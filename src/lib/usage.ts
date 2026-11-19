/**
 * Privacy-light usage counters. One KV key per UTC day holding aggregate counts only.
 * Never stores IPs, emails, tool arguments or any request payload beyond method / tool name / clientInfo.
 */
export interface UsageEvent {
  method: string;
  tool?: string;
  clientName?: string;
  clientVersion?: string;
  ua: string;
  country: string;
  ok: boolean;
}
export type Counts = Record<string, number>;

const clean = (s: unknown, max = 40) => (typeof s === "string" ? s.replace(/[^\w .@/+-]/g, "").slice(0, max).trim() : "") || "unknown";

export function uaFamily(ua: string | null | undefined): string {
  const u = (ua ?? "").toLowerCase();
  if (!u) return "none";
  const table: [string, string][] = [
    ["claude", "claude"], ["anthropic", "claude"], ["chatgpt", "openai"], ["openai", "openai"], ["cursor", "cursor"],
    ["vscode", "vscode"], ["node", "node"], ["undici", "node"], ["python", "python"], ["httpx", "python"], ["aiohttp", "python"],
    ["curl", "curl"], ["postman", "postman"], ["go-http", "go"], ["java", "java"], ["okhttp", "java"],
    ["googlebot", "bot"], ["bot", "bot"], ["spider", "bot"], ["crawl", "bot"],
    ["firefox", "browser"], ["chrome", "browser"], ["safari", "browser"], ["mozilla", "browser"],
  ];
  for (const [k, v] of table) if (u.includes(k)) return v;
  return "other";
}

/** Extract only non-personal fields from one JSON-RPC message. */
export function describeMessage(msg: any): Pick<UsageEvent, "method" | "tool" | "clientName" | "clientVersion"> {
  const method = clean(msg?.method, 60);
  const out: ReturnType<typeof describeMessage> = { method };
  if (msg?.method === "tools/call") out.tool = clean(msg?.params?.name, 60);
  if (msg?.method === "initialize") {
    out.clientName = clean(msg?.params?.clientInfo?.name);
    out.clientVersion = clean(msg?.params?.clientInfo?.version, 20);
  }
  return out;
}

export function responseOk(body: any): boolean {
  const items = Array.isArray(body) ? body : [body];
  return !items.some((b) => b?.error || b?.result?.isError === true);
}

export const dayKey = (d = new Date()) => `d:${d.toISOString().slice(0, 10)}`;

export function applyEvent(counts: Counts, e: UsageEvent): Counts {
  const inc = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  inc("total");
  inc(`method:${e.method}`);
  if (e.tool) inc(`tool:${e.tool}`);
  if (e.clientName) inc(`client:${e.clientName}${e.clientVersion && e.clientVersion !== "unknown" ? " " + e.clientVersion : ""}`);
  inc(`ua:${e.ua}`);
  inc(`country:${e.country}`);
  inc(e.ok ? "ok" : "error");
  return counts;
}

export interface UsageStore {
  /** Atomically add 1 to each key for the given UTC day (YYYY-MM-DD). */
  increment(day: string, keys: Counts): Promise<void>;
  read(days: string[]): Promise<Record<string, Counts>>;
}

/** Record a batch of events with a single store call. Never throws. */
export async function recordUsage(store: UsageStore | undefined, events: UsageEvent[], now = new Date()): Promise<void> {
  if (!store || !events.length) return;
  try {
    const counts: Counts = {};
    for (const e of events) applyEvent(counts, e);
    await store.increment(dayKey(now).slice(2), counts);
  } catch {
    /* storage failure must never affect the MCP */
  }
}

export async function readStats(store: UsageStore, days: number, now = new Date()) {
  const n = Math.min(Math.max(Math.floor(days) || 7, 1), 90);
  const list = Array.from({ length: n }, (_, i) => dayKey(new Date(now.getTime() - i * 86400000)).slice(2));
  const perDay = await store.read(list);
  const totals: Counts = {};
  for (const d of list) for (const [k, v] of Object.entries(perDay[d] ?? {})) totals[k] = (totals[k] ?? 0) + v;
  return { days: n, since_utc: list[list.length - 1], totals, per_day: Object.fromEntries(list.map((d) => [d, perDay[d] ?? {}])), note: "Counts start 2026-11-19; days are UTC; no IPs or arguments stored." };
}

export function timingSafeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
