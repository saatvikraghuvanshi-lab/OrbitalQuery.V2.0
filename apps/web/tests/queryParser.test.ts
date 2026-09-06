import { describe, expect, it } from "vitest";

import { extractDateRange, InvalidQueryError, matchLocation, parseQuery } from "@/lib/queryParser";

describe("parseQuery — flagship and spec examples", () => {
  it("parses the flagship Hyderabad query", () => {
    const q = parseQuery("urban expansion in Hyderabad between 2018 and 2026");
    expect(q.location).toBe("Hyderabad");
    expect(q.startDate).toBe("2018-01-01");
    expect(q.endDate).toBe("2026-12-31");
    expect(q.analysis).toBe("urban_change");
    expect(q.dataset).toBe("sentinel-2-l2a");
    expect(q.bbox).toBeDefined();
  });

  it("parses the Western Ghats forest query", () => {
    const q = parseQuery("forest change in the Western Ghats from 2019 to 2025");
    expect(q.location).toBe("Western Ghats");
    expect(q.startDate).toBe("2019-01-01");
    expect(q.endDate).toBe("2025-12-31");
    expect(q.analysis).toBe("vegetation_change");
  });

  it("parses the Nepal vegetation query", () => {
    const q = parseQuery("vegetation change in Nepal between 2020 and 2026");
    expect(q.location).toBe("Nepal");
    expect(q.startDate).toBe("2020-01-01");
    expect(q.endDate).toBe("2026-12-31"); // clamped later by API to today
    expect(q.analysis).toBe("vegetation_change");
  });

  it("parses the Mumbai land use query", () => {
    const q = parseQuery("land use change around Mumbai from 2018 to 2024");
    expect(q.location).toBe("Mumbai");
    expect(q.analysis).toBe("land_use_change");
    expect(q.startDate).toBe("2018-01-01");
    expect(q.endDate).toBe("2024-12-31");
  });

  it("parses Delhi alias", () => {
    const q = parseQuery("urban change in Delhi from 2018 to 2025");
    expect(q.location).toBe("Delhi NCR");
  });

  it("parses Kathmandu alias", () => {
    const q = parseQuery("urban growth in Kathmandu between 2018 and 2026");
    expect(q.location).toBe("Kathmandu Valley");
  });

  it("resolves non-preset cities from the gazetteer", () => {
    const q = parseQuery("urban change in Bengaluru from 2018 to 2025");
    expect(q.location).toBe("Bengaluru");
    expect(q.bbox).toBeDefined();
  });
});

describe("parseQuery — deterministic fallbacks", () => {
  it("defaults dates to 2018→present with a warning", () => {
    const q = parseQuery("urban change in Hyderabad");
    expect(q.startDate).toBe("2018-01-01");
    expect(q.warnings.join(" ")).toMatch(/no date range found/i);
  });

  it("clamps far-future end dates to the current year end", () => {
    const q = parseQuery("urban change in Hyderabad between 2018 and 2099");
    expect(q.endDate).toBe(`${new Date().getUTCFullYear()}-12-31`);
    expect(q.warnings.join(" ")).toBeFalsy();
    expect(q.notes.join(" ")).toMatch(/latest possible imagery/i);
  });

  it("orders bare reversed years", () => {
    const q = parseQuery("urban change in Hyderabad between 2026 and 2018");
    expect(q.startDate).toBe("2018-01-01");
    expect(q.endDate).toBe("2026-12-31");
  });

  it("defaults analysis to land use change", () => {
    const q = parseQuery("something in Jaipur between 2019 and 2024");
    expect(q.analysis).toBe("land_use_change");
  });

  it("handles 'since YYYY'", () => {
    const q = parseQuery("deforestation in Uttarakhand since 2019");
    expect(q.startDate).toBe("2019-01-01");
    expect(q.analysis).toBe("vegetation_change");
  });

  it("extracts MGRS tile hints", () => {
    const q = parseQuery("urban change in Hyderabad MGRS tile 44QKE between 2018 and 2020");
    expect(q.mgrsTile).toBe("44QKE");
  });
});

describe("parseQuery — invalid input", () => {
  it("throws on empty/short queries", () => {
    expect(() => parseQuery("")).toThrow(InvalidQueryError);
    expect(() => parseQuery("hi")).toThrow(InvalidQueryError);
  });

  it("throws when no location phrase exists at all", () => {
    expect(() => parseQuery("urban expansion between 2018 and 2026")).toThrow(InvalidQueryError);
    expect(() => parseQuery("random words 2019 2024")).toThrow(InvalidQueryError);
  });

  it("extracts unknown place phrases for geocoding instead of failing", () => {
    const q = parseQuery("vegetation change in Nairobi between 2019 and 2025");
    expect(q.location).toBe("Nairobi");
    expect(q.bbox).toBeUndefined(); // route resolves via geocoder
    expect(q.startDate).toBe("2019-01-01");
    expect(q.notes.join(" ")).toMatch(/geocoding/i);
  });
});

describe("extractDateRange", () => {
  it("handles ISO pairs", () => {
    const r = extractDateRange("change from 2018-06-01 to 2019-08-01");
    expect(r?.startDate).toBe("2018-06-01");
    expect(r?.endDate).toBe("2019-08-01");
  });
  it("handles month-year pairs", () => {
    const r = extractDateRange("change from Jan 2019 to Mar 2025");
    expect(r?.startDate).toBe("2019-01-01");
    expect(r?.endDate).toBe("2025-03-01");
  });
  it("handles en-dash year ranges", () => {
    const r = extractDateRange("Hyderabad 2018–2026");
    expect(r?.startDate).toBe("2018-01-01");
    expect(r?.endDate).toBe("2026-12-31");
  });
});

describe("matchLocation", () => {
  it("prefers the longest alias", () => {
    const m = matchLocation("delhi ncr urban change")?.entry.name;
    expect(m).toBe("Delhi NCR");
  });
  it("is case-insensitive", () => {
    expect(matchLocation("HYDERABAD growth")?.entry.name).toBe("Hyderabad");
  });
});
