import { env } from "./env";
import { itemTilejsonUrl } from "./planetaryComputer";
import type { SceneSummary } from "@/types/scene";

/** Minimal STAC item shape we rely on. */
interface StacItem {
  id: string;
  bbox: number[];
  properties: Record<string, unknown>;
  assets: Record<string, unknown>;
  collection?: string;
}

export class StacError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function stacFetch(path: string, body?: unknown): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), env.stacTimeoutMs);
  try {
    const res = await fetch(`${env.stacUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    return res;
  } catch (e) {
    throw new StacError(
      e instanceof Error && e.name === "AbortError"
        ? "STAC search timed out"
        : "STAC service unreachable",
      504
    );
  } finally {
    clearTimeout(t);
  }
}

function toSceneSummary(item: StacItem): SceneSummary | null {
  const datetime = (item.properties?.datetime as string) ?? null;
  if (!datetime) return null;
  const cloud = Number(item.properties?.["eo:cloud_cover"] ?? 100);
  if (!Number.isFinite(cloud)) return null;
  const bbox = item.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;

  const assets = Object.keys(item.assets ?? {});
  const useful = ["visual", "B04", "B08", "SCL"].filter((a) => assets.includes(a));
  if (!useful.includes("visual")) return null; // can't render without it

  return {
    id: item.id,
    collection: item.collection ?? "sentinel-2-l2a",
    datetime,
    cloudCover: cloud,
    bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
    mgrsTile: (item.properties?.["s2:mgrs_tile"] as string) ?? null,
    tileUrl: itemTilejsonUrl({ collection: item.collection ?? "sentinel-2-l2a", item: item.id, kind: "trueColor" }),
    assets: useful,
  };
}

export interface SceneSearchParams {
  bbox: [number, number, number, number];
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  maxCloud: number;  // percent
  limit?: number;
  /** When true, only keep scenes whose bbox fully contains the AOI, so
   *  before/after scenes always cover the whole area (a scene that merely
   *  clips the AOI edge would poison analysis and edge-to-edge swipes).
   *  Falls back to unfiltered results when nothing covers the AOI. */
  coverAoi?: boolean;
}

/** Search Sentinel-2 L2A scenes over an AOI + date window. */
export async function searchScenes(params: SceneSearchParams): Promise<SceneSummary[]> {
  const body = {
    collections: ["sentinel-2-l2a"],
    bbox: params.bbox,
    datetime: `${params.startDate}T00:00:00Z/${params.endDate}T23:59:59Z`,
    query: { "eo:cloud_cover": { lt: params.maxCloud } },
    limit: params.limit ?? 40,
  };
  const res = await stacFetch("/search", body);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new StacError(`STAC search failed (${res.status}) ${text.slice(0, 160)}`, res.status);
  }
  const data = (await res.json()) as { features?: StacItem[] };
  const scenes = (data.features ?? [])
    .map(toSceneSummary)
    .filter((s): s is SceneSummary => s !== null);

  // Coverage filter: drop scenes that do not fully contain the AOI.
  let covered = scenes;
  if (params.coverAoi) {
    const [w, s, e, n] = params.bbox;
    const inside = scenes.filter(
      (sc) => sc.bbox[0] <= w && sc.bbox[1] <= s && sc.bbox[2] >= e && sc.bbox[3] >= n
    );
    if (inside.length > 0) covered = inside;
  }

  // Deduplicate by MGRS tile + day (STAC can return processing duplicates).
  const seen = new Set<string>();
  const deduped = covered.filter((s) => {
    const day = s.datetime.slice(0, 10);
    const key = `${s.mgrsTile ?? s.bbox.join(",")}|${day}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: earliest acquisitions first, then lowest cloud cover.
  deduped.sort((a, b) => (a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : a.cloudCover - b.cloudCover));
  return deduped;
}
