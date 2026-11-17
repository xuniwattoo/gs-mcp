import { describe, expect, it, beforeEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildRatesForm, clearRatesCache, getShippingRates, normalizeRates, RatesError } from "../src/lib/rates.js";
import { assistedFee, estimateLandedCost } from "../src/lib/landed.js";
import { findDutyRule, DUTY_RULES } from "../src/data/duties.js";
import { guessCarrier, trackingLinks } from "../src/lib/tracking.js";
import { submitLead } from "../src/lib/leads.js";
import { RateLimiter } from "../src/lib/ratelimit.js";
import { resolveCountry } from "../src/lib/countries.js";
import { AO_FIXTURE, mockFetch } from "./helpers.js";

const cfg = loadConfig({});
beforeEach(() => clearRatesCache());

describe("countries", () => {
  it("resolves codes, names and aliases", () => {
    expect(resolveCountry("ao")?.city).toBe("Luanda");
    expect(resolveCountry("Saudi Arabia")?.code).toBe("SA");
    expect(resolveCountry("UK")?.code).toBe("GB");
    expect(resolveCountry("UAE")?.code).toBe("AE");
    expect(resolveCountry("Atlantis")).toBeUndefined();
  });
});

describe("rates", () => {
  it("builds the same form GS's calculator sends", () => {
    const { form } = buildRatesForm({ country: "Angola", weight: 5, unit: "kg" });
    expect(Object.fromEntries(form)).toEqual({ country: "AO", measurement_unit: "2", weight: "5", city: "Luanda", zip_code: "00000", length: "1", width: "1", height: "1" });
    expect(buildRatesForm({ country: "SA", weight: 3, unit: "lb", city: "Jeddah", zip: "21442" }).form.get("measurement_unit")).toBe("1");
  });
  it("normalizes and sorts services", () => {
    const n = normalizeRates(AO_FIXTURE, { country: "AO", weight: 5, unit: "kg" }, { code: "AO", name: "Angola" }, "Luanda", "00000");
    expect(n.services.length).toBe(6);
    expect(n.cheapest?.carrier).toBe("DHL");
    expect(n.services.map((s) => s.price_usd)).toEqual([...n.services.map((s) => s.price_usd)].sort((a, b) => a - b));
    expect(n.services[1].service).toBe("FedEx Economy");
    expect(n.services[0].dimensional_weight_applies).toBe(true);
  });
  it("sends honest headers and optional allowlist header", async () => {
    const { f, calls } = mockFetch();
    await getShippingRates({ country: "AO", weight: 5, unit: "kg" }, loadConfig({ GS_RATES_HEADER_NAME: "X-GS-MCP-Key", GS_RATES_HEADER_VALUE: "s3cret" }), f);
    const h = calls[0].init!.headers as Record<string, string>;
    expect(h["X-GS-MCP-Key"]).toBe("s3cret");
    expect(h["user-agent"]).toMatch(/GlobalShopaholics-MCP/);
    expect(h.referer).toMatch(/international-shipping-calculator/);
  });
  it("detects bot-protection challenge", async () => {
    const { f } = mockFetch({ rates: "blocked" });
    await expect(getShippingRates({ country: "AO", weight: 5, unit: "kg" }, cfg, f)).rejects.toMatchObject({ kind: "blocked" });
  });
  it("rejects unknown countries", () => {
    expect(() => buildRatesForm({ country: "Narnia", weight: 1, unit: "kg" })).toThrow(RatesError);
  });
});

describe("assisted purchase fee", () => {
  it("0% for bank transfer/crypto, else 5% with $5 min", () => {
    expect(assistedFee(200, "standard", "bank_transfer", cfg).fee).toBe(0);
    expect(assistedFee(200, "standard", "crypto", cfg).fee).toBe(0);
    expect(assistedFee(200, "standard", "card", cfg).fee).toBe(10);
    expect(assistedFee(40, "standard", "paypal", cfg).fee).toBe(5);
    expect(assistedFee(50, "expedited", "card", cfg).fee).toBe(10);
    expect(assistedFee(200, "executive", "card", cfg).fee).toBe(30);
    expect(assistedFee(200, "none", "card", cfg).fee).toBe(0);
  });
});

describe("duty rules", () => {
  it("covers required destinations with sources", () => {
    for (const c of ["AO", "SA", "AE", "GB", "CA", "AU", "NG", "PK", "IN", "BR", "DE", "FR", "NL"]) {
      const r = findDutyRule(c);
      expect(r, c).toBeDefined();
      expect(r!.sources.length).toBeGreaterThan(0);
      r!.sources.forEach((s) => expect(s).toMatch(/^https:\/\//));
    }
    expect(DUTY_RULES.length).toBeGreaterThanOrEqual(13);
  });
  it("Angola courier flat 16%", () => {
    const e = findDutyRule("AO")!.estimate({ goodsUsd: 100, shippingUsd: 50, itemCategories: 1 });
    expect(e.dutyLow).toBe(16);
  });
  it("Saudi under SAR 1000 is duty-free but VAT applies", () => {
    const e = findDutyRule("SA")!.estimate({ goodsUsd: 100, shippingUsd: 50, itemCategories: 1 });
    expect(e.dutyHigh).toBe(0);
    expect(e.taxLow).toBeCloseTo(22.5);
  });
  it("Nigeria under $300 exempt", () => {
    const e = findDutyRule("NG")!.estimate({ goodsUsd: 150, shippingUsd: 100, itemCategories: 1 });
    expect(e.dutyHigh + e.taxHigh + e.otherHigh).toBe(0);
  });
  it("EU flat €3 per category under €150", () => {
    const e = findDutyRule("DE")!.estimate({ goodsUsd: 60, shippingUsd: 40, itemCategories: 2 });
    expect(e.dutyLow).toBeCloseTo(6.9);
  });
});

describe("landed cost", () => {
  it("combines fee, live shipping and duty and is labelled an estimate", async () => {
    const { f } = mockFetch();
    const r: any = await estimateLandedCost({ destination_country: "Angola", items_total_usd: 200, assisted_purchase: "standard", payment_method: "card", package: { weight: 5, unit: "kg" } }, cfg, f);
    expect(r.estimate).toBe(true);
    expect(r.breakdown_usd.gs_assisted_purchase_fee).toBe(10);
    expect(r.breakdown_usd.international_shipping).toBe(165.13);
    expect(r.duty.duty_usd.low).toBeCloseTo(33.6);
    expect(r.total_landed_usd.low).toBeCloseTo(200 + 10 + 165.13 + 33.6, 1);
  });
  it("still answers when rates are blocked", async () => {
    const { f } = mockFetch({ rates: "blocked" });
    const r: any = await estimateLandedCost({ destination_country: "SA", items_total_usd: 100, assisted_purchase: "none", payment_method: "card", package: { weight: 1, unit: "kg" } }, cfg, f);
    expect(r.breakdown_usd.international_shipping).toBeNull();
    expect(r.notes.join(" ")).toMatch(/bot protection/);
  });
});

describe("tracking", () => {
  it("guesses carriers", () => {
    expect(guessCarrier("1Z999AA10123456784")).toBe("ups");
    expect(guessCarrier("9400111899223856923456")).toBe("usps");
    expect(guessCarrier("1234567890")).toBe("dhl");
    expect(guessCarrier("123456789012")).toBe("fedex");
    expect(trackingLinks("1Z999AA10123456784").tracking_url).toMatch(/ups\.com/);
  });
});

describe("leads (mocked, never real GHL)", () => {
  const lead = { kind: "assisted_purchase" as const, name: "Test Person", email: "test@example.com", destination_country: "AO", details: {}, summary: "test" };
  it("falls back to GS page when no sink configured", async () => {
    const { f, calls } = mockFetch();
    const r = await submitLead(lead, cfg, f);
    expect(calls.length).toBe(0);
    expect(r.status).toBe("not_submitted");
    expect(r.fallback?.request_page).toBe("https://globalshopaholics.com/assisted-purchase/");
    expect(r.reference_id).toMatch(/^GSMCP-AP-/);
  });
  it("upserts GHL contact, tags and notes", async () => {
    const { f, calls } = mockFetch();
    const r = await submitLead(lead, loadConfig({ GHL_API_TOKEN: "t", GHL_LOCATION_ID: "loc", GHL_API_BASE: "https://ghl.test" }), f);
    expect(r.status).toBe("submitted");
    expect(calls.map((c) => c.url)).toEqual(["https://ghl.test/contacts/upsert", "https://ghl.test/contacts/c_test_123/tags", "https://ghl.test/contacts/c_test_123/notes"]);
    expect(JSON.parse(calls[1].init!.body as string).tags).toEqual(["mcp-assisted-purchase"]);
    expect((calls[0].init!.headers as any).version).toBe("2021-07-28");
  });
  it("posts signed webhook with shipping tag", async () => {
    const { f, calls } = mockFetch();
    const r = await submitLead({ ...lead, kind: "shipment_quote" }, loadConfig({ LEAD_WEBHOOK_URL: "https://webhook.test/x", LEAD_WEBHOOK_SECRET: "k" }), f);
    expect(r.delivered_to).toEqual(["webhook"]);
    expect(JSON.parse(calls[0].init!.body as string).tag).toBe("mcp-shipping-request");
    expect((calls[0].init!.headers as any)["x-gs-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
  it("reports GHL failure with fallback", async () => {
    const { f } = mockFetch({ ghlOk: false });
    const r = await submitLead(lead, loadConfig({ GHL_API_TOKEN: "t", GHL_LOCATION_ID: "loc", GHL_API_BASE: "https://ghl.test" }), f);
    expect(r.status).toBe("not_submitted");
    expect(r.fallback).toBeDefined();
  });
});

describe("rate limiter", () => {
  it("limits per key", () => {
    const l = new RateLimiter(2, 1000);
    expect(l.check("a", 0).ok).toBe(true);
    expect(l.check("a", 1).ok).toBe(true);
    expect(l.check("a", 2).ok).toBe(false);
    expect(l.check("b", 2).ok).toBe(true);
    expect(l.check("a", 1500).ok).toBe(true);
  });
});
