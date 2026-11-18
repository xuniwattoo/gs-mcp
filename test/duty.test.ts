import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { estimateLandedCost } from "../src/lib/landed.js";
import { categoryFromHs, categoryFromText, CATEGORIES } from "../src/data/duty/categories.js";
import { PROFILES, findProfile } from "../src/data/duty/profiles.js";
import { GS_SHIPMENTS_BY_COUNTRY } from "../src/data/duty/priority.js";
import { MemoryDutyCache } from "../src/lib/duty-fallback.js";
import { staleProfiles } from "../src/lib/duty-freshness.js";
import { handleRequest } from "../src/http.js";

const cfg = loadConfig({});
const noNet = (async (u: any) => { throw new Error(`unexpected fetch ${typeof u === "string" ? u : u.url}`); }) as typeof fetch;
const est = (input: any, c = cfg, f: typeof fetch = noNet, cache?: MemoryDutyCache): Promise<any> =>
  estimateLandedCost({ assisted_purchase: "none", payment_method: "card", ...input }, c, f, undefined, cache);

describe("product categories", () => {
  it("maps free text and HS codes to categories", () => {
    expect(categoryFromText("Apple iPhone 17 Pro Max 256GB")?.id).toBe("phones");
    expect(categoryFromText("Nike Air Jordan 1 Retro High sneakers")?.id).toBe("shoes");
    expect(categoryFromText("Apple Watch Series 11")?.id).toBe("wearables");
    expect(categoryFromText("Clinique moisturizer")?.id).toBe("cosmetics");
    expect(categoryFromText("Dior Sauvage eau de parfum")?.id).toBe("perfume");
    expect(categoryFromText("MagSafe phone case")?.id).toBe("electronics_accessories");
    expect(categoryFromText("xyzzy")).toBeUndefined();
    expect(categoryFromHs("8517.13.00")?.id).toBe("phones");
    expect(categoryFromHs("640411")?.id).toBe("shoes");
    expect(categoryFromHs("3304.99")?.id).toBe("cosmetics");
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(25);
  });
});

describe("country profiles", () => {
  it("cover 40+ countries incl. GS's top 15, each with https sources and a last_checked date", () => {
    expect(PROFILES.length).toBeGreaterThanOrEqual(40);
    const top15 = GS_SHIPMENTS_BY_COUNTRY.map(([c]) => c).filter((c) => c !== "US").slice(0, 15);
    for (const c of top15) expect(findProfile(c), c).toBeDefined();
    for (const p of PROFILES) {
      expect(p.sources.length, p.code).toBeGreaterThan(0);
      p.sources.forEach((s) => expect(s, p.code).toMatch(/^https?:\/\//));
      expect(p.last_checked, p.code).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.tax.rate[0] <= p.tax.rate[1] && p.tax.rate[1] <= p.tax.rate[2], p.code).toBe(true);
    }
    expect(new Set(PROFILES.map((p) => p.code)).size).toBe(PROFILES.length);
  });
  it("freshness check lists profiles older than 180 days", () => {
    expect(staleProfiles(180, new Date("2026-11-18"))).toEqual([]);
    const stale = staleProfiles(180, new Date("2027-07-01"));
    expect(stale.length).toBe(PROFILES.length);
    expect(stale[0].code).toBe("AO"); // highest GS volume first
  });
});

describe("per-item landed cost", () => {
  it("phone to Angola: 16% courier flat rate under AOA 1.5M", async () => {
    const r = await est({ destination_country: "Angola", items: [{ description: "iPhone 17 Pro 256GB", unit_price_usd: 1100 }], shipping_usd: 60 });
    expect(r.duty.items[0].category).toBe("phones");
    expect(r.duty.regime_applied).toMatch(/16%/);
    expect(r.duty.duty_usd.typical).toBeCloseTo(176, 2);
    expect(r.duty.tax_usd.typical).toBe(0);
    expect(r.duty.total_usd.low).toBeLessThanOrEqual(r.duty.total_usd.typical);
    expect(r.duty.total_usd.typical).toBeLessThanOrEqual(r.duty.total_usd.high);
    expect(r.total_landed_usd.typical).toBeCloseTo(1100 + 60 + r.duty.total_usd.typical, 2);
    expect(r.duty.last_checked).toMatch(/^2026-/);
    expect(r.duty.sources.length).toBeGreaterThan(0);
  });
  it("Angola above AOA 1.5M switches to the general regime", async () => {
    const r = await est({ destination_country: "AO", items: [{ description: "iPhone", unit_price_usd: 1100, quantity: 2 }], shipping_usd: 60 });
    expect(r.duty.regime_applied).toMatch(/general/);
    expect(r.duty.tax_usd.typical).toBeGreaterThan(0);
  });
  it("sneakers to Nigeria: under US$300 usually exempt, over it dutiable at the shoe rate", async () => {
    const under = await est({ destination_country: "NG", items: [{ description: "Nike Air Jordan 1 sneakers", unit_price_usd: 180 }], shipping_usd: 70 });
    expect(under.duty.items[0].category).toBe("shoes");
    expect(under.duty.total_usd.typical).toBe(0);
    expect(under.duty.total_usd.high).toBeGreaterThan(0); // exemption capped at 4 imports a year
    const over = await est({ destination_country: "NG", items: [{ description: "Nike Air Jordan 1 sneakers", unit_price_usd: 180, quantity: 2 }], shipping_usd: 70 });
    expect(over.duty.items[0].duty_rate_pct.typical).toBeGreaterThanOrEqual(15);
    expect(over.duty.duty_usd.typical).toBeGreaterThan(0);
    expect(over.duty.tax_usd.typical).toBeGreaterThan(0);
    expect(over.duty.de_minimis.duty.applied).toBe("no");
  });
  it("cosmetics to UAE under and over AED 1,000", async () => {
    const under = await est({ destination_country: "AE", items: [{ description: "skincare moisturizer", unit_price_usd: 150 }], shipping_usd: 40 });
    expect(under.duty.items[0].category).toBe("cosmetics");
    expect(under.duty.duty_usd.low).toBe(0);
    expect(under.duty.tax_usd.low).toBeCloseTo(190 * 0.05, 2); // VAT still due
    expect(under.duty.de_minimis.duty.applied).toMatch(/maybe/);
    const over = await est({ destination_country: "AE", items: [{ category: "cosmetics", unit_price_usd: 400 }], shipping_usd: 40 });
    expect(over.duty.duty_usd.low).toBeCloseTo(440 * 0.05, 2);
    expect(over.duty.tax_usd.typical).toBeCloseTo((440 + 22) * 0.05, 2);
    expect(over.duty.de_minimis.duty.applied).toBe("no");
  });
  it("laptop to Germany: 0% duty, 19% VAT on CIF", async () => {
    const r = await est({ destination_country: "DE", items: [{ description: "MacBook Air 13 laptop", unit_price_usd: 1200 }], shipping_usd: 80 });
    expect(r.duty.items[0].category).toBe("laptops");
    expect(r.duty.duty_usd.typical).toBe(0);
    expect(r.duty.tax_usd.typical).toBeCloseTo(1280 * 0.19, 2);
    expect(r.duty.valuation_basis).toMatch(/CIF/);
  });
  it("EU consignment ≤ €150 pays €3 per tariff category", async () => {
    const r = await est({ destination_country: "FR", items: [{ description: "t-shirt", unit_price_usd: 25, quantity: 2 }, { description: "sunglasses", unit_price_usd: 60 }], shipping_usd: 30 });
    expect(r.duty.regime_applied).toMatch(/€3/);
    expect(r.duty.duty_usd.typical).toBeCloseTo((3 / 0.87) * 2, 2);
  });
  it("keeps the legacy single-total input working", async () => {
    const r = await est({ destination_country: "SA", items_total_usd: 100, shipping_usd: 50 });
    expect(r.duty.duty_usd.high).toBe(0);
    expect(r.duty.tax_usd.low).toBeCloseTo(22.5);
    expect(r.duty.items[0].category).toBe("general");
  });
  it("Canada low end assumes CUSMA-origin goods at 0% duty", async () => {
    const r = await est({ destination_country: "CA", items: [{ description: "winter jacket", unit_price_usd: 250 }], shipping_usd: 50 });
    expect(r.duty.duty_usd.low).toBe(0);
    expect(r.duty.duty_usd.typical).toBeGreaterThan(0);
  });
});

describe("fallback for countries without a profile", () => {
  const witsXml = `<message:DataSet><generic:Series><generic:SeriesKey><generic:Value id="PRODUCTCODE" value="640411" /></generic:SeriesKey><generic:Obs><generic:ObsDimension id="TIME_PERIOD" value="2022" /><generic:ObsValue value="20" /><generic:Attributes><generic:Value id="MIN_RATE" value="20" /><generic:Value id="MAX_RATE" value="25" /></generic:Attributes></generic:Obs><generic:Obs><generic:ObsDimension id="TIME_PERIOD" value="2023" /><generic:ObsValue value="25" /><generic:Attributes><generic:Value id="MIN_RATE" value="25" /><generic:Value id="MAX_RATE" value="25" /></generic:Attributes></generic:Obs></generic:Series></message:DataSet>`;
  it("uses WITS by HS6, adds the standard VAT and caches permanently", async () => {
    expect(findProfile("UG")).toBeUndefined();
    const calls: string[] = [];
    const f = (async (u: any) => { const url = typeof u === "string" ? u : u.url; calls.push(url); if (url.includes("wits.worldbank.org")) return new Response(witsXml); throw new Error(url); }) as typeof fetch;
    const cache = new MemoryDutyCache();
    const r = await est({ destination_country: "Uganda", items: [{ description: "running sneakers", unit_price_usd: 100 }], shipping_usd: 50 }, cfg, f, cache);
    expect(r.duty.method).toBe("fallback_api");
    expect(r.duty.items[0].provider).toBe("wits");
    expect(r.duty.items[0].duty_rate_pct.typical).toBe(25);
    expect(r.duty.duty_usd.typical).toBeCloseTo(150 * 0.25, 2);
    expect(r.duty.tax_usd.typical).toBeCloseTo((150 + 37.5) * 0.18, 2);
    expect(calls.filter((c) => c.includes("A.800.000.640411"))).toHaveLength(1);
    expect(cache.map.has("duty:UG:640411")).toBe(true);
    const again = await est({ destination_country: "UG", items: [{ category: "shoes", unit_price_usd: 100 }], shipping_usd: 50 }, cfg, f, cache);
    expect(again.duty.items[0].cached).toBe(true);
    expect(calls).toHaveLength(1);
  });
  it("prefers Easyship when EASYSHIP_API_KEY is set", async () => {
    const c = loadConfig({ EASYSHIP_API_KEY: "test-key" });
    const seen: any[] = [];
    const f = (async (u: any, init?: RequestInit) => {
      const url = typeof u === "string" ? u : u.url;
      seen.push({ url, init });
      if (url.includes("easyship")) return Response.json({ tax_and_duty: { currency: "USD", duty: 100, tax: 198, import_duty_details: [{ duty_calculation_method: "CIF" }] } });
      throw new Error(url);
    }) as typeof fetch;
    const cache = new MemoryDutyCache();
    const r = await est({ destination_country: "KZ", items: [{ hs_code: "851713", unit_price_usd: 500 }], shipping_usd: 0 }, c, f, cache);
    expect(r.duty.items[0].provider).toBe("easyship");
    expect(r.duty.duty_usd.typical).toBeCloseTo(50, 2);
    expect(r.duty.tax_usd.typical).toBeCloseTo(99, 2);
    expect(JSON.parse(String(seen[0].init.body)).destination_country_alpha2).toBe("KZ");
    expect(cache.map.get("duty:KZ:851713")?.provider).toBe("easyship");
  });
  it("says duty is not included when nothing is available", async () => {
    const f = (async () => new Response("Not Found - NoRecordsFound", { status: 404 })) as unknown as typeof fetch;
    const r = await est({ destination_country: "KP", items_total_usd: 100, shipping_usd: 10 }, cfg, f, new MemoryDutyCache());
    expect(r.duty).toBeNull();
    expect(r.notes.join(" ")).toMatch(/NOT included/);
  });
});

describe("MCP tool accepts item lines", () => {
  it("estimate_landed_cost with items over MCP", async () => {
    const res = await handleRequest(new Request("http://x/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "estimate_landed_cost", arguments: { destination_country: "GB", items: [{ description: "Coach leather handbag", unit_price_usd: 400 }], shipping_usd: 50, assisted_purchase: "none" } } }) }), {}, { fetch: noNet });
    const j: any = await res.json();
    const data = JSON.parse(j.result.content[0].text);
    expect(data.duty.items[0].category).toBe("bags");
    expect(data.duty.duty_usd.typical).toBeGreaterThan(0);
    expect(data.total_landed_usd.low).toBeLessThanOrEqual(data.total_landed_usd.high);
  });
});
