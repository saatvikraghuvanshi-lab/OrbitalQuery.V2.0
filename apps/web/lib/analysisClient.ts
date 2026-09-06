import type { SceneSummary } from "@/types/scene";
import type { AnalysisRequest } from "@/types/analysis";
import { env } from "./env";
import { getSasToken } from "./planetaryComputer";

export class AnalysisUnavailableError extends Error {
  constructor(message: string, readonly cause_status?: number) {
    super(message);
  }
}

/**
 * POST the analysis job to the Python service. Server-side only.
 * The scene objects are trimmed to exactly what the service accepts.
 */
export async function requestAnalysis(
  before: SceneSummary,
  after: SceneSummary,
  bbox: [number, number, number, number],
  threshold?: number
): Promise<{ status: string; geojson: unknown; statistics: unknown; timing_ms: number; warnings: string[] }> {
  const body: AnalysisRequest = {
    beforeScene: {
      id: before.id,
      collection: before.collection,
      datetime: before.datetime,
      bbox: before.bbox,
    },
    afterScene: {
      id: after.id,
      collection: after.collection,
      datetime: after.datetime,
      bbox: after.bbox,
    },
    bbox,
    threshold,
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), env.analysisTimeoutMs);
  try {
    const res = await fetch(`${env.analysisServiceUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 503) {
      throw new AnalysisUnavailableError("analysis service is temporarily unavailable");
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AnalysisUnavailableError(
        `analysis failed (${res.status}): ${detail.slice(0, 200)}`,
        res.status
      );
    }
    const data = (await res.json()) as {
      status?: string;
      message?: string;
      geojson: unknown;
      statistics: unknown;
      timing_ms?: number;
      warnings?: string[] | null;
    };
    return {
      status: data.status ?? "ok",
      geojson: data.geojson,
      statistics: data.statistics,
      timing_ms: data.timing_ms ?? 0,
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
    };
  } catch (e) {
    if (e instanceof AnalysisUnavailableError) throw e;
    throw new AnalysisUnavailableError(
      e instanceof Error && e.name === "AbortError"
        ? "analysis timed out"
        : "analysis service unreachable"
    );
  } finally {
    clearTimeout(t);
  }
}
