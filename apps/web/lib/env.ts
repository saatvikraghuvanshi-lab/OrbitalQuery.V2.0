/** Server-side environment access. Never import this from client components. */

export const env = {
  stacUrl:
    process.env.PLANETARY_COMPUTER_STAC_URL ??
    "https://planetarycomputer.microsoft.com/api/stac/v1",
  sasTokenUrl: "https://planetarycomputer.microsoft.com/api/sas/v1/token",
  dataApi: "https://planetarycomputer.microsoft.com/api/data/v1",
  analysisServiceUrl: process.env.ANALYSIS_SERVICE_URL ?? "http://localhost:8000",
  stacTimeoutMs: Number(process.env.STAC_TIMEOUT_MS ?? 12000),
  analysisTimeoutMs: Number(process.env.ANALYSIS_TIMEOUT_MS ?? 60000),
};

/** True when the analysis service points at a local dev server. */
export function isLocalAnalysisService(): boolean {
  return /localhost|127\.0\.0\.1/.test(env.analysisServiceUrl);
}
