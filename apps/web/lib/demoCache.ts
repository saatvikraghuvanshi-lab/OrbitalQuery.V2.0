/**
 * Demo cache for the flagship Hyderabad scenario.
 *
 * If live analysis fails or times out, the UI falls back to this cached
 * result. The imagery/scene metadata still point at the real Planetary
 * Computer STAC items — only the computed GeoJSON/statistics are cached.
 *
 * The JSON is read from disk at request time (NOT imported) so the ~800 KB
 * of GeoJSON never lands in the client bundle. The fallback activates only
 * when the requested scene pair matches the cached scene pair.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import type { AnalysisResponse } from "@/types/analysis";

export interface DemoSceneMeta {
  id: string;
  collection: string;
  datetime: string;
  cloudCover: number;
  bbox: [number, number, number, number];
  mgrsTile: string;
}

export interface DemoCacheEntry {
  beforeScene: DemoSceneMeta;
  afterScene: DemoSceneMeta;
  aoi: [number, number, number, number];
  analysis: {
    status: "ok";
    geojson: AnalysisResponse["geojson"];
    statistics: NonNullable<AnalysisResponse["statistics"]>;
    computedAt: string;
  };
}

const CACHE_PATH = path.join(process.cwd(), "public", "demo", "hyderabad", "analysis.json");

let memoryCache: DemoCacheEntry | null = null;

/** Load the flagship cache; null when missing or unreadable. */
export async function getFlagshipDemo(): Promise<DemoCacheEntry | null> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as DemoCacheEntry;
    if (
      parsed?.beforeScene?.id &&
      parsed?.afterScene?.id &&
      parsed?.analysis?.status === "ok"
    ) {
      memoryCache = parsed;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** True when the request matches the exact cached scene pair. */
export function isFlagshipPair(
  entry: DemoCacheEntry | null,
  beforeId: string,
  afterId: string
): boolean {
  if (!entry) return false;
  return entry.beforeScene.id === beforeId && entry.afterScene.id === afterId;
}

/** Build the fallback AnalysisResponse from a loaded cache entry. */
export function flagshipFallbackResponse(entry: DemoCacheEntry): AnalysisResponse {
  return {
    status: "ok",
    geojson: entry.analysis.geojson,
    statistics: entry.analysis.statistics,
    source: "cache",
    analysisKind: "urban_change",
    warnings: [
      "Live analysis was unavailable — showing the cached flagship result for Hyderabad. Scenes and imagery remain live.",
    ],
  };
}
