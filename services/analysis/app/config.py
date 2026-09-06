"""OrbitalQuery analysis service configuration (env-driven, no secrets)."""

import os

# --- Planetary Computer endpoints (public, no API key) -------------------
STAC_URL = os.getenv(
    "PLANETARY_COMPUTER_STAC_URL",
    "https://planetarycomputer.microsoft.com/api/stac/v1",
)
SAS_TOKEN_URL = os.getenv(
    "PLANETARY_COMPUTER_SAS_URL",
    "https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection}",
)

# --- CORS -----------------------------------------------------------------
# Comma-separated origins allowed to call this service. "*" for local dev;
# set the Vercel origin in production.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if o.strip()
]

# --- AOI / processing guards ---------------------------------------------
# Max AOI size we accept, in km^2. Larger AOIs are rejected with a clear
# error so the UI can ask the user to narrow the area.
MAX_AOI_KM2 = float(os.getenv("MAX_AOI_KM2", "25000"))
# Cap on pixels read per band (approximate). Keeps memory bounded on any AOI.
TARGET_PIXELS = int(os.getenv("TARGET_PIXELS", "1200000"))
# Max change regions returned in the GeoJSON.
MAX_REGIONS = int(os.getenv("MAX_REGIONS", "250"))

# --- Analysis defaults -----------------------------------------------------
DEFAULT_THRESHOLD = 0.20
MIN_THRESHOLD = 0.05
MAX_THRESHOLD = 0.60
DEFAULT_MIN_REGION_KM2 = 0.02
MIN_REGION_KM2 = 0.001
MAX_REGION_KM2 = 5.0
# Geometry simplification tolerance in meters (dataset CRS is UTM).
SIMPLIFY_TOLERANCE_M = float(os.getenv("SIMPLIFY_TOLERANCE_M", "10"))

# --- SCL classes treated as invalid/cloud (Sentinel-2 Scene Class Layer) --
# 0 nodata, 1 saturated, 3 cloud shadow, 8 cloud medium, 9 cloud high,
# 10 thin cirrus
SCL_INVALID = {0, 1, 3, 8, 9, 10}

# --- Networking ------------------------------------------------------------
HTTP_CONNECT_TIMEOUT_S = float(os.getenv("HTTP_CONNECT_TIMEOUT_S", "5"))
HTTP_READ_TIMEOUT_S = float(os.getenv("HTTP_READ_TIMEOUT_S", "25"))
GDAL_HTTP_TIMEOUT_S = os.getenv("GDAL_HTTP_TIMEOUT_S", "30")

SERVICE_NAME = "orbitalquery-analysis"
SERVICE_VERSION = "2.0.0"
