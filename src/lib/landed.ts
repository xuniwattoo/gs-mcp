import type { Config } from "../config.js";
import { findProfile, PROFILES } from "../data/duty/profiles.js";
import { estimateDuties, resolveItem, type DutyItemInput, type ResolvedItem } from "./duty-engine.js";
import { fallbackEstimate, type DutyCacheStore } from "./duty-fallback.js";
import { GS_URLS, OWNER_POLICY_NOTE } from "../data/gs.js";
import { resolveCountry } from "./countries.js";
import { getShippingRates, type NormalizedService, type RatesInput, type RatesCacheStore } from "./rates.js";

export type PaymentMethod = "card" | "paypal" | "bank_transfer" | "crypto";
export type RequestType = "none" | "standard" | "expedited" | "executive";

export interface LandedInput {
  destination_country: string;
  /** Total item price in USD. Optional when `items` is given (then the sum of items is used). */
  items_total_usd?: number;
  /** Optional item lines for per-category duty. */
  items?: DutyItemInput[];
  /** Single-item shortcuts when `items` is omitted. */
  category?: string;
  description?: string;
  us_sales_tax_pct?: number;
  assisted_purchase: RequestType;
  payment_method: PaymentMethod;
  shipping_usd?: number;
  package?: Omit<RatesInput, "country">;
  preferred_carrier?: string;
  item_categories?: number;
  hs_code?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function assistedFee(itemsUsd: number, type: RequestType, method: PaymentMethod, cfg: Config): { fee: number; basis: string } {
  if (type === "none") return { fee: 0, basis: "Not using Assisted Purchase (you buy and ship to your GS US address yourself)." };
  if (type === "expedited") return { fee: r2(Math.max(10, itemsUsd * 0.1)), basis: "Expedited request: 10% of order cost, $10 minimum (GS published)." };
  if (type === "executive") return { fee: r2(10 + itemsUsd * 0.1), basis: "Executive request: $10 special address + 10% of order cost (GS published)." };
  if (cfg.assistedFeeWaivedMethods.includes(method)) return { fee: 0, basis: `Standard request paid by ${method.replace("_", " ")}: 0% fee (GS policy).` };
  const fee = itemsUsd * (cfg.assistedFeePct / 100);
  return { fee: r2(fee > 0 ? Math.max(cfg.assistedFeeMinUsd, fee) : 0), basis: `Standard request: ${cfg.assistedFeePct}% of order cost${cfg.assistedFeeMinUsd ? `, $${cfg.assistedFeeMinUsd} minimum` : ""}.` };
}

export async function estimateLandedCost(input: LandedInput, cfg: Config, fetchImpl: typeof fetch = fetch, store?: RatesCacheStore, dutyCache?: DutyCacheStore) {
  const country = resolveCountry(input.destination_country);
  if (!country) throw new Error(`Unknown destination country "${input.destination_country}".`);
  const notes: string[] = [];
  const rawItems = (input.items ?? []).filter((i) => i && i.unit_price_usd >= 0);
  const itemsSum = r2(rawItems.reduce((a, i) => a + i.unit_price_usd * Math.max(1, Math.round(i.quantity ?? 1)), 0));
  const itemsTotal = rawItems.length ? itemsSum : (input.items_total_usd ?? 0);
  if (!rawItems.length && !(input.items_total_usd! > 0)) throw new Error("Pass items_total_usd or items[] with unit_price_usd.");
  if (rawItems.length && input.items_total_usd !== undefined && Math.abs(input.items_total_usd - itemsSum) > 0.01) notes.push(`items_total_usd (${input.items_total_usd}) differs from the sum of items (${itemsSum}); using the item lines.`);

  const salesTax = r2(itemsTotal * ((input.us_sales_tax_pct ?? 0) / 100));
  if (!input.us_sales_tax_pct) notes.push("US sales tax assumed 0%: orders shipped to the GS Delaware address pay no state sales tax. Pass us_sales_tax_pct if the store charges it.");
  const fee = assistedFee(itemsTotal, input.assisted_purchase, input.payment_method, cfg);
  if (input.assisted_purchase === "standard") notes.push(OWNER_POLICY_NOTE);

  let shipping = input.shipping_usd;
  let shippingService: NormalizedService | null = null;
  let shippingError: string | undefined;
  if (shipping === undefined && input.package) {
    try {
      const rates = await getShippingRates({ ...input.package, country: country.code }, cfg, fetchImpl, store);
      const pool = input.preferred_carrier ? rates.services.filter((s) => s.carrier.toLowerCase().includes(input.preferred_carrier!.toLowerCase())) : rates.services;
      shippingService = pool[0] ?? rates.cheapest;
      shipping = shippingService?.price_usd;
    } catch (e: any) {
      shippingError = e?.message ?? String(e);
    }
  }
  if (shipping === undefined) notes.push(shippingError ? `Shipping not included: ${shippingError}` : "Shipping not included: pass shipping_usd or package weight to include it.");

  const goods = r2(itemsTotal + salesTax + fee.fee);
  const extras = salesTax + fee.fee;
  const resolved: ResolvedItem[] = rawItems.length
    ? rawItems.map((it) => {
        const ri = resolveItem(it);
        return { ...ri, value_usd: ri.value_usd + (itemsTotal > 0 ? (extras * ri.value_usd) / itemsTotal : extras / rawItems.length) };
      })
    : [{ ...resolveItem({ hs_code: input.hs_code, category: input.category, description: input.description, unit_price_usd: input.items_total_usd ?? 0 }), value_usd: goods }];

  const profile = findProfile(country.code);
  let duty: any = null;
  if (profile) {
    duty = estimateDuties(profile, resolved, shipping ?? 0, { itemCategories: rawItems.length ? undefined : input.item_categories });
    duty.de_minimis_summary = [
      profile.duty_de_minimis ? `Duty-free up to ${profile.duty_de_minimis.currency} ${profile.duty_de_minimis.local.toLocaleString("en-US")} (~$${profile.duty_de_minimis.usd}, ${profile.duty_de_minimis.basis === "cif" ? "incl. shipping" : "goods value"}${profile.duty_de_minimis.certainty !== "firm" ? ", conditions apply" : ""})` : "No duty de minimis",
      profile.tax_de_minimis ? `${profile.tax.name} free up to ${profile.tax_de_minimis.currency} ${profile.tax_de_minimis.local.toLocaleString("en-US")} (~$${profile.tax_de_minimis.usd})` : `${profile.tax.name} due from the first dollar (unless noted)`,
    ].join("; ");
  } else {
    try {
      duty = (await fallbackEstimate(cfg, country.code, resolved, shipping ?? 0, fetchImpl, dutyCache)) ?? null;
    } catch (e: any) {
      notes.push(`Fallback duty lookup failed (${e?.message ?? e}).`);
    }
    if (!duty) notes.push(`No duty rules for ${country.name} yet (GS covers ${PROFILES.length} countries). Check with local customs; import duty/tax is NOT included.`);
  }

  const base = goods + (shipping ?? 0);
  const t = duty?.total_usd ?? { low: 0, typical: 0, high: 0 };
  return {
    estimate: true,
    label: "ESTIMATE ONLY – not a quote. Final duties/taxes are set by destination customs; GS confirms fees before purchase.",
    destination: { country_code: country.code, country: country.name },
    breakdown_usd: {
      items: r2(itemsTotal),
      us_sales_tax: salesTax,
      gs_assisted_purchase_fee: fee.fee,
      gs_fee_basis: fee.basis,
      international_shipping: shipping ?? null,
      shipping_service: shippingService ? `${shippingService.carrier} – ${shippingService.service} (${shippingService.transit_time ?? "n/a"})` : null,
      import_duty_and_tax: duty?.total_usd ?? null,
    },
    total_landed_usd: { low: r2(base + t.low), typical: r2(base + t.typical), high: r2(base + t.high) },
    duty,
    notes,
    sources: [GS_URLS.faqs, GS_URLS.assistedPurchase, GS_URLS.calculator],
  };
}
