/**
 * Smoke test: starts the Node server on a free port (lead sinks pointed at a local mock webhook,
 * GHL disabled), then over real Streamable HTTP: initialize, tools/list, resources, prompts, and calls every tool.
 * get_shipping_rates hits GS LIVE unless SMOKE_OFFLINE=1.
 * Usage: npm run smoke            (or SMOKE_URL=https://host/mcp npm run smoke  to test a deployed server; lead tools skipped unless SMOKE_LEADS=1)
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const leads: any[] = [];
const mock = createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => { leads.push(JSON.parse(b || "{}")); res.end("ok"); });
});
await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
const mockUrl = `http://127.0.0.1:${(mock.address() as AddressInfo).port}/lead`;

let child: ReturnType<typeof spawn> | undefined;
let url = process.env.SMOKE_URL;
const external = !!url;
if (!url) {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const env = { ...process.env, PORT: String(port), HOST: "127.0.0.1", LEAD_WEBHOOK_URL: mockUrl, GHL_API_TOKEN: "", GHL_LOCATION_ID: "", EASYSHIP_API_KEY: "" };
  if (process.env.SMOKE_OFFLINE === "1") env.GS_RATES_URL = `http://127.0.0.1:1/offline`;
  child = spawn(process.execPath, ["--import", "tsx", "src/entry/node.ts"], { env, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start")), 15000);
    child!.stdout!.on("data", (d) => { if (String(d).includes("listening")) { clearTimeout(t); resolve(); } });
  });
  url = `http://127.0.0.1:${port}/mcp`;
}

let failures = 0;
const ok = (name: string, cond: boolean, info = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!cond) failures++; };
const text = (r: any) => JSON.parse(r.content[0].text);

try {
  const client = new Client({ name: "gs-smoke", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  ok("initialize", client.getServerVersion()?.name === "global-shopaholics", `server=${client.getServerVersion()?.name}`);
  const tools = (await client.listTools()).tools.map((t) => t.name);
  ok("tools/list", tools.length === 7, tools.join(","));
  ok("resources/read", (await client.readResource({ uri: "gs://about" })).contents.length === 1);
  ok("prompts/get", (await client.getPrompt({ name: "buy-and-ship", arguments: { product: "AirPods Pro", country: "Angola" } })).messages.length === 1);

  const t0 = Date.now();
  const rates: any = await client.callTool({ name: "get_shipping_rates", arguments: { country: "Angola", city: "Luanda", weight: 5, unit: "kg" } });
  if (rates.isError) ok("get_shipping_rates", process.env.SMOKE_OFFLINE === "1", text(rates).error);
  else {
    const d = text(rates);
    ok("get_shipping_rates (LIVE)", d.services.length > 0, `${d.services.length} services in ${Date.now() - t0} ms; cheapest ${d.cheapest.carrier} ${d.cheapest.service} $${d.cheapest.price_usd}`);
  }
  const lc: any = await client.callTool({ name: "estimate_landed_cost", arguments: { destination_country: "AO", items_total_usd: 250, payment_method: "bank_transfer", package: { weight: 5, unit: "kg" } } });
  ok("estimate_landed_cost", !lc.isError && text(lc).estimate === true, JSON.stringify(text(lc).total_landed_usd));
  ok("get_services_and_fees", !((await client.callTool({ name: "get_services_and_fees", arguments: { topic: "all" } })) as any).isError);
  ok("get_started", text(await client.callTool({ name: "get_started", arguments: {} })).signup_url === "https://login.globalshopaholics.com/register");
  ok("track_shipment", text(await client.callTool({ name: "track_shipment", arguments: { tracking_number: "1Z999AA10123456784" } })).carrier === "ups");

  if (!external || process.env.SMOKE_LEADS === "1") {
    const ap = text(await client.callTool({ name: "request_assisted_purchase", arguments: { product_urls: ["https://www.example.com/product/123"], quantity: 1, destination_country: "AO", name: "Smoke Test", email: "smoke@example.com", payment_method: "bank_transfer" } }));
    ok("request_assisted_purchase", !!ap.reference_id, `${ap.reference_id} status=${ap.status}`);
    const sq = text(await client.callTool({ name: "request_shipment_quote", arguments: { destination_country: "SA", contents: "Clothes", packages: [{ weight: 3, unit: "kg" }], needs: ["quote", "customs_paperwork"], name: "Smoke Test", email: "smoke@example.com" } }));
    ok("request_shipment_quote", !!sq.reference_id, `${sq.reference_id} status=${sq.status}`);
    if (!external) ok("lead sink mocked", leads.length === 2 && leads[0].tag === "mcp-assisted-purchase" && leads[1].tag === "mcp-shipping-request", `${leads.length} leads captured by local mock`);
  }
  await client.close();
} catch (e) {
  console.error(e);
  failures++;
} finally {
  child?.kill();
  mock.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nSmoke test passed");
process.exit(failures ? 1 : 0);
