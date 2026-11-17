/**
 * Global Shopaholics Claude Desktop extension: a tiny stdio <-> Streamable HTTP relay.
 * Claude Desktop talks stdio to this process; every JSON-RPC message is forwarded to the
 * public remote server and responses are relayed back. No credentials, no local state.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.GS_MCP_URL || "https://mcp.globalshopaholics.com/mcp");
const local = new StdioServerTransport();
const remote = new StreamableHTTPClientTransport(url, { requestInit: { headers: { "user-agent": "GlobalShopaholics-MCPB/1.0" } } });

local.onmessage = (msg) => {
  remote.send(msg).catch((e) => {
    const id = (msg as { id?: string | number }).id;
    if (id !== undefined) void local.send({ jsonrpc: "2.0", id, error: { code: -32603, message: `Global Shopaholics server unreachable: ${e?.message ?? e}` } });
  });
};
remote.onmessage = (msg) => void local.send(msg);
remote.onerror = (e) => process.stderr.write(`[gs-mcpb] remote error: ${e?.message ?? e}\n`);
local.onclose = () => void remote.close().then(() => process.exit(0));

await remote.start();
await local.start();
