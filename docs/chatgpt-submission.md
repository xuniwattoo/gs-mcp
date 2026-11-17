# ChatGPT / Codex plugin directory: submission checklist

Package: `plugins/openai/global-shopaholics` (Codex format; ZIP attached to the GitHub release as `global-shopaholics-openai-plugin.zip`, or build with `npm run openai:zip`).
Server is already compatible: public HTTPS, no auth, every tool has a title and explicit `readOnlyHint` / `destructiveHint` / `openWorldHint`.

Only a GS person can do these:

1. **Publish a privacy policy** at `https://globalshopaholics.com/privacy-policy/` (today that URL redirects to the return policy). Required by the directory and referenced by the plugin and the .mcpb. It must cover what the MCP collects (name, email, phone, destination, product links sent to GS/GoHighLevel).
2. **OpenAI platform account** (platform.openai.com) for GS, with an organization. Complete **business verification** in Organization settings → Verification so the listing shows "Global Shopaholics". The owner submits (or grant "Apps Management Write").
3. Open **Plugins** (platform.openai.com → Plugins) → *Upload new or existing plugin* → choose the verified identity → upload the ZIP.
4. **MCPs → Connect**: URL `https://mcp.globalshopaholics.com/mcp`, authentication *None*. For **domain verification** the portal shows a token: send it to the bot (or run `npx wrangler secret put OPENAI_APPS_CHALLENGE` in the account bd278…); the Worker then serves it at `https://mcp.globalshopaholics.com/.well-known/openai-apps-challenge`.
5. Wait for the tool scan; fix findings (send them to the bot).
6. **Review details**: no reviewer credentials needed (no login). Test cases (5 positive, 3 negative) and release notes are pre-filled from the ZIP. Record a short **video walkthrough** of the 5 positive prompts in ChatGPT developer mode and paste its URL.
7. Decide the **commerce** answer: the ZIP says `commerce: false` (GS takes no payment in chat; it emails an invoice). Change it if OpenAI's form says purchase requests count.
8. Submit for review, accept the attestations, then **Publish** after approval.
