import { NextRequest, NextResponse } from "next/server";

import { geocodeLocation } from "@/lib/geocoding";
import { InvalidQueryError, parseQuery } from "@/lib/queryParser";
import { searchScenes, StacError } from "@/lib/stac";
import { selectBeforeAfter } from "@/lib/sceneSelection";
import { validateBBox } from "@/lib/validation";
import { PRESET_CATALOG } from "@/lib/presets";
import type { BBox } from "@/types/geojson";
import type { SceneSummary } from "@/types/scene";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_CLOUD = 25;

/** Flagship demo windows — pinned so scene selection is stable across runs
 *  and always matches the cached fallback result. */
const FLAGSHIP_WINDOWS: Array<{ start: string; end: string }> = [
  { start: "2018-01-01", end: "2018-02-28" },
  { start: "2026-01-01", end: "2026-02-28" },
];

/** Pinned flagship AOI (central Hyderabad). Must equal scripts/build_hyderabad_cache.py
 *  so live analysis, the map view, and the cached fallback cover the same area. */
const FLAGSHIP_AOI: BBox = [78.25, 17.25, 78.45, 17.45];

function pickClearest(scenes: SceneSummary[]): SceneSummary | null {
  if (scenes.length === 0) return null;
  return [...scenes].sort((a, b) => a.cloudCover - b.cloudCover)[0];
}

export async function POST(req: NextRequest) {
  let body: { query?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "request body must be JSON" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query : "";
  if (!query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  // 1. Deterministic parse
  let parsed;
  try {
    parsed = parseQuery(query);
  } catch (e) {
    if (e instanceof InvalidQueryError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  // 2. Resolve AOI: gazetteer hit, else geocoding fallback
  let bbox: BBox | undefined = parsed.bbox;
  let geocoded = false;
  if (!bbox) {
    try {
      const geo = await geocodeLocation(parsed.location);
      if (geo) {
        bbox = geo.bbox;
        geocoded = true;
        parsed.notes.push(`location resolved via geocoding: ${geo.name}`);
      }
    } catch {
      parsed.warnings.push("geocoding service unavailable");
    }
  }
  if (!bbox) {
    return NextResponse.json(
      { error: `could not resolve coordinates for "${parsed.location}"` },
      { status: 422 }
    );
  }
  const v = validateBBox(bbox);
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 422 });
  bbox = v.bbox;

  // 3. STAC search (flagship uses pinned windows + pinned AOI for a stable
  // demo that matches the cache)
  const isFlagship = PRESET_CATALOG.some((p) => p.flagship && p.name === parsed.location);
  if (isFlagship) {
    bbox = FLAGSHIP_AOI;
    parsed.notes.push("flagship demo: using pinned central-Hyderabad AOI for reproducible analysis");
  }
  let candidateScenes: SceneSummary[] = [];
  const selectionNotes: string[] = [];

  try {
    if (isFlagship) {
      const windowScenes: SceneSummary[][] = [];
      for (const w of FLAGSHIP_WINDOWS) {
        windowScenes.push(
          await searchScenes({ bbox, startDate: w.start, endDate: w.end, maxCloud: MAX_CLOUD, coverAoi: true })
        );
      }
      const before = pickClearest(windowScenes[0]);
      // Constrain the after-pool to the same MGRS tile (or at least the same
      // UTM zone) so the rasters are spatially aligned — a zone-43 scene can
      // have a lower cloud score yet a misaligned grid vs a zone-44 before.
      let afterPool = windowScenes[1];
      if (before?.mgrsTile) {
        const zone = before.mgrsTile.slice(0, 2);
        const sameTile = afterPool.filter((s) => s.mgrsTile === before.mgrsTile);
        const sameZone = afterPool.filter((s) => s.mgrsTile?.startsWith(zone));
        if (sameTile.length > 0) afterPool = sameTile;
        else if (sameZone.length > 0) {
          afterPool = sameZone;
          selectionNotes.push(`after window limited to UTM zone ${zone} for grid alignment`);
        }
      }
      const after = pickClearest(afterPool);
      candidateScenes = [...windowScenes[0], ...windowScenes[1]];
      if (before && after) {
        selectionNotes.push(
          `flagship demo: clearest scenes from pinned windows ${FLAGSHIP_WINDOWS[0].start}→${FLAGSHIP_WINDOWS[0].end} and ${FLAGSHIP_WINDOWS[1].start}→${FLAGSHIP_WINDOWS[1].end}`
        );
        return NextResponse.json({
          parsedQuery: { ...parsed, bbox },
          aoi: bbox,
          geocoded,
          candidateScenes,
          selectedScenes: { before, after },
          selectionNotes,
        });
      }
      selectionNotes.push("flagship pinned windows incomplete — falling back to range selection");
    }

    // Generic path: pick the before-scene from an EARLY window of the
    // requested range, then search an ANNIVERSARY window (same season) near
    // the end of the range for the after-scene. A single full-range search
    // biases both picks toward one end of the paginated results, and
    // comparing different seasons flags phenology (spring vs winter) as
    // change — anniversary dating removes that systematic error.
    const rangeDays = Math.max(
      1,
      Math.round(
        (Date.parse(parsed.endDate) - Date.parse(parsed.startDate)) / 86_400_000
      )
    );
    const winDays = Math.min(180, Math.max(45, Math.round(rangeDays / 4)));
    const earlyEnd = new Date(Date.parse(parsed.startDate) + winDays * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const earlyScenes = await searchScenes({
      bbox,
      startDate: parsed.startDate,
      endDate: earlyEnd,
      maxCloud: MAX_CLOUD,
      coverAoi: true,
    });
    const b = earlyScenes.length > 0 ? pickClearest(earlyScenes) : null;

    // After-scene window: anniversary of the before-scene's season in the
    // final year (± 30 days) for multi-year ranges; late-window split for
    // shorter ranges. The window is CAPPED at target+30d so a clearer scene
    // from a different season can't win the pick.
    let afterStart: string;
    let afterEnd: string;
    if (b && rangeDays >= 300) {
      const bd = new Date(b.datetime);
      const endYear = Number(parsed.endDate.slice(0, 4));
      const target = Date.UTC(endYear, bd.getUTCMonth(), bd.getUTCDate());
      afterStart = new Date(target - 30 * 86_400_000).toISOString().slice(0, 10);
      afterEnd = new Date(Math.min(target + 30 * 86_400_000, Date.parse(parsed.endDate)))
        .toISOString()
        .slice(0, 10);
      const minStart = new Date(Date.parse(earlyEnd) + 86_400_000).toISOString().slice(0, 10);
      if (afterStart < minStart) afterStart = minStart;
      if (afterStart > afterEnd) afterStart = afterEnd;
    } else {
      afterStart = new Date(
        Math.max(Date.parse(parsed.endDate) - winDays * 86_400_000, Date.parse(earlyEnd) + 86_400_000)
      )
        .toISOString()
        .slice(0, 10);
      afterEnd = parsed.endDate;
    }

    let lateScenes = await searchScenes({
      bbox,
      startDate: afterStart,
      endDate: afterEnd,
      maxCloud: MAX_CLOUD,
      coverAoi: true,
    });
    if (lateScenes.length === 0 && b && rangeDays >= 300) {
      // No same-season scene in the final year — widen to the whole late
      // half of the range and let seasonality be noted in the result.
      afterStart = new Date(
        Math.max(Date.parse(parsed.endDate) - winDays * 86_400_000, Date.parse(earlyEnd) + 86_400_000)
      )
        .toISOString()
        .slice(0, 10);
      afterEnd = parsed.endDate;
      lateScenes = await searchScenes({
        bbox,
        startDate: afterStart,
        endDate: afterEnd,
        maxCloud: MAX_CLOUD,
        coverAoi: true,
      });
      if (lateScenes.length > 0) {
        selectionNotes.push(
          "no same-season scene in the final year — after scene chosen from the late window; seasonal effects may influence the change result"
        );
      }
    }

    if (b && lateScenes.length > 0) {
      // Grid alignment: same MGRS tile preferred, same UTM zone acceptable.
      let pool = lateScenes;
      if (b.mgrsTile) {
        const zone = b.mgrsTile.slice(0, 2);
        const sameTile = pool.filter((s) => s.mgrsTile === b.mgrsTile);
        const sameZone = pool.filter((s) => s.mgrsTile?.startsWith(zone));
        if (sameTile.length > 0) pool = sameTile;
        else if (sameZone.length > 0) {
          pool = sameZone;
          selectionNotes.push(`after window limited to UTM zone ${zone} for grid alignment`);
        }
      }
      const a = pickClearest(pool);
      if (a) {
        selectionNotes.push(
          `before scene from the early window (${parsed.startDate}→${earlyEnd}); after scene from ${afterStart}→${afterEnd}` +
            (rangeDays >= 300 && afterEnd !== parsed.endDate ? " (matching the before scene's season)" : "")
        );
        const gapDays = Math.round(
          (Date.parse(a.datetime) - Date.parse(b.datetime)) / 86_400_000
        );
        if (gapDays < 30) {
          selectionNotes.push(
            `selected scenes are only ${gapDays} days apart; change signal may be weak`
          );
        }
        if (b.mgrsTile && a.mgrsTile && b.mgrsTile !== a.mgrsTile) {
          selectionNotes.push(
            `before/after scenes span MGRS tiles ${b.mgrsTile}/${a.mgrsTile}; analysis may clip to scene overlap`
          );
        }
        candidateScenes = [...earlyScenes, ...lateScenes];
        return NextResponse.json({
          parsedQuery: { ...parsed, bbox },
          aoi: bbox,
          geocoded,
          candidateScenes: candidateScenes.slice(0, 24),
          selectedScenes: { before: b, after: a },
          selectionNotes,
        });
      }
    }

    // Windowed search incomplete → full-range fallback (old behavior).
    candidateScenes = await searchScenes({
      bbox,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      maxCloud: MAX_CLOUD,
      coverAoi: true,
    });
    if (candidateScenes.length === 0) {
      // AOI too wide for one tile → re-search without the coverage filter
      candidateScenes = await searchScenes({
        bbox,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        maxCloud: MAX_CLOUD,
      });
      selectionNotes.push(
        "no single scene covers the whole AOI — using partial-coverage scenes; analysis will clip to scene overlap"
      );
    }
  } catch (e) {
    if (e instanceof StacError) {
      return NextResponse.json(
        { error: e.message, parsedQuery: { ...parsed, bbox } },
        { status: 504 }
      );
    }
    throw e;
  }

  if (candidateScenes.length === 0) {
    return NextResponse.json(
      {
        error: `no Sentinel-2 scenes found for ${parsed.location} in ${parsed.startDate} → ${parsed.endDate} (try widening the date range)`,
        parsedQuery: { ...parsed, bbox },
        aoi: bbox,
        candidateScenes: [],
        selectedScenes: { before: null, after: null },
      },
      { status: 404 }
    );
  }

  // 4. Deterministic before/after selection
  const selection = selectBeforeAfter(candidateScenes);
  selectionNotes.push(...selection.notes);

  return NextResponse.json({
    parsedQuery: { ...parsed, bbox },
    aoi: bbox,
    geocoded,
    candidateScenes: candidateScenes.slice(0, 24),
    selectedScenes: { before: selection.before, after: selection.after },
    selectionNotes,
  });
}
