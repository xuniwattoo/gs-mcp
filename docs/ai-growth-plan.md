# GS AI channel: 30-day growth plan (from Nov 18, 2026)

**Goal:** turn AI agents into a lead and revenue source for Global Shopaholics (GS). An agent should pick our MCP when a user asks to buy something from a US store and ship it to them, and that request should end up as a paid GS order.

**North-star metric:** paid orders that started from an MCP lead (`mcp-assisted-purchase` / `mcp-shipping-request` contacts in GHL), plus GS sign-ups that came from MCP.
**Fee we quote:** 0% for bank transfer or crypto, otherwise 5% with a $5 minimum. Until checkout ships, there is **no in-chat payment**: GS confirms every order by email.

---

## Week 1: get measurable and get listed (highest ROI)

1. **Source attribution on leads.** This is a quick win and has to come first, or nothing else can be measured.
   - Record the MCP `clientInfo.name`/`version` from `initialize` (claude-ai, chatgpt, cursor, cline, codex and so on) on every lead. Also add an optional `source` / `ref` argument to the two `request_*` tools.
   - Write it as a GHL tag (`mcp-src-<client>`) and into the note. CCC tickets will then show where each lead came from.
   - Add `?ref=mcp-<client>` to every website link the tools return: sign-up, assisted-purchase page, plans. This lets GA/WordPress attribute sign-ups.
2. **Worker analytics.** Turn on Workers Analytics Engine (free tier) and log one data point per tool call. Fields: tool, client name, destination country, ok or error, latency.
   - Weekly digest: calls by tool, by client, and by country, plus the funnel *rates → landed cost → request*.
   - No personal data in analytics (no emails, no IPs).
3. **Directories** (status as of today):
   - Done: Official MCP Registry ✅ and Glama ✅ (server and connector).
   - Waiting on automatic ingest from the registry: PulseMCP, about 1 week.
   - Drafted, waiting on Zuni's OK: awesome-mcp-servers PR, awesome-remote-mcp-servers PR, Cline marketplace issue.
   - SEO Master is submitting mcp.so.
   - Needs a browser or GitHub sign-in: Smithery (`smithery auth login`, then `smithery mcp publish https://mcp.globalshopaholics.com/mcp -n xuniwattoo/gs-mcp`) and mcpservers.org/submit.
   - Also worth doing: mcp.directory, MCPMarket, Cursor directory (cursor.directory), LobeHub MCP, OpenTools, and the Docker MCP Catalog (needs a Dockerfile and a PR).
4. **Website discovery.** SEO Master publishes `llms.txt`, `/.well-known/mcp/server-card.json` and a "Use GS from ChatGPT/Claude" section on /mcp/. The files are already in `site-files/`.
5. **Real privacy policy page.** Right now `/privacy-policy/` redirects to the return policy. This blocks the ChatGPT app directory, the Anthropic directory, and every agent-commerce program below.

## Week 2: launch posts (drafts below; post only after Zuni approves each one)

- **Show HN** (Tue or Wed, 8–10 AM ET), **r/mcp**, **X thread** from the GS account, and a **dev.to** tutorial ("Give your AI agent a US shipping address in 2 minutes").
- **Expat and diaspora communities:** r/expats, r/Nigeria, r/Pakistan, r/Angola, r/UAE. Post genuinely useful "how to buy from the US" answers there, and mention the AI angle only where it helps. One post per community, following each sub's self-promo rules.
- **Answer engines.** Make sure globalshopaholics.com pages answer the exact questions people ask ChatGPT and Perplexity ("how to ship from Amazon US to Nigeria", "duties to Saudi Arabia") with the live-rate figures. SEO Master owns this, and the MCP can generate the tables.

## Weeks 2–3: package for each AI surface

- **ChatGPT app directory.** The Apps SDK package is ready. It needs the privacy page, an OpenAI org with business verification (someone at GS), and then a submission. This is our biggest consumer surface.
- **Anthropic connector directory** (claude.ai). Needs the same privacy page plus their form.
- **Gemini / Google.** Gemini CLI install is already in the README. Track the Gemini extensions gallery.
- **Tool ranking.** Keep descriptions keyword-matched ("buy from US store", "ship to <country>", "customs duties"). Make `get_shipping_rates` answer in under 2 s with no sign-up, because agents favor tools that answer straight away. Add a `compare_forwarders`-style FAQ resource that explains GS against MyUS and Shipito honestly.

## Weeks 3–4: agent payments and commerce protocols (revenue unlock)

| Protocol | What it is | What GS would need | Priority |
|---|---|---|---|
| **BTCPay crypto checkout** (our own) | An MCP tool returns a BTCPay invoice link, and the customer pays (0% fee) | Jawad: BTCPay URL, store ID, and a scoped API key (via secure form). Then a `create_crypto_invoice` tool and an `order_status` tool | **P0**, already in progress |
| **x402** (Coinbase; Cloudflare `agents/x402` `paidTool`) | HTTP 402 stablecoin (USDC on Base) payment, paid per tool call | A USDC wallet address owned by GS, plus a decision on what is paid (e.g. a $1–5 deposit that reserves an assisted purchase, credited to the order). Cheap to add on Workers | P1, fits our Worker |
| **Stripe agentic payments** (Shared Payment Tokens, MPP, Stripe agent toolkit) | Agents pay with a card or Link through a scoped token, and the tool returns a payment link the agent can complete | A GS Stripe account with SPT access, and a decision on whether GS wants card processing through Stripe. The 5% card fee covers processing | P1 once Stripe is approved |
| **OpenAI Agentic Commerce Protocol (ACP)** | Spec for checkout inside ChatGPT. OpenAI is moving away from standalone Instant Checkout, and discovery comes from product feeds. Feeds and checkout are for **approved partners only** | Fits poorly: GS sells a service, not catalog SKUs. Realistic route: a ChatGPT **app** (above), plus applying at chatgpt.com/merchants with "service" SKUs (plans, assisted purchase). Checkout would need the 5 ACP endpoints, signed webhooks, privacy policy and ToS URLs | P2, apply and watch |
| **Google UCP + AP2** | Google's commerce protocol (`/.well-known/ucp`, catalog and checkout, with MCP binding). AP2 adds signed mandates. Used in AI Mode and Gemini | A Merchant Center account, a UCP profile at `globalshopaholics.com/.well-known/ucp`, and checkout endpoints. AP2 also needs an ECDSA signing key. Native checkout is gated through the Merchant Center integration hub | P2, publish the profile, then pilot |

**Rule for all of these:** legal items only, GS confirms before buying, and we never take card data in chat.

## Integrations with AI shopping agents (business development)

- **Agent shopping companies and agent wallets** that buy US goods but can't ship internationally, such as onaa, haggl, BuyWhere, gaisho and similar agent-commerce MCPs. Pitch GS as their *international fulfilment leg*: their agent finds the product, and our MCP quotes and ships it. Offer a referral tag (`mcp-src-<partner>`) and a revenue share.
- **Cross-border tools** (Easyship, duty calculators): co-listing, plus "powered by" rates.
- **Agent frameworks:** example recipes for LangChain, CrewAI, OpenAI Agents SDK, and Vercel AI SDK in the repo. Each gets its own PR to that framework's examples or integrations list, one at a time and only with approval.

## Weekly cadence

- **Mon:** analytics digest, covering calls, leads by source, and leads converted to paid (CCC and Waqas confirm).
- **Wed:** one content or community post, after approval.
- **Fri:** directory and status check, plus tool-description tweaks based on the queries we see.

## 30-day targets

- Listed in 10 or more directories, including ChatGPT or Claude directory submissions.
- At least 1,000 tool calls a month, 30 or more MCP leads, and 5 or more paid orders, all attributed by source.
- Crypto checkout live, and x402 or Stripe piloted on one tool.

---

## DRAFT – Show HN (do not post)

**Title:** Show HN: An MCP server that buys from any US store and ships it to you anywhere

**Body:**
We run Global Shopaholics, a US package forwarder in Delaware. Lots of US stores won't ship abroad, so people abroad use forwarders like us. We built a free, no-auth MCP server so an AI agent can do the whole thing in one conversation:

- live DHL/FedEx/UPS/USPS rates from our warehouse to any country (e.g. 5 kg to Lagos: FedEx about $175 today)
- landed cost with customs duties and VAT (estimates, sources cited)
- a "buy it for me" request for any US store. A human confirms by email before anything is bought, and nothing is charged in chat
- carrier tracking

URL: https://mcp.globalshopaholics.com/mcp (Streamable HTTP). It works in Claude, ChatGPT developer mode, Cursor, VS Code, Codex and Gemini CLI. The code is MIT on Cloudflare Workers: https://github.com/xuniwattoo/gs-mcp

Happy to answer questions about the shipping side (dim weight, duties, what can't be shipped) or the MCP side (rate limiting with a SQLite Durable Object, stateless transport).

## DRAFT – r/mcp (do not post)

**Title:** Free remote MCP: shipping rates + duties + "buy it for me" from any US store to any country

**Body:**
Built this for our forwarding business and opened it to everyone: `https://mcp.globalshopaholics.com/mcp`. No auth, Streamable HTTP.

Tools: `get_shipping_rates` (live carrier quotes), `estimate_landed_cost` (item + fee + shipping + duty/VAT), `request_assisted_purchase` (we buy it from the US store for you; a person confirms by email first), `request_shipment_quote`, `track_shipment`, `get_services_and_fees`, `get_started`.

Try it with: *"What would it cost to get a 2 kg pair of sneakers from Nike.com to Karachi, all in?"*

Repo, with install for Claude Code (`/plugin marketplace add xuniwattoo/gs-mcp`), Cursor, VS Code and Codex: https://github.com/xuniwattoo/gs-mcp. Feedback on tool descriptions is very welcome. We're trying to make agents pick the right tool without being told.

## DRAFT – X thread (do not post)

1/ Your AI agent can now buy from any US store and ship it to you, wherever you live. 🧵
2/ We just opened the Global Shopaholics MCP server. It's free, with no sign-up: https://mcp.globalshopaholics.com/mcp
3/ Ask Claude or ChatGPT: "How much to get this Amazon item to Lagos, duties included?" You get live DHL/FedEx/UPS/USPS prices plus an estimate of customs duties.
4/ Then say "buy it for me." A GS shopper confirms by email, buys it from the US store, and ships it. The fee is 0% if you pay by bank transfer or crypto, otherwise 5% with a $5 minimum.
5/ Setup takes one line. Claude Code: /plugin marketplace add xuniwattoo/gs-mcp. Cursor, VS Code, Codex, Gemini: https://github.com/xuniwattoo/gs-mcp
6/ Legal items only. Built on @Cloudflare Workers and open source (MIT). Tell us what your agent should do next.
