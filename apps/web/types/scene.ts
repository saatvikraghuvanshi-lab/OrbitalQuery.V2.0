/**
 * Normalized scene metadata returned by STAC search and consumed by the UI
 * and the analysis proxy.
 */
export interface SceneSummary {
  /** STAC item id, e.g. "S2B_MSIL2A_20250226T050659_R019_T44QKE_20250226T071341". */
  id: string;
  collection: string;
  /** ISO 8601 acquisition datetime. */
  datetime: string;
  /** Scene-level cloud cover percentage (0–100). */
  cloudCover: number;
  /** [west, south, east, north] in EPSG:4326. */
  bbox: [number, number, number, number];
  /** MGRS tile identifier if present (e.g. "44QKE"). */
  mgrsTile: string | null;
  /**
   * TileJSON URL (Planetary Computer Data API) for true-color rendering.
   * The browser resolves it to an XYZ template; no raster data flows
   * through our servers.
   */
  tileUrl: string;
  /** Asset refs useful for visualization/analysis (e.g. ["visual","B04","B08"]). */
  assets: string[];
}
