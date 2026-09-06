"""Vectorization: labeled raster components → GeoJSON in EPSG:4326.

One feature per labeled component. A component may polygonize into several
parts (8-connectivity merges diagonal pixels; rasterio emits one polygon per
ring) — parts are unioned into a single Polygon or MultiPolygon so region IDs
stay unique and no changed area is discarded.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import rasterio.features
from pyproj import Transformer
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as shapely_transform, unary_union

from ..config import MAX_REGIONS, SIMPLIFY_TOLERANCE_M

logger = logging.getLogger("orbitalquery.vectorize")


def _make_transformer(src_crs: str):
    return Transformer.from_crs(src_crs, "EPSG:4326", always_xy=True)


def _geometry_to_coords(geom: BaseGeometry) -> Optional[List[Any]]:
    """Convert a (Multi)Polygon to GeoJSON coordinates with rounded rings
    (exterior + interior holes preserved). Returns None for non-polygonal
    results."""
    if geom.is_empty:
        return None
    if geom.geom_type == "Polygon":
        return [
            _round_coords(list(geom.exterior.coords)),
            *[_round_coords(list(i.coords)) for i in geom.interiors],
        ]
    if geom.geom_type == "MultiPolygon":
        return [
            [
                _round_coords(list(p.exterior.coords)),
                *[_round_coords(list(i.coords)) for i in p.interiors],
            ]
            for p in geom.geoms
        ]
    return None


def regions_to_geojson(
    labels: np.ndarray,
    transform,
    src_crs: str,
    magnitudes: List[float],
    ndvi_before_means: List[Optional[float]],
    ndvi_after_means: List[Optional[float]],
    pixel_counts: List[int],
    resolution_m: float,
    min_region_area_km2: float,
) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    """Polygonize labeled components, simplify, and compute areas.

    Returns (features, areas_by_region) with regions sorted by area, largest
    first, capped at MAX_REGIONS. Tiny regions below min_region_area_km2 are
    dropped.
    """
    if labels.max() == 0:
        return [], {}

    transformer = _make_transformer(src_crs)
    pixel_area_m2 = float(resolution_m * resolution_m)

    shapes = rasterio.features.shapes(
        labels.astype(np.int32), mask=labels > 0, transform=transform
    )

    # Collect polygon parts per component label.
    parts_by_region: Dict[int, List[BaseGeometry]] = {}
    for geom, value in shapes:
        region = int(value)
        if region <= 0 or region >= len(magnitudes):
            continue
        try:
            poly = shape(geom)
            if poly.is_empty:
                continue
            if not poly.is_valid:
                poly = poly.buffer(0)
                if poly.is_empty:
                    continue
            parts_by_region.setdefault(region, []).append(poly)
        except Exception as exc:  # noqa: BLE001 — skip bad part, keep others
            logger.warning("Region %d part vectorization failed: %s", region, exc)
            continue

    features: List[Dict[str, Any]] = []
    areas: Dict[str, float] = {}

    for region, parts in parts_by_region.items():
        try:
            merged = unary_union(parts) if len(parts) > 1 else parts[0]
            # Simplify in the metric CRS (tolerance in meters)
            simplified = merged.simplify(SIMPLIFY_TOLERANCE_M, preserve_topology=True)
            if simplified.is_empty:
                simplified = merged
            area_km2 = pixel_counts[region] * pixel_area_m2 / 1e6
            if area_km2 < min_region_area_km2:
                continue
            wgs = shapely_transform(
                lambda x, y, z=None: transformer.transform(x, y), simplified
            )
            coords = _geometry_to_coords(wgs)
            if coords is None:
                continue
            region_id = f"R{region:03d}"
            features.append(
                {
                    "type": "Feature",
                    "id": region_id,
                    "geometry": {"type": wgs.geom_type, "coordinates": coords},
                    "properties": {
                        "region_id": region_id,
                        # km² needs 6 decimals: a 10,000 m² region is 0.01 km²,
                        # a 4,000 m² region is 0.004 — round(·, 4) would erase them.
                        "area_km2": round(area_km2, 6),
                        "change_magnitude": round(float(magnitudes[region]), 4),
                        "ndvi_before": (
                            round(ndvi_before_means[region], 4)
                            if ndvi_before_means[region] is not None
                            else None
                        ),
                        "ndvi_after": (
                            round(ndvi_after_means[region], 4)
                            if ndvi_after_means[region] is not None
                            else None
                        ),
                    },
                }
            )
            areas[region_id] = area_km2
        except Exception as exc:  # noqa: BLE001 — skip bad component, keep others
            logger.warning("Region %d vectorization failed: %s", region, exc)
            continue

    features.sort(key=lambda f: f["properties"]["area_km2"], reverse=True)
    dropped = features[MAX_REGIONS:]
    features = features[:MAX_REGIONS]
    if dropped:
        logger.info("Dropped %d regions beyond MAX_REGIONS", len(dropped))
    return features, areas


def _round_coords(coords: List[Tuple[float, float]], precision: int = 6) -> List[List[float]]:
    return [[round(x, precision), round(y, precision)] for x, y in coords]
