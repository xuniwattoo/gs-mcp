import { mkdirSync, writeFileSync } from "node:fs";
import { aiCatalog, LLMS_TXT, serverCard } from "../src/discovery.js";

/** Writes the discovery files SEO Master publishes on globalshopaholics.com. Run: npx tsx scripts/gen-site-files.ts */
mkdirSync("site-files/.well-known/mcp", { recursive: true });
writeFileSync("site-files/llms.txt", LLMS_TXT);
const card = JSON.stringify(serverCard(), null, 2) + "\n";
writeFileSync("site-files/mcp-server-card.json", card);
writeFileSync("site-files/.well-known/mcp/server-card.json", card);
writeFileSync("site-files/.well-known/ai-catalog.json", JSON.stringify(aiCatalog(), null, 2) + "\n");
console.log("site-files written");
