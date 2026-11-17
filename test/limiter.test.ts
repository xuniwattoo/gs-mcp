import { describe, expect, it } from "vitest";
import { MemoryLimiter, RateLimiter, defaultLimiterConfig, leadLimitMessage, utcDayKey } from "../src/lib/ratelimit.js";
import { applyLimiterOp, ensureLimiterSchema, type LimiterRequest } from "../src/lib/limiter-do.js";

describe("RateLimiter (sliding window primitive)", () => {
  it("limits per key", () => {
    const l = new RateLimiter(2, 1000);
    expect(l.check("a", 0).ok).toBe(true);
    expect(l.check("a", 1).ok).toBe(true);
    expect(l.check("a", 2).ok).toBe(false);
    expect(l.check("b", 2).ok).toBe(true);
    expect(l.check("a", 1500).ok).toBe(true);
  });
  it("peek does not consume a slot", () => {
    const l = new RateLimiter(1, 1000);
    expect(l.peek("a", 0).ok).toBe(true);
    expect(l.peek("a", 0).ok).toBe(true);
    expect(l.check("a", 0).ok).toBe(true);
    expect(l.peek("a", 1).ok).toBe(false);
  });
});

describe("MemoryLimiter (lead + rate caps)", () => {
  const cfg = defaultLimiterConfig({ leadPerIpPerHour: 2, leadPerEmailPerDay: 2, leadDailyCap: 3, ratePerIpPerHour: 2 });
  const t0 = Date.parse("2026-11-17T12:00:00.000Z");

  it("enforces per-IP hourly lead limit without consuming email/global when IP is already blocked", async () => {
    const l = new MemoryLimiter(cfg);
    expect((await l.checkLead({ ip: "1.1.1.1", email: "a@x.com" }, t0)).ok).toBe(true);
    expect((await l.checkLead({ ip: "1.1.1.1", email: "b@x.com" }, t0 + 1)).ok).toBe(true);
    const blocked = await l.checkLead({ ip: "1.1.1.1", email: "c@x.com" }, t0 + 2);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("ip");
    // A different IP can still use the same unused email and the remaining global slot.
    expect((await l.checkLead({ ip: "2.2.2.2", email: "c@x.com" }, t0 + 3)).ok).toBe(true);
  });

  it("enforces per-email daily limit (lowercased, trimmed) and does not increment IP on failure", async () => {
    const l = new MemoryLimiter(cfg);
    expect((await l.checkLead({ ip: "9.9.9.9", email: "  User@Example.COM " }, t0)).ok).toBe(true);
    expect((await l.checkLead({ ip: "9.9.9.9", email: "user@example.com" }, t0 + 1)).ok).toBe(true);
    const blocked = await l.checkLead({ ip: "8.8.8.8", email: "USER@example.com" }, t0 + 2);
    expect(blocked).toMatchObject({ ok: false, reason: "email" });
    // Same IP still has its second hourly slot (the failed email check did not consume it).
    expect((await l.checkLead({ ip: "8.8.8.8", email: "other@example.com" }, t0 + 3)).ok).toBe(true);
  });

  it("enforces a global daily cap", async () => {
    const l = new MemoryLimiter(defaultLimiterConfig({ leadPerIpPerHour: 10, leadPerEmailPerDay: 10, leadDailyCap: 2, ratePerIpPerHour: 30 }));
    expect((await l.checkLead({ ip: "1.1.1.1", email: "a@x.com" }, t0)).ok).toBe(true);
    expect((await l.checkLead({ ip: "2.2.2.2", email: "b@x.com" }, t0 + 1)).ok).toBe(true);
    const blocked = await l.checkLead({ ip: "3.3.3.3", email: "c@x.com" }, t0 + 2);
    expect(blocked).toMatchObject({ ok: false, reason: "global" });
    // Next UTC day resets the cap.
    const next = Date.parse("2026-11-18T00:00:00.000Z");
    expect((await l.checkLead({ ip: "3.3.3.3", email: "c@x.com" }, next)).ok).toBe(true);
  });

  it("caps rate-tool calls per IP", async () => {
    const l = new MemoryLimiter(cfg);
    expect((await l.checkRate({ ip: "5.5.5.5" }, t0)).ok).toBe(true);
    expect((await l.checkRate({ ip: "5.5.5.5" }, t0 + 1)).ok).toBe(true);
    expect((await l.checkRate({ ip: "5.5.5.5" }, t0 + 2))).toMatchObject({ ok: false, reason: "rate" });
    expect((await l.checkRate({ ip: "6.6.6.6" }, t0 + 2)).ok).toBe(true);
  });

  it("describes the fallback for agents", () => {
    const msg = leadLimitMessage({ ok: false, retryAfterSec: 30, reason: "ip" }, "https://globalshopaholics.com/assisted-purchase/", "help@globalshopaholics.com");
    expect(msg).toMatch(/help@globalshopaholics.com/);
    expect(msg).toMatch(/assisted-purchase/);
    expect(msg).toMatch(/30s/);
  });

  it("utcDayKey is YYYY-MM-DD in UTC", () => {
    expect(utcDayKey(t0)).toBe("2026-11-17");
  });
});

/** Tiny in-memory stand-in for ctx.storage.sql so LimiterDO logic can be unit-tested without Workers. */
function memorySql() {
  const rows: { k: string; t: number }[] = [];
  const exec = (query: string, ...bindings: unknown[]) => {
    const q = query.replace(/\s+/g, " ").trim();
    if (q.startsWith("CREATE")) return { one: () => undefined, toArray: () => [] };
    if (q.startsWith("DELETE FROM hits WHERE t <")) {
      const cutoff = Number(bindings[0]);
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].t < cutoff) rows.splice(i, 1);
      return { one: () => undefined, toArray: () => [] };
    }
    if (q.startsWith("SELECT k, COUNT(*)")) {
      const map = new Map<string, number>();
      for (const r of rows) map.set(r.k, (map.get(r.k) ?? 0) + 1);
      const arr = [...map.entries()].map(([k, n]) => ({ k, n }));
      return { one: () => arr[0], toArray: () => arr };
    }
    if (q.startsWith("SELECT COUNT(*)")) {
      if (!q.includes("WHERE")) {
        const n = rows.length;
        return { one: () => ({ n }), toArray: () => [{ n }] };
      }
      const [k, since] = bindings as [string, number];
      const n = rows.filter((r) => r.k === k && r.t > since).length;
      return { one: () => ({ n }), toArray: () => [{ n }] };
    }
    if (q.startsWith("SELECT t FROM hits")) {
      const [k, since] = bindings as [string, number];
      const hit = rows.filter((r) => r.k === k && r.t > since).sort((a, b) => a.t - b.t)[0];
      return { one: () => (hit ? { t: hit.t } : undefined), toArray: () => (hit ? [{ t: hit.t }] : []) };
    }
    if (q.startsWith("INSERT INTO hits")) {
      rows.push({ k: String(bindings[0]), t: Number(bindings[1]) });
      return { one: () => undefined, toArray: () => [] };
    }
    throw new Error(`unexpected sql: ${q}`);
  };
  return { exec, rows };
}

describe("LimiterDO SQL logic via a memory sql stand-in", () => {
  const limits = defaultLimiterConfig({ leadPerIpPerHour: 1, leadPerEmailPerDay: 1, leadDailyCap: 2, ratePerIpPerHour: 1 });
  const t0 = Date.parse("2026-11-17T12:00:00.000Z");

  function call(sql: ReturnType<typeof memorySql>, body: LimiterRequest) {
    ensureLimiterSchema(sql);
    return applyLimiterOp(sql, body) as { ok: boolean; reason?: string; retryAfterSec?: number; rows?: number };
  }

  it("applies IP, email and global lead caps atomically", () => {
    const sql = memorySql();
    const base: LimiterRequest = { op: "checkLead", limits, now: t0 };
    expect(call(sql, { ...base, ip: "1.1.1.1", email: "a@x.com" }).ok).toBe(true);
    expect(call(sql, { ...base, now: t0 + 1, ip: "1.1.1.1", email: "b@x.com" })).toMatchObject({ ok: false, reason: "ip" });
    expect(call(sql, { ...base, now: t0 + 2, ip: "2.2.2.2", email: "A@X.com" })).toMatchObject({ ok: false, reason: "email" });
    expect(call(sql, { ...base, now: t0 + 3, ip: "2.2.2.2", email: "b@x.com" }).ok).toBe(true);
    expect(call(sql, { ...base, now: t0 + 4, ip: "3.3.3.3", email: "c@x.com" })).toMatchObject({ ok: false, reason: "global" });
    expect(call(sql, { op: "status" }).rows).toBeGreaterThan(0);
  });

  it("caps rate lookups per IP", () => {
    const sql = memorySql();
    const base: LimiterRequest = { op: "checkRate", limits, now: t0, ip: "9.9.9.9" };
    expect(call(sql, base).ok).toBe(true);
    expect(call(sql, { ...base, now: t0 + 1 })).toMatchObject({ ok: false, reason: "rate" });
  });
});
