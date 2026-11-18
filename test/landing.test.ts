import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http.js";

const BASE = "https://mcp.globalshopaholics.com";
const req = (path: string, headers: Record<string, string> = {}, init: RequestInit = {}, base = BASE) =>
  handleRequest(new Request(`${base}${path}`, { headers, ...init }));

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IMESSAGE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0";

describe("landing page at /", () => {
  it("serves HTML with OG/Twitter tags to browsers (Accept: text/html)", async () => {
    const r = await req("/", { accept: "text/html,application/xhtml+xml", "user-agent": SAFARI });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(r.headers.get("vary")).toMatch(/Accept/);
    const h = await r.text();
    expect(h).toContain("<title>Global Shopaholics MCP: buy from any US store, ship worldwide</title>");
    for (const tag of ['property="og:title"', 'property="og:description"', 'property="og:site_name" content="Global Shopaholics"', 'name="twitter:card" content="summary_large_image"', 'name="description"', 'rel="apple-touch-icon"', 'rel="icon"'])
      expect(h).toContain(tag);
    expect(h).toContain('property="og:url" content="https://mcp.globalshopaholics.com/"');
    expect(h).toContain('property="og:image" content="https://mcp.globalshopaholics.com/og.png"');
    expect(h).toContain("https://mcp.globalshopaholics.com/mcp");
    expect(h).toContain("/plugin marketplace add xuniwattoo/gs-mcp");
    expect(h).toContain("claude mcp add --transport http global-shopaholics");
    expect(h).toContain("codex mcp add global-shopaholics");
    expect(h).toContain("cursor.com/en/install-mcp");
    expect(h).toContain("vscode.dev/redirect/mcp/install");
    expect(h).toContain("global-shopaholics.mcpb");
    expect(h).toContain("https://globalshopaholics.com/mcp/");
    expect(h).toContain("https://github.com/xuniwattoo/gs-mcp");
    expect(h).not.toMatch(/<script[^>]+src=/i); // no external JS
    const visible = h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
    expect(visible).not.toMatch(/\bfees?\b|\d\s*%|\$\s?\d|minimum/i); // fee is not mentioned
    expect(h).not.toMatch(/content="[^"]*\bfees?\b/i);
    expect(h).not.toContain("http://");
  });
  it("serves HTML to link-preview bots even without Accept: text/html", async () => {
    for (const ua of [IMESSAGE, "facebookexternalhit/1.1", "Twitterbot/1.0", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "LinkedInBot/1.0", "WhatsApp/2.23.20", "Mozilla/5.0 (compatible; Discordbot/2.0)", "TelegramBot (like TwitterBot)", "Applebot/0.1"]) {
      const r = await req("/", { "user-agent": ua, accept: "*/*" });
      expect(r.headers.get("content-type"), ua).toContain("text/html");
    }
  });
  it("keeps JSON for curl, JSON clients and ?format=json", async () => {
    const cases: [string, Record<string, string>][] = [
      ["/", { "user-agent": "curl/8.5.0", accept: "*/*" }],
      ["/", {}],
      ["/", { accept: "application/json", "user-agent": SAFARI }],
      ["/?format=json", { accept: "text/html", "user-agent": SAFARI }],
    ];
    for (const [p, h] of cases) {
      const r = await req(p, h);
      expect(r.headers.get("content-type")).toContain("application/json");
      const j = (await r.json()) as any;
      expect(j.status).toBe("ok");
    }
  });
  it("HEAD / returns HTML headers with no body for browsers", async () => {
    const r = await req("/", { accept: "text/html" }, { method: "HEAD" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(await r.text()).toBe("");
  });
  it("serves og.png and icons as long-cached PNGs", async () => {
    for (const p of ["/og.png", "/apple-touch-icon.png", "/favicon.png", "/favicon.ico"]) {
      const r = await req(p);
      expect(r.status, p).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/png");
      expect(r.headers.get("cache-control")).toContain("max-age=31536000");
      const b = new Uint8Array(await r.arrayBuffer());
      expect([...b.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
      if (p === "/og.png") {
        const dv = new DataView(b.buffer);
        expect([dv.getUint32(16), dv.getUint32(20)]).toEqual([1200, 630]);
      }
    }
  });
});

describe("https self URLs", () => {
  it("forces https self URLs when the request arrives as http behind a proxy", async () => {
    const r = await req("/?format=json", {}, {}, "http://mcp.globalshopaholics.com");
    const j = (await r.json()) as any;
    expect(j.mcp_endpoint).toBe("https://mcp.globalshopaholics.com/mcp");
    expect(j.server_card).toBe("https://mcp.globalshopaholics.com/mcp/server-card");
    const card = (await (await req("/mcp/server-card", {}, {}, "http://gs-mcp.gshopaholics.workers.dev")).json()) as any;
    expect(card.remotes[0].url).toBe("https://gs-mcp.gshopaholics.workers.dev/mcp");
    const h = await (await req("/", { accept: "text/html" }, {}, "http://mcp.globalshopaholics.com")).text();
    expect(h).toContain('content="https://mcp.globalshopaholics.com/og.png"');
    expect(h).not.toContain("http://");
  });
  it("status JSON self URLs are https", async () => {
    const j = (await (await req("/?format=json")).json()) as any;
    for (const k of ["mcp_endpoint", "server_card", "llms_txt", "homepage"]) expect(j[k]).toMatch(/^https:\/\/mcp\.globalshopaholics\.com\//);
  });
  it("never emits http:// self URLs from discovery docs on the custom domain", async () => {
    for (const p of ["/mcp/server-card", "/.well-known/ai-catalog.json", "/llms.txt"]) {
      const t = await (await req(p)).text();
      expect(t, p).not.toMatch(/http:\/\/mcp\.globalshopaholics\.com/);
    }
  });
  it("keeps http for localhost development", async () => {
    const j = (await (await req("/", {}, {}, "http://localhost:8787")).json()) as any;
    expect(j.mcp_endpoint).toBe("http://localhost:8787/mcp");
  });
  it("POST /mcp over http still works", async () => {
    const r = await req("/mcp", { "content-type": "application/json", accept: "application/json, text/event-stream" }, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }, "http://mcp.globalshopaholics.com");
    expect(r.status).not.toBe(301);
  });
});
