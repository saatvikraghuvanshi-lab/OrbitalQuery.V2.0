# OrbitalQuery V2 — Deployment

Two deployables, no infrastructure to manage:

| Piece | Where | Notes |
| --- | --- | --- |
| Web console + API routes | **Vercel** | Next.js 15, App Router |
| Analysis service | **Google Cloud Run** | container in `services/analysis/` |

Do **not** use Render. No database, no Redis, no auth provider is required.

## 1. Deploy the analysis service (Cloud Run)

```bash
cd services/analysis

# one-time: pick a region close to your users (Azure blob is in West Europe;
# any GCP region works — e.g. europe-west1 keeps latency low)
gcloud run deploy orbitalquery-analysis \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 4 \
  --set-env-vars ALLOWED_ORIGINS=https://YOUR-APP.vercel.app,MAX_AOI_KM2=25000
```

Notes:
- `--source .` builds the Dockerfile via Cloud Build (no local Docker needed).
- Memory 1 Gi is comfortable for the ~1.2 MP pixel budget; scale to 2 Gi if
  you raise `TARGET_PIXELS`.
- Timeout 300 s covers cold start + worst-case AOI. Min instances 0 is fine —
  the UI's copy and timeouts account for cold starts. For a flawless demo,
  set `--min-instances 1` for the day.
- The service has **no secrets**; Planetary Computer STAC/SAS are public.
- Verify: `curl https://<run-url>/health` → `{"status":"ok",…}`

## 2. Deploy the web app (Vercel)

```bash
cd apps/web
npx vercel            # link the project
```

Set environment variables in the Vercel dashboard (Project → Settings →
Environment Variables) — **Production** scope:

| Variable | Value | Notes |
| --- | --- | --- |
| `ANALYSIS_SERVICE_URL` | `https://orbitalquery-analysis-xxxx-ew.a.run.app` | **Must be the real Cloud Run URL.** Never `http://localhost:8000` in production. |
| `PLANETARY_COMPUTER_STAC_URL` | `https://planetarycomputer.microsoft.com/api/stac/v1` | optional; this is the default |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR-APP.vercel.app` | canonical links |
| `STAC_TIMEOUT_MS` | `12000` | optional |
| `ANALYSIS_TIMEOUT_MS` | `60000` | optional; must exceed Cloud Run cold start |

Then `npx vercel --prod`.

Checklist before the demo:
- [ ] `GET /api/health` returns `"status":"ok"` on the Vercel URL
- [ ] Flagship query returns scenes and `Run change analysis` returns
      `source: "live"` (check the panel badge)
- [ ] Kill the Cloud Run service (or set a bogus URL) and confirm the
      flagship falls back with `source: "cache"` + a visible warning
- [ ] `scripts/build_hyderabad_cache.py` has been run at least once against
      the pinned scenes so `public/demo/hyderabad/analysis.json` is real

## 3. Rebuilding the demo cache

The cache is committed with the repo. Rebuild it (e.g. after a season, to
refresh the 'after' scene) with:

```bash
python scripts/build_hyderabad_cache.py
# writes apps/web/public/demo/hyderabad/analysis.json
# commit + redeploy afterwards
```

If you change `FLAGSHIP_WINDOWS` or `FLAGSHIP_AOI` in
`apps/web/app/api/search/route.ts`, update the same constants in the script
and rebuild — the fallback only activates for the exact cached scene pair.

## Local development

```bash
cd apps/web && npm install && npm run dev
cd services/analysis && pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000 --reload
```

`apps/web/.env.local` (defaults already correct):
```
PLANETARY_COMPUTER_STAC_URL=https://planetarycomputer.microsoft.com/api/stac/v1
ANALYSIS_SERVICE_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`services/analysis/.env.example` documents the service-side options (all
optional, none secret).

## Cost / scale notes

- Vercel: free–pro tier is sufficient; API routes are Node runtime, max 30–90 s.
- Cloud Run: scale-to-zero; request-based billing. A full analysis run is
  ~15–25 s of CPU time.
- Planetary Computer is free for this usage pattern (STAC, SAS tokens, tiles,
  COG range reads). Be a good citizen: the pixel budget caps per-request load.
