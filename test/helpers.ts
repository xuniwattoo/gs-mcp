import { readFileSync } from "node:fs";
export const AO_FIXTURE = JSON.parse(readFileSync(new URL("./fixture-ao-5kg.json", import.meta.url), "utf8"));

export interface Call { url: string; init?: RequestInit }
/** Mock fetch: routes GS rates to the fixture, records lead-sink calls, never touches the network. */
export function mockFetch(opts: { rates?: "ok" | "blocked"; ghlOk?: boolean } = {}) {
  const calls: Call[] = [];
  const f = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    if (url.includes("rate-calculator")) {
      if (opts.rates === "blocked") return new Response("<html><title>One moment, please...</title></html>", { status: 200, headers: { "content-type": "text/html" } });
      return Response.json(AO_FIXTURE);
    }
    if (url.includes("leadconnectorhq") || url.includes("ghl.test")) {
      if (opts.ghlOk === false) return new Response("nope", { status: 401 });
      if (url.endsWith("/contacts/upsert")) return Response.json({ new: true, contact: { id: "c_test_123" } });
      return Response.json({ ok: true });
    }
    if (url.includes("webhook.test")) return new Response("ok");
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { f, calls };
}
