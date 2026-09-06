import { env } from "./env";

const sasCache = new Map<string, { token: string; expiry: number }>();
const SAS_TTL_MS = 45 * 60 * 1000; // tokens live ~1h; refresh early

/**
 * Fetch a SAS token for a collection so server-side COG reads work.
 * Browser never needs this — tiles come from the CORS-open Data API.
 */
export async function getSasToken(collection: string): Promise<string> {
  const cached = sasCache.get(collection);
  if (cached && cached.expiry > Date.now()) return cached.token;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${env.sasTokenUrl}/${collection}`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`SAS endpoint returned ${res.status}`);
    const body = (await res.json()) as { token?: string; "msft:expiry"?: string };
    if (!body.token) throw new Error("SAS endpoint returned no token");
    let token = body.token.startsWith("?") ? body.token.slice(1) : body.token;
    sasCache.set(collection, { token, expiry: Date.now() + SAS_TTL_MS });
    return token;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Build a tilejson URL for rendering one STAC item via the Planetary
 * Computer Data API. Verified against the live API:
 *  - true color:   assets=visual
 *  - NDVI:         assets=B08,B04 + expression + asset_as_band=True
 */
export function itemTilejsonUrl(opts: {
  collection: string;
  item: string;
  kind: "trueColor" | "ndvi";
}): string {
  const p = new URLSearchParams();
  p.set("collection", opts.collection);
  p.set("item", opts.item);
  if (opts.kind === "trueColor") {
    p.set("assets", "visual");
  } else {
    p.set("assets", "B08,B04");
    p.set("expression", "(B08-B04)/(B08+B04)");
    p.set("asset_as_band", "True");
    p.set("rescale", "-1,1");
    p.set("colormap_name", "rdylgn");
  }
  return `${env.dataApi}/item/tilejson.json?${p.toString()}`;
}
