/** Data model for per-country import duty & tax rules. Edit src/data/duty/profiles.ts to update. */

export type Confidence = "high" | "medium" | "low";
/** [low, typical, high] percentages. */
export type Pct3 = [number, number, number];

export interface Threshold {
  /** Amount in local currency (as published). */
  local: number;
  currency: string;
  /** Approximate USD equivalent (see fx note on the profile). */
  usd: number;
  /** What value is compared: goods only (intrinsic/FOB) or goods + shipping (CIF). */
  basis: "goods" | "cif";
  /**
   * firm: published, applies to normal forwarder parcels (all scenarios exempt).
   * likely: usually applies but has caps/conditions → low and typical exempt, high not.
   * uncertain: exists but may not apply (registration, conditions) → only the low end is exempt.
   */
  certainty: "firm" | "likely" | "uncertain";
  note?: string;
}

export interface Fee {
  name: string;
  /** pct_cif: % of dutiable base; pct_duty: % of duty; fixed_usd: flat amount per consignment. */
  kind: "pct_cif" | "pct_duty" | "fixed_usd";
  value: Pct3;
  /** Only charged when the consignment is not under the duty de minimis (default true). */
  onlyWhenDutiable?: boolean;
  /** Included in the VAT/GST base (default true for pct fees, false for fixed carrier fees). */
  inTaxBase?: boolean;
  /** Restrict to these categories. */
  categories?: string[];
}

export interface Excise {
  name: string;
  categories: string[];
  value: Pct3; // % of (base + duty)
  note?: string;
}

export interface CountryDutyProfile {
  code: string; // ISO alpha-2
  name: string;
  confidence: Confidence;
  /** Local currency code and approximate units per USD (Nov 2026). */
  currency: string;
  fx_per_usd: number;
  tax: {
    name: string;
    /** [low, typical, high] e.g. Canada GST 5 / ON HST 13 / 15. Use [r, r, r] for a single rate. */
    rate: Pct3;
    /** Category-specific rates (reduced or higher). */
    byCategory?: Record<string, Pct3>;
    /** Base for import VAT: same as duty basis (default), always CIF, or CIF + uplift (e.g. ZA 10%). */
    base?: "duty_base" | "cif";
    upliftPct?: number;
  };
  /** Customs valuation: CIF (shipping + insurance count) or FOB (goods only). */
  valuation: "CIF" | "FOB";
  duty_de_minimis: Threshold | null;
  tax_de_minimis: Threshold | null;
  /** Duty by category. Missing categories use WITS MFN data, then `defaultDuty`. */
  duty?: Record<string, Pct3>;
  /** Fallback duty range when neither override nor WITS data exist. */
  defaultDuty: Pct3;
  /** WITS reporter key when it differs from `code` (EU members use "EU"). */
  witsKey?: string;
  /**
   * US free-trade partner: US-made goods can enter at 0% duty, so the LOW estimate uses 0% duty
   * (typical/high still use MFN because most retail goods are made elsewhere).
   */
  usFta?: string;
  /** If true, ignore WITS and use only `duty` + `defaultDuty` (flat national rates). */
  ignoreWits?: boolean;
  fees?: Fee[];
  excise?: Excise[];
  /** Special regime id handled in src/lib/duty-engine.ts (flat courier rates etc.). */
  regime?: "AO_courier" | "IN_personal" | "BR_import_tax" | "DZ_parcels" | "EU_lowvalue" | "ID_consignment" | "AU_lvg" | "MY_lvg";
  /** Who collects and when. */
  collection: string;
  notes?: string[];
  sources: string[];
  /** ISO date the rules were last checked against the sources. */
  last_checked: string;
}
