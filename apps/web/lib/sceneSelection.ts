import type { SceneSummary } from "@/types/scene";

export interface SceneSelection {
  before: SceneSummary | null;
  after: SceneSummary | null;
  notes: string[];
}

const TARGET_SCENE_CLOUD = 5;
const ABS_MAX_SCENE_CLOUD = 25;

function cloudScore(s: SceneSummary): number {
  // Prefer scenes near the target cloud cover; heavily penalize the rest.
  const d = Math.max(0, s.cloudCover - TARGET_SCENE_CLOUD);
  return d + (s.cloudCover > ABS_MAX_SCENE_CLOUD ? 100 : 0);
}

/**
 * Deterministic before/after scene selection.
 *
 * Strategy: split the date range into an earlier and a later window, pick the
 * clearest scene in each half, and require the two scenes to come from the
 * same MGRS tile when possible so their rasters align for analysis.
 */
export function selectBeforeAfter(scenes: SceneSummary[]): SceneSelection {
  const notes: string[] = [];
  if (scenes.length === 0) return { before: null, after: null, notes };

  // Scenes span the sorted candidate list; pick a mid split.
  const mid = Math.floor(scenes.length / 2);
  const earlier = scenes.slice(0, mid);
  const later = scenes.slice(mid);

  const pick = (pool: SceneSummary[]): SceneSummary | null => {
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => cloudScore(a) - cloudScore(b))[0];
  };

  let before = pick(earlier) ?? pick(later);
  let after = pick(later) ?? pick(earlier);

  if (!before || !after) {
    return { before: null, after: null, notes: ["could not select two distinct scenes"] };
  }
  if (before.id === after.id) {
    // Only one candidate available — cannot compare.
    return {
      before,
      after: null,
      notes: ["only one suitable scene found; a time comparison needs at least two"],
    };
  }
  if (before.datetime > after.datetime) {
    const t = before;
    before = after;
    after = t;
  }

  if (before.mgrsTile && after.mgrsTile && before.mgrsTile !== after.mgrsTile) {
    // Prefer a pair sharing a UTM zone (same CRS ⇒ aligned grids) — same tile
    // is ideal; same zone is acceptable. Zone = first two chars of the tile id.
    const zoneOf = (t: string) => t.slice(0, 2);
    const sameZone = scenes.filter(
      (s) =>
        s.mgrsTile &&
        zoneOf(s.mgrsTile) === zoneOf(before!.mgrsTile!) &&
        s.id !== before!.id &&
        s.datetime > before!.datetime
    );
    const sameTile = sameZone.filter((s) => s.mgrsTile === before!.mgrsTile);
    const altAfter = pick(sameTile.length > 0 ? sameTile : sameZone);
    if (altAfter) {
      notes.push(
        sameTile.length > 0
          ? `after scene re-selected within MGRS tile ${before.mgrsTile} for grid alignment`
          : `after scene re-selected within UTM zone ${zoneOf(before!.mgrsTile!)} for grid alignment`
      );
      after = altAfter;
    } else {
      notes.push(
        `before/after scenes span different UTM zones (${before.mgrsTile}/${after.mgrsTile}); analysis may be unreliable — try a narrower AOI`
      );
    }
  }

  // Guard: sensible temporal spacing (>= 30 days apart).
  const gapDays =
    (new Date(after.datetime).getTime() - new Date(before.datetime).getTime()) / 86_400_000;
  if (gapDays < 30) {
    notes.push(
      `selected scenes are only ${Math.round(gapDays)} days apart; change signal may be weak`
    );
  }

  return { before, after, notes };
}
