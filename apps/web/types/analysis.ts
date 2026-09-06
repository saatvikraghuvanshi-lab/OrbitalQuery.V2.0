import type { BBox } from "./geojson";
import type { ChangeFeatureCollection } from "./geojson";
import type { AnalysisKind } from "./query";
import type { SceneSummary } from "./scene";

/** POST /api/analysis body (proxied to the Python service). */
export interface AnalysisRequest {
  beforeScene: Pick<SceneSummary, "id" | "collection" | "datetime" | "bbox">;
  afterScene: Pick<SceneSummary, "id" | "collection" | "datetime" | "bbox">;
  /** AOI in EPSG:4326 [west, south, east, north]. */
  bbox: BBox;
  /** NDVI-difference threshold. Default 0.20. */
  threshold?: number;
  /** Minimum polygon area kept in output, km². Default 0.02. */
  minRegionAreaKm2?: number;
}

/** Properties attached to every vectorized change region. */
export interface ChangeRegionProps {
  region_id: string;
  /** Approximate area in km². */
  area_km2: number;
  /** Mean |NDVI_after − NDVI_before| inside the region. */
  change_magnitude: number;
  /** Mean NDVI of the before scene inside the region. */
  ndvi_before: number;
  /** Mean NDVI of the after scene inside the region. */
  ndvi_after: number;
}

/** Compact aggregate statistics for the analysis result. */
export interface ChangeStatistics {
  n_regions: number;
  total_changed_area_km2: number;
  mean_change_magnitude: number;
  max_region_area_km2: number;
  threshold_used: number;
  aoi_area_km2: number;
  /** Fraction of valid AOI pixels flagged as changed. */
  changed_fraction: number;
  ndvi_before_mean: number | null;
  ndvi_after_mean: number | null;
  pixel_counts: { changed: number; total: number; valid: number };
}

/** Response shape for POST /api/analysis. */
export interface AnalysisResponse {
  status: "ok" | "no_change" | "skipped";
  message?: string;
  geojson: ChangeFeatureCollection | null;
  statistics: ChangeStatistics | null;
  /** Server-side processing time in ms (live analysis only). */
  timing_ms?: number;
  analysisKind?: AnalysisKind;
  /** "cache" when the flagship fallback was served instead of live analysis. */
  source: "live" | "cache";
  /** Warning strings for degraded results (e.g. fallback used). */
  warnings?: string[];
}
