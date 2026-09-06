"""OrbitalQuery analysis service entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import ALLOWED_ORIGINS, SERVICE_NAME, SERVICE_VERSION
from .routes import analysis, health

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("orbitalquery")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("%s v%s ready", SERVICE_NAME, SERVICE_VERSION)
    yield


app = FastAPI(
    title="OrbitalQuery Analysis Service",
    version=SERVICE_VERSION,
    description="Deterministic NDVI change detection over user-defined AOIs.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(analysis.router, prefix="")
