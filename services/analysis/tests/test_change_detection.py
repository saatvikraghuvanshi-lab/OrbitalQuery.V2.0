"""Tests for change thresholding, morphology, and connected components."""

import numpy as np

from app.services.change_detection import (
    clean_mask,
    connected_components,
    detect_change,
    threshold_difference,
)


def _grid(value: float, shape=(8, 8)) -> np.ndarray:
    return np.full(shape, value, dtype=np.float32)


def test_threshold_basic():
    diff = np.array([[0.1, 0.25], [0.3, -0.25]])
    mask = threshold_difference(diff, 0.2)
    # |−0.25| >= 0.2 → True (absolute difference)
    assert mask.tolist() == [[False, True], [True, True]]


def test_threshold_nan_safe():
    diff = np.array([[np.nan, 0.25]])
    mask = threshold_difference(diff, 0.2)
    assert mask.tolist() == [[False, True]]


def test_cleaning_removes_single_pixels():
    mask = np.zeros((10, 10), dtype=bool)
    mask[5, 5] = True  # isolated speckle
    mask[2:5, 2:5] = True  # 3x3 block survives opening
    cleaned = clean_mask(mask)
    assert not cleaned[5, 5]
    assert cleaned[2:5, 2:5].all()


def test_cleaning_removes_small_blocks():
    # A 2x2 block cannot contain the 3x3 structuring element → removed.
    # This is intentional: such fragments are below the size we report.
    mask = np.zeros((10, 10), dtype=bool)
    mask[2:4, 2:4] = True
    cleaned = clean_mask(mask)
    assert not cleaned.any()


def test_cleaning_fills_one_pixel_holes():
    mask = np.zeros((10, 10), dtype=bool)
    mask[2:5, 2:5] = True
    mask[3, 3] = False  # hole
    cleaned = clean_mask(mask)
    assert cleaned[3, 3]


def test_components_count():
    mask = np.zeros((20, 20), dtype=bool)
    mask[2:5, 2:5] = True  # component 1
    mask[10:13, 10:13] = True  # component 2
    labels, n = connected_components(mask)
    assert n == 2


def test_detect_change_end_to_end():
    before = _grid(0.5)
    after = _grid(0.5)  # background unchanged
    after[2:5, 2:5] = 0.2  # strong change region (|Δ| = 0.3)
    after[7, 7] = 0.2  # speckle → cleaned away

    comps = detect_change(before, after, threshold=0.2, min_region_pixels=6)
    assert comps.n_components == 1
    assert comps.changed_pixels == 9
    assert comps.magnitudes[1] > 0.25
    assert comps.threshold_used == 0.2


def test_detect_change_no_change():
    before = _grid(0.5)
    after = _grid(0.52)
    comps = detect_change(before, after, threshold=0.2)
    assert comps.n_components == 0
    assert comps.changed_pixels == 0


def test_detect_change_respects_min_region_pixels():
    before = _grid(0.5)
    after = _grid(0.5)
    after[2:4, 2:3] = 0.8  # only 2 pixels < min_region_pixels=6
    comps = detect_change(before, after, threshold=0.2, min_region_pixels=6)
    assert comps.n_components == 0


def test_detect_change_scl_masking():
    before = _grid(0.5)
    after = _grid(0.5)
    after[2:5, 2:5] = 0.8  # |Δ| = 0.3 over 9 pixels
    # SCL background = 4 (vegetation), one clouded pixel = 8 (cloud medium)
    scl_after = np.full((8, 8), 4, dtype=np.uint8)
    scl_after[3, 3] = 8
    comps = detect_change(before, after, threshold=0.2, min_region_pixels=6,
                          scl_invalid_after=scl_after)
    # Closing fills the 1-px cloud hole in the 3x3 block → 9 px remain.
    assert comps.changed_pixels == 9


def test_detect_change_scl_nodata_excluded():
    """SCL class 0 = nodata; those pixels must never be counted as change."""
    before = _grid(0.5)
    after = _grid(0.2)  # everything differs by 0.3
    scl_after = np.zeros((8, 8), dtype=np.uint8)  # 0 everywhere → all invalid
    comps = detect_change(before, after, threshold=0.2, min_region_pixels=1,
                          scl_invalid_after=scl_after)
    assert comps.changed_pixels == 0
    assert comps.n_components == 0


def test_detect_change_shape_mismatch_raises():
    try:
        detect_change(_grid(0.5, (8, 8)), _grid(0.5, (9, 9)), 0.2)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass
