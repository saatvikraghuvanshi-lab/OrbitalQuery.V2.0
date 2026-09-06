# OrbitalQuery analysis service — Cloud Run container
# Build:  docker build -t orbitalquery-analysis services/analysis
# Run:    docker run -p 8000:8000 orbitalquery-analysis
# Deploy: see docs/DEPLOYMENT.md

FROM python:3.12-slim

WORKDIR /app

# Python deps (rasterio ships manylinux wheels; no GDAL build needed)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Cloud Run injects PORT (default 8080). uvicorn binds it; exec keeps PID 1.
ENV PORT=8080
EXPOSE 8080
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --timeout-keep-alive 65
