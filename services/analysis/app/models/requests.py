"""Request models for POST /analyze."""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SceneRef(BaseModel):
    """Minimal scene reference. The service re-fetches the STAC item itself
    so callers cannot inject arbitrary asset URLs."""

    id: str = Field(min_length=8, max_length=160)
    collection: str = Field(min_length=3, max_length=80)
    datetime: str = Field(min_length=10, max_length=40)
    bbox: List[float] = Field(min_length=4, max_length=4)


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # Accept both wire styles: the Next.js proxy sends camelCase, direct
    # Python callers use snake_case.
    before_scene: SceneRef = Field(alias="beforeScene")
    after_scene: SceneRef = Field(alias="afterScene")
    # AOI in EPSG:4326: [west, south, east, north]
    bbox: List[float] = Field(min_length=4, max_length=4)
    threshold: Optional[float] = None
    min_region_area_km2: Optional[float] = None
    analysis: str = Field(default="vegetation_change", max_length=40)

    @field_validator("bbox")
    @classmethod
    def _validate_bbox(cls, v: List[float]) -> List[float]:
        west, south, east, north = v
        if not (-180 <= west < east <= 180):
            raise ValueError("bbox longitudes invalid: need west < east within [-180, 180]")
        if not (-90 <= south < north <= 90):
            raise ValueError("bbox latitudes invalid: need south < north within [-90, 90]")
        if (east - west) > 30 or (north - south) > 30:
            raise ValueError("bbox too large for analysis; narrow the AOI")
        return v

    @field_validator("threshold")
    @classmethod
    def _validate_threshold(cls, v):
        if v is None:
            return v
        if not 0.05 <= v <= 0.60:
            raise ValueError("threshold must be between 0.05 and 0.60")
        return v
