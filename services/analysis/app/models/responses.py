"""Response models for POST /analyze and GET /health."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ChangeStatistics(BaseModel):
    n_regions: int
    total_changed_area_km2: float
    mean_change_magnitude: float
    max_region_area_km2: float
    threshold_used: float
    aoi_area_km2: float
    changed_fraction: float
    ndvi_before_mean: Optional[float] = None
    ndvi_after_mean: Optional[float] = None
    pixel_counts: Dict[str, int]


class AnalyzeResponse(BaseModel):
    status: str  # "ok" | "no_change" | "skipped"
    message: Optional[str] = None
    geojson: Optional[Dict[str, Any]] = None
    statistics: Optional[ChangeStatistics] = None
    timing_ms: Optional[int] = None
    analysis: str = "vegetation_change"
    warnings: List[str] = []


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    checks: Dict[str, bool]
    uptime_s: float
