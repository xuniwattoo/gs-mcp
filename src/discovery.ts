import { SERVER_VERSION } from "./server.js";

/** Public discovery documents served by the Worker (and copied to /site-files for globalshopaholics.com). */
export const PUBLIC_MCP_URL = "https://mcp.globalshopaholics.com/mcp";
export const REGISTRY_NAME = "io.github.xuniwattoo/gs-mcp";
export const ICON_URL = "https://globalshopaholics.com/wp-content/uploads/2026/09/cropped-Favicon-192x192.png";
export const SHORT_DESCRIPTION = "Buy from any US store for you: ship worldwide or in the US, find it cheaper, pay in crypto.";

export function serverCard(mcpUrl = PUBLIC_MCP_URL) {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: REGISTRY_NAME,
    version: SERVER_VERSION,
    title: "Global Shopaholics",
    description: SHORT_DESCRIPTION,
    websiteUrl: "https://globalshopaholics.com/mcp/",
    repository: { url: "https://github.com/xuniwattoo/gs-mcp", source: "github" },
    icons: [{ src: ICON_URL, mimeType: "image/png", sizes: ["192x192"] }],
    remotes: [{ type: "streamable-http", url: mcpUrl, supportedProtocolVersions: ["2025-06-18", "2025-11-25"] }],
  };
}

export function aiCatalog(cardUrl = `${PUBLIC_MCP_URL}/server-card`) {
  return {
    specVersion: "1.0",
    entries: [
      {
        identifier: "urn:air:globalshopaholics.com:mcp:gs-mcp",
        type: "application/mcp-server-card+json",
        url: cardUrl,
      },
    ],
  };
}

export const LLMS_TXT = `# Global Shopaholics

> Global Shopaholics (GS) is a US package forwarding and assisted-purchase (personal shopper) service. People in any country can buy from any US online store and have it shipped worldwide with DHL, FedEx, UPS or USPS. AI agents can use the free public GS MCP server to quote shipping, estimate customs duties and taxes, and send "buy it for me" requests. Legal items only.

## MCP server (for AI agents)

- Endpoint (Streamable HTTP, no sign-up, no auth): ${PUBLIC_MCP_URL}
- Server card: ${PUBLIC_MCP_URL}/server-card
- Source and install guides: https://github.com/xuniwattoo/gs-mcp
- Overview page: https://globalshopaholics.com/mcp/

Use it when a user wants to buy something from a US store and get it delivered abroad, wants GS to buy something for them inside the US ("buy this for me", "find this cheaper", Hawaii/Alaska/Puerto Rico/APO delivery, stores that won't ship to them), wants to pay with crypto or stablecoins, asks what shipping from the USA to their country costs, or asks about customs duties or import tax on a US order.

Tools:
- get_shipping_rates: live DHL/FedEx/UPS/USPS prices and transit times from the GS Delaware warehouse to any country.
- estimate_landed_cost: item + GS fee + shipping + estimated duties/VAT (labelled estimates).
- get_services_and_fees: plans and published fees.
- get_started: how to get a free US shipping address.
- request_assisted_purchase: ask GS to buy from a US store for the user (GS confirms the total by email; nothing is charged in chat).
- request_us_purchase: US domestic buy-for-me: GS buys from any US store and ships to a US address (incl. HI, AK, PR, APO/FPO); optional lower-price search (other stores, coupons, price match, outlet; savings not guaranteed). Only ship-to state and ZIP needed; GS confirms the total by email.
- request_shipment_quote: custom quotes for heavy/oversize items, freight or customs paperwork.
- create_crypto_payment: crypto checkout (Bitcoin, Lightning, stablecoins) for an amount GS has quoted; 0% GS fee. Returns a checkout link.
- get_crypto_payment_status: status of a crypto invoice by id.
- track_shipment: carrier tracking links.

Fees: Assisted Purchase is 0% when paid by bank transfer or crypto, otherwise 5% with a $5 minimum. Payment is by emailed invoice, not inside the chat.

## Key pages

- [How it works](https://globalshopaholics.com/how-it-works/)
- [Shipping calculator](https://globalshopaholics.com/international-shipping-calculator/)
- [Assisted Purchase](https://globalshopaholics.com/assisted-purchase/)
- [Plans](https://globalshopaholics.com/subscription-plan/)
- [FAQs](https://globalshopaholics.com/faqs/)
- [Sign up (free US address)](https://login.globalshopaholics.com/register)
- [Contact](https://globalshopaholics.com/contact-us/): help@globalshopaholics.com, +1 302 725 0586
`;

const corsJson = { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" };

/** Returns a Response for discovery paths, or undefined. */
export function discoveryResponse(pathname: string, origin: string, env: Record<string, string | undefined> = {}): Response | undefined {
  const mcpUrl = origin.includes("workers.dev") || origin.includes("localhost") || origin.includes("127.0.0.1") ? `${origin}/mcp` : PUBLIC_MCP_URL;
  switch (pathname) {
    case "/mcp/server-card":
    case "/server-card":
    case "/.well-known/mcp/server-card.json":
    case "/.well-known/mcp/server-card":
      return new Response(JSON.stringify(serverCard(mcpUrl), null, 2), { headers: { ...corsJson, "content-type": "application/mcp-server-card+json" } });
    case "/.well-known/ai-catalog.json":
    case "/.well-known/mcp/catalog.json":
      return new Response(JSON.stringify(aiCatalog(`${mcpUrl}/server-card`), null, 2), { headers: { ...corsJson, "content-type": "application/ai-catalog+json" } });
    case "/llms.txt":
      return new Response(LLMS_TXT, { headers: { ...corsJson, "content-type": "text/plain; charset=utf-8" } });
    case "/.well-known/openai-apps-challenge": {
      const token = env.OPENAI_APPS_CHALLENGE?.trim();
      return token ? new Response(token, { headers: { "content-type": "text/plain; charset=utf-8" } }) : new Response("Not found", { status: 404 });
    }
    default:
      return undefined;
  }
}
