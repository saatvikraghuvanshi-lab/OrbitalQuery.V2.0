# OrbitalQuery V2 — Architecture

## Design principles

1. **Deterministic over clever.** Query parsing, scene selection, and change
   detection are rule-based and explainable. No LLM in the loop, no nondeterministic
   outputs for the same input.
2. **The browser never receives rasters.** Imagery flows from Planetary
   Computer tile endpoints straight to MapLibre; analysis returns vectors.
3. **Demo reliability > feature count.** The flagship flow has pinned inputs
   and a cached fallback; every async path has a timeout and a UI state.
4. **Small surface.** Two deployables (Next.js on Vercel, FastAPI on Cloud
   Run), no database, no auth, no queue.

## Data flow

```
┌─────────┐   POST /api/search     ┌──────────────┐   STAC /search   ┌────────────────────┐
│ Browser │ ─────────────────────► │ Next.js API  │ ───────────────► │ Planetary Computer │
│ MapLibre│ ◄───────────────────── │ route.ts     │ ◄─────────────── │ STAC API           │
└─────────┘  parsedQuery + scenes └──────────────┘  scene metadata └────────────────────┘
     │                                   │      ▲
     │  XYZ raster tiles (true color)    │      │ item tilejson URLs
     ▼                                   ▼      │
┌────────────────────┐            POST /api/analysis
│ PC Data API (tiles)│                   │
└────────────────────┘                   ▼ (server-to-server)
                              ┌────────────────────┐  COG range reads (SAS-signed)
                              │ Cloud Run analysis │ ────────────────────────────► Sentinel-2 L2A
                              │ FastAPI + rasterio │                                blobs (AOI window only)
                              └────────────────────┘
                                        │ GeoJSON + statistics
                                        ▼
                              Next.js → change layer on the map
```

Key detail: **tile URLs resolve on the client**. `/api/search` returns
Planetary Computer `tilejson` URLs per scene; the browser fetches them
(CORS-open) and MapLibre renders XYZ tiles directly. Our servers never proxy
imagery.

## Query interpretation (`lib/queryParser.ts`)

Deterministic pipeline: gazetteer match (longest alias wins) → date-range
extraction (ISO pairs, month-year pairs, `between X and Y`, `from X to Y`,
`since YYYY`, bare years) → analysis-kind detection (urban / vegetation /
land-use keyword rules) → optional MGRS tile hint.

Fallbacks, never failures: missing dates default to 2018→present (with a
visible warning); end dates clamp to the current year-end; a gazetteer miss
falls through to the Open-Meteo geocoder (point → ~12 km AOI); only an
unresolvable *location* is a hard 400.

## Scene selection (`lib/sceneSelection.ts`)

1. STAC search filtered to `eo:cloud_cover < 25`, deduplicated by
   (MGRS tile, day).
2. **Coverage filter**: prefer scenes whose bbox fully contains the AOI — a
   scene that merely clips the AOI edge would poison analysis and swipes.
3. Split candidates into earlier/later halves; pick the clearest scene in
   each (cloud score relative to a 5% target).
4. **Grid alignment**: constrain the pair to the same MGRS tile (or at least
   the same UTM zone) so the two rasters share a CRS. This is what keeps the
   NDVI difference meaningful.
5. Notes are returned for every adjustment so the UI can show *why*.

The flagship query additionally uses pinned search windows (clearest
Jan–Feb 2018 / Jan–Feb 2026) and a pinned AOI so demo runs are stable and
match the cache.

## Change detection (`services/analysis`)

```
NDVI_before = (B08 − B04) / (B08 + B04)      # AOI-clipped COG windows only
NDVI_after  = (B08 − B04) / (B08 + B04)
diff        = NDVI_after − NDVI_before
mask        = |diff| ≥ threshold (default 0.20, configurable 0.05–0.60)
mask       &= valid SCL pixels (clouds/shadow/cirrus/nodata excluded, both dates)
clean       = binary closing → binary opening (3×3)
components  = 8-connected labeling, drop components < 6 px
vectorize   = rasterio.features.shapes → shapely simplify (10 m) → WGS84
stats       = per-region area/magnitude/NDVI means + AOI aggregates
```

Pixel budget: bands are read through `rasterio.windows` + bilinear
downsampling to ≤ ~1.2 MP per band regardless of AOI size, so memory is
bounded and no full scene is ever downloaded. AOIs above 25,000 km² are
rejected with a clear message.

The output is *localized* change regions (250 max, sorted by area), not a
global change mask — each region carries `region_id`, `area_km2`,
`change_magnitude`, `ndvi_before`, `ndvi_after`.

## Demo cache / fallback

`apps/web/public/demo/hyderabad/analysis.json` is produced by
`scripts/build_hyderabad_cache.py`, which runs the *same* analysis function
on the same pinned scenes/AOI as live traffic. `/api/analysis` loads it from
disk at request time (never bundled into JS). When the live call fails or
times out **and** the requested scene pair matches the cached pair, the
cached GeoJSON/statistics are served with `source: "cache"` and a visible
warning. Scene metadata and imagery remain live in both modes.

## Failure handling matrix

| Failure | Behavior |
| --- | --- |
| STAC timeout / unreachable | 504 with message; UI shows error state, retry available |
| No scenes found | 404 with suggestion to widen the date range |
| Invalid query / no location | 400 with a concrete example in the message |
| Geocoder down | Warning + search proceeds if gazetteer matched |
| Analysis service down | 503 + hint; flagship pair → cached result |
| Cloud Run cold start | Client timeout 120 s; panel copy explains cold starts |
| Raster read error / 422 | 502/422 surfaced verbatim in the UI error state |
| AOI too large | 413 with the size limit in the message |
| Empty change result | `status: "no_change"` + explanatory panel (not an error) |
| Malformed GeoJSON | Validated client-side before the layer is added |
| Tile load failure | Map-level error chip; basemap + vector layers still work |
