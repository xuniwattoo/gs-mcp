import { beforeEach, describe, expect, it } from "vitest";
import { handleRequest } from "../src/http.js";
import { MemoryLimiter, defaultLimiterConfig } from "../src/lib/ratelimit.js";
import { clearPriceCache, normalizeQuery, shapeOffers } from "../src/lib/price-search.js";

const H = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const call = async (args: any, deps: any, env: any = { SERPER_API_KEY: "serperSECRET" }) => {
  const res = await handleRequest(new Request("http://x/mcp", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "find_lower_price", arguments: args } }) }), env, deps);
  return (await res.json()) as any;
};
const serper = { shopping: [
  { title: "AirPods Pro 2", source: "Amazon.com", price: "$189.00", link: "https://www.amazon.com/x", rating: 4.7, ratingCount: 1000 },
  { title: "AirPods Pro 2", source: "Best Buy", price: "$179.99", link: "https://www.bestbuy.com/x" },
  { title: "AirPods Pro 2", source: "Walmart", price: "$199.00", link: "https://www.walmart.com/x" },
  { title: "AirPods Pro 2", source: "eBay", price: "$120.00", link: "https://www.ebay.com/x" },
  { title: "AirPods Pro 2 refurbished", source: "Gizmo", price: "$140.00", link: "https://gizmo.example/x" },
  { title: "AirPods Pro 2", source: "Temu", price: "$29.00", link: "https://www.temu.com/x" },
  { title: "AirPods Pro 2 ear tips", source: "Shady Shop", price: "$9.00", link: "https://shady.example/x" },
  { title: "AirPods Pro 2", source: "Target", price: "EUR 150", link: "https://www.target.com/x" },
] };
function mk(status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (u: any, init?: RequestInit) => { calls.push({ url: String(u), init }); return status === 200 ? Response.json(serper) : new Response("x", { status }); }) as typeof fetch;
  return { f, calls };
}
beforeEach(() => clearPriceCache());

describe("find_lower_price", () => {
  it("sorts by price, computes savings, drops sketchy/outlier/non-USD offers, hides key", async () => {
    const { f, calls } = mk();
    const r = await call({ product: "AirPods Pro 2", current_price_usd: 249 }, { fetch: f, limiter: new MemoryLimiter(defaultLimiterConfig()), clientKey: "p1" });
    const out = JSON.parse(r.result.content[0].text);
    expect(out.offers.map((o: any) => o.store)).toEqual(["Best Buy", "Amazon.com", "Walmart"]);
    expect(out.resale_or_used_offers.map((o: any) => o.store)).toEqual(["eBay", "Gizmo"]);
    expect(out.offers[0].savings_usd).toBeCloseTo(69.01);
    expect(JSON.stringify(r)).not.toContain("serperSECRET");
    expect(calls[0].url).toBe("https://google.serper.dev/shopping");
    expect((calls[0].init!.headers as any)["X-API-KEY"]).toBe("serperSECRET");
    expect(JSON.stringify(out)).not.toMatch(/tag=|affiliate_id/);
  });
  it("caches by normalized query", async () => {
    const { f, calls } = mk();
    const d = { fetch: f, limiter: new MemoryLimiter(defaultLimiterConfig()), clientKey: "p2" };
    await call({ product: "AirPods  Pro 2" }, d);
    await call({ product: "airpods pro 2" }, d);
    expect(calls.length).toBe(1);
  });
  it("rate limits at 10/hour by default and handles missing key and upstream errors", async () => {
    const { f } = mk();
    const d = { fetch: f, limiter: new MemoryLimiter(defaultLimiterConfig({ pricePerIpPerHour: 2 })), clientKey: "p3" };
    expect((await call({ product: "AirPods Pro 2" }, d)).result.isError).toBeUndefined();
    expect((await call({ product: "AirPods Pro 3" }, d)).result.isError).toBeUndefined();
    expect((await call({ product: "AirPods Pro 4" }, d)).result.isError).toBe(true);
    expect((await call({ product: "AirPods Pro 2" }, { ...d, limiter: new MemoryLimiter(defaultLimiterConfig()) }, {})).result.isError).toBe(true);
    clearPriceCache();
    const bad = mk(500);
    const r = await call({ product: "something new here" }, { fetch: bad.f, limiter: new MemoryLimiter(defaultLimiterConfig()), clientKey: "p4" });
    expect(r.result.isError).toBe(true);
    expect(JSON.stringify(r)).not.toContain("serperSECRET");
  });
  it("normalizes URLs and shapes offers", () => {
    expect(normalizeQuery("https://www.bestbuy.com/site/apple-airpods-pro-2nd-generation/6447382.p")).toContain("apple airpods pro");
    expect(() => normalizeQuery("https://www.amazon.com/dp/B0BDHWDR12")).toThrow();
    expect(shapeOffers([{ source: "A", price: "$10", link: "http://insecure" }])).toEqual([]);
  });
});
