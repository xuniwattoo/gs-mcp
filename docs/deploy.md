# Deploying the GS MCP server

Every request builds a fresh MCP server (no MCP sessions). On Cloudflare Workers, lead and rate-tool limits are stored in a SQLite-backed Durable Object (free-plan compatible) and identical rate-engine responses are cached for 10 minutes (in-memory plus the Cache API). Node and Vercel use the same limiter contract in memory (per process; resets on restart) and the 10-minute in-memory rates cache only.

## 1. Cloudflare Workers (primary, free plan)

```bash
npm install
npx wrangler login                       # once, opens browser
# If this login can see more than one account, target the GS account:
export CLOUDFLARE_ACCOUNT_ID=bd278cd7f2b3921e4b3c9eeff0a95396
npx wrangler secret put GHL_API_TOKEN     # optional; required for leads to reach GHL
npm run cf:deploy                         # = wrangler deploy
```

Live MCP URL: `https://mcp.globalshopaholics.com/mcp`. Check `https://mcp.globalshopaholics.com/health`.

`wrangler.toml` attaches the custom domain `mcp.globalshopaholics.com` on the `globalshopaholics.com` zone (`custom_domain = true`) and also publishes the workers.dev fallback `https://gs-mcp.gshopaholics.workers.dev/mcp`. `GHL_LOCATION_ID` is a plain `[vars]` value, not a secret.

Free-plan fit: bundle ≈ 265 KB gzip (limit 3 MB). The rate engine takes ~10 s to answer, but waiting on `fetch` is wall-clock time, not CPU time, so the 10 ms CPU limit is not an issue. 100k requests/day free.

Non-secret vars live in `wrangler.toml` `[vars]`; secrets via `wrangler secret put`.

The `LIMITER` Durable Object binding is required for durable limits. Per-IP buckets use `CF-Connecting-IP`, with IPv6 addresses folded to their /64 prefix so privacy/SNAT rotations on the same network share a limit. `wrangler deploy` applies the `v1` SQLite class migration and keeps existing Worker secrets. The in-memory limiter is used automatically when the binding is absent (Node/Vercel).

Assisted-purchase fee: 0% when paid by bank transfer or crypto, otherwise 5% with a $5 minimum. Override the percentage or minimum with `GS_ASSISTED_FEE_PCT` and `GS_ASSISTED_FEE_MIN_USD` without a code change.

## 2. Plain Node host (Cloudways fallback)

Requires Node ≥ 20.

```bash
npm ci && npm run build
cp .env.example .env    # fill in secrets
PORT=8787 node --env-file=.env dist/entry/node.js
```

Keep it running with pm2 (`pm2 start dist/entry/node.js --name gs-mcp`) or systemd, and proxy a subdomain to it (nginx/Apache):

```
location /mcp { proxy_pass http://127.0.0.1:8787; proxy_http_version 1.1; proxy_set_header Host $host;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; }
```

Cloudways application servers are PHP-first; Node needs SSH access and a custom process manager. If that's awkward, use Workers.

## 3. Vercel (also supported)

`vercel deploy` — `api/mcp.ts` exports web-standard handlers and `vercel.json` rewrites `/mcp`, `/health`, `/` to it. Set env vars in the Vercel dashboard. Default function timeout covers the ~10 s rate call.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `GS_RATES_URL` | `https://globalshopaholics.com/wp-json/rate-calculator/v2/getrates` | Rate engine endpoint |
| `GS_RATES_REFERER` | `https://globalshopaholics.com/international-shipping-calculator/` | Referer/Origin sent (same as the website) |
| `GS_RATES_HEADER_NAME` / `GS_RATES_HEADER_VALUE` | – | Optional shared-secret header for the WAF allowlist (secret) |
| `GS_RATES_TIMEOUT_MS` | `25000` | Upstream timeout |
| `GS_USER_AGENT` | `GlobalShopaholics-MCP/0.1 (+https://globalshopaholics.com)` | Honest, identifiable UA |
| `GHL_API_TOKEN` | – | GoHighLevel private integration token (scopes: contacts.write, contacts.readonly) (secret) |
| `GHL_LOCATION_ID` | (set in `wrangler.toml` `[vars]`) | GHL sub-account/location id |
| `GHL_API_BASE` | `https://services.leadconnectorhq.com` | GHL API v2 base |
| `LEAD_WEBHOOK_URL` | – | Generic webhook for leads (Zapier/Make/internal) (secret) |
| `LEAD_WEBHOOK_SECRET` | – | HMAC-SHA256 key → `x-gs-signature: sha256=<hex>` header (secret) |
| `LEAD_RATE_LIMIT_PER_HOUR` | `5` | Shared per-IP hourly cap across both lead tools |
| `LEAD_EMAIL_LIMIT_PER_DAY` | `3` | Per-email daily cap (email is lowercased and trimmed; UTC day) |
| `LEAD_DAILY_CAP` | `200` | Global daily cap on accepted lead submissions (UTC day) |
| `RATE_LIMIT_PER_HOUR` | `30` | Per-IP hourly cap on `get_shipping_rates` and `estimate_landed_cost` |
| `EASYSHIP_API_KEY` | – | Optional Easyship Tax & Duty API (secret) |
| `EASYSHIP_TAX_URL` | `https://public-api.easyship.com/2024-09/taxes_and_duties` | Easyship endpoint |
| `GS_ASSISTED_FEE_PCT` | `5` | Standard assisted-purchase fee % |
| `GS_ASSISTED_FEE_MIN_USD` | `5` | Minimum standard fee in USD (configurable; default matches the published site) |
| `GS_ASSISTED_FEE_WAIVED_METHODS` | `bank_transfer,crypto` | Payment methods with 0% standard fee |
| `ALLOWED_ORIGINS` | `*` | CORS origins (comma list) |
| `PUBLIC_BASE_URL` | – | Shown in `/health` |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Node entry only |

With no GHL/webhook configured, lead tools still return a reference id plus GS's own Assisted Purchase page and a prefilled email to help@globalshopaholics.com.

## What GS's developer must whitelist

The rate engine sits behind **Imunify360 bot-protection** on the Cloudways origin (and Cloudflare in front). Observed on 2026-11-17:

- Requests with a default Node `fetch` User-Agent were rejected: `403 {"message":"Access denied by Imunify360 bot-protection. IPs used for automation should be whitelisted"}`.
- Requests with the honest UA `GlobalShopaholics-MCP/0.1 (+https://globalshopaholics.com)` plus the calculator's Referer succeeded (from the build box and from `wrangler dev`). Earlier tests from other IPs got the "One moment, please…" JS challenge, so behaviour depends on IP reputation.
- No WordPress nonce or cookie is required: the endpoint answers without the `X-WP-Nonce` the page sends.

To make it reliable from Cloudflare Workers (shared Cloudflare egress IPs) or any host, ask the developer to add **one** of these in Imunify360 / Cloudflare WAF:

1. **Preferred – shared-secret header**: allow requests to `POST /wp-json/rate-calculator/v2/getrates` that carry header `X-GS-MCP-Key: <random secret>`. Set `GS_RATES_HEADER_NAME=X-GS-MCP-Key` and `GS_RATES_HEADER_VALUE=<secret>` (as a Worker secret).
2. **User-Agent rule**: allow UA `GlobalShopaholics-MCP/*` on that path (weaker; UA can be copied).
3. **IP allowlist**: for a Node host, whitelist its static IP in Imunify360 (`imunify360-agent whitelist ip add <ip>`). Not practical for Workers (egress IPs are shared and change).

Only `/wp-json/rate-calculator/v2/getrates` (POST) needs the exception. Also consider whitelisting at Cloudflare (WAF custom rule → Skip) if bot-fight mode is ever enabled.

When blocked, `get_shipping_rates` returns a clear error with the website calculator link, and `estimate_landed_cost` still returns the fee + duty parts.

## Usage counters (`/stats`)

Every `/mcp` POST is counted in a SQLite Durable Object (`USAGE_DO`, class `UsageDO`, free plan): method, tool name (`tools/call`), `clientInfo` name/version (`initialize` only), coarse user-agent family, `request.cf.country`, ok/error, per UTC day. No IPs, emails or tool arguments are stored. Writes run in `ctx.waitUntil`; storage errors are swallowed and never affect the MCP. Rows are kept 120 days.

- Read: `GET /stats?days=7` with `Authorization: Bearer $STATS_TOKEN` (401 otherwise). Or run `scripts/stats.sh 7` (token in gitignored `.stats_token`).
- Secret: `CLOUDFLARE_ACCOUNT_ID=bd278cd7f2b3921e4b3c9eeff0a95396 npx wrangler secret put STATS_TOKEN`.
- Why a DO and not KV: creating a KV namespace was denied for our Workers Admin role (auth error 10000); GraphQL analytics is also denied.
