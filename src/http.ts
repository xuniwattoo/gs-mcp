import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadConfig, type Config, type EnvRecord } from "./config.js";
import { canonicalizeClientIp } from "./lib/ip.js";
import { createServer, SERVER_NAME, SERVER_VERSION, type ServerDeps } from "./server.js";
import { discoveryResponse } from "./discovery.js";
import { describeMessage, readStats, recordUsage, responseOk, timingSafeEq, uaFamily, type UsageEvent } from "./lib/usage.js";
import { imageResponse, landingResponse, selfOrigin, wantsHtml } from "./landing.js";

function cors(cfg: Config, req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allow = cfg.allowedOrigins.includes("*") ? "*" : origin && cfg.allowedOrigins.includes(origin) ? origin : "";
  return allow
    ? {
        "access-control-allow-origin": allow,
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id",
        "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
        "access-control-max-age": "86400",
      }
    : {};
}

function withHeaders(res: Response, extra: Record<string, string>) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export function clientKeyFrom(req: Request) {
  const raw = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  return canonicalizeClientIp(raw);
}

/**
 * Stateless Streamable HTTP handler (web-standard Request/Response).
 * A fresh server + transport per request: no sessions, no storage – fits Cloudflare Workers, Vercel and Node.
 */
export async function handleRequest(req: Request, env: EnvRecord = {}, deps: ServerDeps = {}): Promise<Response> {
  const cfg = loadConfig(env);
  const url = new URL(req.url);
  const c = cors(cfg, req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });
  // Public self URLs are always https (the request URL can arrive as http behind proxies).
  const origin = (cfg.publicBaseUrl ?? selfOrigin(url)).replace(/\/+$/, "");
  const isGet = req.method === "GET" || req.method === "HEAD";

  if (isGet) {
    const img = imageResponse(url.pathname, req.method);
    if (img) return img;
  }
  if (isGet && url.pathname === "/" && wantsHtml(req, url)) return landingResponse(origin, req.method);

  if (url.pathname === "/" || url.pathname === "/health") {
    const mcpUrl = `${origin}/mcp`;
    return Response.json(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        status: "ok",
        mcp_endpoint: mcpUrl,
        transport: "streamable-http",
        docs: "https://globalshopaholics.com/mcp/",
        server_card: `${origin}/mcp/server-card`,
        llms_txt: `${origin}/llms.txt`,
        homepage: `${origin}/`,
        limiter: deps.limiterBackend ?? (deps.limiter ? "custom" : "memory"),
        limiter_ok: deps.limiterStatus ? deps.limiterStatus.ok : undefined,
        rate_limit_per_hour: cfg.rateLimitPerHour,
        lead_rate_limit_per_hour: cfg.leadRateLimitPerHour,
        lead_email_limit_per_day: cfg.leadEmailLimitPerDay,
        lead_daily_cap: cfg.leadDailyCap,
      },
      { headers: { ...c, vary: "Accept, User-Agent", "cache-control": "no-store" } },
    );
  }
  if (req.method === "GET" || req.method === "HEAD") {
    const d = discoveryResponse(url.pathname, origin, env);
    if (d) return d;
  }
  if (url.pathname === "/stats") {
    const token = env.STATS_TOKEN;
    const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token || !given || !timingSafeEq(given, token)) return new Response("Unauthorized", { status: 401, headers: { ...c, "cache-control": "no-store" } });
    if (!deps.usageStore) return Response.json({ error: "usage storage not configured" }, { status: 503 });
    const days = Number(url.searchParams.get("days") ?? "7");
    return Response.json(await readStats(deps.usageStore, days), { headers: { ...c, "cache-control": "no-store" } });
  }
  if (url.pathname !== "/mcp") return new Response("Not found", { status: 404, headers: c });

  if (req.method === "GET" || req.method === "DELETE") {
    // Stateless server: no standalone SSE stream or sessions.
    return withHeaders(Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: use POST)." }, id: null }, { status: 405 }), { ...c, allow: "POST, OPTIONS" });
  }

  // Usage counting: parse a copy of the body for method/tool/clientInfo only (never arguments).
  let msgs: ReturnType<typeof describeMessage>[] = [];
  if (deps.usageStore) {
    try {
      const parsed = await req.clone().json();
      msgs = (Array.isArray(parsed) ? parsed : [parsed]).filter((m) => m && typeof m === "object" && m.method).map(describeMessage);
    } catch { /* not JSON: ignore */ }
  }
  const countUsage = async (res: Response | undefined) => {
    if (!deps.usageStore || !msgs.length) return;
    try {
      let ok = !!res && res.status < 400;
      if (res && ok) { try { ok = responseOk(await res.clone().json()); } catch { /* keep status-based */ } }
      const ua = uaFamily(req.headers.get("user-agent"));
      const country = String((req as unknown as { cf?: { country?: string } }).cf?.country ?? "unknown").slice(0, 8);
      const events: UsageEvent[] = msgs.map((m) => ({ ...m, ua, country, ok }));
      const p = recordUsage(deps.usageStore, events);
      if (deps.waitUntil) deps.waitUntil(p); else await p;
    } catch { /* never break the MCP */ }
  };

  const server = createServer(cfg, { clientKey: clientKeyFrom(req), ...deps });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    let res: Response;
    try { res = await transport.handleRequest(req); } catch (e) { await countUsage(undefined); throw e; }
    await countUsage(res);
    return withHeaders(res, c);
  } finally {
    // JSON mode: response body is fully built once handleRequest resolves.
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  }
}
