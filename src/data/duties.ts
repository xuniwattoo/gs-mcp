/**
 * Small import duty / tax rules table for GS's top destinations.
 * ESTIMATES ONLY. Real duty depends on HS code, declared value, origin and local rules.
 * Each row cites a public source. Checked 2026-11-17. USD equivalents of local-currency
 * thresholds are approximate (pegged rates for SAR/AED; others approximate as of Nov 2026).
 */
export interface DutyEstimateInput {
  goodsUsd: number; // item price incl. US sales tax + GS fee (what the shopper pays for the goods)
  shippingUsd: number; // international shipping
  itemCategories: number; // distinct product types (for EU flat duty)
}

export interface DutyRange {
  dutyLow: number;
  dutyHigh: number;
  taxLow: number;
  taxHigh: number;
  otherLow: number;
  otherHigh: number;
  notes: string[];
}

export interface DutyRule {
  code: string;
  country: string;
  taxName: string;
  taxRatePct: number | [number, number];
  deMinimis: string;
  typicalDutyPct: [number, number];
  sources: string[];
  estimate(i: DutyEstimateInput): DutyRange;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const range = (v: number | [number, number]): [number, number] => (Array.isArray(v) ? v : [v, v]);

/** Generic: duty on CIF, tax on CIF + duty, with optional duty/tax de minimis in USD (value <= threshold => exempt). */
function generic(opts: {
  dutyPct: [number, number];
  taxPct: number | [number, number];
  dutyDeMinUsd?: number;
  taxDeMinUsd?: number;
  basis?: "CIF" | "FOB";
  notes?: string[];
  other?: (cif: number, dutyLow: number, dutyHigh: number) => [number, number, string?];
}) {
  return (i: DutyEstimateInput): DutyRange => {
    const cif = opts.basis === "FOB" ? i.goodsUsd : i.goodsUsd + i.shippingUsd;
    const notes = [...(opts.notes ?? [])];
    let dutyLow = (cif * opts.dutyPct[0]) / 100;
    let dutyHigh = (cif * opts.dutyPct[1]) / 100;
    if (opts.dutyDeMinUsd !== undefined && cif <= opts.dutyDeMinUsd) {
      dutyLow = dutyHigh = 0;
      notes.push(`Value is under the duty-free threshold (~$${opts.dutyDeMinUsd}), so no duty is expected.`);
    }
    const [tl, th] = range(opts.taxPct);
    let taxLow = ((cif + dutyLow) * tl) / 100;
    let taxHigh = ((cif + dutyHigh) * th) / 100;
    if (opts.taxDeMinUsd !== undefined && cif <= opts.taxDeMinUsd) {
      taxLow = taxHigh = 0;
      notes.push(`Value is under the import-tax threshold (~$${opts.taxDeMinUsd}).`);
    }
    let otherLow = 0, otherHigh = 0;
    if (opts.other && !(opts.dutyDeMinUsd !== undefined && cif <= opts.dutyDeMinUsd)) {
      const [ol, oh, note] = opts.other(cif, dutyLow, dutyHigh);
      otherLow = ol; otherHigh = oh;
      if (note) notes.push(note);
    }
    return { dutyLow: r2(dutyLow), dutyHigh: r2(dutyHigh), taxLow: r2(taxLow), taxHigh: r2(taxHigh), otherLow: r2(otherLow), otherHigh: r2(otherHigh), notes };
  };
}

const EUR_USD = 1.15; // approximate
const eu = (code: string, country: string, vat: number, source: string): DutyRule => ({
  code, country, taxName: "VAT", taxRatePct: vat,
  deMinimis: "No VAT threshold (VAT from €0). Duty-free €150 threshold abolished 1 Jul 2026; temporary €3 customs duty per item category for consignments ≤ €150 until 1 Jul 2028.",
  typicalDutyPct: [0, 12],
  sources: [source, "https://taxation-customs.ec.europa.eu/news/guidance-and-legal-text-temporary-flat-fee-low-value-imports-which-will-apply-until-1-july-2028-2026-06-08_en"],
  estimate(i) {
    const cif = i.goodsUsd + i.shippingUsd;
    const notes: string[] = [];
    let dutyLow: number, dutyHigh: number;
    if (cif <= 150 * EUR_USD) {
      dutyLow = dutyHigh = 3 * EUR_USD * Math.max(1, i.itemCategories);
      notes.push(`Consignment ≤ €150: flat €3 per product category (${Math.max(1, i.itemCategories)} assumed).`);
    } else {
      dutyLow = 0; dutyHigh = cif * 0.12;
      notes.push("Above €150: normal EU tariff by HS code (most consumer goods 0–12%).");
    }
    notes.push("A new EU parcel handling fee was proposed for late 2026; not included.");
    return { dutyLow: r2(dutyLow), dutyHigh: r2(dutyHigh), taxLow: r2((cif + dutyLow) * vat / 100), taxHigh: r2((cif + dutyHigh) * vat / 100), otherLow: 0, otherHigh: 0, notes };
  },
});

export const DUTY_RULES: DutyRule[] = [
  {
    code: "AO", country: "Angola", taxName: "IVA (VAT)", taxRatePct: 14,
    deMinimis: "None since 1 Jun 2024. Courier shipments up to AOA 1,500,000 (~$1,640) pay a flat 16% duty+VAT on invoice value (carriers may add an admin fee, e.g. DHL AOA 5,000).",
    typicalDutyPct: [2, 50],
    sources: ["https://www.dhl.com/discover/en-tw/ship-with-dhl/export-with-dhl/2024-angola-deminimis", "https://www.trade.gov/country-commercial-guides/angola-import-tariffs"],
    estimate(i) {
      const notes: string[] = [];
      if (i.goodsUsd <= 1640) {
        const flat = i.goodsUsd * 0.16;
        notes.push("Courier flat rate: 16% of invoice value covers duty and VAT (AGT Circular 12/2024). Carrier admin fee not included.");
        return { dutyLow: r2(flat), dutyHigh: r2(flat), taxLow: 0, taxHigh: 0, otherLow: 0, otherHigh: 0, notes };
      }
      const cif = i.goodsUsd + i.shippingUsd;
      notes.push("Above AOA 1.5M: general regime, duty 2–50% (avg ~10.9%) on CIF + 2% customs fee + 14% VAT.");
      const dl = cif * 0.02, dh = cif * 0.5;
      return { dutyLow: r2(dl), dutyHigh: r2(dh), taxLow: r2((cif + dl) * 0.14), taxHigh: r2((cif + dh) * 0.14), otherLow: r2(cif * 0.02), otherHigh: r2(cif * 0.02), notes };
    },
  },
  {
    code: "SA", country: "Saudi Arabia", taxName: "VAT", taxRatePct: 15,
    deMinimis: "Personal e-store purchases under SAR 1,000 (~$267, incl. shipping+insurance) are duty-exempt; VAT 15% applies at any value; SAR 15 declaration fee.",
    typicalDutyPct: [5, 12],
    sources: ["https://zatca.gov.sa/en/RulesRegulations/Taxes/Pages/customs-individual/e-stores-customers.aspx", "https://zatca.gov.sa/en/MediaCenter/News/Pages/news-1282.aspx"],
    estimate: generic({ dutyPct: [5, 12], taxPct: 15, dutyDeMinUsd: 266.67, notes: ["GCC common tariff: most goods 5%."], other: () => [4, 4, "Includes ~SAR 15 (~$4) customs declaration fee."] }),
  },
  {
    code: "AE", country: "United Arab Emirates", taxName: "VAT", taxRatePct: 5,
    deMinimis: "Dubai only: e-commerce goods ≤ AED 1,000 (~$272) duty-exempt from 3 Aug 2026. No low-value VAT threshold confirmed.",
    typicalDutyPct: [5, 5],
    sources: ["https://traddal.com/resources/calculate-duties-taxes-imports-united-arab-emirates"],
    estimate: generic({ dutyPct: [0, 5], taxPct: 5, notes: ["Duty 5% on CIF generally; Dubai e-commerce exemption up to AED 1,000 may bring duty to 0 (low end)."] }),
  },
  {
    code: "GB", country: "United Kingdom", taxName: "VAT", taxRatePct: 20,
    deMinimis: "No customs duty on goods worth £135 (~$175) or less in total; VAT 20% still applies (charged by seller or carrier).",
    typicalDutyPct: [0, 12],
    sources: ["https://www.gov.uk/goods-sent-from-abroad/tax-and-duty"],
    estimate: generic({ dutyPct: [0, 12], taxPct: 20, dutyDeMinUsd: 175, notes: ["Carriers usually add a clearance/handling fee (not included)."] }),
  },
  {
    code: "CA", country: "Canada", taxName: "GST/HST", taxRatePct: [5, 15],
    deMinimis: "Courier from the US: duty-free up to CAD 150 (~$107), tax-free up to CAD 40 (~$29). Mail: CAD 20.",
    typicalDutyPct: [0, 18],
    sources: ["https://traddal.com/resources/calculate-duties-taxes-imports-canada"],
    estimate: generic({ dutyPct: [0, 18], taxPct: [5, 15], dutyDeMinUsd: 107, taxDeMinUsd: 29, basis: "FOB", notes: ["GST 5% federal; HST provinces up to 15%; PST/QST may apply. US/Mexico-origin goods are often duty-free under CUSMA. Carrier brokerage fees not included."] }),
  },
  {
    code: "AU", country: "Australia", taxName: "GST", taxRatePct: 10,
    deMinimis: "Goods ≤ AUD 1,000 (~$700) generally clear free of duty and GST at the border (registered overseas sellers may charge 10% GST at checkout).",
    typicalDutyPct: [0, 5],
    sources: ["https://traddal.com/resources/calculate-duties-taxes-imports-australia"],
    estimate: generic({ dutyPct: [0, 5], taxPct: 10, dutyDeMinUsd: 700, taxDeMinUsd: 700, basis: "FOB", notes: ["Above AUD 1,000 Border Force charges also apply (not included)."] }),
  },
  {
    code: "NG", country: "Nigeria", taxName: "VAT", taxRatePct: 7.5,
    deMinimis: "Express/e-commerce consignments ≤ $300 exempt from duty and taxes (max 4 imports per person per year) since 8 Sep 2025.",
    typicalDutyPct: [5, 35],
    sources: ["https://fmino.gov.ng/nigeria-customs-service-board-approves-de-minimis-threshold-to-enhance-trade-facilitation-issues-stern-warning-to-officers-against-unethical-behaviour/", "https://www.dhl.com/discover/en-ng/ship-with-dhl/import-with-dhl/Shipping-from-the-USA-and-UK-to-Nigeria--Costs-and-Customs"],
    estimate: generic({ dutyPct: [5, 35], taxPct: 7.5, dutyDeMinUsd: 300, taxDeMinUsd: 300, notes: ["Exemption limited to 4 imports per person per year."], other: (cif, dl, dh) => [dl * 0.07 + cif * 0.015, dh * 0.07 + cif * 0.015, "Includes 7% surcharge on duty, 0.5% ETLS and ~1% CISS levies."] }),
  },
  {
    code: "PK", country: "Pakistan", taxName: "Sales tax", taxRatePct: [18, 25],
    deMinimis: "Post/courier imports ≤ PKR 1,000 (~$3.60) are exempt (Customs Act s.19C); above that the whole value is taxed.",
    typicalDutyPct: [0, 30],
    sources: ["https://download1.fbr.gov.pk/Docs/20268241784853463Customs-Act-1969.pdf", "https://www.dhl.com/discover/en-pk/logistics-advice/import-export-advice/importing-a-parcel-in-pakistan-"],
    estimate: generic({ dutyPct: [0, 30], taxPct: [18, 25], dutyDeMinUsd: 3.6, taxDeMinUsd: 3.6, notes: ["Additional customs duty / regulatory duty may apply by product; phones need PTA registration."], other: (cif) => [cif * 0.01, cif * 0.12, "Includes advance income tax (~1–12%; higher for non-filers)."] }),
  },
  {
    code: "IN", country: "India", taxName: "IGST", taxRatePct: [5, 40],
    deMinimis: "No general low-value exemption; courier consignments are dutiable. Gifts bought online are prohibited unless full duty is paid.",
    typicalDutyPct: [11, 44],
    sources: ["https://traddal.com/resources/calculate-duties-taxes-imports-india"],
    estimate: generic({ dutyPct: [11, 44], taxPct: [5, 40], notes: ["Duty = basic customs duty (often 10–40%) + 10% social welfare surcharge; IGST usually 18% (5%/40% for some goods)."] }),
  },
  {
    code: "BR", country: "Brazil", taxName: "ICMS", taxRatePct: [17, 20],
    deMinimis: "No threshold for forwarder/non-certified sellers: 60% import duty from the first dollar, plus state ICMS 17–20% (by inclusion). The 0% ≤ $50 rule applies only to Remessa Conforme-certified sites.",
    typicalDutyPct: [60, 60],
    sources: ["https://traddal.com/resources/calculate-duties-taxes-imports-brazil"],
    estimate(i) {
      const cif = i.goodsUsd + i.shippingUsd;
      const duty = cif * 0.6;
      const icms = (rate: number) => ((cif + duty) / (1 - rate)) * rate;
      return { dutyLow: r2(duty), dutyHigh: r2(duty), taxLow: r2(icms(0.17)), taxHigh: r2(icms(0.2)), otherLow: 0, otherHigh: 0, notes: ["60% import duty on CIF; ICMS charged by inclusion. Correios/carrier fees not included."] };
    },
  },
  eu("DE", "Germany", 19, "https://traddal.com/resources/calculate-duties-taxes-imports-germany"),
  eu("FR", "France", 20, "https://traddal.com/resources/calculate-duties-taxes-imports-france"),
  eu("NL", "Netherlands", 21, "https://traddal.com/resources/calculate-duties-taxes-imports-netherlands"),
];

export function findDutyRule(code: string): DutyRule | undefined {
  return DUTY_RULES.find((r) => r.code === code.toUpperCase());
}
