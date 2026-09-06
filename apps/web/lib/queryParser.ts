import { PRESET_CATALOG } from "./presets";
import { todayUtc } from "./validation";
import type { AnalysisKind, ParsedQuery } from "@/types/query";

export class InvalidQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidQueryError";
  }
}

interface GazetteerEntry {
  name: string;
  aliases: string[];
  bbox: [number, number, number, number];
}

/** Extra cities beyond the preset catalog. */
const EXTRA_LOCATIONS: GazetteerEntry[] = [
  { name: "Chennai", aliases: ["chennai"], bbox: [80.15, 12.9, 80.35, 13.2] },
  { name: "Kolkata", aliases: ["kolkata"], bbox: [88.2, 22.4, 88.5, 22.7] },
  { name: "Pune", aliases: ["pune"], bbox: [73.7, 18.4, 73.95, 18.65] },
  { name: "Ahmedabad", aliases: ["ahmedabad"], bbox: [72.5, 22.9, 72.75, 23.15] },
  { name: "Bengaluru", aliases: ["bengaluru", "bangalore"], bbox: [77.4, 12.85, 77.75, 13.2] },
];

/** Common aliases for preset names (e.g. "Delhi NCR" → "delhi"). */
const ALIASES: Record<string, string[]> = {
  "delhi ncr": ["delhi", "new delhi"],
  "kathmandu valley": ["kathmandu"],
  "northeast india": ["north east india"],
  "brahmaputra basin": ["brahmaputra"],
};

const GAZETTEER: GazetteerEntry[] = [
  ...PRESET_CATALOG.map((p) => ({
    name: p.name,
    aliases: [p.name.toLowerCase(), ...(ALIASES[p.name.toLowerCase()] ?? [])],
    bbox: p.bbox,
  })),
  ...EXTRA_LOCATIONS,
];

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const ANALYSIS_RULES: Array<[RegExp, AnalysisKind]> = [
  [/\burban\b|\bexpansion\b|\bbuild[- ]?up\b/i, "urban_change"],
  [/\bforest\b|\bdeforestation\b|\bafforestation\b/i, "vegetation_change"],
  [/\bvegetation\b|\bndvi\b|\bgreening\b|\bmangrove\b/i, "vegetation_change"],
  [/\bland[- ]?use\b|\blulc\b|\bland[- ]?cover\b/i, "land_use_change"],
];

const MGRS_RE = /\b(\d{2}[C-HJ-NP-X][A-Z]{2})\b/;
const YEAR_RE = /\b(20\d{2})\b/g;
const MIN_YEAR = 2016;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function isMonthWord(w: string): boolean {
  return w.toLowerCase() in MONTHS;
}

interface DateRange {
  startDate: string;
  endDate: string;
  source: string;
}

/** Extract a date range deterministically. Returns null when nothing found. */
export function extractDateRange(query: string): DateRange | null {
  // 1. Full ISO date pairs: 2018-06-01 to 2025-06-01
  const isoPair = query.match(
    /\b(\d{4}-\d{2}-\d{2})\s*(?:to|and|[-–—])\s*(\d{4}-\d{2}-\d{2})\b/i
  );
  if (isoPair) {
    return { startDate: isoPair[1], endDate: isoPair[2], source: "ISO date range" };
  }

  // 2. Month-name pairs: "Jan 2019 to Mar 2025"
  const monthPair = query.match(
    /\b([A-Za-z]{3,9})\s+(\d{4})\s*(?:to|and|[-–—])\s*([A-Za-z]{3,9})\s+(\d{4})\b/
  );
  if (monthPair && isMonthWord(monthPair[1]) && isMonthWord(monthPair[3])) {
    const m1 = MONTHS[monthPair[1].toLowerCase()];
    const m2 = MONTHS[monthPair[3].toLowerCase()];
    return {
      startDate: iso(Number(monthPair[2]), m1, 1),
      endDate: iso(Number(monthPair[4]), m2, 1),
      source: "month/year range",
    };
  }

  // 3. Year ranges with connectors: between X and Y / from X to Y / X-Y / X to Y
  const yearPair = query.match(
    /\b(?:between|from)?\s*(\d{4})\s*(?:\band\b|\bto\b|[-–—])\s*(\d{4})\b/i
  );
  if (yearPair) {
    const y1 = Number(yearPair[1]);
    const y2 = Number(yearPair[2]);
    if (y1 >= MIN_YEAR && y2 >= y1 && y2 <= 2100) {
      return { startDate: iso(y1, 1, 1), endDate: iso(y2, 12, 31), source: "year range" };
    }
  }

  // 4. "since YYYY" / "after YYYY"
  const since = query.match(/\b(?:since|after)\s+(\d{4})\b/i);
  if (since) {
    const y = Number(since[1]);
    return {
      startDate: iso(y, 1, 1),
      endDate: iso(Number(todayUtc().slice(0, 4)), 12, 31),
      source: `"since ${y}"`,
    };
  }

  // 5. Bare years (first and last occurrence).
  const years: number[] = [];
  let m: RegExpExecArray | null;
  YEAR_RE.lastIndex = 0;
  while ((m = YEAR_RE.exec(query)) !== null) {
    const y = Number(m[1]);
    if (y >= MIN_YEAR && y <= 2100) years.push(y);
  }
  if (years.length >= 2) {
    const y1 = years[0];
    const y2 = years[years.length - 1];
    const [start, end] = y1 <= y2 ? [y1, y2] : [y2, y1];
    return { startDate: iso(start, 1, 1), endDate: iso(end, 12, 31), source: "year range" };
  }
  if (years.length === 1) {
    const y = years[0];
    return { startDate: iso(y, 1, 1), endDate: iso(y, 12, 31), source: "single year" };
  }

  return null;
}

/** Longest-alias-first gazetteer match. Returns null when nothing matches. */
export function matchLocation(query: string): { entry: GazetteerEntry; alias: string } | null {
  const q = query.toLowerCase();
  let best: { entry: GazetteerEntry; alias: string } | null = null;
  for (const entry of GAZETTEER) {
    for (const alias of entry.aliases) {
      if (q.includes(alias)) {
        if (!best || alias.length > best.alias.length) {
          best = { entry, alias };
        }
      }
    }
  }
  return best;
}

/**
 * Extract a capitalized place phrase after a preposition for queries outside
 * the gazetteer ("vegetation change in Nairobi between 2019 and 2025" →
 * "Nairobi"). The phrase is resolved by the geocoder; if that fails the
 * caller returns a clear error. Returns null when no plausible place exists.
 */
export function extractLocationPhrase(query: string): string | null {
  const m = query.match(
    /\b(?:in|around|near|over)\s+((?:[A-Z][a-zA-Z'.-]*|\bof\b|\bthe\b)(?:[\s-]+(?:[A-Z][a-zA-Z'.-]*|\bof\b|\bthe\b)){0,3})/
  );
  if (!m) return null;
  const words = m[1].split(/[\s-]+/);
  while (words.length && /^(of|the|and|de)$/i.test(words[words.length - 1])) words.pop();
  while (words.length && /^(of|the|and|de)$/i.test(words[0])) words.shift();
  return words.length ? words.join(" ") : null;
}

function detectAnalysis(query: string): { kind: AnalysisKind; matched: string | null } {
  for (const [re, kind] of ANALYSIS_RULES) {
    const m = query.match(re);
    if (m) return { kind, matched: m[0] };
  }
  return { kind: "land_use_change", matched: null };
}

/**
 * Deterministic natural-language query parsing.
 * Gazetteer hits carry a bbox; misses extract a place phrase and leave bbox
 * undefined so the caller geocodes `location` via lib/geocoding.ts.
 */
export function parseQuery(raw: string): ParsedQuery {
  const notes: string[] = [];
  const warnings: string[] = [];

  const query = (raw ?? "").trim().slice(0, 200);
  if (query.length < 4) {
    throw new InvalidQueryError("query is too short — name a location and a time range");
  }

  // ---- location ----
  const loc = matchLocation(query);
  if (loc) {
    notes.push(`location: "${loc.entry.name}" (matched "${loc.alias}")`);
    return finishParse(query, loc.entry.name, loc.entry.bbox, notes, warnings);
  }

  // Gazetteer miss → extract a place phrase for the geocoder. Only fail
  // when there is no plausible place at all.
  const phrase = extractLocationPhrase(query);
  if (!phrase) {
    throw new InvalidQueryError(
      'could not identify a location — try a city or region name (e.g. "urban expansion in Hyderabad between 2018 and 2026")'
    );
  }
  notes.push(`location: "${phrase}" (from query — resolved by geocoding)`);
  return finishParse(query, phrase, undefined, notes, warnings);
}

function finishParse(
  query: string,
  location: string,
  bbox: [number, number, number, number] | undefined,
  notes: string[],
  warnings: string[]
): ParsedQuery {
  // ---- dates ----
  const range = extractDateRange(query);
  let startDate: string;
  let endDate: string;
  if (range) {
    startDate = range.startDate;
    endDate = range.endDate;
    notes.push(`dates: ${range.startDate} → ${range.endDate} (${range.source})`);
  } else {
    startDate = "2018-01-01";
    endDate = iso(Number(todayUtc().slice(0, 4)), 12, 31);
    warnings.push("no date range found — defaulting to 2018 → present");
  }
  // Sentinel-2 imagery cannot exist in the future; clamp to the end of the
  // current year so "between 2018 and 2026" keeps its semantic end date while
  // never searching beyond what can exist.
  const currentYear = Number(todayUtc().slice(0, 4));
  const yearEnd = `${currentYear}-12-31`;
  if (endDate > yearEnd) {
    notes.push(`end date limited to ${yearEnd} (latest possible imagery)`);
    endDate = yearEnd;
  }
  if (startDate > endDate) {
    const t = startDate;
    startDate = endDate;
    endDate = t;
    warnings.push("start date was after end date — swapped");
  }

  // ---- analysis ----
  const { kind, matched } = detectAnalysis(query);
  if (matched) {
    notes.push(`analysis: ${kind.replace("_", " ")} (from "${matched}")`);
  } else {
    notes.push("analysis: land use change (default)");
  }

  // ---- optional MGRS tile ----
  const mgrs = query.match(MGRS_RE);
  if (mgrs) notes.push(`MGRS tile hint: ${mgrs[1]}`);

  return {
    location,
    bbox,
    startDate,
    endDate,
    analysis: kind,
    dataset: "sentinel-2-l2a",
    mgrsTile: mgrs ? mgrs[1] : undefined,
    notes,
    warnings,
  };
}
