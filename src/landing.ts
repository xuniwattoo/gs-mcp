import { APPLE_TOUCH_PNG_B64, FAVICON_PNG_B64, OG_PNG_B64 } from "./assets/images.js";

/** Link-preview bots and browsers get HTML at GET /; everything else keeps the JSON status. */
const PREVIEW_UA = /facebookexternalhit|facebot|twitterbot|slackbot|linkedinbot|whatsapp|discordbot|telegrambot|applebot|imessage|skypeuripreview|redditbot|pinterest|embedly|quora link preview|vkshare|w3c_validator|googlebot|bingbot|mozilla/i;

export function wantsHtml(req: Request, url: URL): boolean {
  const fmt = url.searchParams.get("format");
  if (fmt === "json") return false;
  if (fmt === "html") return true;
  const accept = req.headers.get("accept") ?? "";
  if (/application\/json/i.test(accept) && !/text\/html/i.test(accept)) return false;
  if (/text\/html/i.test(accept)) return true;
  return PREVIEW_UA.test(req.headers.get("user-agent") ?? "");
}

/** Self origin for public URLs: always https except for local development hosts. */
export function selfOrigin(url: URL): string {
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(url.hostname) || !url.hostname.includes(".");
  return local ? url.origin : `https://${url.host}`;
}

function bytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const IMAGES: Record<string, string> = {
  "/og.png": OG_PNG_B64,
  "/apple-touch-icon.png": APPLE_TOUCH_PNG_B64,
  "/apple-touch-icon-precomposed.png": APPLE_TOUCH_PNG_B64,
  "/favicon.png": FAVICON_PNG_B64,
  "/favicon.ico": FAVICON_PNG_B64,
};

export function imageResponse(pathname: string, method: string): Response | undefined {
  const b64 = IMAGES[pathname];
  if (!b64) return undefined;
  const body = bytes(b64);
  return new Response(method === "HEAD" ? null : body, {
    headers: {
      "content-type": "image/png",
      "content-length": String(body.length),
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
    },
  });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const PAGE_TITLE = "Global Shopaholics MCP: Buy From Any US Store, Ship Worldwide";
export const SHARE_TITLE = "Buy From Any US Store, Ship Worldwide";
export const PAGE_DESCRIPTION =
  "A free MCP server for AI agents. Claude, ChatGPT, Cursor and others can quote live DHL/FedEx/UPS/USPS shipping, estimate duties, and request a buy-it-for-me order from any US store, shipped to any country.";

export function landingHtml(origin: string): string {
  const mcp = `${origin}/mcp`;
  const cursorCfg = btoa(JSON.stringify({ url: mcp }));
  const cursorLink = `https://cursor.com/en/install-mcp?name=global-shopaholics&config=${cursorCfg}`;
  const vsCfg = encodeURIComponent(JSON.stringify({ type: "http", url: mcp }));
  const vsLink = `https://vscode.dev/redirect/mcp/install?name=global-shopaholics&config=${vsCfg}`;
  const mcpb = "https://github.com/xuniwattoo/gs-mcp/releases/latest/download/global-shopaholics.mcpb";
  const og = `${origin}/og.png`;
  const snippet = (label: string, code: string) =>
    `<div class="snip"><div class="snip-h"><span>${label}</span><button class="copy" data-copy="${esc(code)}" type="button">Copy</button></div><pre><code>${esc(code)}</code></pre></div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(PAGE_TITLE)}</title>
<meta name="description" content="${esc(PAGE_DESCRIPTION)}">
<link rel="canonical" href="${origin}/">
<meta name="theme-color" content="#06205F">
<link rel="icon" type="image/png" sizes="32x32" href="${origin}/favicon.png">
<link rel="apple-touch-icon" sizes="180x180" href="${origin}/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Global Shopaholics">
<meta property="og:title" content="${esc(SHARE_TITLE)}">
<meta property="og:description" content="${esc(PAGE_DESCRIPTION)}">
<meta property="og:url" content="${origin}/">
<meta property="og:image" content="${og}">
<meta property="og:image:secure_url" content="${og}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Global Shopaholics MCP: Buy from any US store. Ship anywhere. Your AI agent can do it.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(SHARE_TITLE)}">
<meta name="twitter:description" content="${esc(PAGE_DESCRIPTION)}">
<meta name="twitter:image" content="${og}">
<style>
:root{--navy:#06205F;--green:#01A371;--ink:#0f172a;--muted:#5b6478;--line:#e3e8f2;--bg:#f6f8fc}
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--navy)}
header{background:var(--navy);color:#fff;padding:28px 20px 40px;background-image:radial-gradient(circle at 90% -10%,rgba(1,163,113,.45),transparent 55%)}
.wrap{max-width:760px;margin:0 auto}
.brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:18px}
.brand img{width:40px;height:40px;background:#fff;border-radius:10px;padding:3px}
.tag{display:inline-block;margin-left:auto;background:var(--green);color:#fff;font-size:13px;font-weight:700;padding:4px 12px;border-radius:999px}
h1{font-size:clamp(28px,6vw,44px);line-height:1.12;margin:28px 0 10px}
h1 em{font-style:normal;color:#35d69f}
.lead{font-size:18px;color:#dbe4ff;margin:0 0 22px;max-width:600px}
.url{display:flex;gap:8px;align-items:stretch;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.28);border-radius:12px;padding:6px 6px 6px 14px;max-width:560px}
.url code{flex:1;align-self:center;font:15px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#fff;word-break:break-all}
button{font:inherit;cursor:pointer}
.btn{background:var(--green);color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:700;font-size:14px}
.btn:hover{filter:brightness(1.08)}
.meta{font-size:14px;color:#b9c6ea;margin-top:10px}
main{padding:8px 20px 40px}
section{margin-top:28px}
h2{font-size:20px;margin:0 0 10px;color:var(--navy)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.card b{display:block;color:var(--navy);margin-bottom:2px}
.card span{color:var(--muted);font-size:14px}
.snip{background:#fff;border:1px solid var(--line);border-radius:12px;margin:10px 0;overflow:hidden}
.snip-h{display:flex;align-items:center;justify-content:space-between;padding:8px 10px 8px 14px;border-bottom:1px solid var(--line);font-size:14px;font-weight:600;color:var(--muted)}
.copy{background:#eef2fa;border:1px solid var(--line);border-radius:7px;padding:4px 10px;font-size:13px;color:var(--navy);font-weight:600}
pre{margin:0;padding:12px 14px;overflow-x:auto;background:#0b1530;color:#e6edff}
pre code{font:13.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre}
.buttons{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 4px}
.lbtn{display:inline-flex;align-items:center;gap:8px;text-decoration:none;background:var(--navy);color:#fff;font-weight:600;font-size:14px;padding:10px 14px;border-radius:9px}
.lbtn.alt{background:#fff;color:var(--navy);border:1px solid var(--line)}
footer{border-top:1px solid var(--line);padding:22px 20px 36px;color:var(--muted);font-size:14px}
footer a{margin-right:16px}
@media (max-width:480px){.url{flex-wrap:wrap;padding:10px}.url code{flex-basis:100%;font-size:14px;word-break:normal;overflow-wrap:anywhere}.url .btn{width:100%;padding:10px}header{padding-bottom:32px}}
</style>
</head>
<body>
<header><div class="wrap">
<div class="brand"><img src="${origin}/apple-touch-icon.png" alt="" width="40" height="40">Global Shopaholics <span class="tag">MCP server</span></div>
<h1>Buy from any US store.<br><em>Ship anywhere.</em> Your AI agent can do it.</h1>
<p class="lead">A free, public MCP server. It lets Claude, ChatGPT, Cursor and other AI agents quote live international shipping, estimate customs duties, and request a buy-it-for-me order from any US store, then ship it to almost any country through Global Shopaholics.</p>
<div class="url"><code id="mcp-url">${esc(mcp)}</code><button class="btn copy-main" data-copy="${esc(mcp)}" type="button">Copy</button></div>
<div class="meta">Streamable HTTP · no sign-up · no API key</div>
</div></header>
<main><div class="wrap">
<section>
<h2>What your agent can do</h2>
<div class="grid">
<div class="card"><b>Live shipping rates</b><span>DHL, FedEx, UPS and USPS from our Delaware warehouse to any country.</span></div>
<div class="card"><b>Landed cost</b><span>Item, shipping and estimated duties and import taxes in one total.</span></div>
<div class="card"><b>Buy it for me</b><span>Send a purchase request for any US store. Our team confirms by email before buying.</span></div>
<div class="card"><b>Tracking</b><span>Carrier tracking links for shipments on their way.</span></div>
</div>
</section>
<section>
<h2>Install</h2>
<div class="buttons">
<a class="lbtn" href="${esc(cursorLink)}">Add to Cursor</a>
<a class="lbtn" href="${esc(vsLink)}">Add to VS Code</a>
<a class="lbtn alt" href="${mcpb}">Claude Desktop (.mcpb)</a>
</div>
${snippet("Claude Code plugin", "/plugin marketplace add xuniwattoo/gs-mcp\n/plugin install global-shopaholics@global-shopaholics")}
${snippet("Claude Code (server only)", `claude mcp add --transport http global-shopaholics ${mcp}`)}
${snippet("Codex", `codex mcp add global-shopaholics --url ${mcp}`)}
${snippet("Any MCP client (JSON config)", JSON.stringify({ mcpServers: { "global-shopaholics": { url: mcp } } }, null, 2))}
<p style="font-size:14px;color:var(--muted)">For ChatGPT, Claude.ai, Windsurf, Gemini CLI and Cline, see the <a href="https://github.com/xuniwattoo/gs-mcp#connect-an-ai-agent">setup guide</a>.</p>
</section>
</div></main>
<footer><div class="wrap">
<a href="https://globalshopaholics.com/mcp/">Docs</a><a href="https://github.com/xuniwattoo/gs-mcp">GitHub</a><a href="https://globalshopaholics.com/">globalshopaholics.com</a><a href="${origin}/?format=json">Status (JSON)</a>
<p>Legal items only. Global Shopaholics is a US package forwarder and personal shopper.</p>
</div></footer>
<script>
document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;var t=b.getAttribute("data-copy"),o=b.textContent;function ok(){b.textContent="Copied";setTimeout(function(){b.textContent=o},1500)}
if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t).then(ok,fallback)}else fallback();
function fallback(){var a=document.createElement("textarea");a.value=t;a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();try{document.execCommand("copy");ok()}catch(_){}document.body.removeChild(a)}});
</script>
</body>
</html>`;
}

export function landingResponse(origin: string, method: string): Response {
  const html = landingHtml(origin);
  return new Response(method === "HEAD" ? null : html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      vary: "Accept, User-Agent",
      "x-content-type-options": "nosniff",
    },
  });
}
