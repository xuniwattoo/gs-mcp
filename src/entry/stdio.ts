#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "../config.js";
import { createServer } from "../server.js";

const server = createServer(loadConfig(process.env), { clientKey: "stdio" });
await server.connect(new StdioServerTransport());
