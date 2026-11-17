import type { Config } from "../config.js";
import { resolveCountry } from "./countries.js";
import { GS_URLS } from "../data/gs.js";

export interface RatesInput {
  country: string;
  city?: string;
  zip?: string;
  weight: number;
  unit: "kg" | "lb";
  length?: number;
  width?: number;
  height?: number;
}

export interface NormalizedService {
  carrier: string;
  service: string;
  price_usd: number;
  transit_time: string | null;
  estimated_delivery_date: string | null;
  max_weight: string | null;
  max_size: string | null;
  departure_frequency: string | null;
  insurance: string | null;
  dimensional_weight_applies: boolean;
  tracking: boolean;
}

export interface NormalizedRates {
  destination: { country_code: string; country: string; city: string; zip: string };
  package: { weight: number; unit: "kg" | "lb"; dimensions: string; dimension_unit: "cm" | "in" };
  currency: "USD";
  services: NormalizedService[];
  cheapest: NormalizedService | null;
  fastest: NormalizedService | null;
  notes: string[];
  source: string;
  retrieved_at: string;
}

export class RatesError extends Error {
  constructor(message: string, public readonly kind: "blocked" | "upstream" | "input" | "timeout") {
    super(message);
  }
}

type Fetch = typeof fetch;
const cache = new Map<string, { at: number; value: NormalizedRates }>();
export const RATES_CACHE_TTL_MS = 10 * 60 * 1000;

/** Optional durable cache (Cloudflare Cache API on Workers) layered under the per-isolate map. */
export interface RatesCacheStore {
  get(key: string): Promise<NormalizedRates | undefined> | NormalizedRates | undefined;
  set(key: string, value: NormalizedRates): Promise<void> | void;
}

export function clearRatesCache() { cache.clear(); }

export function cacheApiRatesCache(api: { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> }, ttlSec = RATES_CACHE_TTL_MS / 1000): RatesCacheStore {
  const req = (key: string) => new Request(`https://gs-mcp.internal/rates-cache?${encodeURIComponent(key)}`);
  return {
    async get(key) {
      try {
        const res = await api.match(req(key));
        if (!res) return undefined;
        return (await res.json()) as NormalizedRates;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      try {
        await api.put(req(key), new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttlSec}` } }));
      } catch {
        /* Cache API may be unavailable in some runtimes */
      }
    },
  };
}

export function buildRatesForm(input: RatesInput) {
  const c = resolveCountry(input.country);
  if (!c) throw new RatesError(`Unknown or unsupported destination country "${input.country}". Use a 2-letter ISO code (e.g. AO, SA, GB) or a country name GS ships to.`, "input");
  const form = new URLSearchParams();
  form.set("country", c.code);
  form.set("measurement_unit", input.unit === "kg" ? "2" : "1"); // GS UI: 1 = Pound/Inches, 2 = Kilogram/Centimeter
  form.set("weight", String(input.weight));
  form.set("city", input.city?.trim() || c.city);
  form.set("zip_code", input.zip?.trim() || c.zip);
  form.set("length", String(input.length ?? 1));
  form.set("width", String(input.width ?? 1));
  form.set("height", String(input.height ?? 1));
  return { country: c, form };
}

const firstDays = (s: string | null) => {
  const m = s?.match(/(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

export function normalizeRates(raw: any, input: RatesInput, country: { code: string; name: string }, city: string, zip: string): NormalizedRates {
  if (!raw || raw.success === false || typeof raw.data !== "object") {
    throw new RatesError(`GS rate engine returned no rates${raw?.message ? `: ${raw.message}` : ""}.`, "upstream");
  }
  const services: NormalizedService[] = [];
  for (const val of Object.values(raw.data)) {
    if (!Array.isArray(val)) continue;
    for (const s of val as any[]) {
      const price = Number(s.rate);
      if (!Number.isFinite(price) || price <= 0) continue;
      services.push({
        carrier: String(s.carrier ?? "").trim(),
        service: String(s.service ?? "").replace(/\s+/g, " ").trim(),
        price_usd: Math.round(price * 100) / 100,
        transit_time: s.estimated_delivery_time ?? null,
        estimated_delivery_date: s.estimated_delivery_date ?? null,
        max_weight: s.maximum_weight ?? null,
        max_size: s.maximum_size ?? null,
        departure_frequency: s.departure_frequency ?? null,
        insurance: s.insurance ?? null,
        dimensional_weight_applies: /applicable/i.test(String(s.dimensional_weight ?? "")) && !/not/i.test(String(s.dimensional_weight ?? "")),
        tracking: /yes/i.test(String(s.tracking ?? "")),
      });
    }
  }
  services.sort((a, b) => a.price_usd - b.price_usd);
  const fastest = services.length ? [...services].sort((a, b) => firstDays(a.transit_time) - firstDays(b.transit_time) || a.price_usd - b.price_usd)[0] : null;
  const du = input.unit === "kg" ? "cm" : "in";
  return {
    destination: { country_code: country.code, country: country.name, city, zip },
    package: { weight: input.weight, unit: input.unit, dimensions: `${input.length ?? 1}x${input.width ?? 1}x${input.height ?? 1}`, dimension_unit: du },
    currency: "USD",
    services,
    cheapest: services[0] ?? null,
    fastest,
    notes: [
      "Live prices from Global Shopaholics' rate engine (same as the website calculator).",
      "Prices exclude customs duties, tariffs and import taxes (see estimate_landed_cost).",
      "Dimensional weight applies: pass real box dimensions for accuracy (default 1x1x1 like the website). The final price uses the consolidated box's actual vs volumetric weight measured at the GS warehouse.",
      services.length === 0 ? "No services returned for this destination/weight. Contact GS support for a manual quote." : "",
    ].filter(Boolean),
    source: GS_URLS.calculator,
    retrieved_at: new Date().toISOString(),
  };
}

export async function getShippingRates(input: RatesInput, cfg: Config, fetchImpl: Fetch = fetch, store?: RatesCacheStore): Promise<NormalizedRates> {
  const { country, form } = buildRatesForm(input);
  const key = form.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < RATES_CACHE_TTL_MS) return hit.value;
  if (store) {
    const cached = await store.get(key);
    if (cached) {
      cache.set(key, { at: Date.now(), value: cached });
      return cached;
    }
  }

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    accept: "application/json",
    "user-agent": cfg.userAgent,
    referer: cfg.ratesReferer,
    origin: new URL(cfg.ratesReferer).origin,
  };
  if (cfg.ratesHeaderName && cfg.ratesHeaderValue) headers[cfg.ratesHeaderName] = cfg.ratesHeaderValue;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.ratesTimeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(cfg.ratesUrl, { method: "POST", headers, body: key, signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new RatesError(`GS rate engine timed out after ${cfg.ratesTimeoutMs} ms.`, "timeout");
    throw new RatesError(`Could not reach GS rate engine: ${e?.message ?? e}`, "upstream");
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (/One moment, please|Imunify360|bot-protection|cf-challenge|Just a moment/i.test(text) || res.status === 403 || res.status === 429) {
    throw new RatesError(
      `GS website bot protection blocked the live rate request (HTTP ${res.status}). Use the calculator at ${GS_URLS.calculator} meanwhile; the server operator must whitelist this server (see docs/deploy.md).`,
      "blocked",
    );
  }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new RatesError(`GS rate engine returned non-JSON (HTTP ${res.status}).`, "upstream"); }
  if (!res.ok) throw new RatesError(`GS rate engine error HTTP ${res.status}.`, "upstream");
  const value = normalizeRates(raw, input, country, form.get("city")!, form.get("zip_code")!);
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  await store?.set(key, value);
  return value;
}
