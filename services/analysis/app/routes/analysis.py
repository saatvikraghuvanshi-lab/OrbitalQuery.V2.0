"""POST /analyze — NDVI change detection over a small AOI."""

import logging
import time
from typing import Any, Dict, List

import numpy as np
from fastapi import APIRouter, HTTPException

from ..config import (
    DEFAULT_MIN_REGION_KM2,
    DEFAULT_THRESHOLD,
    MAX_AOI_KM2,
    TARGET_PIXELS,
)
from ..models.requests import AnalyzeRequest
from ..models.responses import AnalyzeResponse, ChangeStatistics
from ..services import raster as raster_svc
from ..services.change_detection import detect_change
from ..services.ndvi import compute_ndvi
from ..services.planetary import fetch_item
from ..services.statistics import build_statistics
from ..services.vectorization import regions_to_geojson

router = APIRouter()
logger = logging.getLogger("orbitalquery.analysis")


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    t0 = time.time()
    warnings: List[str] = []

    aoi_km2 = raster_svc.aoi_area_km2(req.bbox)
    if aoi_km2 > MAX_AOI_KM2:
        raise HTTPException(
            status_code=413,
            detail=f"AOI of {aoi_km2:,.0f} km² exceeds the {MAX_AOI_KM2:,.0f} km² limit — narrow the area and retry",
        )

    if req.before_scene.collection != req.after_scene.collection:
        raise HTTPException(status_code=400, detail="before/after scenes must share a collection")

    try:
        item_b = fetch_item(req.before_scene.collection, req.before_scene.id)
        item_a = fetch_item(req.after_scene.collection, req.after_scene.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    def _asset_href(item: Dict[str, Any], asset_key: str) -> str:
        assets = item.get("assets") or {}
        asset = assets.get(asset_key)
        if not asset or "href" not in asset:
            raise HTTPException(
                status_code=422,
                detail=f"Scene '{item.get('id')}' has no '{asset_key}' asset",
            )
        return asset["href"]

    # Read red/NIR clipped to AOI, before scene first
    try:
        b04_b = raster_svc.read_band_window(
            _asset_href(item_b, "B04"), req.before_scene.collection, tuple(req.bbox), TARGET_PIXELS
        )
        b08_b = raster_svc.read_band_window(
            _asset_href(item_b, "B08"), req.before_scene.collection, tuple(req.bbox), TARGET_PIXELS
        )
        b04_a = raster_svc.read_band_window(
            _asset_href(item_a, "B04"), req.after_scene.collection, tuple(req.bbox), TARGET_PIXELS
        )
        b08_a = raster_svc.read_band_window(
            _asset_href(item_a, "B08"), req.after_scene.collection, tuple(req.bbox), TARGET_PIXELS
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("raster read failed")
        raise HTTPException(status_code=502, detail=f"raster read failed: {exc}") from exc

    # Guard: raster dimensions
    shapes = {b.shape for b in (b04_b, b08_b, b04_a, b08_a)}
    if len(shapes) != 1:
        # Re-grid after-scene bands onto the before-scene grid is complex;
        # AOIs within one MGRS tile share a grid. Fail with a clear message.
        raise HTTPException(
            status_code=422,
            detail="before/after rasters do not share a grid — pick scenes from the same MGRS tile",
        )

    ndvi_b = compute_ndvi(b08_b.data, b04_b.data)
    ndvi_a = compute_ndvi(b08_a.data, b04_a.data)

    threshold = req.threshold if req.threshold is not None else DEFAULT_THRESHOLD
    min_area = req.min_region_area_km2 if req.min_region_area_km2 is not None else DEFAULT_MIN_REGION_KM2

    scl_b = None
    scl_a = None
    scl_asset_b = (item_b.get("assets") or {}).get("SCL")
    scl_asset_a = (item_a.get("assets") or {}).get("SCL")
    if scl_asset_b and scl_asset_a and "href" in scl_asset_b and "href" in scl_asset_a:
        scl_b = raster_svc.read_scl_window(
            scl_asset_b["href"], req.before_scene.collection, tuple(req.bbox), b04_b.width, b04_b.height
        )
        scl_a = raster_svc.read_scl_window(
            scl_asset_a["href"], req.after_scene.collection, tuple(req.bbox), b04_b.width, b04_b.height
        )
        if scl_b is None or scl_a is None:
            warnings.append("cloud masking unavailable; results may include cloud-driven artifacts")

    try:
        comps = detect_change(
            ndvi_b, ndvi_a, threshold=threshold,
            scl_invalid_before=scl_b, scl_invalid_after=scl_a,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    features, areas = regions_to_geojson(
        comps.labels,
        b04_b.transform,
        b04_b.crs,
        comps.magnitudes,
        comps.ndvi_before_means,
        comps.ndvi_after_means,
        comps.pixel_counts,
        b04_b.resolution_m,
        min_area,
    )

    nb = float(np.nanmean(ndvi_b)) if np.isfinite(ndvi_b).any() else None
    na = float(np.nanmean(ndvi_a)) if np.isfinite(ndvi_a).any() else None

    stats = build_statistics(
        features=features,
        changed_pixels=comps.changed_pixels,
        valid_pixels=comps.valid_pixels,
        total_pixels=comps.total_pixels,
        ndvi_before_mean=nb,
        ndvi_after_mean=na,
        aoi_area_km2=aoi_km2,
        threshold_used=comps.threshold_used,
        areas_by_region=areas,
    )

    status = "ok" if features else "no_change"
    message = None if features else "No significant change detected at this threshold"
    timing = int((time.time() - t0) * 1000)
    return AnalyzeResponse(
        status=status,
        message=message,
        geojson={"type": "FeatureCollection", "features": features} if features else None,
        statistics=ChangeStatistics(**stats),
        timing_ms=timing,
        analysis=req.analysis,
        warnings=warnings,
    )
