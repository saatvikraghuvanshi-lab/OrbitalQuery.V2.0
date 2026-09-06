#!/usr/bin/env bash
# OrbitalQuery E2E smoke check.
# Starts the analysis service (uvicorn) + production Next.js server, runs the
# core API flows including failure cases, then shuts everything down.
# Usage: bash scripts/e2e_check.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY_PORT=8000
WEB_PORT=3100
PASS=0; FAIL=0
say() { echo "[$1] $2"; }
check() { # name, exit-code-of-probe
  if [ "$2" -eq 0 ]; then PASS=$((PASS+1)); say "PASS" "$1"; else FAIL=$((FAIL+1)); say "FAIL" "$1"; fi
}

# ---------- helpers ----------
post() { # url, json-body  -> writes body to last_body, echoes status
  local url="$1"; shift
  local data="$1"
  curl -s -m 150 -o "$ROOT/.e2e_body" -w "%{http_code}" -X POST "$url" -H "Content-Type: application/json" -d "$data"
}
get() {
  curl -s -m 20 -o "$ROOT/.e2e_body" -w "%{http_code}" "$1"
}
jqq() { node -e "const d=JSON.parse(require('fs').readFileSync(process.env.BODY,'utf8')); $1"; }
BODY="$ROOT/.e2e_body"
export BODY

# Windows-reliable kill: terminate whatever process owns the port (a subshell
# `kill $!` does not reach the python grandchild on MSYS).
kill_port_proc() {
  local port="$1" pid i
  pid=$(netstat -ano 2>/dev/null | grep ":$port .*LISTENING" | awk '{print $NF}' | head -1)
  if [ -n "${pid:-}" ]; then taskkill //PID "$pid" //F >/dev/null 2>&1; fi
  for i in $(seq 1 10); do
    netstat -ano 2>/dev/null | grep -q ":$port .*LISTENING" || return 0
    sleep 0.5
  done
}

# ---------- cleanup trap ----------
cleanup() {
  kill_port_proc "$WEB_PORT"
  kill_port_proc "$PY_PORT"
  rm -f "$BODY"
}
trap cleanup EXIT

# ---------- preflight: refuse to run against stale processes ----------
for port in "$PY_PORT" "$WEB_PORT"; do
  if netstat -ano 2>/dev/null | grep -q ":$port .*LISTENING"; then
    say "ABORT" "port $port is already in use — kill the stale process (orphaned server would falsify the failure-path tests) and retry"
    exit 2
  fi
done

# ---------- start services ----------
say "BOOT" "starting analysis service on :$PY_PORT"
(cd "$ROOT/services/analysis" && python -m uvicorn app.main:app --port "$PY_PORT" --log-level warning >/dev/null 2>&1) &
PY_PID=$!
say "BOOT" "building already done; starting Next server on :$WEB_PORT"
(cd "$ROOT/apps/web" && ANALYSIS_SERVICE_URL="http://localhost:$PY_PORT" npx next start -p "$WEB_PORT" >/dev/null 2>&1) &
WEB_PID=$!

for i in $(seq 1 30); do
  H=$(get "http://localhost:$PY_PORT/health" || true)
  [ "$H" = "200" ] && break
  sleep 1
done
check "analysis service /health responds" "$([ "$(get http://localhost:$PY_PORT/health)" = "200" ]; echo $?)"

for i in $(seq 1 40); do
  H=$(get "http://localhost:$WEB_PORT/api/health" || true)
  [ "$H" = "200" ] && break
  sleep 1
done

# ---------- web /api/health ----------
ST=$(get "http://localhost:$WEB_PORT/api/health")
check "web /api/health returns 200" "$([ "$ST" = "200" ]; echo $?)"
node -e "const d=JSON.parse(require('fs').readFileSync(process.env.BODY,'utf8')); process.exit(d.checks.stac.ok && d.checks.analysisService.ok ? 0 : 1)" \
  && check "web health reports both deps ok" 0 || check "web health reports both deps ok" 1

# ---------- flagship search ----------
ST=$(post "http://localhost:$WEB_PORT/api/search" '{"query":"urban expansion in Hyderabad between 2018 and 2026"}')
check "flagship search returns 200" "$([ "$ST" = "200" ]; echo $?)"
node -e "
const d=JSON.parse(require('fs').readFileSync(process.env.BODY,'utf8'));
const ok = d.parsedQuery?.location==='Hyderabad'
  && d.parsedQuery?.startDate==='2018-01-01'
  && d.parsedQuery?.endDate==='2026-12-31'
  && d.parsedQuery?.analysis==='urban_change'
  && d.selectedScenes?.before && d.selectedScenes?.after
  && JSON.stringify(d.aoi)===JSON.stringify([78.25,17.25,78.45,17.45]);
process.exit(ok?0:1);" \
  && check "flagship parse + scenes + pinned AOI correct" 0 || check "flagship parse + scenes + pinned AOI correct" 1

BEFORE_ID=$(jqq "process.stdout.write(d.selectedScenes.before.id)")
AFTER_ID=$(jqq "process.stdout.write(d.selectedScenes.after.id)")
say "INFO" "before=$BEFORE_ID"
say "INFO" "after =$AFTER_ID"

# ---------- invalid inputs ----------
ST=$(post "http://localhost:$WEB_PORT/api/search" '{"query":"hello world"}')
check "invalid query rejected (400)" "$([ "$ST" = "400" ]; echo $?)"
ST=$(post "http://localhost:$WEB_PORT/api/search" '{}')
check "missing query rejected (400)" "$([ "$ST" = "400" ]; echo $?)"

# ---------- live analysis on flagship pair ----------
ST=$(post "http://localhost:$WEB_PORT/api/analysis" "{\"beforeScene\":{\"id\":\"$BEFORE_ID\",\"collection\":\"sentinel-2-l2a\",\"datetime\":\"2018-02-28T05:07:41Z\",\"bbox\":[78.1,17.1,78.9,17.9]},\"afterScene\":{\"id\":\"$AFTER_ID\",\"collection\":\"sentinel-2-l2a\",\"datetime\":\"2026-02-21T05:07:29Z\",\"bbox\":[78.1,17.1,78.9,17.9]},\"bbox\":[78.25,17.25,78.45,17.45]}")
check "live analysis returns 200" "$([ "$ST" = "200" ]; echo $?)"
node -e "
const d=JSON.parse(require('fs').readFileSync(process.env.BODY,'utf8'));
const ok=d.source==='live' && d.status==='ok' && d.statistics?.n_regions>0 && d.geojson?.features?.length>0;
process.exit(ok?0:1);" \
  && check "live analysis produces regions (source=live)" 0 || check "live analysis produces regions (source=live)" 1

# ---------- fallback: analysis service down ----------
kill_port_proc "$PY_PORT"
ST=$(post "http://localhost:$WEB_PORT/api/analysis" "{\"beforeScene\":{\"id\":\"$BEFORE_ID\",\"collection\":\"sentinel-2-l2a\",\"datetime\":\"2018-02-28T05:07:41Z\",\"bbox\":[78.1,17.1,78.9,17.9]},\"afterScene\":{\"id\":\"$AFTER_ID\",\"collection\":\"sentinel-2-l2a\",\"datetime\":\"2026-02-21T05:07:29Z\",\"bbox\":[78.1,17.1,78.9,17.9]},\"bbox\":[78.25,17.25,78.45,17.45]}")
check "fallback analysis returns 200 when service down" "$([ "$ST" = "200" ]; echo $?)"
node -e "
const d=JSON.parse(require('fs').readFileSync(process.env.BODY,'utf8'));
const ok=d.source==='cache' && d.statistics?.n_regions>0 && Array.isArray(d.warnings) && d.warnings.length>0;
process.exit(ok?0:1);" \
  && check "fallback serves cached flagship result (source=cache)" 0 || check "fallback serves cached flagship result (source=cache)" 1

# ---------- non-flagship without service must fail cleanly ----------
ST=$(post "http://localhost:$WEB_PORT/api/analysis" "{\"beforeScene\":{\"id\":\"$BEFORE_ID\",\"collection\":\"sentinel-2-l2a\",\"datetime\":\"2018-02-28T05:07:41Z\",\"bbox\":[78.1,17.1,78.9,17.9]},\"afterScene\":{\"id\":\"S2B_MSIL2A_20250226T050659_R019_T44QKE_20250226T071341\",\"collection\":\"sentinel-2-l2a\",\"datetime\":\"2025-02-26T05:06:59Z\",\"bbox\":[78.1,17.1,78.9,17.9]},\"bbox\":[78.25,17.25,78.45,17.45]}")
check "non-flagship analysis without service returns 503" "$([ "$ST" = "503" ]; echo $?)"

# ---------- analysis service down: search still works ----------
ST=$(post "http://localhost:$WEB_PORT/api/search" '{"query":"land use change around Mumbai from 2018 to 2024"}')
check "preset search (Mumbai) works without analysis service" "$([ "$ST" = "200" ]; echo $?)"

# ---------- page rendering ----------
ST=$(get "http://localhost:$WEB_PORT/")
check "homepage renders (200)" "$([ "$ST" = "200" ]; echo $?)"
ST=$(get "http://localhost:$WEB_PORT/console")
check "console page renders (200)" "$([ "$ST" = "200" ]; echo $?)"

# ---------- summary ----------
say "SUMMARY" "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
