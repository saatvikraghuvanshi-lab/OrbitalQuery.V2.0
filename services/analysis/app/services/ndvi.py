"""NDVI computation with explicit nodata / division-by-zero handling."""

import numpy as np


def compute_ndvi(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    """NDVI = (NIR − Red) / (NIR + Red).

    Pixels where either band is NaN or the denominator is ~0 become NaN.
    Inputs are float arrays (reflectance or DN — the ratio is scale-invariant).
    """
    if nir.shape != red.shape:
        raise ValueError("NIR and Red band shapes differ")
    nir = nir.astype(np.float32, copy=False)
    red = red.astype(np.float32, copy=False)
    denom = nir + red
    with np.errstate(invalid="ignore", divide="ignore"):
        ndvi = (nir - red) / denom
    # Guard: denominator near zero or non-finite inputs -> NaN
    bad = (~np.isfinite(denom)) | (np.abs(denom) < 1e-6)
    ndvi = np.where(bad, np.nan, ndvi)
    ndvi[~np.isfinite(ndvi)] = np.nan
    return ndvi.astype(np.float32)
