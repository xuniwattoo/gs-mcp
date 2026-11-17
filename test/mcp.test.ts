import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http.js";
import { RateLimiter } from "../src/lib/ratelimit.js";
import { mockFetch } from "./helpers.js";

const H = { "content-type": "application/json", accept: "application/json, text/event-stream" };
async function rpc(body: unknown, deps: any = {}, env: any = {}) {
  const res = await handleRequest(new Request("http://x/mcp", { method: "POST", headers: H, body: JSON.stringify(body) }), env, deps);
  return { status: res.status, json: (await res.json()) as any };
}

describe("MCP over web-standard Streamable HTTP", () => {
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
  it("rate-limits lead tools", async () => {
    const { f } = mockFetch();
    const limiter = new RateLimiter(1, 60_000);
    const args = { product_urls: ["https://www.amazon.com/dp/B000TEST"], destination_country: "AO", name: "Test Person", email: "t@example.com" };
    const call = () => rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "request_assisted_purchase", arguments: args } }, { fetch: f, limiter, clientKey: "ip1" });
    const a = await call();
    expect(JSON.parse(a.json.result.content[0].text).reference_id).toMatch(/^GSMCP-AP-/);
    const b = await call();
    expect(b.json.result.isError).toBe(true);
  });
  it("serves health and CORS preflight, rejects GET /mcp", async () => {
    expect((await handleRequest(new Request("http://x/health"))).status).toBe(200);
    expect((await handleRequest(new Request("http://x/mcp", { method: "OPTIONS", headers: { origin: "https://claude.ai" } }))).headers.get("access-control-allow-origin")).toBe("*");
    expect((await handleRequest(new Request("http://x/mcp"))).status).toBe(405);
  });
});
