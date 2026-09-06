import { NextRequest, NextResponse } from "next/server";

import { searchScenes, StacError } from "@/lib/stac";
import { selectBeforeAfter } from "@/lib/sceneSelection";
import { validateBBox, validateDateRange } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "request body must be JSON" }, { status: 400 });
  }

  const v = validateBBox(body.bbox);
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 422 });

  const startDate = typeof body.startDate === "string" ? body.startDate : "";
  const endDate = typeof body.endDate === "string" ? body.endDate : "";
  const dr = validateDateRange(startDate, endDate);
  if (!dr.ok) return NextResponse.json({ error: dr.reason }, { status: 422 });

  const maxCloud = typeof body.maxCloud === "number" ? body.maxCloud : 25;

  try {
    const scenes = await searchScenes({ bbox: v.bbox, startDate, endDate, maxCloud });
    const selection = selectBeforeAfter(scenes);
    return NextResponse.json({
      candidateScenes: scenes.slice(0, 24),
      selectedScenes: { before: selection.before, after: selection.after },
      selectionNotes: selection.notes,
    });
  } catch (e) {
    if (e instanceof StacError) {
      return NextResponse.json({ error: e.message }, { status: 504 });
    }
    throw e;
  }
}
