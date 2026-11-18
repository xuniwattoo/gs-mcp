/**
 * Per-item import duty & tax estimator driven by src/data/duty/profiles.ts.
 * Produces three scenarios (low / typical / high) so callers can show a central estimate and a range.
 */
import { CATEGORIES, categoryFromHs, categoryFromText, getCategory, type Category } from "../data/duty/categories.js";
import type { CountryDutyProfile, Pct3, Threshold } from "../data/duty/types.js";
import WITS_DATA from "../data/duty/wits-mfn.json" with { type: "json" };

export interface DutyItemInput {
  description?: string;
  category?: string;
  hs_code?: string;
  unit_price_usd: number;
  quantity?: number;
}

export interface ResolvedItem {
  description?: string;
  category: Category;
  matched_by: "category" | "hs_code" | "description" | "default";
  hs_code?: string;
  quantity: number;
  value_usd: number; // line total incl. allocated sales tax / fees
}

export interface Range3 { low: number; typical: number; high: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const S = [0, 1, 2] as const;
const toRange = (a: number[]): Range3 => ({ low: r2(a[0]), typical: r2(a[1]), high: r2(a[2]) });
const zero = () => [0, 0, 0];

type WitsObs = { year: number; avg: number; min: number; max: number };
const WITS = WITS_DATA as unknown as { source: string; source_url: string; fetched: string; countries: Record<string, { reporter: string; rates: Record<string, WitsObs> }> };

export function resolveItem(i: DutyItemInput): ResolvedItem {
  const qty = Math.max(1, Math.round(i.quantity ?? 1));
  const value = Math.max(0, i.unit_price_usd) * qty;
  const byId = i.category ? getCategory(i.category.trim().toLowerCase().replace(/[\s-]+/g, "_")) : undefined;
  if (byId) return { description: i.description, category: byId, matched_by: "category", hs_code: i.hs_code, quantity: qty, value_usd: value };
  const byHs = i.hs_code ? categoryFromHs(i.hs_code) : undefined;
  if (byHs) return { description: i.description, category: byHs, matched_by: "hs_code", hs_code: i.hs_code, quantity: qty, value_usd: value };
  const text = [i.category, i.description].filter(Boolean).join(" ");
  const byText = text ? categoryFromText(text) : undefined;
  if (byText) return { description: i.description, category: byText, matched_by: "description", hs_code: i.hs_code, quantity: qty, value_usd: value };
  return { description: i.description, category: getCategory("general")!, matched_by: "default", hs_code: i.hs_code, quantity: qty, value_usd: value };
}

/** Duty % [low, typical, high] for a category in a country, with where it came from. */
export function categoryDutyPct(p: CountryDutyProfile, cat: Category): { pct: Pct3; source: string } {
  const res = rawCategoryDutyPct(p, cat);
  if (p.usFta && res.pct[0] > 0) return { pct: [0, res.pct[1], res.pct[2]], source: `${res.source}; low = 0% for US-made goods under ${p.usFta}` };
  return res;
}

function rawCategoryDutyPct(p: CountryDutyProfile, cat: Category): { pct: Pct3; source: string } {
  const o = p.duty?.[cat.id];
  if (o) return { pct: o, source: "GS rules table" };
  const w = p.ignoreWits ? undefined : WITS.countries[p.witsKey ?? p.code];
  if (w) {
    const codes = cat.id === "general" ? CATEGORIES.filter((c) => c.id !== "general").map((c) => c.hs[0]) : cat.hs;
    const obs = codes.map((h) => w.rates[h]).filter(Boolean) as WitsObs[];
    if (obs.length) {
      const year = Math.max(...obs.map((o) => o.year));
      if (cat.id === "general") {
        const avgs = obs.map((o) => o.avg).sort((a, b) => a - b);
        return { pct: [avgs[0], avgs[Math.floor(avgs.length / 2)], avgs[avgs.length - 1]], source: `WITS/UNCTAD TRAINS MFN applied rates (${year}), spread across all categories` };
      }
      const low = Math.min(...obs.map((o) => o.min));
      const high = Math.max(...obs.map((o) => o.max));
      const typical = obs[0].avg;
      return { pct: [r2(low), r2(typical), r2(high)], source: `WITS/UNCTAD TRAINS MFN applied rate, HS ${codes.join("/")} (${year})` };
    }
  }
  return { pct: p.defaultDuty, source: "GS country default range" };
}

/** Is the consignment under a threshold in scenario s? */
function exemptFor(t: Threshold | null, goods: number, cif: number): boolean[] {
  if (!t) return [false, false, false];
  const v = t.basis === "cif" ? cif : goods;
  if (v > t.usd) return [false, false, false];
  if (t.certainty === "firm") return [true, true, true];
  if (t.certainty === "likely") return [true, true, false];
  return [true, false, false];
}

export interface ItemEstimate {
  description?: string;
  category: string;
  category_label: string;
  matched_by: ResolvedItem["matched_by"];
  hs_code?: string;
  quantity: number;
  value_usd: number;
  customs_value_usd: number;
  duty_rate_pct: Range3;
  duty_rate_source: string;
  duty_usd: Range3;
  tax_rate_pct: Range3;
  tax_usd: Range3;
  fees_usd: Range3;
  total_usd: Range3;
}

export interface DutyEstimate {
  method: "rules_table";
  country: string;
  country_code: string;
  confidence: CountryDutyProfile["confidence"];
  valuation_basis: string;
  tax_name: string;
  tax_rate_pct: Range3;
  de_minimis: { duty: (Threshold & { applied: string }) | null; tax: (Threshold & { applied: string }) | null };
  regime_applied?: string;
  items: ItemEstimate[];
  duty_usd: Range3;
  tax_usd: Range3;
  other_fees_usd: Range3;
  fee_lines: { name: string; usd: Range3 }[];
  total_usd: Range3;
  collection: string;
  notes: string[];
  sources: string[];
  last_checked: string;
}

const appliedLabel = (ex: boolean[]) => (ex.every(Boolean) ? "yes: under threshold" : ex.some(Boolean) ? "maybe: under threshold but conditions apply (exempt in the low estimate only" + (ex[1] ? " and typical)" : ")") : "no");

export function estimateDuties(p: CountryDutyProfile, items: ResolvedItem[], shippingUsd: number, opts: { itemCategories?: number } = {}): DutyEstimate {
  const notes: string[] = [...(p.notes ?? [])];
  const goods = items.reduce((s, i) => s + i.value_usd, 0);
  const cif = goods + shippingUsd;
  const share = (i: ResolvedItem) => (goods > 0 ? i.value_usd / goods : 1 / items.length);
  let dutyEx = exemptFor(p.duty_de_minimis, goods, cif);
  let taxEx = exemptFor(p.tax_de_minimis, goods, cif);
  let regime: string | undefined;
  const sources = new Set(p.sources);

  const per = items.map((it) => {
    const { pct, source } = categoryDutyPct(p, it.category);
    if (source.startsWith("WITS")) sources.add(WITS.source_url);
    return { it, dutyPct: [...pct] as number[], dutySource: source, taxPct: [...(p.tax.byCategory?.[it.category.id] ?? p.tax.rate)] as number[], duty: zero(), tax: zero(), fees: zero(), base: 0, flat: false, extraIncomeTax: 0 };
  });

  // ---- special regimes (adjust rates / exemptions before the generic maths) ----
  const fx = p.fx_per_usd;
  let skipPctFees = false;
  let flatDutyUsd: number[] | null = null; // EU €3 flat duty total
  let borderTaxOff = false;
  let atSaleTax: number[] | null = null; // AU/MY: tax charged at sale by registered sellers/redeliverers
  switch (p.regime) {
    case "AO_courier":
      if (goods * fx <= 1_500_000) {
        regime = "Angola courier flat rate: 16% of invoice value (duty + IVA)";
        per.forEach((x) => { x.flat = true; x.dutyPct = [16, 16, 16]; x.dutySource = "AGT flat courier rate"; x.taxPct = [0, 0, 0]; });
        skipPctFees = true;
      } else regime = "Angola general regime (above AOA 1.5M)";
      break;
    case "IN_personal":
      regime = "India personal import (heading 9804): 10% BCD + 10% SWS + 18% IGST";
      per.forEach((x) => { const hi = Math.max(10, x.dutyPct[2]); x.dutyPct = [11, 11, hi * 1.1]; x.dutySource = "Customs heading 9804 (10% BCD + SWS); high = commercial tariff assessment"; });
      break;
    case "BR_import_tax":
      regime = "Brazil simplified regime: 60% import tax + ICMS by inclusion";
      per.forEach((x) => { x.dutyPct = [60, 60, 60]; x.dutySource = "Receita Federal simplified regime (non-Remessa Conforme)"; });
      if (cif > 3000) notes.push("Shipments over US$3,000 cannot use the simplified courier regime; formal import applies.");
      break;
    case "DZ_parcels": {
      const v = goods * fx;
      if (v > 50_000 && v <= 100_000) {
        regime = "Algeria personal parcel flat rate: 30% (DZD 50,001–100,000)";
        per.forEach((x) => { const exemptCat = x.it.category.id === "phones" || x.it.category.id === "laptops"; x.flat = true; x.dutyPct = exemptCat ? [0, 0, 0] : [30, 30, 30]; x.dutySource = exemptCat ? "Flat tax exemption for phones/IT" : "Algerian customs flat rate for personal parcels"; x.taxPct = [0, 0, 0]; });
        skipPctFees = true;
      }
      break;
    }
    case "EU_lowvalue":
      if (goods <= 150 / fx) {
        const cats = opts.itemCategories ?? new Set(items.map((i) => i.category.id)).size;
        const total = (3 / fx) * Math.max(1, cats);
        regime = `EU low-value consignment (≤ €150): €3 flat duty × ${Math.max(1, cats)} tariff categor${cats > 1 ? "ies" : "y"}`;
        flatDutyUsd = [total, total, total];
        per.forEach((x) => { x.dutySource = "EU €3 flat duty per tariff category (1 Jul 2026 – 1 Jul 2028)"; });
      } else regime = "EU normal tariff (consignment above €150)";
      break;
    case "ID_consignment":
      if (goods <= 3) { regime = "Indonesia consignment ≤ US$3: duty-free, VAT applies"; dutyEx = [true, true, true]; }
      else if (goods <= 1500) {
        regime = "Indonesia consignment US$3–1,500 (PMK 4/2025)";
        per.forEach((x) => { const textile = ["bags", "shoes", "clothing"].includes(x.it.category.id); x.dutyPct = textile ? [25, 25, 25] : [7.5, 7.5, 7.5]; x.dutySource = textile ? "PMK 4/2025: bags/shoes/textiles 25% + 5% income tax" : "PMK 4/2025 flat 7.5%"; x.extraIncomeTax = textile ? 5 : 0; });
      } else regime = "Indonesia normal tariff (above US$1,500)";
      break;
    case "AU_lvg":
      if (goods <= 1000 / fx) {
        regime = "Australia low-value goods (≤ AUD 1,000): no border duty/GST; 10% GST may be charged at sale";
        borderTaxOff = true;
        atSaleTax = [0, 0, 10];
      }
      break;
    case "MY_lvg":
      if (cif <= 500 / fx) {
        regime = "Malaysia de minimis (≤ RM 500 CIF): no border duty/tax; 10% LVG tax may be charged at sale";
        borderTaxOff = true;
        atSaleTax = [0, 0, 10];
      }
      break;
  }

  // ---- generic maths ----
  const feeLines = new Map<string, number[]>();
  const addFee = (name: string, s: number, v: number) => { const a = feeLines.get(name) ?? zero(); a[s] += v; feeLines.set(name, a); };
  for (const x of per) {
    const sh = share(x.it);
    const ship = shippingUsd * sh;
    const insurance = p.regime === "IN_personal" ? x.it.value_usd * 0.01125 : 0;
    const base = x.flat && p.regime === "AO_courier" ? x.it.value_usd : p.valuation === "CIF" ? x.it.value_usd + ship + insurance : x.it.value_usd;
    x.base = base;
    for (const s of S) {
      if (borderTaxOff) {
        if (atSaleTax) x.tax[s] = ((x.it.value_usd + ship) * atSaleTax[s]) / 100;
        continue;
      }
      const dutyExempt = dutyEx[s];
      let duty = dutyExempt ? 0 : flatDutyUsd ? flatDutyUsd[s] * sh : (base * x.dutyPct[s]) / 100;
      let pctFeesInTax = 0;
      if (!dutyExempt && !skipPctFees)
        for (const f of p.fees ?? []) {
          if (f.kind === "fixed_usd") continue;
          if (f.categories && !f.categories.includes(x.it.category.id)) continue;
          const v = f.kind === "pct_duty" ? (duty * f.value[s]) / 100 : (base * f.value[s]) / 100;
          x.fees[s] += v; addFee(f.name, s, v);
          if (f.inTaxBase !== false) pctFeesInTax += v;
        }
      let excise = 0;
      if (!dutyExempt && !x.flat)
        for (const e of p.excise ?? []) if (e.categories.includes(x.it.category.id)) {
          const v = ((base + duty) * e.value[s]) / 100;
          excise += v; addFee(e.name, s, v);
        }
      x.fees[s] += excise;
      if (x.extraIncomeTax && !dutyExempt) { const v = ((base + duty) * x.extraIncomeTax) / 100; x.fees[s] += v; addFee("Import income tax (PPh)", s, v); }
      x.duty[s] = duty;
      if (!taxEx[s] && x.taxPct[s] > 0) {
        const taxBaseGoods = p.tax.base === "cif" ? x.it.value_usd + ship + insurance : base;
        const tb = taxBaseGoods * (1 + (p.tax.upliftPct ?? 0) / 100) + duty + pctFeesInTax + excise;
        const rate = x.taxPct[s] / 100;
        x.tax[s] = p.regime === "BR_import_tax" ? (tb / (1 - rate)) * rate : tb * rate;
      }
    }
  }
  // India: duty+tax under ₹100 is waived.
  if (p.regime === "IN_personal") for (const s of S) if (per.reduce((a, x) => a + x.duty[s] + x.tax[s], 0) < 100 / fx) per.forEach((x) => { x.duty[s] = 0; x.tax[s] = 0; });

  // Fixed per-consignment fees (carrier, processing): only when something is payable in that scenario.
  for (const s of S) {
    const payable = per.reduce((a, x) => a + x.duty[s] + x.tax[s] + x.fees[s], 0) > 0.005;
    for (const f of p.fees ?? []) {
      if (f.kind !== "fixed_usd") continue;
      if (f.onlyWhenDutiable && (dutyEx[s] || borderTaxOff)) continue;
      if (!payable || (borderTaxOff && !f.onlyWhenDutiable)) continue;
      addFee(f.name, s, f.value[s]);
    }
  }

  const sum = (pick: (x: (typeof per)[number]) => number[]) => S.map((s) => per.reduce((a, x) => a + pick(x)[s], 0));
  const dutyT = sum((x) => x.duty);
  const taxT = sum((x) => x.tax);
  const feeT = S.map((s) => [...feeLines.values()].reduce((a, v) => a + v[s], 0));
  const total = S.map((s) => dutyT[s] + taxT[s] + feeT[s]);
  const sorted = [...total].sort((a, b) => a - b);
  if (sorted[0] !== total[0] || sorted[2] !== total[2]) { total[0] = sorted[0]; total[2] = sorted[2]; }

  if (borderTaxOff && atSaleTax) notes.push("Under the low-value threshold nothing is collected at the border. A GST/sales-tax-registered seller or shopping service may add tax at checkout (shown in the high estimate).");
  if (items.some((i) => i.matched_by === "default")) notes.push("Some items could not be matched to a product category, so a country-wide duty range was used. Pass category or hs_code for a tighter estimate.");
  notes.push("GS assisted-purchase fee and any US sales tax are included in the declared value (conservative).");

  return {
    method: "rules_table",
    country: p.name,
    country_code: p.code,
    confidence: p.confidence,
    valuation_basis: p.valuation === "CIF" ? "CIF: duty on goods + international shipping (+ insurance)" : "FOB: duty on goods value only (shipping excluded)" + (p.tax.base === "cif" ? "; GST/VAT base includes shipping" : ""),
    tax_name: p.tax.name,
    tax_rate_pct: toRange(p.tax.rate),
    de_minimis: {
      duty: p.duty_de_minimis ? { ...p.duty_de_minimis, applied: appliedLabel(dutyEx) } : null,
      tax: p.tax_de_minimis ? { ...p.tax_de_minimis, applied: appliedLabel(taxEx) } : null,
    },
    ...(regime ? { regime_applied: regime } : {}),
    items: per.map((x) => ({
      ...(x.it.description ? { description: x.it.description } : {}),
      category: x.it.category.id,
      category_label: x.it.category.label,
      matched_by: x.it.matched_by,
      ...(x.it.hs_code ? { hs_code: x.it.hs_code } : {}),
      quantity: x.it.quantity,
      value_usd: r2(x.it.value_usd),
      customs_value_usd: r2(x.base),
      duty_rate_pct: flatDutyUsd ? toRange(flatDutyUsd.map((v) => (x.base ? ((v * share(x.it)) / x.base) * 100 : 0))) : toRange(x.dutyPct),
      duty_rate_source: x.dutySource,
      duty_usd: toRange(x.duty),
      tax_rate_pct: toRange(atSaleTax && borderTaxOff ? atSaleTax : x.taxPct),
      tax_usd: toRange(x.tax),
      fees_usd: toRange(x.fees),
      total_usd: toRange(S.map((s) => x.duty[s] + x.tax[s] + x.fees[s])),
    })),
    duty_usd: toRange(dutyT),
    tax_usd: toRange(taxT),
    other_fees_usd: toRange(feeT),
    fee_lines: [...feeLines.entries()].filter(([, v]) => v.some((n) => n > 0.004)).map(([name, v]) => ({ name, usd: toRange(v) })),
    total_usd: toRange(total),
    collection: p.collection,
    notes,
    sources: [...sources],
    last_checked: p.last_checked,
  };
}
