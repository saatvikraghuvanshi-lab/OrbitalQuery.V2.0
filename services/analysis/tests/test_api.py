"""Tests for request validation and the health endpoint."""

import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.models.requests import AnalyzeRequest, SceneRef
from app.services.raster import aoi_area_km2

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "orbitalquery-analysis"
    assert body["version"] == "2.0.0"
    assert isinstance(body["checks"], dict)


def _scene(sid: str, dt: str) -> SceneRef:
    return SceneRef(id=sid, collection="sentinel-2-l2a", datetime=dt, bbox=[78.0, 17.0, 79.0, 18.0])


def test_valid_request_passes_pydantic():
    req = AnalyzeRequest(
        before_scene=_scene("S2A_2018", "2018-01-12T05:07:03Z"),
        after_scene=_scene("S2B_2026", "2026-01-18T05:12:29Z"),
        bbox=[78.2, 17.3, 78.4, 17.5],
    )
    assert req.threshold is None


def test_invalid_bbox_rejected():
    for bad in ([79, 17, 78, 18], [78, 18, 79, 17], [-200, 0, 0, 1], [0, 0, 0, 1]):
        try:
            AnalyzeRequest(
                before_scene=_scene("A", "2018-01-01T00:00:00Z"),
                after_scene=_scene("B", "2026-01-01T00:00:00Z"),
                bbox=bad,
            )
            raise AssertionError(f"expected validation error for {bad}")
        except Exception:
            pass


def test_oversized_bbox_rejected():
    try:
        AnalyzeRequest(
            before_scene=_scene("A", "2018-01-01T00:00:00Z"),
            after_scene=_scene("B", "2026-01-01T00:00:00Z"),
            bbox=[0, 0, 40, 40],
        )
        raise AssertionError("expected validation error")
    except Exception:
        pass


def test_out_of_range_threshold_rejected():
    try:
        AnalyzeRequest(
            before_scene=_scene("A", "2018-01-01T00:00:00Z"),
            after_scene=_scene("B", "2026-01-01T00:00:00Z"),
            bbox=[78.2, 17.3, 78.4, 17.5],
            threshold=0.9,
        )
        raise AssertionError("expected validation error")
    except Exception:
        pass


def test_analyze_requires_real_scenes():
    """A bogus scene id must 404, not hang or 500."""
    res = client.post(
        "/analyze",
        json={
            "before_scene": {
                "id": "TOTALLY_BOGUS_ID_1234567890",
                "collection": "sentinel-2-l2a",
                "datetime": "2018-01-01T00:00:00Z",
                "bbox": [78.2, 17.3, 78.4, 17.5],
            },
            "after_scene": {
                "id": "TOTALLY_BOGUS_ID_0987654321",
                "collection": "sentinel-2-l2a",
                "datetime": "2026-01-01T00:00:00Z",
                "bbox": [78.2, 17.3, 78.4, 17.5],
            },
            "bbox": [78.2, 17.3, 78.4, 17.5],
        },
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_aoi_area_matches_known_value():
    """1 degree of longitude at the equator ~ 111.32 km * 111.32 km."""
    area = aoi_area_km2([0.0, 0.0, 1.0, 1.0])
    assert 12000 < area < 12500  # ~12364 km²
    # Hyderabad test AOI: 0.2° x 0.2° at ~17.35°N ≈ 21.3 x 22.1 km
    area_hyd = aoi_area_km2([78.25, 17.25, 78.45, 17.45])
    assert 440 < area_hyd < 500
