# Installing the Global Shopaholics MCP server (for AI agents such as Cline)

This is a **hosted, remote** MCP server. Nothing needs to be cloned, built or run locally, and no API key is needed.

- Transport: Streamable HTTP
- URL: `https://mcp.globalshopaholics.com/mcp`
- Auth: none

## Cline

Add this to `cline_mcp_settings.json` (Cline → MCP Servers → Configure → "Configure MCP Servers"):

```json
{
  "mcpServers": {
    "global-shopaholics": {
      "type": "streamableHttp",
      "url": "https://mcp.globalshopaholics.com/mcp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

If the client only supports stdio, use the `mcp-remote` bridge instead:

```json
{
  "mcpServers": {
    "global-shopaholics": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.globalshopaholics.com/mcp"]
    }
  }
}
```

## Verify

Call `get_shipping_rates` with `{"country": "NG", "weight": 5, "unit": "kg"}`. You should get live DHL/FedEx/UPS/USPS prices from the Global Shopaholics Delaware warehouse.

## Tools

`get_shipping_rates`, `estimate_landed_cost`, `get_services_and_fees`, `get_started`, `request_assisted_purchase`, `request_shipment_quote`, `track_shipment`. The two `request_*` tools send a request to the Global Shopaholics team, who confirm by email before anything is bought. Nothing is charged in chat.
