import { describe, expect, it } from "vitest";

import { selectBeforeAfter } from "@/lib/sceneSelection";
import type { SceneSummary } from "@/types/scene";

function scene(id: string, datetime: string, cloudCover = 3, mgrsTile = "44QKE"): SceneSummary {
  return {
    id,
    collection: "sentinel-2-l2a",
    datetime,
    cloudCover,
    bbox: [78.0, 17.0, 79.0, 18.0],
    mgrsTile,
    tileUrl: `https://example.com/${id}`,
    assets: ["visual", "B04", "B08", "SCL"],
  };
}

const SCENES = [
  scene("a-2018", "2018-01-12T05:07:03Z", 6),
  scene("b-2018", "2018-01-14T05:07:03Z", 2),
  scene("c-2025", "2025-02-10T05:07:03Z", 9),
  scene("d-2025", "2025-02-20T05:07:03Z", 1),
];

describe("selectBeforeAfter", () => {
  it("selects the clearest scene from each half", () => {
    const sel = selectBeforeAfter(SCENES);
    expect(sel.before?.id).toBe("b-2018");
    expect(sel.after?.id).toBe("d-2025");
  });

  it("orders before strictly earlier than after", () => {
    const sel = selectBeforeAfter([...SCENES].reverse());
    expect(sel.before!.datetime < sel.after!.datetime).toBe(true);
  });

  it("returns nulls for empty input", () => {
    const sel = selectBeforeAfter([]);
    expect(sel.before).toBeNull();
    expect(sel.after).toBeNull();
  });

  it("cannot select two scenes from a single scene", () => {
    const sel = selectBeforeAfter([scene("only", "2020-01-01T00:00:00Z")]);
    expect(sel.before).not.toBeNull();
    expect(sel.after).toBeNull();
    expect(sel.notes.length).toBeGreaterThan(0);
  });

  it("prefers same-MGRS pairs for grid alignment", () => {
    const mixed = [
      scene("t1-old", "2018-01-12T00:00:00Z", 1, "44QKE"),
      scene("t2-old", "2018-01-13T00:00:00Z", 10, "44QMH"),
      scene("t2-new", "2025-01-20T00:00:00Z", 1, "44QMH"),
      scene("t1-new", "2025-01-22T00:00:00Z", 12, "44QKE"),
    ];
    const sel = selectBeforeAfter(mixed);
    expect(sel.before?.mgrsTile).toBe(sel.after?.mgrsTile);
  });

  it("warns when scenes are too close in time", () => {
    const close = [
      scene("x1", "2020-06-01T00:00:00Z"),
      scene("x2", "2020-06-20T00:00:00Z"),
    ];
    const sel = selectBeforeAfter(close);
    expect(sel.notes.join(" ")).toMatch(/days apart/i);
  });
});
