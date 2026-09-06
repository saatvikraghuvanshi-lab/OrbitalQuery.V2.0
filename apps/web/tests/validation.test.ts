import { describe, expect, it } from "vitest";

import {
  clampDate,
  isPlausibleChangeGeoJSON,
  isValidIsoDate,
  validateBBox,
  validateDateRange,
} from "@/lib/validation";

describe("validateBBox", () => {
  it("accepts a valid bbox", () => {
    expect(validateBBox([78.0, 17.0, 78.7, 17.7])).toEqual({
      ok: true,
      bbox: [78.0, 17.0, 78.7, 17.7],
    });
  });
  it("rejects inverted longitude", () => {
    expect(validateBBox([79, 17, 78, 18]).ok).toBe(false);
  });
  it("rejects out-of-range values", () => {
    expect(validateBBox([-200, 17, 78, 18]).ok).toBe(false);
    expect(validateBBox([78, 95, 79, 96]).ok).toBe(false);
  });
  it("rejects non-numeric input", () => {
    expect(validateBBox(["a", "b", "c", "d"]).ok).toBe(false);
    expect(validateBBox(null).ok).toBe(false);
  });
  it("rejects pathologically large AOIs", () => {
    expect(validateBBox([0, 0, 40, 40]).ok).toBe(false);
  });
});

describe("dates", () => {
  it("validates ISO dates", () => {
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2023-02-29")).toBe(false);
    expect(isValidIsoDate("2024-13-01")).toBe(false);
    expect(isValidIsoDate("not a date")).toBe(false);
  });
  it("validates ranges", () => {
    expect(validateDateRange("2018-01-01", "2026-12-31").ok).toBe(true);
    expect(validateDateRange("2026-01-01", "2018-01-01").ok).toBe(false);
    expect(validateDateRange("2099-01-01", "2099-12-31").ok).toBe(false);
  });
  it("clamps dates", () => {
    expect(clampDate("2010-01-01", "2016-01-01", "2026-01-01")).toBe("2016-01-01");
    expect(clampDate("2099-01-01", "2016-01-01", "2026-01-01")).toBe("2026-01-01");
    expect(clampDate("2020-06-01", "2016-01-01", "2026-01-01")).toBe("2020-06-01");
  });
});

describe("isPlausibleChangeGeoJSON", () => {
  it("accepts a valid change FeatureCollection", () => {
    expect(
      isPlausibleChangeGeoJSON({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
            properties: { region_id: "R001" },
          },
        ],
      })
    ).toBe(true);
  });
  it("rejects malformed shapes", () => {
    expect(isPlausibleChangeGeoJSON(null)).toBe(false);
    expect(isPlausibleChangeGeoJSON({ type: "FeatureCollection" })).toBe(false);
    expect(
      isPlausibleChangeGeoJSON({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} }],
      })
    ).toBe(false);
  });
});
