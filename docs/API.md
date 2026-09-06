# OrbitalQuery V2 — API

All endpoints live under the Next.js app (`/api/*`). The Python service is
internal (server-to-server only; the browser never calls it).

## POST /api/search

Interpret a natural-language query, resolve the AOI, search STAC, select
before/after scenes.

**Request**
```json
{ "query": "urban expansion in Hyderabad between 2018 and 2026" }
```

**Response 200**
```json
{
  "parsedQuery": {
    "location": "Hyderabad",
    "bbox": [78.25, 17.25, 78.45, 17.45],
    "startDate": "2018-01-01",
    "endDate": "2026-12-31",
    "analysis": "urban_change",
    "dataset": "sentinel-2-l2a",
    "notes": ["location: \"Hyderabad\" (matched \"hyderabad\")", "…"],
    "warnings": []
  },
  "aoi": [78.25, 17.25, 78.45, 17.45],
  "geocoded": false,
  "candidateScenes": [
    {
      "id": "S2B_MSIL2A_20250226T050659_R019_T44QKE_20250226T071341",
      "collection": "sentinel-2-l2a",
      "datetime": "2025-02-26T05:06:59.024000Z",
      "cloudCover": 0.55,
      "bbox": [78.16, 17.07, 79.21, 18.08],
      "mgrsTile": "44QKE",
      "tileUrl": "https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json?…",
      "assets": ["visual", "B04", "B08", "SCL"]
    }
  ],
  "selectedScenes": { "before": { … }, "after": { … } },
  "selectionNotes": ["after scene re-selected within MGRS tile 44QKE for grid alignment"]
}
```

**Errors**
- `400` unparsable query (no location, too short) — message includes an example
- `404` no scenes in the window (suggests widening dates)
- `422` unresolvable location or invalid AOI
- `504` STAC timeout/unreachable

## POST /api/scenes

Scene retrieval without query parsing (used when bbox/dates come from a UI
control rather than text).

**Request**
```json
{ "bbox": [78.2, 17.3, 78.4, 17.5], "startDate": "2018-01-01", "endDate": "2026-12-31", "maxCloud": 25 }
```
**Response 200**
```json
{ "candidateScenes": [ … ], "selectedScenes": { "before": …, "after": … }, "selectionNotes": [] }
```
**Errors:** `422` invalid bbox/dates, `504` STAC failure.

## POST /api/analysis

Run change detection on a selected scene pair + AOI. Proxies to the Python
service; on failure for the cached flagship pair, returns the cached result.

**Request**
```json
{
  "beforeScene": { "id": "S2A_MSIL2A_…", "collection": "sentinel-2-l2a", "datetime": "2018-02-28T05:07:41Z", "bbox": [ … ] },
  "afterScene":  { "id": "S2B_MSIL2A_…", "collection": "sentinel-2-l2a", "datetime": "2026-02-21T05:07:29Z", "bbox": [ … ] },
  "bbox": [78.25, 17.25, 78.45, 17.45],
  "analysisKind": "urban_change",
  "threshold": 0.2
}
```

**Response 200 (live)**
```json
{
  "status": "ok",
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": "R272",
        "geometry": { "type": "Polygon", "coordinates": [[ [78.312, 17.402], … ]]},
        "properties": {
          "region_id": "R272",
          "area_km2": 6.124637,
          "change_magnitude": 0.384,
          "ndvi_before": 0.3784,
          "ndvi_after": -0.0036
        }
      }
    ]
  },
  "statistics": {
    "n_regions": 250,
    "total_changed_area_km2": 55.333,
    "mean_change_magnitude": 0.2863,
    "max_region_area_km2": 6.1246,
    "threshold_used": 0.2,
    "aoi_area_km2": 470.52,
    "changed_fraction": 0.118,
    "ndvi_before_mean": 0.2412,
    "ndvi_after_mean": 0.1551,
    "pixel_counts": { "changed": 141560, "valid": 1199025, "total": 1199025 }
  },
  "timing_ms": 22444,
  "analysisKind": "urban_change",
  "source": "live",
  "warnings": []
}
```

`source` is `"cache"` when the flagship fallback was served (with a warning
string explaining why). `status` is `"no_change"` when detection succeeded
but nothing crossed the threshold — `geojson` is then `null` and the UI
shows an explanatory panel, not an error.

**Errors**
- `400` missing scenes / malformed body
- `413` AOI above the area limit
- `422` raster/grid validation failure
- `502` raster read failure upstream
- `503` analysis service unavailable (non-flagship pair)

## GET /api/health

Reports dependency health. Always HTTP 200 — "degraded" is a valid state.

```json
{
  "status": "ok",
  "checks": {
    "stac": { "ok": true },
    "analysisService": { "ok": true }
  },
  "time": "2026-09-06T16:41:22.914Z"
}
```

## Internal: POST /analyze (Cloud Run)

Same contract as `/api/analysis` minus the fallback logic; accepts both
`beforeScene`/`afterScene` (camelCase) and `before_scene`/`after_scene`
(snake_case). Guardrails: bbox ≤ 30° span, threshold ∈ [0.05, 0.60],
AOI ≤ `MAX_AOI_KM2`, same-collection pair required.

## GET /health (Cloud Run)

`{ "status": "ok", "service": "orbitalquery-analysis", "version": "2.0.0", "checks": { … }, "uptime_s": 12.3 }`
