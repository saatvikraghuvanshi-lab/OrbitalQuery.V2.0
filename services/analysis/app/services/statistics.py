"""Aggregate statistics for an analysis run."""

from typing import Dict, List, Optional

import numpy as np

from ..config import DEFAULT_THRESHOLD


def build_statistics(
    features: List[Dict[str, Any]],
    changed_pixels: int,
    valid_pixels: int,
    total_pixels: int,
    ndvi_before_mean: Optional[float],
    ndvi_after_mean: Optional[float],
    aoi_area_km2: float,
    threshold_used: float,
    areas_by_region: Optional[Dict[str, float]] = None,
) -> Dict:
    """Compact, UI-ready statistics. Areas prefer the vectorized geometry
    areas (after simplification/dropping) over raw pixel counts."""
    areas_by_region = areas_by_region or {}
    if features:
        area_vals = [f["properties"]["area_km2"] for f in features]
        total_area = float(sum(area_vals))
        max_area = float(max(area_vals))
        mags = [
            f["properties"]["change_magnitude"]
            for f in features
            if f["properties"]["change_magnitude"] is not None
        ]
        mean_mag = float(np.mean(mags)) if mags else 0.0
    else:
        total_area = 0.0
        max_area = 0.0
        mean_mag = 0.0

    denom = valid_pixels if valid_pixels > 0 else max(1, total_pixels)
    return {
        "n_regions": len(features),
        "total_changed_area_km2": round(total_area, 3),
        "mean_change_magnitude": round(mean_mag, 4),
        "max_region_area_km2": round(max_area, 4),
        "threshold_used": round(threshold_used, 3),
        "aoi_area_km2": round(aoi_area_km2, 2),
        "changed_fraction": round(changed_pixels / denom, 6),
        "ndvi_before_mean": (
            round(ndvi_before_mean, 4) if ndvi_before_mean is not None else None
        ),
        "ndvi_after_mean": (
            round(ndvi_after_mean, 4) if ndvi_after_mean is not None else None
        ),
        "pixel_counts": {
            "changed": int(changed_pixels),
            "valid": int(valid_pixels),
            "total": int(total_pixels),
        },
    }
