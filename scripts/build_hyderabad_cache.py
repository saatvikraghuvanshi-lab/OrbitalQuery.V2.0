"""Build the flagship Hyderabad demo cache by running the REAL pipeline.

Searches the same pinned windows as /api/search (clearest Jan-Feb 2018 and
Jan-Feb 2026 Sentinel-2 scenes over the Hyderabad AOI), runs the live
NDVI change-detection pipeline, and writes the result to
apps/web/public/demo/hyderabad/analysis.json.

This is a build script, not a runtime dependency: the app reads the JSON,
never this code. Run:  python scripts/build_hyderabad_cache.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "services" / "analysis"))

from app.models.requests import AnalyzeRequest, SceneRef  # noqa: E402
from app.routes.analysis import analyze  # noqa: E402
from app.services import raster as raster_svc  # noqa: E402

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
AOI = [78.25, 17.25, 78.45, 17.45]
WINDOWS = [("2018-01-01", "2018-02-28"), ("2026-01-01", "2026-02-28")]
OUT = ROOT / "apps" / "web" / "public" / "demo" / "hyderabad" / "analysis.json"


def search_window(bbox, start, end):
    import requests

    resp = requests.post(
        STAC_URL,
        json={
            "collections": ["sentinel-2-l2a"],
            "bbox": bbox,
            "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
            "query": {"eo:cloud_cover": {"lt": 25}},
            "limit": 30,
        },
        timeout=30,
    )
    resp.raise_for_status()
    items = resp.json().get("features", [])
    # coverage rule: the scene bbox must fully contain the AOI (same rule as
    # the web app) so the 'after' scene can't be a tile that only clips an edge
    w, s, e, n = bbox
    items = [
        it for it in items
        if it["bbox"][0] <= w and it["bbox"][1] <= s and it["bbox"][2] >= e and it["bbox"][3] >= n
    ]
    # same dedup rule as the web app: tile + day
    seen, out = set(), []
    for it in items:
        key = (it["properties"].get("s2:mgrs_tile"), it["properties"]["datetime"][:10])
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    out.sort(key=lambda it: (it["properties"]["datetime"], it["properties"]["eo:cloud_cover"]))
    return out


def main():
    print("Searching pinned windows over Hyderabad AOI", AOI)
    pools = [search_window(AOI, s, e) for (s, e) in WINDOWS]
    before_pool, after_pool = pools
    # Clearest before scene; then prefer an after scene in the SAME MGRS tile
    # (or at least the same UTM zone) so rasters are spatially aligned.
    before_item = min(before_pool, key=lambda it: it["properties"]["eo:cloud_cover"])
    before_tile = before_item["properties"].get("s2:mgrs_tile", "")
    before_zone = before_tile[:2]
    same_tile = [it for it in after_pool if it["properties"].get("s2:mgrs_tile") == before_tile]
    same_zone = [it for it in after_pool if it["properties"].get("s2:mgrs_tile", "")[:2] == before_zone]
    if same_tile:
        after_pool = same_tile
    elif same_zone:
        after_pool = same_zone
        print("note: no same-tile after scene; using same UTM zone", before_zone)
    after_item = min(after_pool, key=lambda it: it["properties"]["eo:cloud_cover"])
    before_cloud = before_item["properties"]["eo:cloud_cover"]
    after_cloud = after_item["properties"]["eo:cloud_cover"]
    print(f"before: {before_item['id']}  cloud={before_cloud:.2f}%  tile={before_tile}")
    print(f"after : {after_item['id']}  cloud={after_cloud:.2f}%  tile={after_item['properties'].get('s2:mgrs_tile')}")

    req = AnalyzeRequest(
        before_scene=SceneRef(
            id=before_item["id"],
            collection="sentinel-2-l2a",
            datetime=before_item["properties"]["datetime"],
            bbox=before_item["bbox"],
        ),
        after_scene=SceneRef(
            id=after_item["id"],
            collection="sentinel-2-l2a",
            datetime=after_item["properties"]["datetime"],
            bbox=after_item["bbox"],
        ),
        bbox=AOI,
    )
    print("Running live NDVI change analysis (streams ~4 bands + 2 SCL)...")
    resp = analyze(req)
    if resp.status != "ok":
        print(f"ANALYSIS DID NOT SUCCEED: status={resp.status} message={resp.message}")
        sys.exit(1)

    payload = {
        "beforeScene": {
            "id": before_item["id"],
            "collection": "sentinel-2-l2a",
            "datetime": before_item["properties"]["datetime"],
            "cloudCover": round(float(before_cloud), 2),
            "bbox": [round(x, 6) for x in before_item["bbox"]],
            "mgrsTile": before_item["properties"].get("s2:mgrs_tile"),
        },
        "afterScene": {
            "id": after_item["id"],
            "collection": "sentinel-2-l2a",
            "datetime": after_item["properties"]["datetime"],
            "cloudCover": round(float(after_cloud), 2),
            "bbox": [round(x, 6) for x in after_item["bbox"]],
            "mgrsTile": after_item["properties"].get("s2:mgrs_tile"),
        },
        "aoi": AOI,
        "analysis": {
            "status": "ok",
            "geojson": resp.geojson,
            "statistics": resp.statistics.model_dump(),
            "computedAt": datetime.now(timezone.utc).isoformat(),
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1), encoding="utf-8")

    stats = resp.statistics
    print(f"\nOK -> {OUT}")
    print(f"  regions={stats.n_regions}  area={stats.total_changed_area_km2} km2  "
          f"mean|dNDVI|={stats.mean_change_magnitude}  "
          f"NDVI {stats.ndvi_before_mean} -> {stats.ndvi_after_mean}")
    print(f"  timing={resp.timing_ms}ms  warnings={resp.warnings}")


if __name__ == "__main__":
    main()
