"""Remote raster reading, clipped to the AOI as early as possible.

Only the requested window of each 10 m Sentinel-2 band COG is streamed via
vsicurl; nothing close to a full scene is ever loaded into memory.
"""

import logging
import math
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import numpy as np
import rasterio
import rasterio.windows
from rasterio.warp import transform_bounds
from rasterio.enums import Resampling

from ..config import GDAL_HTTP_TIMEOUT_S
from .planetary import signed_href

logger = logging.getLogger("orbitalquery.raster")

_GDAL_ENV = {
    "GDAL_HTTP_TIMEOUT": GDAL_HTTP_TIMEOUT_S,
    "GDAL_HTTP_MAX_RETRY": "2",
    "GDAL_HTTP_RETRY_DELAY": "1",
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "GDAL_HTTP_VERIFY_CERT": "YES",
    "VSI_CACHE": "TRUE",
    "VSI_CACHE_SIZE": "50000000",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.tiff,.xml",
    "GDAL_NUM_THREADS": "2",
}


@dataclass
class BandData:
    data: np.ndarray  # float32, nodata replaced with NaN
    transform: "rasterio.Affine"
    crs: str
    resolution_m: float
    width: int
    height: int

    @property
    def shape(self) -> Tuple[int, int]:
        return (self.height, self.width)


def aoi_area_km2(bbox) -> float:
    """Geodesic area of a 4326 bbox in km²."""
    from pyproj import Geod

    west, south, east, north = bbox
    geod = Geod(ellps="WGS84")
    lons = [west, east, east, west, west]
    lats = [south, south, north, north, south]
    area, _perimeter = geod.polygon_area_perimeter(lons, lats)
    return abs(area) / 1e6


def _out_size(span_src: float, span_dst_m: float, max_pixels: int) -> int:
    """Choose an output pixel count so the grid stays within budget."""
    if span_src <= 0:
        raise ValueError("degenerate AOI span")
    # Source pixels at native resolution: span in meters / 10 m (approx).
    native = max(1, int(span_dst_m / 10))
    if native <= max_pixels:
        return native
    return max_pixels


def read_band_window(
    band_href: str,
    collection: str,
    bbox_4326: Tuple[float, float, float, float],
    target_pixels: int,
) -> BandData:
    """Read one band clipped to the AOI, downsampled if needed."""
    href = signed_href(collection, band_href)
    west, south, east, north = bbox_4326

    with rasterio.Env(**_GDAL_ENV):
        with rasterio.open(href) as src:
            src_crs = src.crs
            # Reproject AOI bounds into the dataset CRS (UTM for Sentinel-2).
            tf_bounds = transform_bounds("EPSG:4326", src_crs, west, south, east, north)
            window = rasterio.windows.from_bounds(*tf_bounds, transform=src.transform)
            window = window.round_offsets().round_lengths()

            # Approximate span in meters for pixel-budget math.
            if src_crs.is_geographic:
                midlat = math.radians((north + south) / 2)
                span_x_m = (tf_bounds[2] - tf_bounds[0]) * 111320 * math.cos(midlat)
                span_y_m = (tf_bounds[3] - tf_bounds[1]) * 110540
            else:
                span_x_m = tf_bounds[2] - tf_bounds[0]
                span_y_m = tf_bounds[3] - tf_bounds[1]

            # Native pixel size in meters.
            res_x, res_y = src.res
            if src_crs.is_geographic:
                res_x_m = res_x * 111320 * math.cos(midlat)
                res_y_m = res_y * 110540
            else:
                res_x_m, res_y_m = res_x, res_y

            max_side = max(1, int(math.sqrt(target_pixels)))
            out_w = _out_size(span_x_m, span_x_m, max_side)
            out_h = _out_size(span_y_m, span_y_m, max_side)
            # Respect the pixel budget as a product, not per-side.
            scale = math.sqrt(target_pixels / max(1, out_w * out_h))
            out_w = max(16, min(out_w, int(out_w * min(1.0, scale))))
            out_h = max(16, min(out_h, int(out_h * min(1.0, scale))))

            nodata = src.nodata
            raw = src.read(
                1,
                window=window,
                out_shape=(out_h, out_w),
                resampling=Resampling.bilinear,
            ).astype(np.float32)

            data = raw.copy()
            if nodata is not None:
                data[raw == nodata] = np.nan
            data[raw <= 0] = np.nan  # Sentinel-2 encodes nodata as 0

            # Affine transform mapping array -> dataset CRS.
            out_transform = rasterio.windows.transform(window, src.transform) * rasterio.Affine.scale(
                (window.width) / out_w, (window.height) / out_h
            )

            return BandData(
                data=data,
                transform=out_transform,
                crs=src_crs.to_string(),
                resolution_m=span_x_m / out_w,
                width=out_w,
                height=out_h,
            )


def read_scl_window(
    scl_href: str,
    collection: str,
    bbox_4326: Tuple[float, float, float, float],
    grid_w: int,
    grid_h: int,
) -> Optional[np.ndarray]:
    """Read the 60 m Scene Classification Layer, upsampled to the band grid.

    Returns None if the SCL asset cannot be read (analysis proceeds without
    cloud masking, with a warning upstream).
    """
    try:
        href = signed_href(collection, scl_href)
        west, south, east, north = bbox_4326
        with rasterio.Env(**_GDAL_ENV):
            with rasterio.open(href) as src:
                tf_bounds = transform_bounds("EPSG:4326", src.crs, west, south, east, north)
                window = rasterio.windows.from_bounds(*tf_bounds, transform=src.transform)
                scl = src.read(
                    1,
                    window=window,
                    out_shape=(grid_h, grid_w),
                    resampling=Resampling.nearest,
                )
        return scl.astype(np.uint8)
    except Exception as exc:  # noqa: BLE001 — degrade gracefully
        logger.warning("SCL read failed (continuing without cloud mask): %s", exc)
        return None
