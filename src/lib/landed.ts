import type { Config } from "../config.js";
import { findDutyRule, DUTY_RULES } from "../data/duties.js";
import { GS_URLS, OWNER_POLICY_NOTE } from "../data/gs.js";
import { resolveCountry } from "./countries.js";
import { getShippingRates, type NormalizedService, type RatesInput, type RatesCacheStore } from "./rates.js";

export type PaymentMethod = "card" | "paypal" | "bank_transfer" | "crypto";
export type RequestType = "none" | "standard" | "expedited" | "executive";

export interface LandedInput {
  destination_country: string;
  items_total_usd: number;
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

async function easyship(cfg: Config, countryCode: string, hs: string, customsValue: number, shipping: number, fetchImpl: typeof fetch) {
  const res = await fetchImpl(cfg.easyshipTaxUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.easyshipApiKey}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      origin_country_alpha2: "US",
      destination_country_alpha2: countryCode,
      insurance_fee: 0,
      shipment_charge: shipping,
      items: [{ duty_origin_country_alpha2: "US", hs_code: hs.replace(/\D/g, "").padEnd(8, "0").slice(0, 8), customs_value: customsValue }],
    }),
  });
  if (!res.ok) throw new Error(`Easyship HTTP ${res.status}`);
  return res.json();
}

export async function estimateLandedCost(input: LandedInput, cfg: Config, fetchImpl: typeof fetch = fetch, store?: RatesCacheStore) {
  const country = resolveCountry(input.destination_country);
  if (!country) throw new Error(`Unknown destination country "${input.destination_country}".`);
  const notes: string[] = [];

  const salesTax = r2(input.items_total_usd * ((input.us_sales_tax_pct ?? 0) / 100));
  if (!input.us_sales_tax_pct) notes.push("US sales tax assumed 0%: orders shipped to the GS Delaware address pay no state sales tax. Pass us_sales_tax_pct if the store charges it.");
  const fee = assistedFee(input.items_total_usd, input.assisted_purchase, input.payment_method, cfg);
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

  const goods = r2(input.items_total_usd + salesTax + fee.fee);
  const rule = findDutyRule(country.code);
  let duty: any = null;
  if (input.hs_code && cfg.easyshipApiKey) {
    try {
      duty = { method: "easyship_api", raw: await easyship(cfg, country.code, input.hs_code, input.items_total_usd, shipping ?? 0, fetchImpl) };
    } catch (e: any) {
      notes.push(`Easyship duty lookup failed (${e?.message}); using GS rules table.`);
    }
  }
  if (!duty && rule) {
    const est = rule.estimate({ goodsUsd: goods, shippingUsd: shipping ?? 0, itemCategories: input.item_categories ?? 1 });
    duty = {
      method: "rules_table",
      country: rule.country,
      tax_name: rule.taxName,
      tax_rate_pct: rule.taxRatePct,
      de_minimis: rule.deMinimis,
      typical_duty_pct: rule.typicalDutyPct,
      duty_usd: { low: est.dutyLow, high: est.dutyHigh },
      tax_usd: { low: est.taxLow, high: est.taxHigh },
      other_fees_usd: { low: est.otherLow, high: est.otherHigh },
      total_usd: { low: r2(est.dutyLow + est.taxLow + est.otherLow), high: r2(est.dutyHigh + est.taxHigh + est.otherHigh) },
      notes: est.notes,
      sources: rule.sources,
    };
  }
  if (!duty) notes.push(`No duty rules for ${country.name} yet (covered: ${DUTY_RULES.map((r) => r.code).join(", ")}). Check with local customs; import duty/tax is NOT included.`);

  const base = goods + (shipping ?? 0);
  const dutyLow = duty?.total_usd?.low ?? 0;
  const dutyHigh = duty?.total_usd?.high ?? 0;
  return {
    estimate: true,
    label: "ESTIMATE ONLY – not a quote. Final duties/taxes are set by destination customs; GS confirms fees before purchase.",
    destination: { country_code: country.code, country: country.name },
    breakdown_usd: {
      items: r2(input.items_total_usd),
      us_sales_tax: salesTax,
      gs_assisted_purchase_fee: fee.fee,
      gs_fee_basis: fee.basis,
      international_shipping: shipping ?? null,
      shipping_service: shippingService ? `${shippingService.carrier} – ${shippingService.service} (${shippingService.transit_time ?? "n/a"})` : null,
      import_duty_and_tax: duty?.total_usd ?? (duty?.method === "easyship_api" ? "see duty.raw" : null),
    },
    total_landed_usd: { low: r2(base + dutyLow), high: r2(base + dutyHigh) },
    duty,
    notes,
    sources: [GS_URLS.faqs, GS_URLS.assistedPurchase, GS_URLS.calculator],
  };
}
