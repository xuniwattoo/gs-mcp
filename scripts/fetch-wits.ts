/**
 * Pulls MFN applied tariff rates (UNCTAD TRAINS via World Bank WITS, free, no key) for every
 * category HS-6 code and every country in the duty table, and writes src/data/duty/wits-mfn.json.
 * Run: npx tsx scripts/fetch-wits.ts   (re-run when refreshing; review the diff before committing)
 */
import { writeFileSync } from "node:fs";
import { CATEGORIES } from "../src/data/duty/categories.js";

// ISO alpha-2 -> WITS reporter code (ISO numeric; EU = 918).
export const WITS_REPORTERS: Record<string, string> = {
  AO: "024", SA: "682", AE: "784", AU: "036", GB: "826", EU: "918", CA: "124", MY: "458", ZM: "894", IN: "356",
  DZ: "012", QA: "634", BM: "060", PK: "586", NZ: "554", KH: "116", NG: "566", IL: "376", OM: "512", IQ: "368",
  CH: "756", BR: "076", MZ: "508", KR: "410", ID: "360", SC: "690", KW: "414", JO: "400", BH: "048", MX: "484",
  NO: "578", GH: "288", ZA: "710", LK: "144", AM: "051", NP: "524", MV: "462", SG: "702", TH: "764", JP: "392",
  CN: "156", HK: "344", TW: "158", VN: "704", BD: "050", PH: "608", KE: "404", TR: "792", EG: "818", CO: "170",
  CL: "152", PE: "604", DO: "214", JM: "388", TT: "780", AR: "032", CM: "120", CI: "384", SN: "686", ET: "231", CD: "180",
};

const codes = [...new Set(CATEGORIES.flatMap((c) => c.hs))];
const BASE = "https://wits.worldbank.org/API/V1/SDMX/V21/rest/data/DF_WITS_Tariff_TRAINS";

type Obs = { year: number; avg: number; min: number; max: number };
async function fetchBatch(rep: string, batch: string[]): Promise<Record<string, Obs>> {
  const url = `${BASE}/A.${rep}.000.${batch.join("+")}.reported/?startPeriod=2015`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    const text = await res.text();
    if (text.includes("NoRecordsFound")) return {};
    if (!res.ok) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    const out: Record<string, Obs> = {};
    for (const series of text.split("<generic:Series>").slice(1)) {
      const product = /id="PRODUCTCODE" value="(\d+)"/.exec(series)?.[1];
      if (!product) continue;
      for (const obs of series.split("<generic:Obs>").slice(1)) {
        const year = Number(/TIME_PERIOD" value="(\d+)"/.exec(obs)?.[1]);
        const avg = Number(/ObsValue value="([\d.]+)"/.exec(obs)?.[1]);
        const min = Number(/id="MIN_RATE" value="([\d.]+)"/.exec(obs)?.[1] ?? avg);
        const max = Number(/id="MAX_RATE" value="([\d.]+)"/.exec(obs)?.[1] ?? avg);
        if (!Number.isFinite(year) || !Number.isFinite(avg)) continue;
        if (!out[product] || out[product].year < year) out[product] = { year, avg, min, max };
      }
    }
    return out;
  }
  throw new Error(`WITS failed for ${rep}`);
}

const result: Record<string, { reporter: string; rates: Record<string, Obs> }> = {};
const entries = Object.entries(WITS_REPORTERS);
let i = 0;
async function worker() {
  while (i < entries.length) {
    const [cc, rep] = entries[i++];
    const rates: Record<string, Obs> = {};
    for (let b = 0; b < codes.length; b += 25) Object.assign(rates, await fetchBatch(rep, codes.slice(b, b + 25)));
    result[cc] = { reporter: rep, rates };
    console.log(cc, Object.keys(rates).length, "codes");
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
const sorted = Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
writeFileSync(new URL("../src/data/duty/wits-mfn.json", import.meta.url), JSON.stringify({ source: "UNCTAD TRAINS via World Bank WITS API (MFN applied, latest reported year, simple average per HS-6)", source_url: "https://wits.worldbank.org/witsapiintro.aspx", fetched: new Date().toISOString().slice(0, 10), countries: sorted }, null, 0) + "\n");
