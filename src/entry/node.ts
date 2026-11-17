import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { handleRequest } from "../http.js";

/** Plain Node host (Cloudways, VPS, Docker). PORT defaults to 8787. */
async function toRequest(req: IncomingMessage): Promise<Request> {
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  const url = `${proto}://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  if (!headers.has("x-forwarded-for") && req.socket.remoteAddress) headers.set("x-forwarded-for", req.socket.remoteAddress);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, { method: req.method, headers, body: hasBody ? (Readable.toWeb(req) as any) : undefined, duplex: "half" } as RequestInit);
}

async function send(res: ServerResponse, r: Response) {
  res.statusCode = r.status;
  r.headers.forEach((v, k) => res.setHeader(k, v));
  if (!r.body) return res.end();
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
createHttpServer(async (req, res) => {
  try {
    await send(res, await handleRequest(await toRequest(req), process.env));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.statusCode = 500;
    res.end(JSON.stringify({ error: "internal error" }));
  }
}).listen(port, host, () => console.log(`GS MCP listening on http://${host}:${port}/mcp`));
