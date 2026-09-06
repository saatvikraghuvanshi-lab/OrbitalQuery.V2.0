import { NextRequest, NextResponse } from "next/server";

import { requestAnalysis, AnalysisUnavailableError } from "@/lib/analysisClient";
import {
  flagshipFallbackResponse,
  getFlagshipDemo,
  isFlagshipPair,
} from "@/lib/demoCache";
import { validateBBox } from "@/lib/validation";
import type { AnalysisResponse } from "@/types/analysis";
import type { SceneSummary } from "@/types/scene";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "request body must be JSON" }, { status: 400 });
  }

  const before = body.beforeScene as SceneSummary | undefined;
  const after = body.afterScene as SceneSummary | undefined;
  if (!before || !after || typeof before.id !== "string" || typeof after.id !== "string") {
    return NextResponse.json(
      { error: "beforeScene and afterScene are required" },
      { status: 400 }
    );
  }

  const v = validateBBox(body.bbox);
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 422 });

  const threshold = typeof body.threshold === "number" ? body.threshold : undefined;
  const analysisKind =
    body.analysisKind === "urban_change" || body.analysisKind === "vegetation_change" || body.analysisKind === "land_use_change"
      ? body.analysisKind
      : "vegetation_change";

  // Flagship fallback: if live analysis fails for the cached Hyderabad pair,
  // serve the cached result so the demo never dead-ends.
  const cacheEntry = await getFlagshipDemo();
  const flagship = isFlagshipPair(cacheEntry, before.id, after.id);

  try {
    const result = await requestAnalysis(before, after, v.bbox, threshold);
    const payload: AnalysisResponse = {
      status: result.status === "no_change" ? "no_change" : "ok",
      message: result.status === "no_change" ? "No significant change detected at this threshold" : undefined,
      geojson: result.geojson as AnalysisResponse["geojson"],
      statistics: result.statistics as AnalysisResponse["statistics"],
      timing_ms: result.timing_ms,
      analysisKind,
      source: "live",
      warnings: result.warnings ?? [],
    };
    return NextResponse.json(payload);
  } catch (e) {
    if (flagship && cacheEntry) {
      const fallback = flagshipFallbackResponse(cacheEntry);
      fallback.warnings = [
        ...(fallback.warnings ?? []),
        `(live analysis: ${e instanceof Error ? e.message : "unknown error"})`,
      ];
      return NextResponse.json(fallback);
    }
    if (e instanceof AnalysisUnavailableError) {
      return NextResponse.json(
        {
          error: e.message,
          hint: "Is the analysis service running? For local dev: uvicorn app.main:app --port 8000 (see services/analysis).",
        },
        { status: 503 }
      );
    }
    throw e;
  }
}
