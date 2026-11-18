/**
 * Standard VAT/GST/sales-tax rates for destinations WITHOUT a full profile (used only by the
 * fallback path together with WITS or Easyship duty rates). LOW CONFIDENCE: standard rates as
 * generally published (e.g. PwC Worldwide Tax Summaries), not verified per country. Checked 2026-11-18.
 * Source: https://taxsummaries.pwc.com/quick-charts/value-added-tax-vat-rates
 */
export const FALLBACK_VAT_SOURCE = "https://taxsummaries.pwc.com/quick-charts/value-added-tax-vat-rates";
export const FALLBACK_VAT_CHECKED = "2026-11-18";
export const FALLBACK_VAT: Record<string, number> = {
  AL: 20, AD: 4.5, AG: 17, AZ: 18, BS: 10, BB: 17.5, BY: 20, BZ: 12.5, BJ: 18, BO: 13, BA: 17, BW: 14, BN: 0, BF: 18,
  BI: 18, CF: 19, TD: 18, KM: 10, CG: 18.9, CR: 13, DJ: 10, DM: 15, EC: 15, SV: 13, GQ: 15, FJ: 15, GA: 18, GM: 15,
  GE: 18, GD: 15, GT: 12, GN: 18, GW: 17, GY: 14, HT: 10, HN: 15, IS: 24, IR: 10, KZ: 16, KG: 12, LA: 10, LB: 11,
  LS: 15, LR: 10, LY: 0, LI: 8.1, MO: 0, MK: 18, MG: 20, MW: 16.5, ML: 18, MR: 16, MU: 15, MD: 20, MC: 20, MN: 10,
  MA: 20, NA: 15, NI: 15, NE: 19, PA: 7, PG: 10, PY: 10, PR: 11.5, RU: 22, RW: 18, KN: 17, LC: 12.5, WS: 15, CS: 20,
  SL: 15, SD: 17, SR: 10, TZ: 18, TG: 18, TO: 15, TN: 19, UG: 18, UA: 20, UY: 22, UZ: 12, VU: 15, VE: 16, ZW: 15.5,
  MQ: 8.5, GP: 8.5, PF: 16,
};

/** ISO alpha-2 → WITS reporter (ISO numeric) for destinations without a full profile. */
export const FALLBACK_WITS_REPORTER: Record<string, string> = {
  AF: "004", AL: "008", AD: "020", AG: "028", AZ: "031", BS: "044", BB: "052", BY: "112", BZ: "084", BJ: "204", BT: "064",
  BO: "068", BA: "070", BW: "072", BN: "096", BF: "854", BI: "108", CF: "140", TD: "148", KM: "174", CG: "178", CR: "188",
  CU: "192", DJ: "262", DM: "212", EC: "218", SV: "222", GQ: "226", ER: "232", FJ: "242", GA: "266", GM: "270", GE: "268",
  GD: "308", GT: "320", GN: "324", GW: "624", GY: "328", HT: "332", HN: "340", IS: "352", IR: "364", KZ: "398", KI: "296",
  KG: "417", LA: "418", LB: "422", LS: "426", LR: "430", LY: "434", LI: "438", MO: "446", MK: "807", MG: "450", MW: "454",
  ML: "466", MH: "584", MR: "478", MU: "480", FM: "583", MD: "498", MC: "492", MN: "496", MA: "504", MM: "104", NA: "516",
  NR: "520", NI: "558", NE: "562", NU: "570", PW: "585", PS: "275", PA: "591", PG: "598", PY: "600", RU: "643", RW: "646",
  KN: "659", LC: "662", WS: "882", SM: "674", ST: "678", CS: "688", SL: "694", SB: "090", SO: "706", SD: "729", SR: "740",
  SY: "760", TJ: "762", TZ: "834", TL: "626", TG: "768", TO: "776", TN: "788", TM: "795", TV: "798", UG: "800", UA: "804",
  UY: "858", UZ: "860", VU: "548", VE: "862", YE: "887", ZW: "716", PF: "258", CW: "531",
};
