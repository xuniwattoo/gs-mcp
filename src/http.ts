import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadConfig, type Config, type EnvRecord } from "./config.js";
import { canonicalizeClientIp } from "./lib/ip.js";
import { createServer, SERVER_NAME, SERVER_VERSION, type ServerDeps } from "./server.js";

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

  if (url.pathname === "/" || url.pathname === "/health") {
    const mcpUrl = `${cfg.publicBaseUrl ?? url.origin}/mcp`;
    return Response.json(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        status: "ok",
        mcp_endpoint: mcpUrl,
        transport: "streamable-http",
        docs: "https://globalshopaholics.com/",
        limiter: deps.limiterBackend ?? (deps.limiter ? "custom" : "memory"),
        limiter_ok: deps.limiterStatus ? deps.limiterStatus.ok : undefined,
        rate_limit_per_hour: cfg.rateLimitPerHour,
        lead_rate_limit_per_hour: cfg.leadRateLimitPerHour,
        lead_email_limit_per_day: cfg.leadEmailLimitPerDay,
        lead_daily_cap: cfg.leadDailyCap,
      },
      { headers: c },
    );
  }
  if (url.pathname !== "/mcp") return new Response("Not found", { status: 404, headers: c });

  if (req.method === "GET" || req.method === "DELETE") {
    // Stateless server: no standalone SSE stream or sessions.
    return withHeaders(Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: use POST)." }, id: null }, { status: 405 }), { ...c, allow: "POST, OPTIONS" });
  }

  const server = createServer(cfg, { clientKey: clientKeyFrom(req), ...deps });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req);
    return withHeaders(res, c);
  } finally {
    // JSON mode: response body is fully built once handleRequest resolves.
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  }
}
