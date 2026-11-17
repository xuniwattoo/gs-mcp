# Connect your AI agent to Global Shopaholics (MCP)

*Suggested URL: `/mcp/` · Footer link text: "AI agents (MCP)"*

Use ChatGPT, Claude, Cursor, Grok or any AI assistant that supports the **Model Context Protocol (MCP)** to shop US stores and ship worldwide with Global Shopaholics. Your assistant can check live shipping prices, estimate duties, explain our plans and send us a buy-for-me request – right inside the chat.

**MCP server URL:** `https://mcp.globalshopaholics.com/mcp`
No login or API key needed.

## What your AI agent can do

- **Get live shipping rates** – DHL, FedEx, UPS and USPS prices and delivery times from our US warehouse to your country (same engine as our [shipping calculator](https://globalshopaholics.com/international-shipping-calculator/)).
- **Estimate the total landed cost** – item price + our Assisted Purchase fee + shipping + estimated import duty/VAT for popular destinations (estimates only; customs decides the final amount).
- **Explain our services and fees** – plans, storage, consolidation, insurance and other published fees.
- **Get you started** – how to open your free US address.
- **Request an Assisted Purchase** – send us product links and we buy them for you (we always confirm the total by email before buying).
- **Request a shipping quote** – for heavy, oversized or multi-box shipments, labels or customs paperwork.
- **Track a shipment** – direct carrier tracking links.

## Set it up

**ChatGPT** – Settings → Apps & Connectors → Advanced → turn on Developer mode → Create → paste `https://mcp.globalshopaholics.com/mcp` → No authentication.

**Claude** – Settings → Connectors → Add custom connector → paste `https://mcp.globalshopaholics.com/mcp`.

**Cursor** – add to `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "global-shopaholics": { "url": "https://mcp.globalshopaholics.com/mcp" } } }
```

**Other MCP clients** – add a remote server with Streamable HTTP transport at `https://mcp.globalshopaholics.com/mcp`.

## Try asking

- "How much does it cost to ship 5 kg from the USA to Luanda, Angola with Global Shopaholics?"
- "I want these sneakers from Nike.com delivered to Riyadh. What will it cost in total?"
- "Ask Global Shopaholics to buy this for me: <product link>, size M, ship to Lagos."

## Good to know

- Shipping prices are live but exclude customs duties and taxes; duty figures are estimates.
- Requests sent through your AI agent go to our team, who reply by email before anything is charged.
- Prefer doing it yourself? [Sign up free](https://login.globalshopaholics.com/register) or use our [Assisted Purchase page](https://globalshopaholics.com/assisted-purchase/).
- Questions: help@globalshopaholics.com
