"""Tests for GeoJSON generation and statistics."""

import numpy as np

from app.services.statistics import build_statistics
from app.services.vectorization import regions_to_geojson


def _labels_2x2():
    """A 2x2 block labeled 1 with an identity transform (1m pixels)."""
    labels = np.zeros((6, 6), dtype=np.int32)
    labels[2:4, 2:4] = 1
    transform = _identity_transform()
    return labels, transform


def _identity_transform():
    from rasterio.transform import Affine

    return Affine.identity()  # 1m pixels, origin (0,0)


def test_regions_to_geojson_structure():
    labels, transform = _labels_2x2()
    features, areas = regions_to_geojson(
        labels=labels,
        transform=transform,
        src_crs="EPSG:32644",
        magnitudes=[0.0, 0.42],
        ndvi_before_means=[None, 0.5],
        ndvi_after_means=[None, 0.2],
        pixel_counts=[0, 4],
        resolution_m=1.0,
        min_region_area_km2=0.0,
    )
    assert len(features) == 1
    f = features[0]
    assert f["type"] == "Feature"
    assert f["geometry"]["type"] == "Polygon"
    assert f["properties"]["region_id"] == "R001"
    assert np.isclose(f["properties"]["area_km2"], 4e-6, rtol=1e-3)
    assert np.isclose(f["properties"]["change_magnitude"], 0.42)
    assert areas["R001"] == f["properties"]["area_km2"]

    # Ring closure
    ring = f["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1]
    assert len(ring) >= 4


def test_regions_to_geojson_respects_min_area():
    labels, transform = _labels_2x2()
    features, _ = regions_to_geojson(
        labels, transform, "EPSG:32644",
        [0.0, 0.5], [None, 0.5], [None, 0.2], [0, 4],
        resolution_m=1.0, min_region_area_km2=100.0,
    )
    assert len(features) == 0


def test_regions_to_geojson_empty_labels():
    labels = np.zeros((4, 4), dtype=np.int32)
    features, areas = regions_to_geojson(
        labels, _identity_transform(), "EPSG:32644",
        [0.0], [None], [None], [0], 1.0, 0.0,
    )
    assert features == []
    assert areas == {}


def test_regions_to_geojson_wgs84_output():
    """Coordinates must be lon/lat after reprojection from UTM."""
    labels, transform = _labels_2x2()
    features, _ = regions_to_geojson(
        labels, transform, "EPSG:32644",
        [0.0, 0.42], [None, 0.5], [None, 0.2], [0, 4],
        resolution_m=1.0, min_region_area_km2=0.0,
    )
    ring = features[0]["geometry"]["coordinates"][0]
    lons = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    assert all(-180 <= x <= 180 for x in lons)
    assert all(-90 <= y <= 90 for y in lats)


def test_build_statistics_basic():
    features = [
        {"properties": {"area_km2": 2.0, "change_magnitude": 0.3}},
        {"properties": {"area_km2": 1.0, "change_magnitude": 0.5}},
    ]
    stats = build_statistics(
        features=features,
        changed_pixels=300,
        valid_pixels=1000,
        total_pixels=1200,
        ndvi_before_mean=0.45,
        ndvi_after_mean=0.30,
        aoi_area_km2=500.0,
        threshold_used=0.2,
    )
    assert stats["n_regions"] == 2
    assert np.isclose(stats["total_changed_area_km2"], 3.0)
    assert np.isclose(stats["max_region_area_km2"], 2.0)
    assert np.isclose(stats["mean_change_magnitude"], 0.4)
    assert np.isclose(stats["changed_fraction"], 0.3)
    assert stats["pixel_counts"] == {"changed": 300, "valid": 1000, "total": 1200}
    assert stats["threshold_used"] == 0.2


def test_build_statistics_empty():
    stats = build_statistics(
        features=[],
        changed_pixels=0,
        valid_pixels=100,
        total_pixels=100,
        ndvi_before_mean=None,
        ndvi_after_mean=None,
        aoi_area_km2=10.0,
        threshold_used=0.2,
    )
    assert stats["n_regions"] == 0
    assert stats["total_changed_area_km2"] == 0
    assert stats["mean_change_magnitude"] == 0.0
