import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http.js";
import { readStats, uaFamily, type Counts, type UsageStore } from "../src/lib/usage.js";

const H = { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": "node-fetch/1" };
function memStore(fail = false): UsageStore & { data: Record<string, Counts> } {
  const data: Record<string, Counts> = {};
  return {
    data,
    async increment(day, keys) { if (fail) throw new Error("boom"); const d = (data[day] ??= {}); for (const [k, n] of Object.entries(keys)) d[k] = (d[k] ?? 0) + n; },
    async read(days) { if (fail) throw new Error("boom"); return Object.fromEntries(days.map((d) => [d, data[d] ?? {}])); },
  };
}
const post = (body: unknown, deps: any, env: any = {}) => handleRequest(new Request("http://x/mcp", { method: "POST", headers: H, body: JSON.stringify(body) }), env, deps);

describe("usage counting", () => {
  it("counts methods, tools, clients, ua, ok/error and stores no arguments", async () => {
    const store = memStore();
    await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "gs-internal-test", version: "9" } } }, { usageStore: store });
    await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { usageStore: store });
    await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_started", arguments: { email: "secret@example.com" } } }, { usageStore: store });
    const c = Object.values(store.data)[0];
    expect(c.total).toBe(3);
    expect(c["method:initialize"]).toBe(1);
    expect(c["method:tools/list"]).toBe(1);
    expect(c["tool:get_started"]).toBe(1);
    expect(c["client:gs-internal-test 9"]).toBe(1);
    expect(c["ua:node"]).toBe(3);
    expect(c["country:unknown"]).toBe(3);
    expect(JSON.stringify(store.data)).not.toContain("secret@example.com");
  });
  it("does not break the MCP when storage errors", async () => {
    const res = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { usageStore: memStore(true) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).result.tools.length).toBeGreaterThan(5);
  });
  it("/stats requires the token", async () => {
    const store = memStore();
    await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { usageStore: store });
    const env = { STATS_TOKEN: "tok123" };
    expect((await handleRequest(new Request("http://x/stats"), env, { usageStore: store })).status).toBe(401);
    expect((await handleRequest(new Request("http://x/stats", { headers: { authorization: "Bearer nope" } }), env, { usageStore: store })).status).toBe(401);
    expect((await handleRequest(new Request("http://x/stats"), {}, { usageStore: store })).status).toBe(401);
    const ok = await handleRequest(new Request("http://x/stats?days=3", { headers: { authorization: "Bearer tok123" } }), env, { usageStore: store });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).totals.total).toBe(1);
  });
  it("helpers", async () => {
    expect(uaFamily("Mozilla/5.0 Chrome")).toBe("browser");
    expect(uaFamily(null)).toBe("none");
    expect((await readStats(memStore(), 2)).days).toBe(2);
  });
});
