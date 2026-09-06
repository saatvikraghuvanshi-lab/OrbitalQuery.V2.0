import { NextResponse } from "next/server";

import { env, isLocalAnalysisService } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // STAC reachability
  const stacCtrl = new AbortController();
  const stacTimer = setTimeout(() => stacCtrl.abort(), 5000);
  try {
    const res = await fetch(`${env.stacUrl}/collections/sentinel-2-l2a`, {
      signal: stacCtrl.signal,
      cache: "no-store",
    });
    checks.stac = { ok: res.ok, detail: res.ok ? undefined : `status ${res.status}` };
  } catch {
    checks.stac = { ok: false, detail: "unreachable" };
  } finally {
    clearTimeout(stacTimer);
  }

  // Analysis service reachability
  const anaCtrl = new AbortController();
  const anaTimer = setTimeout(() => anaCtrl.abort(), 5000);
  try {
    const res = await fetch(`${env.analysisServiceUrl}/health`, {
      signal: anaCtrl.signal,
      cache: "no-store",
    });
    checks.analysisService = {
      ok: res.ok,
      detail: res.ok ? undefined : `status ${res.status}`,
    };
  } catch {
    checks.analysisService = {
      ok: false,
      detail: isLocalAnalysisService()
        ? "not running locally (start with: uvicorn app.main:app --port 8000)"
        : "unreachable",
    };
  } finally {
    clearTimeout(anaTimer);
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks, time: new Date().toISOString() },
    { status: ok ? 200 : 200 } // 200 always — degraded is still a valid health state
  );
}
