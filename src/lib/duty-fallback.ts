/**
 * Fallback duty/tax lookup for destinations without a GS profile.
 * Order: permanent cache (country + HS6) → Easyship Taxes & Duties API (if EASYSHIP_API_KEY) →
 * World Bank WITS MFN tariff API (free, no key). Every successful lookup is stored permanently,
 * so GS builds its own country×HS6 rate store over time.
 */
import type { Config } from "../config.js";
import { FALLBACK_VAT, FALLBACK_VAT_CHECKED, FALLBACK_VAT_SOURCE, FALLBACK_WITS_REPORTER } from "../data/duty/fallback-vat.js";
import type { ResolvedItem, Range3 } from "./duty-engine.js";

export interface DutyRateRecord {
  provider: "easyship" | "wits";
  duty_pct: [number, number, number];
  tax_pct?: number; // effective tax % of value (Easyship), if known
  method?: "CIF" | "FOB";
  year?: number;
  fetched: string;
}

export interface DutyCacheStore {
  get(key: string): Promise<DutyRateRecord | undefined>;
  put(key: string, value: DutyRateRecord): Promise<void>;
}

export class MemoryDutyCache implements DutyCacheStore {
  map = new Map<string, DutyRateRecord>();
  async get(k: string) { return this.map.get(k); }
  async put(k: string, v: DutyRateRecord) { this.map.set(k, v); }
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export const hs6Of = (item: ResolvedItem): string | undefined => {
  const d = item.hs_code?.replace(/\D/g, "");
  if (d && d.length >= 6) return d.slice(0, 6);
  return item.category.hs[0];
};

async function easyshipRate(cfg: Config, cc: string, hs6: string, fetchImpl: typeof fetch): Promise<DutyRateRecord | undefined> {
  if (!cfg.easyshipApiKey) return undefined;
  // Probe with a US$1,000 customs value and no shipping so de minimis does not zero the rate.
  const res = await fetchImpl(cfg.easyshipTaxUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.easyshipApiKey}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ origin_country_alpha2: "US", destination_country_alpha2: cc, insurance_fee: 0, shipment_charge: 0, items: [{ duty_origin_country_alpha2: "US", hs_code: hs6.padEnd(8, "0"), customs_value: 1000 }] }),
  });
  if (!res.ok) throw new Error(`Easyship HTTP ${res.status}`);
  const j: any = await res.json();
  const td = j?.tax_and_duty;
  if (!td || typeof td.duty !== "number") throw new Error("Easyship: unexpected response");
  const d = (td.duty / 1000) * 100;
  const method = td.import_duty_details?.[0]?.duty_calculation_method;
  return { provider: "easyship", duty_pct: [r2(d), r2(d), r2(d)], tax_pct: r2((td.tax / 1000) * 100), ...(method ? { method } : {}), fetched: new Date().toISOString().slice(0, 10) };
}

async function witsRate(cc: string, hs6: string, fetchImpl: typeof fetch): Promise<DutyRateRecord | undefined> {
  const rep = FALLBACK_WITS_REPORTER[cc];
  if (!rep) return undefined;
  const url = `https://wits.worldbank.org/API/V1/SDMX/V21/rest/data/DF_WITS_Tariff_TRAINS/A.${rep}.000.${hs6}.reported/?startPeriod=2015`;
  const res = await fetchImpl(url, { headers: { accept: "application/xml" } });
  const text = await res.text();
  if (!res.ok || text.includes("NoRecordsFound")) return undefined;
  let best: { year: number; avg: number; min: number; max: number } | undefined;
  for (const obs of text.split("<generic:Obs>").slice(1)) {
    const year = Number(/TIME_PERIOD" value="(\d+)"/.exec(obs)?.[1]);
    const avg = Number(/ObsValue value="([\d.]+)"/.exec(obs)?.[1]);
    if (!Number.isFinite(year) || !Number.isFinite(avg)) continue;
    const min = Number(/id="MIN_RATE" value="([\d.]+)"/.exec(obs)?.[1] ?? avg);
    const max = Number(/id="MAX_RATE" value="([\d.]+)"/.exec(obs)?.[1] ?? avg);
    if (!best || year > best.year) best = { year, avg, min, max };
  }
  if (!best) return undefined;
  return { provider: "wits", duty_pct: [r2(best.min), r2(best.avg), r2(best.max)], year: best.year, fetched: new Date().toISOString().slice(0, 10) };
}

export async function lookupRate(cfg: Config, cc: string, hs6: string, fetchImpl: typeof fetch, cache?: DutyCacheStore): Promise<{ rec?: DutyRateRecord; cached: boolean; errors: string[] }> {
  const key = `duty:${cc}:${hs6}`;
  const errors: string[] = [];
  const hit = await cache?.get(key).catch(() => undefined);
  if (hit) return { rec: hit, cached: true, errors };
  let rec: DutyRateRecord | undefined;
  try { rec = await easyshipRate(cfg, cc, hs6, fetchImpl); } catch (e: any) { errors.push(`Easyship: ${e?.message ?? e}`); }
  if (!rec) try { rec = await witsRate(cc, hs6, fetchImpl); } catch (e: any) { errors.push(`WITS: ${e?.message ?? e}`); }
  if (rec && cache) await cache.put(key, rec).catch(() => undefined);
  return { rec, cached: false, errors };
}

export interface FallbackEstimate {
  method: "fallback_api";
  country_code: string;
  confidence: "low";
  valuation_basis: string;
  tax_name: string;
  tax_rate_pct: Range3 | null;
  items: { category: string; hs6?: string; value_usd: number; provider?: string; cached?: boolean; duty_rate_pct: Range3 | null; duty_usd: Range3; tax_usd: Range3; total_usd: Range3 }[];
  duty_usd: Range3;
  tax_usd: Range3;
  other_fees_usd: Range3;
  total_usd: Range3;
  collection: string;
  notes: string[];
  sources: string[];
  last_checked: string;
}

export async function fallbackEstimate(cfg: Config, cc: string, items: ResolvedItem[], shippingUsd: number, fetchImpl: typeof fetch, cache?: DutyCacheStore): Promise<FallbackEstimate | undefined> {
  const goods = items.reduce((s, i) => s + i.value_usd, 0);
  const vat = FALLBACK_VAT[cc];
  const notes: string[] = ["No GS-verified rules for this country yet: duty comes from an external tariff source by HS code; de minimis thresholds and extra levies are NOT applied. Treat as a rough guide."];
  const sources = new Set<string>();
  let any = false;
  const out = [] as FallbackEstimate["items"];
  for (const it of items) {
    const hs6 = hs6Of(it);
    const sh = goods > 0 ? it.value_usd / goods : 1 / items.length;
    const base = it.value_usd + shippingUsd * sh;
    const { rec, cached, errors } = hs6 ? await lookupRate(cfg, cc, hs6, fetchImpl, cache) : { rec: undefined, cached: false, errors: ["no HS code"] };
    if (errors.length && !rec) notes.push(`Rate lookup failed for HS ${hs6 ?? "?"}: ${errors.join("; ")}`);
    const d = rec?.duty_pct;
    if (rec) {
      any = true;
      sources.add(rec.provider === "easyship" ? "https://developers.easyship.com/reference/taxes_and_duties_calculate" : "https://wits.worldbank.org/witsapiintro.aspx");
    }
    const duty = d ? d.map((p) => (base * p) / 100) : [0, 0, 0];
    let tax: number[];
    if (rec?.provider === "easyship" && rec.tax_pct !== undefined) tax = [0, 1, 2].map(() => (base * rec.tax_pct!) / 100);
    else if (vat !== undefined) { tax = duty.map((du) => ((base + du) * vat) / 100); sources.add(FALLBACK_VAT_SOURCE); }
    else tax = [0, 0, 0];
    out.push({
      category: it.category.id, ...(hs6 ? { hs6 } : {}), value_usd: r2(it.value_usd), ...(rec ? { provider: rec.provider, cached } : {}),
      duty_rate_pct: d ? { low: d[0], typical: d[1], high: d[2] } : null,
      duty_usd: { low: r2(duty[0]), typical: r2(duty[1]), high: r2(duty[2]) },
      tax_usd: { low: r2(tax[0]), typical: r2(tax[1]), high: r2(tax[2]) },
      total_usd: { low: r2(duty[0] + tax[0]), typical: r2(duty[1] + tax[1]), high: r2(duty[2] + tax[2]) },
    });
  }
  if (!any && vat === undefined) return undefined;
  if (vat === undefined) notes.push("VAT/GST rate for this country is not in GS's table; tax NOT included.");
  const sum = (k: "duty_usd" | "tax_usd" | "total_usd") => ({ low: r2(out.reduce((a, x) => a + x[k].low, 0)), typical: r2(out.reduce((a, x) => a + x[k].typical, 0)), high: r2(out.reduce((a, x) => a + x[k].high, 0)) });
  return {
    method: "fallback_api",
    country_code: cc,
    confidence: "low",
    valuation_basis: "Assumed CIF (goods + shipping)",
    tax_name: "VAT/GST (standard rate)",
    tax_rate_pct: vat !== undefined ? { low: vat, typical: vat, high: vat } : null,
    items: out,
    duty_usd: sum("duty_usd"),
    tax_usd: sum("tax_usd"),
    other_fees_usd: { low: 0, typical: 0, high: 0 },
    total_usd: sum("total_usd"),
    collection: "Usually collected by the carrier from the recipient before delivery (duties unpaid / DAP), plus a carrier clearance fee.",
    notes,
    sources: [...sources],
    last_checked: FALLBACK_VAT_CHECKED,
  };
}
