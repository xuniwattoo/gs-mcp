import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { handleRequest } from "../src/http.js";
import { LLMS_TXT, serverCard } from "../src/discovery.js";
import { SERVER_VERSION } from "../src/server.js";

const H = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const get = (path: string, env: any = {}) => handleRequest(new Request(`https://mcp.globalshopaholics.com${path}`), env);

describe("discovery documents", () => {
  it("serves the server card at /mcp/server-card and the .well-known alias", async () => {
    for (const p of ["/mcp/server-card", "/.well-known/mcp/server-card.json"]) {
      const r = await get(p);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("application/mcp-server-card+json");
      const card = (await r.json()) as any;
      expect(card.remotes[0]).toMatchObject({ type: "streamable-http", url: "https://mcp.globalshopaholics.com/mcp" });
      expect(card.version).toBe(SERVER_VERSION);
      expect(card.description.length).toBeLessThanOrEqual(100);
    }
  });
  it("serves an AI catalog pointing at the card", async () => {
    const r = await get("/.well-known/ai-catalog.json");
    const cat = (await r.json()) as any;
    expect(cat.entries[0].type).toBe("application/mcp-server-card+json");
    expect(cat.entries[0].url).toBe("https://mcp.globalshopaholics.com/mcp/server-card");
  });
  it("serves llms.txt without promising in-chat payment", async () => {
    const r = await get("/llms.txt");
    const t = await r.text();
    expect(t).toContain("https://mcp.globalshopaholics.com/mcp");
    expect(t).toMatch(/not inside the chat|nothing is charged in chat/i);
    expect(t).toContain("$5 minimum");
  });
  it("openai challenge is 404 unless configured", async () => {
    expect((await get("/.well-known/openai-apps-challenge")).status).toBe(404);
    const r = await get("/.well-known/openai-apps-challenge", { OPENAI_APPS_CHALLENGE: "tok123" });
    expect(await r.text()).toBe("tok123");
  });
  it("uses the request origin on workers.dev", () => {
    expect(serverCard("https://gs-mcp.gshopaholics.workers.dev/mcp").remotes[0].url).toContain("workers.dev");
  });
  it("site-files copies match what the Worker serves", () => {
    expect(readFileSync("site-files/llms.txt", "utf8")).toBe(LLMS_TXT);
    expect(JSON.parse(readFileSync("site-files/mcp-server-card.json", "utf8"))).toEqual(serverCard());
  });
  it("server.json description stays within 100 chars", () => {
    const sj = JSON.parse(readFileSync("server.json", "utf8"));
    expect(sj.description.length).toBeLessThanOrEqual(100);
    expect(sj.version).toBe(SERVER_VERSION);
  });
});

describe("tool metadata for agent directories (ChatGPT/Claude)", () => {
  it("every tool has a title and explicit readOnly/destructive/openWorld hints", async () => {
    const res = await handleRequest(new Request("http://x/mcp", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }));
    const tools = ((await res.json()) as any).result.tools;
    expect(tools.length).toBe(9);
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy();
      expect(typeof t.annotations.readOnlyHint, t.name).toBe("boolean");
      expect(t.annotations.destructiveHint, t.name).toBe(false);
      expect(typeof t.annotations.openWorldHint, t.name).toBe("boolean");
    }
    const writes = tools.filter((t: any) => !t.annotations.readOnlyHint).map((t: any) => t.name).sort();
    expect(writes).toEqual(["create_crypto_payment", "request_assisted_purchase", "request_shipment_quote"]);
  });
  it("descriptions match common shopper queries", async () => {
    const res = await handleRequest(new Request("http://x/mcp", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }));
    const all = ((await res.json()) as any).result.tools.map((t: any) => `${t.title} ${t.description}`).join(" ").toLowerCase();
    for (const kw of ["us store", "shipping", "customs dut", "import tax", "package forwarding", "track"]) expect(all).toContain(kw);
  });
});
