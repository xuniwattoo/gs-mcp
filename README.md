# Global Shopaholics MCP server

A public, remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets any AI agent (Claude, ChatGPT, Cursor, Grok, …) help a person anywhere **buy from any US store and ship it through Global Shopaholics (GS)**.

It only wraps what GS already has: the website's live rate engine, published fees/plans, the sign-up flow, the Assisted Purchase request process and carrier tracking. Duty/VAT figures come from a small sourced rules table and are always labelled estimates.

- Transport: **Streamable HTTP** (stateless, JSON responses) at `/mcp`, plus a **stdio** entry.
- Runtime: web-standard `Request`/`Response` → runs on **Cloudflare Workers (primary)**, Vercel, or any Node ≥ 20 host (Cloudways).
- No auth for read tools; the two lead tools are rate-limited per client IP (in-memory, no database).

## Tools

| Tool | What it does |
|---|---|
| `get_shipping_rates` | Live DHL / FedEx / UPS / USPS prices, transit times, max weight/size, insurance text and dimensional-weight flag from GS's rate engine (`/wp-json/rate-calculator/v2/getrates`), normalized and sorted. |
| `estimate_landed_cost` | Item + optional US sales tax + GS Assisted Purchase fee (0% bank transfer/crypto, else 5% / $5 min; expedited & executive per GS FAQ) + live shipping + estimated duty/VAT (AO, SA, AE, GB, CA, AU, NG, PK, IN, BR, DE, FR, NL). Optional Easyship Tax & Duty API when `EASYSHIP_API_KEY` and an HS code are given. |
| `get_services_and_fees` | Services, plans (Basic free, Premium $9.99, Business $14.99) and published fees with source URLs + last-checked date. |
| `get_started` | How to get the free US address (sign-up: `https://login.globalshopaholics.com/register`) and next steps. |
| `request_assisted_purchase` | Sends a "buy it for me" request to GS (GoHighLevel and/or webhook), tag `mcp-assisted-purchase`; returns a reference id. Falls back to GS's [Assisted Purchase page](https://globalshopaholics.com/assisted-purchase/) + prefilled email if no sink is configured. |
| `request_shipment_quote` | Same lead flow for manual quotes, labels, customs paperwork, freight; tag `mcp-shipping-request`. |
| `track_shipment` | Carrier tracking URL (DHL/FedEx/UPS/USPS, auto-detected). GS has no public tracking page; customers also see status in their dashboard. |

Resource: `gs://about` (markdown overview). Prompt: `buy-and-ship`.

## Run locally

```bash
npm install
cp .env.example .env          # optional, every value has a default
npm run dev                   # Node server on http://localhost:8787/mcp
npm test                      # unit + in-process MCP tests (all network mocked)
npm run smoke                 # spawns the server, real HTTP MCP client, LIVE GS rates, lead sinks mocked
npm run cf:dev                # same code inside the Cloudflare Workers runtime (wrangler dev)
npm run stdio                 # stdio transport
```

`npm run build && npm start` runs the compiled Node server (`dist/entry/node.js`).

## Connect an AI agent

Replace `{{MCP_URL}}` with the deployed URL, e.g. `https://gs-mcp.<account>.workers.dev/mcp` or `https://mcp.globalshopaholics.com/mcp`.

**Claude (claude.ai / Claude Desktop)** – Settings → Connectors → *Add custom connector* → paste `{{MCP_URL}}`. For older Claude Desktop builds without remote connectors, add to `claude_desktop_config.json`:

```json
{ "mcpServers": { "global-shopaholics": { "command": "npx", "args": ["-y", "mcp-remote", "{{MCP_URL}}"] } } }
```

**ChatGPT** – Settings → Apps & Connectors → Advanced → enable Developer mode → *Create* connector → MCP server URL `{{MCP_URL}}`, authentication *No authentication*.

**Cursor** – `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{ "mcpServers": { "global-shopaholics": { "url": "{{MCP_URL}}" } } }
```

**curl**

```bash
curl -s -X POST {{MCP_URL}} -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_shipping_rates","arguments":{"country":"AO","weight":5,"unit":"kg"}}}'
```

## Configuration

See `.env.example` (Node/Vercel) or `wrangler.toml` `[vars]` + `wrangler secret put` (Workers). Full list in [docs/deploy.md](docs/deploy.md).

## Layout

```
src/config.ts            env → typed config (works with Workers env or process.env)
src/server.ts            McpServer: 7 tools, resource, prompt (zod schemas)
src/http.ts              stateless web-standard Streamable HTTP handler, CORS, /health
src/entry/worker.ts      Cloudflare Workers entry
src/entry/node.ts        plain Node HTTP entry (Cloudways/VPS)
src/entry/stdio.ts       stdio entry
api/mcp.ts, vercel.json  Vercel entry
src/lib/rates.ts         GS rate engine client + normalizer + 10-min cache
src/lib/landed.ts        landed-cost estimator, GS fee logic, optional Easyship
src/lib/leads.ts         GoHighLevel v2 / webhook lead sinks + fallback
src/lib/ratelimit.ts     in-memory limiter
src/lib/tracking.ts      carrier detection + URLs
src/data/*.ts            GS facts (sourced), duty rules (sourced), GS calculator country list
test/                    vitest tests + fixture (real GS response, Angola 5 kg)
scripts/smoke.ts         end-to-end smoke test
docs/                    website page copy, deploy guide
server.json              MCP registry manifest
```
