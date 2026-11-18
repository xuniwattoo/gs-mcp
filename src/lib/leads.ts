import type { Config } from "../config.js";
import { GS_CONTACT, GS_URLS } from "../data/gs.js";

export type LeadKind = "assisted_purchase" | "shipment_quote" | "us_domestic";
export const LEAD_TAGS: Record<LeadKind, string> = {
  assisted_purchase: "mcp-assisted-purchase",
  shipment_quote: "mcp-shipping-request",
  us_domestic: "mcp-us-domestic",
};

export interface Lead {
  kind: LeadKind;
  name: string;
  email: string;
  phone?: string;
  destination_country: string;
  destination_city?: string;
  details: Record<string, unknown>;
  summary: string;
  extraTags?: string[];
}

export interface SinkResult { sink: "gohighlevel" | "webhook"; ok: boolean; id?: string; error?: string }

export function makeReference(kind: LeadKind, now = Date.now()): string {
  const prefix = kind === "assisted_purchase" ? "AP" : kind === "us_domestic" ? "US" : "SQ";
  const rand = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `GSMCP-${prefix}-${now.toString(36).toUpperCase()}-${rand}`;
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? name, lastName: parts.slice(1).join(" ") || undefined };
}

async function sendGhl(lead: Lead, ref: string, cfg: Config, f: typeof fetch): Promise<SinkResult> {
  const headers = {
    authorization: `Bearer ${cfg.ghlApiToken}`,
    version: "2021-07-28",
    "content-type": "application/json",
    accept: "application/json",
  };
  try {
    const up = await f(`${cfg.ghlApiBase}/contacts/upsert`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        locationId: cfg.ghlLocationId,
        ...splitName(lead.name),
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        country: lead.destination_country,
        city: lead.destination_city,
        source: "GS MCP connector",
      }),
    });
    if (!up.ok) return { sink: "gohighlevel", ok: false, error: `upsert HTTP ${up.status}` };
    const data: any = await up.json();
    const id: string | undefined = data?.contact?.id ?? data?.id;
    if (!id) return { sink: "gohighlevel", ok: false, error: "upsert returned no contact id" };
    const tag = await f(`${cfg.ghlApiBase}/contacts/${id}/tags`, { method: "POST", headers, body: JSON.stringify({ tags: [LEAD_TAGS[lead.kind], ...(lead.extraTags ?? [])] }) });
    const note = await f(`${cfg.ghlApiBase}/contacts/${id}/notes`, { method: "POST", headers, body: JSON.stringify({ body: `[${ref}] ${lead.summary}` }) });
    const err = [!tag.ok && `tag HTTP ${tag.status}`, !note.ok && `note HTTP ${note.status}`].filter(Boolean).join(", ");
    return { sink: "gohighlevel", ok: true, id, error: err || undefined };
  } catch (e: any) {
    return { sink: "gohighlevel", ok: false, error: e?.message ?? String(e) };
  }
}

async function hmacHex(secret: string, body: string) {
  const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendWebhook(lead: Lead, ref: string, cfg: Config, f: typeof fetch): Promise<SinkResult> {
  const body = JSON.stringify({ reference: ref, tag: LEAD_TAGS[lead.kind], submitted_at: new Date().toISOString(), ...lead });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.leadWebhookSecret) headers["x-gs-signature"] = `sha256=${await hmacHex(cfg.leadWebhookSecret, body)}`;
  try {
    const res = await f(cfg.leadWebhookUrl!, { method: "POST", headers, body });
    return { sink: "webhook", ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e: any) {
    return { sink: "webhook", ok: false, error: e?.message ?? String(e) };
  }
}

export async function submitLead(lead: Lead, cfg: Config, f: typeof fetch = fetch) {
  const reference = makeReference(lead.kind);
  const results: SinkResult[] = [];
  if (cfg.ghlApiToken && cfg.ghlLocationId) results.push(await sendGhl(lead, reference, cfg, f));
  if (cfg.leadWebhookUrl) results.push(await sendWebhook(lead, reference, cfg, f));
  const delivered = results.some((r) => r.ok);
  const pageUrl = lead.kind === "assisted_purchase" || lead.kind === "us_domestic" ? GS_URLS.assistedPurchase : GS_URLS.calculator;
  const mailto = `mailto:${GS_CONTACT.email}?subject=${encodeURIComponent(`${lead.kind === "assisted_purchase" ? "Assisted Purchase request" : lead.kind === "us_domestic" ? "US purchase request" : "Shipment quote request"} ${reference}`)}&body=${encodeURIComponent(lead.summary)}`;
  return {
    reference_id: reference,
    status: delivered ? "submitted" : "not_submitted",
    delivered_to: results.filter((r) => r.ok).map((r) => r.sink),
    sink_errors: results.filter((r) => !r.ok || r.error).map((r) => `${r.sink}: ${r.error}`),
    fallback: delivered ? undefined : {
      message: "This server could not hand the request to GS automatically. Ask the user to submit it on GS's own page or email it (prefilled link below).",
      request_page: pageUrl,
      signup: GS_URLS.signup,
      email_link: mailto,
      email: GS_CONTACT.email,
    },
    summary: lead.summary,
  };
}

/** Best-effort: tag + note the contact in GHL when a crypto invoice is created. Never throws. */
export async function logCryptoInvoiceGhl(email: string, note: string, cfg: Config, f: typeof fetch = fetch): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.ghlApiToken || !cfg.ghlLocationId) return { ok: false, error: "ghl not configured" };
  const headers = { authorization: `Bearer ${cfg.ghlApiToken}`, version: "2021-07-28", "content-type": "application/json", accept: "application/json" };
  try {
    const up = await f(`${cfg.ghlApiBase}/contacts/upsert`, { method: "POST", headers, body: JSON.stringify({ locationId: cfg.ghlLocationId, email, source: "GS MCP connector" }) });
    if (!up.ok) return { ok: false, error: `upsert HTTP ${up.status}` };
    const data: any = await up.json();
    const id: string | undefined = data?.contact?.id ?? data?.id;
    if (!id) return { ok: false, error: "no contact id" };
    await f(`${cfg.ghlApiBase}/contacts/${id}/tags`, { method: "POST", headers, body: JSON.stringify({ tags: ["mcp-crypto-payment"] }) });
    await f(`${cfg.ghlApiBase}/contacts/${id}/notes`, { method: "POST", headers, body: JSON.stringify({ body: note }) });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
