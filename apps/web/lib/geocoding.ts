/**
 * Free-form location geocoding (fallback when the gazetteer misses).
 * Uses Open-Meteo's free geocoding API — no key, CORS-open, no auth.
 * Server-side use only (called from /api/search).
 */

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

export interface GeocodeResult {
  name: string;
  bbox: [number, number, number, number];
  source: "open-meteo";
}

interface OmResult {
  name: string;
  latitude: number;
  longitude: number;
  population?: number;
}

export class GeocodingError extends Error {}

export async function geocodeLocation(place: string): Promise<GeocodeResult | null> {
  const q = place.trim();
  if (q.length < 3) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new GeocodingError(`geocoder returned ${res.status}`);
    const data = (await res.json()) as { results?: OmResult[] };
    const results = data.results ?? [];
    if (results.length === 0) return null;
    // Prefer the most populous result — deterministic and usually the city
    // the user means.
    const best = [...results].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
    // Synthesize a small AOI around the point (~12 km across; a city view).
    const dLat = 0.06;
    const dLon = 0.06 / Math.max(0.35, Math.cos((best.latitude * Math.PI) / 180));
    return {
      name: best.name,
      bbox: [
        best.longitude - dLon,
        best.latitude - dLat,
        best.longitude + dLon,
        best.latitude + dLat,
      ],
      source: "open-meteo",
    };
  } catch (e) {
    if (e instanceof GeocodingError) throw e;
    throw new GeocodingError("geocoding service unreachable");
  } finally {
    clearTimeout(t);
  }
}
