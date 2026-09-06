import { describe, expect, it } from "vitest";

import { PRESET_CATALOG, groupedPresets } from "@/lib/presets";
import { validateBBox } from "@/lib/validation";

describe("preset catalog", () => {
  it("contains the required spec presets", () => {
    const names = new Set(PRESET_CATALOG.map((p) => p.name));
    for (const required of [
      "Hyderabad", "Mumbai", "Delhi NCR", "Jaipur",
      "Himalayan Belt", "Western Ghats", "Thar Desert", "Sundarbans",
      "Nepal", "Kathmandu Valley", "Uttarakhand", "Northeast India", "Brahmaputra Basin",
      "Dehradun", "Srinagar",
    ]) {
      expect(names.has(required), `missing preset: ${required}`).toBe(true);
    }
  });

  it("marks exactly one flagship (Hyderabad)", () => {
    const flagged = PRESET_CATALOG.filter((p) => p.flagship);
    expect(flagged.length).toBe(1);
    expect(flagged[0].name).toBe("Hyderabad");
  });

  it("all bboxes are valid", () => {
    for (const p of PRESET_CATALOG) {
      expect(validateBBox(p.bbox).ok, `${p.name} bbox invalid`).toBe(true);
    }
  });

  it("all preset queries parse through the normal parser", async () => {
    const { parseQuery } = await import("@/lib/queryParser");
    for (const p of PRESET_CATALOG) {
      const q = parseQuery(p.query);
      expect(q.location, `${p.query} → ${q.location}`).toBe(p.name);
    }
  });

  it("groups preserve the spec order", () => {
    expect(groupedPresets().map((g) => g.group)).toEqual(["CITIES", "REGIONS", "CHANGE & RISK"]);
  });
});
