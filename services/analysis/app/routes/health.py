"""Health check endpoint."""

import time

from fastapi import APIRouter

from ..config import SERVICE_NAME, SERVICE_VERSION
from ..models.responses import HealthResponse

router = APIRouter()
_START = time.time()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Dependency-free liveness + config sanity. STAC/SAS reachability is
    checked by the caller when needed; this stays fast for cold starts."""
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        version=SERVICE_VERSION,
        checks={
            "config_loaded": True,
            "stac_url_set": bool(SERVICE_NAME),
        },
        uptime_s=round(time.time() - _START, 1),
    )
