import type { Config } from "../config.js";

export class PriceSearchError extends Error {
  constructor(message: string, public kind: "input" | "unavailable" | "upstream" = "upstream") { super(message); }
}

export interface Offer {
  store: string;
  title: string;
  price_usd: number;
  link: string;
  rating?: number;
  rating_count?: number;
  delivery?: string;
  condition: "new_or_unspecified" | "resale_or_used";
  savings_usd?: number;
  savings_pct?: number;
}

export interface PriceCacheStore {
  get(key: string): Promise<unknown | undefined> | unknown | undefined;
  set(key: string, value: unknown): Promise<void> | void;
}

export const PRICE_CACHE_TTL_SEC = 24 * 60 * 60;
const mem = new Map<string, { at: number; value: unknown }>();
export function clearPriceCache() { mem.clear(); }

export function cacheApiJsonCache(api: { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> }, namespace: string, ttlSec = PRICE_CACHE_TTL_SEC): PriceCacheStore {
  const req = (key: string) => new Request(`https://gs-mcp.internal/${namespace}?${encodeURIComponent(key)}`);
  return {
    async get(key) {
      try {
        const res = await api.match(req(key));
        return res ? await res.json() : undefined;
      } catch { return undefined; }
    },
    async set(key, value) {
      try {
        await api.put(req(key), new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttlSec}` } }));
      } catch { /* cache unavailable */ }
    },
  };
}

/** Counterfeit/drop-ship marketplaces; dropped. Resale/auction marketplaces and used/refurbished listings are kept but separated (see splitOffers). */
const SKETCHY = /\b(temu|dhgate|aliexpress|alibaba|wish|banggood|shein|joom|lightinthebox|miniinthebox|tomtop|gearbest|ubuy|shop app)\b/i;
const RESALE = /\b(mercari|whatnot|poshmark|offerup|depop|thredup|ebay|facebook|craigslist|letgo|swappa|backmarket|back market|reebelo)\b/i;
const USED = /\b(used|pre-?owned|refurbished|renewed|open[- ]box|for parts|damaged|broken|replacement|case only)\b/i;

export function normalizeQuery(input: string): string {
  const raw = input.trim();
  if (/^https?:\/\//i.test(raw)) {
    let u: URL;
    try { u = new URL(raw); } catch { throw new PriceSearchError("That product link is not a valid URL.", "input"); }
    const words = decodeURIComponent(u.pathname).split(/[\/_\-+.]+/).filter((w) => /^[A-Za-z][A-Za-z0-9]*$/.test(w) && !/^(dp|gp|product|products|p|ip|site|itm|item|html|htm|www|pd|b)$/i.test(w) && w.length > 1);
    if (words.length < 2) throw new PriceSearchError("Could not read a product name from that link. Please pass the product name (brand + model) instead.", "input");
    return words.slice(0, 12).join(" ").toLowerCase();
  }
  const q = raw.replace(/\s+/g, " ").toLowerCase().slice(0, 150);
  if (q.length < 3) throw new PriceSearchError("Give a product name of at least 3 characters.", "input");
  return q;
}

function parsePrice(p: unknown): number | undefined {
  if (typeof p === "number") return p > 0 ? p : undefined;
  if (typeof p !== "string") return undefined;
  if (/[^\d$.,\s\-A-Za-z]/.test(p) || (/[A-Za-z]/.test(p) && !/^\s*(US\s?)?\$/.test(p))) return undefined; // non-USD
  if (!p.includes("$")) return undefined;
  const n = Number(p.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function shapeOffers(items: any[], currentPrice?: number, limit = 8): Offer[] {
  const all = shapeAll(items, currentPrice);
  const fresh = all.filter((o) => o.condition === "new_or_unspecified").slice(0, limit);
  const resale = all.filter((o) => o.condition === "resale_or_used").slice(0, 3);
  return [...fresh, ...resale];
}

function shapeAll(items: any[], currentPrice?: number): Offer[] {
  const seen = new Set<string>();
  let offers: Offer[] = [];
  for (const it of items ?? []) {
    const price = parsePrice(it?.price);
    const link = typeof it?.link === "string" && /^https:\/\//i.test(it.link) ? it.link : undefined;
    const store = typeof it?.source === "string" ? it.source.trim() : "";
    if (!price || !link || !store || SKETCHY.test(store)) continue;
    const key = `${store.toLowerCase()}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    offers.push({
      store,
      title: String(it.title ?? "").slice(0, 160),
      price_usd: Math.round(price * 100) / 100,
      link,
      rating: typeof it.rating === "number" ? it.rating : undefined,
      rating_count: typeof it.ratingCount === "number" ? it.ratingCount : undefined,
      delivery: typeof it.delivery === "string" ? it.delivery : undefined,
      condition: RESALE.test(store) || USED.test(String(it.title ?? "")) ? "resale_or_used" : "new_or_unspecified",
    });
  }
  // Drop implausibly cheap outliers (likely accessories, scams or counterfeits).
  if (offers.length >= 4) {
    const sorted = offers.map((o) => o.price_usd).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    offers = offers.filter((o) => o.price_usd >= median * 0.5);
  }
  offers.sort((a, b) => a.price_usd - b.price_usd);
  if (currentPrice && currentPrice > 0) {
    for (const o of offers) {
      o.savings_usd = Math.round((currentPrice - o.price_usd) * 100) / 100;
      o.savings_pct = Math.round(((currentPrice - o.price_usd) / currentPrice) * 1000) / 10;
    }
  }
  return offers;
}

export async function searchLowerPrices(
  input: { query: string; current_price_usd?: number },
  cfg: Config,
  f: typeof fetch = fetch,
  store?: PriceCacheStore,
): Promise<{ query: string; cached: boolean; offers: Offer[]; raw_results: number }> {
  if (!cfg.serperApiKey) throw new PriceSearchError("Price search is not available right now.", "unavailable");
  const q = normalizeQuery(input.query);
  const key = `price:${q}`;
  let items: any[] | undefined;
  let cached = false;
  const m = mem.get(key);
  if (m && Date.now() - m.at < PRICE_CACHE_TTL_SEC * 1000) { items = m.value as any[]; cached = true; }
  if (!items && store) {
    const c = await store.get(key);
    if (Array.isArray(c)) { items = c; cached = true; mem.set(key, { at: Date.now(), value: c }); }
  }
  if (!items) {
    let res: Response;
    try {
      res = await f("https://google.serper.dev/shopping", {
        method: "POST",
        headers: { "X-API-KEY": cfg.serperApiKey, "content-type": "application/json" },
        body: JSON.stringify({ q, gl: "us", hl: "en", num: 40 }),
      });
    } catch {
      throw new PriceSearchError("The price search service could not be reached.");
    }
    if (!res.ok) throw new PriceSearchError(res.status === 401 || res.status === 403 || res.status === 429 ? "Price search is temporarily unavailable." : `Price search failed (HTTP ${res.status}).`, res.status === 429 || res.status === 401 || res.status === 403 ? "unavailable" : "upstream");
    const data: any = await res.json().catch(() => ({}));
    items = Array.isArray(data?.shopping) ? data.shopping : [];
    mem.set(key, { at: Date.now(), value: items });
    if (store) await store.set(key, items);
  }
  return { query: q, cached, raw_results: (items ?? []).length, offers: shapeOffers(items ?? [], input.current_price_usd) };
}
