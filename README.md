# OrbitalQuery V2

**Ask questions. Discover Earth Observation data. See what changed.**

OrbitalQuery is an EO discovery and multi-temporal analysis console. Enter a
natural-language request — *"urban expansion in Hyderabad between 2018 and
2026"* — and the system interprets it, finds Sentinel-2 scenes over your area
and period, renders before/after imagery on a map, detects localized land
change, and reports quantitative evidence (area, magnitude, per-region NDVI).

> EO-derived change regions are **evidence to support review**, not validated
> ground truth. OrbitalQuery is a discovery/analysis tool — not an emergency
> response system and not a guarantee of accuracy.

## Architecture (60 seconds)

```
Browser (Next.js + MapLibre)
  → Next.js API routes
    → Planetary Computer STAC (scene discovery, tiles straight to the browser)
    → Cloud Run analysis service (Python) — only when analysis is requested
  → GeoJSON + statistics
→ Map UI
```

The browser never talks to the Python service directly, and no full satellite
rasters are ever downloaded — analysis streams only the AOI window of each
band via COG range requests, and the map renders via Planetary Computer tile
endpoints.

## Repository layout

```
apps/web                 Next.js 15 + TypeScript + MapLibre console
  app/api/{search,scenes,analysis,health}/route.ts
  components/{map,search,analysis,ui}
  lib/                   queryParser, stac, sceneSelection, demoCache, …
  public/demo/hyderabad  flagship demo cache (fallback result)
services/analysis        FastAPI + rasterio NDVI change service (Cloud Run)
scripts/                 demo-cache builder + E2E smoke check
docs/                    ARCHITECTURE, API, DEPLOYMENT
```

## Quickstart (local)

Prereqs: Node 20+, Python 3.12+ (3.14 works), no API keys needed.

```bash
# 1. Web console
cd apps/web
npm install
cp .env.example .env.local        # defaults are fine for local dev
npm run dev                       # http://localhost:3000

# 2. Analysis service (second terminal)
cd services/analysis
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000 --reload
```

Open http://localhost:3000, type the flagship query, hit **Run change
analysis** on the right panel.

Without the Python service running, everything except live analysis still
works (search, scenes, map, swipe), and the flagship Hyderabad demo serves
its cached result when analysis is unavailable.

## Tests

```bash
cd apps/web && npm test           # 41 tests: parser, presets, selection, validation
cd services/analysis && python -m pytest   # 32 tests: NDVI, change, geojson, stats, API
bash scripts/e2e_check.sh         # full-stack smoke incl. fallback-on-failure
```

## The flagship demo

`urban expansion in Hyderabad between 2018 and 2026` runs with **pinned
windows** (clearest Jan/Feb 2018 + Jan/Feb 2026 scenes over a pinned central
Hyderabad AOI) so the demo is reproducible. If live analysis fails or times
out, the UI transparently falls back to a **real cached result** (computed by
`scripts/build_hyderabad_cache.py` from the same pipeline — not fake data);
imagery and scene metadata remain live.

Every other preset (Mumbai, Nepal, Western Ghats, …) and any free-text query
goes through the exact same pipeline — presets are metadata, not hard-coded
datasets.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data flow, change detection method, fallback behavior
- [docs/API.md](docs/API.md) — endpoint contracts
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel + Cloud Run setup, env vars
