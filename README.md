# Global Shopaholics MCP server

A public, remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets any AI agent (Claude, ChatGPT, Cursor, Grok, …) help a person anywhere **buy from any US store and ship it through Global Shopaholics (GS)**.

It only wraps what GS already has: the website's live rate engine, published fees/plans, the sign-up flow, the Assisted Purchase request process and carrier tracking. Duty/VAT figures come from GS's sourced per-country, per-product-category rules (87 countries; see [docs/duties.md](docs/duties.md)) and are always labelled estimates with a range.

- Transport: **Streamable HTTP** (stateless, JSON responses) at `/mcp`, plus a **stdio** entry.
- Runtime: web-standard `Request`/`Response` → runs on **Cloudflare Workers (primary)**, Vercel, or any Node ≥ 20 host (Cloudways).
- No auth for read tools. Lead tools are rate-limited per IP (hourly), per email (daily) and by a global daily cap; rate-lookup tools have a per-IP hourly cap. On Cloudflare Workers these limits live in a SQLite Durable Object; Node/Vercel fall back to a per-process in-memory limiter.

## Tools

| Tool | What it does |
|---|---|
| `get_shipping_rates` | Live DHL / FedEx / UPS / USPS prices, transit times, max weight/size, insurance text and dimensional-weight flag from GS's rate engine (`/wp-json/rate-calculator/v2/getrates`), normalized and sorted. |
| `estimate_landed_cost` | Item + optional US sales tax + GS Assisted Purchase fee (0% when paid by bank transfer or crypto, otherwise 5% with a $5 minimum; expedited & executive per GS FAQ) + live shipping + estimated duty, VAT/GST and fees per item and product category (phones, laptops, clothing, shoes, cosmetics, perfume…) for 87 countries, with de minimis, CIF/FOB basis, courier regimes and who collects. Other countries: WITS tariff lookup (free) or the Easyship Tax & Duty API when `EASYSHIP_API_KEY` is set, cached permanently by country + HS6. Returns a typical estimate plus low–high range. |
| `get_services_and_fees` | Services, plans (Basic free, Premium $9.99, Business $14.99) and published fees with source URLs + last-checked date. |
| `get_started` | How to get the free US address (sign-up: `https://login.globalshopaholics.com/register`) and next steps. |
| `request_assisted_purchase` | Sends a "buy it for me" request to GS (GoHighLevel and/or webhook), tag `mcp-assisted-purchase`; returns a reference id. Falls back to GS's [Assisted Purchase page](https://globalshopaholics.com/assisted-purchase/) + prefilled email if no sink is configured. |
| `find_lower_price` | **Find it cheaper at US stores.** Google Shopping (US) via Serper: top offers sorted by price (store, price, link, rating, savings vs the current price), no affiliate links, sketchy sellers and outliers dropped. Indicative prices only. Cached 24 h, 10 searches/hour per client. Needs `SERPER_API_KEY`. Hands off to `request_us_purchase` / `request_assisted_purchase`. |
| `request_us_purchase` | **US domestic buy-for-me.** GS buys from any US store and ships to a US address (incl. Hawaii, Alaska, Puerto Rico, APO/FPO, stores that won't ship to the customer). Inputs: product URLs, quantity, variant, max price, `find_lower_price`, ship-to state + ZIP, name, email. Same GHL lead flow; tags `mcp-us-domestic` (+ `price-beat`). Fee 0% for crypto/bank transfer, otherwise 5% with $5 minimum; crypto via `create_crypto_payment` once GS confirms the total. Prices are never guaranteed. |
| `request_shipment_quote` | Same lead flow for manual quotes, labels, customs paperwork, freight; tag `mcp-shipping-request`. |
| `create_crypto_payment` | **Crypto checkout is live.** Creates a BTCPay invoice (USD) for an amount GS has already quoted and returns checkout link, invoice id and expiry. 0% GS fee when paying by crypto. Capped at $10,000, rate limited, logged to the GHL contact (`mcp-crypto-payment`). Needs `BTCPAY_URL`, `BTCPAY_STORE_ID`, `BTCPAY_API_KEY` (key limited to create/view invoices). |
| `get_crypto_payment_status` | Read-only status of an invoice by id. |
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

Public MCP URL (Streamable HTTP, free, no sign-up, no auth): **`https://mcp.globalshopaholics.com/mcp`**. Fallback: `https://gs-mcp.gshopaholics.workers.dev/mcp`.

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=global-shopaholics&config=eyJ1cmwiOiJodHRwczovL21jcC5nbG9iYWxzaG9wYWhvbGljcy5jb20vbWNwIn0=)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP-0098FF?logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=global-shopaholics&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.globalshopaholics.com%2Fmcp%22%7D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_MCP-24bfa5?logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=global-shopaholics&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.globalshopaholics.com%2Fmcp%22%7D&quality=insiders)
[![Claude Desktop extension](https://img.shields.io/badge/Claude_Desktop-.mcpb-D97757)](https://github.com/xuniwattoo/gs-mcp/releases/latest/download/global-shopaholics.mcpb)

**Claude Code** – plugin (adds the server plus a `ship-from-us` skill that tells Claude when to use it):

```
/plugin marketplace add xuniwattoo/gs-mcp
/plugin install global-shopaholics@global-shopaholics
```

On Claude Code 2.1.275+ one step works: `/plugin install global-shopaholics --marketplace xuniwattoo/gs-mcp`

Or just the server: `claude mcp add --transport http global-shopaholics https://mcp.globalshopaholics.com/mcp`

**Claude.ai / Claude Desktop** – Settings → Connectors → *Add custom connector* → name `Global Shopaholics`, URL `https://mcp.globalshopaholics.com/mcp`. Or download [`global-shopaholics.mcpb`](https://github.com/xuniwattoo/gs-mcp/releases/latest/download/global-shopaholics.mcpb) and double-click it (Claude Desktop → Settings → Extensions). Manual config for older builds:

```json
{ "mcpServers": { "global-shopaholics": { "command": "npx", "args": ["-y", "mcp-remote", "https://mcp.globalshopaholics.com/mcp"] } } }
```

**ChatGPT** – Settings → Apps & Connectors → Advanced settings → turn on *Developer mode* → *Create* → MCP server URL `https://mcp.globalshopaholics.com/mcp`, authentication *No authentication*.

**Codex (CLI, IDE, ChatGPT desktop)** – `codex mcp add global-shopaholics --url https://mcp.globalshopaholics.com/mcp`, or in `~/.codex/config.toml`:

```toml
[mcp_servers.global-shopaholics]
url = "https://mcp.globalshopaholics.com/mcp"
```

A Codex/ChatGPT plugin package (server + skill) is in [`plugins/openai/global-shopaholics`](plugins/openai/global-shopaholics).

**Cursor** – click the button above, or `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "global-shopaholics": { "url": "https://mcp.globalshopaholics.com/mcp" } } }
```

[Direct deeplink](cursor://anysphere.cursor-deeplink/mcp/install?name=global-shopaholics&config=eyJ1cmwiOiJodHRwczovL21jcC5nbG9iYWxzaG9wYWhvbGljcy5jb20vbWNwIn0=): `cursor://anysphere.cursor-deeplink/mcp/install?name=global-shopaholics&config=eyJ1cmwiOiJodHRwczovL21jcC5nbG9iYWxzaG9wYWhvbGljcy5jb20vbWNwIn0=`

**VS Code (Copilot agent mode)** – click the button above, or `code --add-mcp '{"name":"global-shopaholics","type":"http","url":"https://mcp.globalshopaholics.com/mcp"}'`, or `.vscode/mcp.json`:

```json
{ "servers": { "global-shopaholics": { "type": "http", "url": "https://mcp.globalshopaholics.com/mcp" } } }
```

**Windsurf** – `~/.codeium/windsurf/mcp_config.json`:

```json
{ "mcpServers": { "global-shopaholics": { "serverUrl": "https://mcp.globalshopaholics.com/mcp" } } }
```

**Gemini CLI** – `gemini mcp add --transport http global-shopaholics https://mcp.globalshopaholics.com/mcp`, or `~/.gemini/settings.json`:

```json
{ "mcpServers": { "global-shopaholics": { "httpUrl": "https://mcp.globalshopaholics.com/mcp" } } }
```

**Cline / Roo / other clients** – add a remote server of type *Streamable HTTP* with URL `https://mcp.globalshopaholics.com/mcp`.

**curl**

```bash
curl -s -X POST https://mcp.globalshopaholics.com/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_shipping_rates","arguments":{"country":"AO","weight":5,"unit":"kg"}}}'
```

### Discovery

- Server card: `https://mcp.globalshopaholics.com/mcp/server-card` (also `/.well-known/mcp/server-card.json`)
- AI catalog: `https://mcp.globalshopaholics.com/.well-known/ai-catalog.json`
- `https://mcp.globalshopaholics.com/llms.txt`
- Official MCP Registry name: `io.github.xuniwattoo/gs-mcp` ([server.json](server.json))
- Copies for globalshopaholics.com: [`site-files/`](site-files)

## Configuration

See `.env.example` (Node/Vercel) or `wrangler.toml` `[vars]` + `wrangler secret put` (Workers). Full list in [docs/deploy.md](docs/deploy.md).

## Layout

```
src/config.ts            env → typed config (works with Workers env or process.env)
src/server.ts            McpServer: 11 tools, resource, prompt (zod schemas)
src/http.ts              stateless web-standard Streamable HTTP handler, CORS, /health
src/entry/worker.ts      Cloudflare Workers entry
src/entry/node.ts        plain Node HTTP entry (Cloudways/VPS)
src/entry/stdio.ts       stdio entry
api/mcp.ts, vercel.json  Vercel entry
src/lib/rates.ts         GS rate engine client + normalizer + 10-min cache
src/lib/landed.ts        landed-cost estimator, GS fee logic
src/lib/duty-engine.ts   per-item duty/tax engine (profiles + WITS MFN rates)
src/lib/duty-fallback.ts fallback lookup (Easyship → WITS) + permanent DO cache
src/lib/leads.ts         GoHighLevel v2 / webhook lead sinks + fallback
src/lib/ratelimit.ts     limiter contract + in-memory fallback
src/lib/limiter-do.ts    SQLite Durable Object limiter (Workers)
src/lib/validate.ts      lead-input sanitization and checks
src/lib/tracking.ts      carrier detection + URLs
src/data/*.ts            GS facts (sourced), GS calculator country list
src/data/duty/           duty profiles, categories, WITS tariff snapshot, GS order priority
test/                    vitest tests + fixture (real GS response, Angola 5 kg)
scripts/smoke.ts         end-to-end smoke test
docs/                    website page copy, deploy guide
src/discovery.ts         server card, AI catalog, llms.txt (served by the Worker)
site-files/              discovery files to publish on globalshopaholics.com
.claude-plugin/          Claude Code marketplace (plugins/claude/global-shopaholics)
plugins/openai/          Codex / ChatGPT plugin package
mcpb/                    Claude Desktop extension (stdio relay to the remote server); `npm run mcpb:build`
server.json              MCP registry manifest
```
