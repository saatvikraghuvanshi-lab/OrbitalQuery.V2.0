import type { SceneSummary } from "./scene";

/** Analysis kinds supported by the pipeline. */
export type AnalysisKind =
  | "urban_change"
  | "vegetation_change"
  | "land_use_change";

/** Deterministic query interpretation result. */
export interface ParsedQuery {
  /** Human-readable location string, e.g. "Hyderabad", "Western Ghats". */
  location: string;
  /** Known-location bbox from the gazetteer when matched, else undefined
   *  (caller geocodes via lib/geocoding.ts). */
  bbox?: [number, number, number, number];
  /** ISO date YYYY-MM-DD. Deterministic defaults applied when absent. */
  startDate: string;
  endDate: string;
  analysis: AnalysisKind;
  /** Dataset family to search. Currently always Sentinel-2 L2A. */
  dataset: "sentinel-2-l2a";
  /** Optional MGRS tile hint parsed from the query (e.g. "G8V"). */
  mgrsTile?: string;
  /** Non-fatal parse notes shown in the interpretation card. */
  notes: string[];
  /** Warnings about fallbacks applied during parsing. */
  warnings: string[];
}

export type PresetGroup = "CITIES" | "REGIONS" | "CHANGE & RISK";

/**
 * A geographic search preset. Metadata only — every preset flows through
 * the same query → STAC → visualization → analysis pipeline.
 */
export interface SearchPreset {
  id: string;
  name: string;
  group: PresetGroup;
  type: "city" | "region";
  bbox: [number, number, number, number];
  defaultAnalysis: AnalysisKind;
  suggestedDateRange: { startDate: string; endDate: string };
  /** Natural-language query sent through the normal parser. */
  query: string;
  /** Visually marked as the flagship example. */
  flagship?: boolean;
}

export interface SelectedScenes {
  before: SceneSummary | null;
  after: SceneSummary | null;
}

/** Response shape for POST /api/search. */
export interface SearchResponse {
  parsedQuery: ParsedQuery;
  candidateScenes: SceneSummary[];
  selectedScenes: SelectedScenes;
  selectionNotes?: string[];
}
