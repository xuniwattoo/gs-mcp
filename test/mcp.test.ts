import { beforeEach, describe, expect, it } from "vitest";
import { handleRequest } from "../src/http.js";
import { MemoryLimiter, defaultLimiterConfig } from "../src/lib/ratelimit.js";
import { clearRatesCache } from "../src/lib/rates.js";
import { mockFetch } from "./helpers.js";

const H = { "content-type": "application/json", accept: "application/json, text/event-stream" };
async function rpc(body: unknown, deps: any = {}, env: any = {}) {
  const res = await handleRequest(new Request("http://x/mcp", { method: "POST", headers: H, body: JSON.stringify(body) }), env, deps);
  return { status: res.status, json: (await res.json()) as any };
}

describe("MCP over web-standard Streamable HTTP", () => {
  beforeEach(() => clearRatesCache());
  it("initializes and lists tools/resources/prompts", async () => {
    const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
    expect(init.json.result.serverInfo.name).toBe("global-shopaholics");
    const tools = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(tools.json.result.tools.map((t: any) => t.name).sort()).toEqual(["estimate_landed_cost", "get_services_and_fees", "get_shipping_rates", "get_started", "request_assisted_purchase", "request_shipment_quote", "track_shipment"]);
    const res = await rpc({ jsonrpc: "2.0", id: 3, method: "resources/list" });
    expect(res.json.result.resources[0].uri).toBe("gs://about");
    const pr = await rpc({ jsonrpc: "2.0", id: 4, method: "prompts/list" });
    expect(pr.json.result.prompts[0].name).toBe("buy-and-ship");
  });
  it("calls get_shipping_rates with mocked upstream", async () => {
    const { f } = mockFetch();
    const r = await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_shipping_rates", arguments: { country: "AO", weight: 5, unit: "kg" } } }, { fetch: f });
    const data = JSON.parse(r.json.result.content[0].text);
    expect(data.cheapest.price_usd).toBe(165.13);
  });
  it("rate-limits lead tools per IP and points at email / the Assisted Purchase page", async () => {
    const { f, calls } = mockFetch();
    const limiter = new MemoryLimiter(defaultLimiterConfig({ leadPerIpPerHour: 1, leadPerEmailPerDay: 5, leadDailyCap: 10, ratePerIpPerHour: 30 }));
    const args = { product_urls: ["https://www.amazon.com/dp/B000TEST"], destination_country: "AO", name: "Test Person", email: "t@example.com" };
    const call = () => rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "request_assisted_purchase", arguments: args } }, { fetch: f, limiter, clientKey: "ip1" });
    const a = await call();
    expect(JSON.parse(a.json.result.content[0].text).reference_id).toMatch(/^GSMCP-AP-/);
    const b = await call();
    expect(b.json.result.isError).toBe(true);
    const err = JSON.parse(b.json.result.content[0].text);
    expect(err.error).toMatch(/help@globalshopaholics.com/);
    expect(err.error).toMatch(/assisted-purchase/);
    expect(calls.filter((c) => c.url.includes("ghl") || c.url.includes("leadconnector")).length).toBe(0);
  });
  it("rejects invalid lead input before calling sinks or consuming a slot", async () => {
    const { f, calls } = mockFetch();
    const limiter = new MemoryLimiter(defaultLimiterConfig({ leadPerIpPerHour: 1, leadPerEmailPerDay: 1, leadDailyCap: 1, ratePerIpPerHour: 30 }));
    const base = { destination_country: "AO", name: "Test Person", email: "t@example.com" };
    const badUrl = await rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "request_assisted_purchase", arguments: { ...base, product_urls: ["javascript:alert(1)"] } } }, { fetch: f, limiter, clientKey: "ip-val" });
    expect(badUrl.json.result.isError).toBe(true);
    expect(JSON.parse(badUrl.json.result.content[0].text).error).toMatch(/http or https/i);
    const badCountry = await rpc({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "request_assisted_purchase", arguments: { ...base, product_urls: ["https://www.amazon.com/dp/B000TEST"], destination_country: "Narnia" } } }, { fetch: f, limiter, clientKey: "ip-val" });
    expect(badCountry.json.result.isError).toBe(true);
    expect(JSON.parse(badCountry.json.result.content[0].text).error).toMatch(/Unknown or unsupported/i);
    const badEmail = await rpc({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "request_assisted_purchase", arguments: { ...base, email: "not-an-email", product_urls: ["https://www.amazon.com/dp/B000TEST"] } } }, { fetch: f, limiter, clientKey: "ip-val" });
    expect(badEmail.json.result.isError).toBe(true);
    // The one valid slot is still available after the rejected attempts.
    const ok = await rpc({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "request_assisted_purchase", arguments: { ...base, product_urls: ["https://www.amazon.com/dp/B000TEST"] } } }, { fetch: f, limiter, clientKey: "ip-val" });
    expect(JSON.parse(ok.json.result.content[0].text).reference_id).toMatch(/^GSMCP-AP-/);
    expect(calls.length).toBe(0);
  });
  it("rate-limits get_shipping_rates per IP", async () => {
    const { f, calls } = mockFetch();
    const limiter = new MemoryLimiter(defaultLimiterConfig({ ratePerIpPerHour: 2, leadPerIpPerHour: 5, leadPerEmailPerDay: 3, leadDailyCap: 200 }));
    const call = (id: number) => rpc({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "get_shipping_rates", arguments: { country: "AO", weight: 5, unit: "kg" } } }, { fetch: f, limiter, clientKey: "ip-rates" });
    expect(JSON.parse((await call(11)).json.result.content[0].text).cheapest.price_usd).toBe(165.13);
    expect(JSON.parse((await call(12)).json.result.content[0].text).cheapest.price_usd).toBe(165.13);
    const third = await call(13);
    expect(third.json.result.isError).toBe(true);
    expect(JSON.parse(third.json.result.content[0].text).error).toMatch(/Rate lookup limit/i);
    expect(calls.filter((c) => c.url.includes("rate-calculator")).length).toBe(1);
  });
  it("serves health and CORS preflight, rejects GET /mcp", async () => {
    expect((await handleRequest(new Request("http://x/health"))).status).toBe(200);
    expect((await handleRequest(new Request("http://x/mcp", { method: "OPTIONS", headers: { origin: "https://claude.ai" } }))).headers.get("access-control-allow-origin")).toBe("*");
    expect((await handleRequest(new Request("http://x/mcp"))).status).toBe(405);
  });
});
