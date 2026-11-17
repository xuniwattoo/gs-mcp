import type { LimitResult, Limiter, LimiterConfig } from "./ratelimit.js";
import { utcDayKey } from "./ratelimit.js";

export interface DurableObjectId {
  toString(): string;
}
export interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
  getByName?(name: string): DurableObjectStub;
}

const HOUR_MS = 60 * 60 * 1000;
const RETENTION_MS = 48 * 60 * 60 * 1000;

type Op = "checkLead" | "checkRate" | "status";
export interface LimiterRequest {
  op: Op;
  ip?: string;
  email?: string;
  limits?: LimiterConfig;
  now?: number;
}

/** Minimal SQL surface used by the limiter (Workers SqlStorage or the test stand-in). */
export interface LimiterSql {
  exec(query: string, ...bindings: unknown[]): { one(): unknown; toArray(): unknown[] };
}

export function ensureLimiterSchema(sql: LimiterSql): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, t INTEGER NOT NULL)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS hits_k_t ON hits(k, t)`);
}

function count(sql: LimiterSql, key: string, since: number): number {
  const cursor = sql.exec(`SELECT COUNT(*) AS n FROM hits WHERE k = ? AND t > ?`, key, since);
  const row = (typeof cursor.one === "function" ? cursor.one() : cursor.toArray()[0]) as { n?: number | string } | undefined;
  return Number(row?.n ?? 0);
}

function oldestTs(sql: LimiterSql, key: string, since: number): number | undefined {
  const cursor = sql.exec(`SELECT t FROM hits WHERE k = ? AND t > ? ORDER BY t ASC LIMIT 1`, key, since);
  const row = (typeof cursor.one === "function" ? cursor.one() : cursor.toArray()[0]) as { t?: number } | undefined;
  return row?.t;
}

function add(sql: LimiterSql, key: string, now: number): void {
  sql.exec(`INSERT INTO hits (k, t) VALUES (?, ?)`, key, now);
}

export function applyLimiterOp(sql: LimiterSql, body: LimiterRequest): LimitResult | { ok: true; rows: number; distinct_keys?: number; by_prefix?: Record<string, number>; key_shapes?: string[] } {
  const now = body.now ?? Date.now();
  sql.exec(`DELETE FROM hits WHERE t < ?`, now - RETENTION_MS);
  if (body.op === "status") {
    const row = sql.exec(`SELECT COUNT(*) AS n FROM hits`).one() as { n?: number } | undefined;
    const groups = (sql.exec(`SELECT k, COUNT(*) AS n FROM hits GROUP BY k`).toArray?.() ?? []) as { k?: string; n?: number }[];
    const by_prefix: Record<string, number> = {};
    const key_shapes: string[] = [];
    for (const g of groups) {
      const k = String(g.k ?? "");
      const parts = k.split(":");
      const prefix = parts.slice(0, 2).join(":") || "unknown";
      by_prefix[prefix] = (by_prefix[prefix] ?? 0) + Number(g.n ?? 0);
      key_shapes.push(`${prefix}:n=${Number(g.n ?? 0)}:restLen=${parts.slice(2).join(":").length}`);
    }
    return { ok: true, rows: Number(row?.n ?? 0), distinct_keys: groups.length, by_prefix, key_shapes: key_shapes.slice(0, 20) };
  }
  const limits = body.limits;
  if (!limits) return { ok: false, retryAfterSec: 60, reason: body.op === "checkRate" ? "rate" : "ip" };
  if (body.op === "checkRate") return checkRate(sql, body.ip ?? "unknown", limits, now);
  return checkLead(sql, body.ip ?? "unknown", body.email ?? "", limits, now);
}

function checkLead(sql: LimiterSql, ip: string, email: string, limits: LimiterConfig, now: number): LimitResult {
  const day = utcDayKey(now);
  const emailKey = `lead:email:${email.trim().toLowerCase()}:${day}`;
  const globalKey = `lead:global:${day}`;
  const ipKey = `lead:ip:${ip}`;
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  const endOfDaySec = Math.max(1, Math.ceil((dayStart + 24 * 60 * 60 * 1000 - now) / 1000));

  if (count(sql, emailKey, dayStart - 1) >= limits.leadPerEmailPerDay) {
    return { ok: false, retryAfterSec: endOfDaySec, reason: "email" };
  }
  if (count(sql, globalKey, dayStart - 1) >= limits.leadDailyCap) {
    return { ok: false, retryAfterSec: endOfDaySec, reason: "global" };
  }
  if (count(sql, ipKey, now - HOUR_MS) >= limits.leadPerIpPerHour) {
    const oldest = oldestTs(sql, ipKey, now - HOUR_MS);
    const retryAfterSec = Math.max(1, Math.ceil((HOUR_MS - (now - (oldest ?? now))) / 1000));
    return { ok: false, retryAfterSec, reason: "ip" };
  }

  add(sql, emailKey, now);
  add(sql, globalKey, now);
  add(sql, ipKey, now);
  return { ok: true, retryAfterSec: 0 };
}

function checkRate(sql: LimiterSql, ip: string, limits: LimiterConfig, now: number): LimitResult {
  const ipKey = `rate:ip:${ip}`;
  const n = count(sql, ipKey, now - HOUR_MS);
  if (n >= limits.ratePerIpPerHour) {
    const oldest = oldestTs(sql, ipKey, now - HOUR_MS);
    const retryAfterSec = Math.max(1, Math.ceil((HOUR_MS - (now - (oldest ?? now))) / 1000));
    return { ok: false, retryAfterSec, reason: "rate" };
  }
  add(sql, ipKey, now);
  return { ok: true, retryAfterSec: 0 };
}

/**
 * SQLite-backed Durable Object (Workers free plan: new_sqlite_classes).
 * One instance ("global") so the daily lead cap is strongly consistent.
 * Plain class (no cloudflare:workers import) so unit tests can load this file in Node.
 */
export class LimiterDO {
  private sql: LimiterSql;
  constructor(ctx: { storage: { sql: LimiterSql } }, _env: unknown) {
    this.sql = ctx.storage.sql;
    ensureLimiterSchema(this.sql);
  }

  async fetch(request: Request): Promise<Response> {
    let body: LimiterRequest;
    try {
      body = (await request.json()) as LimiterRequest;
    } catch {
      return Response.json({ ok: false, retryAfterSec: 60, reason: "ip" } satisfies LimitResult, { status: 400 });
    }
    try {
      return Response.json(applyLimiterOp(this.sql, body));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ ok: false, retryAfterSec: 60, reason: "ip", error: message }, { status: 500 });
    }
  }
}

/** Worker-side client: one RPC per check to the singleton DO. */
export class DurableLimiter implements Limiter {
  constructor(
    private binding: DurableObjectNamespace,
    private limits: LimiterConfig,
  ) {}

  private stub() {
    if (typeof this.binding.getByName === "function") return this.binding.getByName("global");
    return this.binding.get(this.binding.idFromName("global"));
  }

  private async rpc(op: Op, body: { ip?: string; email?: string } = {}): Promise<Record<string, unknown>> {
    const res = await this.stub().fetch(new Request("https://limiter/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op, limits: this.limits, ...body }),
    }));
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : `limiter HTTP ${res.status}`);
    }
    return data;
  }

  async checkLead(input: { ip: string; email: string }): Promise<LimitResult> {
    const data = await this.rpc("checkLead", input);
    return { ok: !!data.ok, retryAfterSec: Number(data.retryAfterSec ?? 60), reason: data.reason as LimitResult["reason"] };
  }

  async checkRate(input: { ip: string }): Promise<LimitResult> {
    const data = await this.rpc("checkRate", input);
    return { ok: !!data.ok, retryAfterSec: Number(data.retryAfterSec ?? 60), reason: data.ok ? undefined : "rate" };
  }

  async status(): Promise<{ ok: true; rows: number; distinct_keys?: number; by_prefix?: Record<string, number>; key_shapes?: string[] } | { ok: false; error: string }> {
    try {
      const data = await this.rpc("status");
      return {
        ok: true,
        rows: Number(data.rows ?? 0),
        distinct_keys: typeof data.distinct_keys === "number" ? data.distinct_keys : undefined,
        by_prefix: (data.by_prefix as Record<string, number> | undefined),
        key_shapes: data.key_shapes as string[] | undefined,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
