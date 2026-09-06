"""Deterministic NDVI-difference change detection.

Pipeline: NDVI(before) / NDVI(after) → absolute difference → threshold →
morphological cleanup (closing then opening) → connected components.
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np
from scipy import ndimage

from ..config import SCL_INVALID


@dataclass
class ChangeComponents:
    """Labeled change components plus per-component pixel statistics."""

    labels: np.ndarray          # int32, 0 = background
    n_components: int
    magnitudes: List[float]     # mean |dNDVI| per component (index 0 unused)
    ndvi_before_means: List[Optional[float]]
    ndvi_after_means: List[Optional[float]]
    pixel_counts: List[int]
    changed_pixels: int
    valid_pixels: int
    total_pixels: int
    threshold_used: float


def threshold_difference(
    diff: np.ndarray, threshold: float
) -> np.ndarray:
    """Boolean mask of |diff| >= threshold (NaN-safe)."""
    return np.isfinite(diff) & (np.abs(diff) >= threshold)


def clean_mask(
    mask: np.ndarray,
    close_iter: int = 1,
    open_iter: int = 1,
) -> np.ndarray:
    """Morphological cleanup: closing fills speckle holes, opening removes
    isolated single-pixel noise. Uses a 3×3 structuring element."""
    if mask.size == 0:
        return mask
    structure = np.ones((3, 3), dtype=bool)
    cleaned = ndimage.binary_closing(mask, structure=structure, iterations=close_iter)
    cleaned = ndimage.binary_opening(cleaned, structure=structure, iterations=open_iter)
    return cleaned


def connected_components(mask: np.ndarray) -> Tuple[np.ndarray, int]:
    """8-connected component labeling."""
    structure = np.ones((3, 3), dtype=bool)
    labels, n = ndimage.label(mask, structure=structure)
    return labels.astype(np.int32), int(n)


def detect_change(
    ndvi_before: np.ndarray,
    ndvi_after: np.ndarray,
    threshold: float,
    min_region_pixels: int = 6,
    scl_invalid_before: Optional[np.ndarray] = None,
    scl_invalid_after: Optional[np.ndarray] = None,
) -> ChangeComponents:
    """Full deterministic change pipeline on aligned NDVI grids."""
    if ndvi_before.shape != ndvi_after.shape:
        raise ValueError("NDVI grids are not aligned")

    total = int(ndvi_before.size)
    valid = int(np.isfinite(ndvi_before).sum())

    diff = ndvi_after - ndvi_before
    mask = threshold_difference(diff, threshold)

    # Cloud/invalid masking via SCL if provided.
    if scl_invalid_before is not None:
        invalid_b = np.isin(scl_invalid_before, list(SCL_INVALID))
        mask &= ~invalid_b
    if scl_invalid_after is not None:
        invalid_a = np.isin(scl_invalid_after, list(SCL_INVALID))
        mask &= ~invalid_a

    mask = clean_mask(mask)
    labels, n = connected_components(mask)

    magnitudes: List[float] = [0.0]
    before_means: List[Optional[float]] = [None]
    after_means: List[Optional[float]] = [None]
    counts: List[int] = [0]

    kept = 0
    for comp in range(1, n + 1):
        sel = labels == comp
        cnt = int(sel.sum())
        if cnt < min_region_pixels:
            labels[sel] = 0
            continue
        kept += 1
        counts.append(cnt)
        dvals = np.abs(diff[sel])
        dvals = dvals[np.isfinite(dvals)]
        magnitudes.append(float(dvals.mean()) if dvals.size else 0.0)
        bvals = ndvi_before[sel]
        bvals = bvals[np.isfinite(bvals)]
        before_means.append(float(bvals.mean()) if bvals.size else None)
        avals = ndvi_after[sel]
        avals = avals[np.isfinite(avals)]
        after_means.append(float(avals.mean()) if avals.size else None)

    changed = int((labels > 0).sum())
    return ChangeComponents(
        labels=labels,
        n_components=kept,
        magnitudes=magnitudes,
        ndvi_before_means=before_means,
        ndvi_after_means=after_means,
        pixel_counts=counts,
        changed_pixels=changed,
        valid_pixels=valid,
        total_pixels=total,
        threshold_used=threshold,
    )
