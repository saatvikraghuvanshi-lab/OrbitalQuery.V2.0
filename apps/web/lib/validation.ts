import type { BBox } from "@/types/geojson";

/**
 * Validate and normalize an AOI bounding box [west, south, east, north].
 * Returns null with a reason when invalid so callers can produce useful
 * UI errors instead of throwing.
 */
export function validateBBox(
  bbox: unknown
): { ok: true; bbox: BBox } | { ok: false; reason: string } {
  if (
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    bbox.some((n) => typeof n !== "number" || !Number.isFinite(n))
  ) {
    return { ok: false, reason: "bbox must be [west, south, east, north] numbers" };
  }
  const [west, south, east, north] = bbox as number[];
  if (west >= east) return { ok: false, reason: "west must be less than east" };
  if (south >= north) return { ok: false, reason: "south must be less than north" };
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    return { ok: false, reason: "bbox outside valid coordinate ranges" };
  }
  const spanX = east - west;
  const spanY = north - south;
  // Rough guard for absurdly large AOIs (~ >2500 km across). The Python
  // service enforces the real area limit; this catches pathologies early.
  if (spanX > 25 || spanY > 25) {
    return { ok: false, reason: "AOI is too large — narrow the area of interest" };
  }
  return { ok: true, bbox: [west, south, east, north] };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** Latest date STAC can be searched (Sentinel-2 has ~1-2 day publish lag). */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function validateDateRange(
  start: string,
  end: string
): { ok: true } | { ok: false; reason: string } {
  if (!isValidIsoDate(start)) return { ok: false, reason: `invalid start date "${start}"` };
  if (!isValidIsoDate(end)) return { ok: false, reason: `invalid end date "${end}"` };
  if (start > end) return { ok: false, reason: "start date is after end date" };
  // End dates within the current year are allowed ("between 2018 and 2026"
  // in Sep 2026 semantically means through Dec 31); later years are rejected.
  const yearEnd = `${new Date().getUTCFullYear()}-12-31`;
  if (end > yearEnd) return { ok: false, reason: `end date ${end} is beyond the current year` };
  return { ok: true };
}

/** Clamp a date string into a valid range, used by the parser fallbacks. */
export function clampDate(s: string, min: string, max: string): string {
  const v = isValidIsoDate(s) ? s : min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/** Basic GeoJSON sanity check for change-layer responses. */
export function isPlausibleChangeGeoJSON(g: unknown): boolean {
  if (!g || typeof g !== "object") return false;
  const obj = g as Record<string, unknown>;
  if (obj.type !== "FeatureCollection") return false;
  if (!Array.isArray(obj.features)) return false;
  return obj.features.every((f) => {
    const feat = f as Record<string, unknown>;
    const geom = feat.geometry as Record<string, unknown> | null;
    if (!geom) return false;
    return geom.type === "Polygon" || geom.type === "MultiPolygon";
  });
}
