"""Tests for NDVI computation."""

import numpy as np

from app.services.ndvi import compute_ndvi


def test_perfect_vegetation_pixel():
    nir = np.array([[0.6]], dtype=np.float32)
    red = np.array([[0.1]], dtype=np.float32)
    ndvi = compute_ndvi(nir, red)
    # (0.6 − 0.1) / (0.6 + 0.1) = 0.5 / 0.7
    assert np.isclose(ndvi[0, 0], 0.5 / 0.7, atol=1e-6)


def test_scale_invariance():
    nir = np.array([[6000.0]])
    red = np.array([[1000.0]])
    ndvi = compute_ndvi(nir, red)
    assert np.isclose(ndvi[0, 0], 5000.0 / 7000.0, atol=1e-6)


def test_division_by_zero_yields_nan():
    nir = np.array([[0.0]])
    red = np.array([[0.0]])
    ndvi = compute_ndvi(nir, red)
    assert np.isnan(ndvi[0, 0])


def test_near_zero_denominator_yields_nan():
    nir = np.array([[1e-8]])
    red = np.array([[-1e-8]])
    ndvi = compute_ndvi(nir, red)
    assert np.isnan(ndvi[0, 0])


def test_nodata_propagates_as_nan():
    nir = np.array([[np.nan, 0.5]])
    red = np.array([[0.2, np.nan]])
    ndvi = compute_ndvi(nir, red)
    assert np.isnan(ndvi[0, 0])
    assert np.isnan(ndvi[0, 1])


def test_shape_mismatch_raises():
    nir = np.zeros((3, 3))
    red = np.zeros((4, 4))
    try:
        compute_ndvi(nir, red)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_value_range():
    rng = np.random.default_rng(42)
    nir = rng.uniform(0, 1, (64, 64)).astype(np.float32)
    red = rng.uniform(0, 1, (64, 64)).astype(np.float32)
    ndvi = compute_ndvi(nir, red)
    finite = ndvi[np.isfinite(ndvi)]
    assert ((finite >= -1) & (finite <= 1)).all()
