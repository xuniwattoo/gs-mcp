/** Sliding-window and calendar-day limiters. MemoryLimiter is the Node/Vercel fallback; Workers use the SQLite Durable Object. */

export interface LimitResult {
  ok: boolean;
  retryAfterSec: number;
  reason?: "ip" | "email" | "global" | "rate";
}

export interface LimiterConfig {
  leadPerIpPerHour: number;
  leadPerEmailPerDay: number;
  leadDailyCap: number;
  ratePerIpPerHour: number;
}

export interface Limiter {
  checkLead(input: { ip: string; email: string }, now?: number): Promise<LimitResult>;
  checkRate(input: { ip: string }, now?: number): Promise<LimitResult>;
}

export function defaultLimiterConfig(partial: Partial<LimiterConfig> = {}): LimiterConfig {
  return {
    leadPerIpPerHour: 5,
    leadPerEmailPerDay: 3,
    leadDailyCap: 200,
    ratePerIpPerHour: 30,
    ...partial,
  };
}

export function utcDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function leadLimitMessage(result: LimitResult, pageUrl: string, email: string): string {
  const why =
    result.reason === "email"
      ? "This email address has reached today's request limit"
      : result.reason === "global"
        ? "The daily request cap has been reached"
        : "This client has reached the hourly request limit";
  return `${why}. Please email ${email} or use ${pageUrl}. You can retry in ${result.retryAfterSec}s.`;
}

export function rateLimitMessage(result: LimitResult, calculatorUrl: string): string {
  return `Rate lookup limit reached for this client (${result.retryAfterSec}s before a retry). Use the calculator at ${calculatorUrl} meanwhile.`;
}

/** In-memory sliding-window limiter. Used as a primitive and as the Node/Vercel/test fallback. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}

  peek(key: string, now = Date.now()): LimitResult {
    const arr = this.fresh(key, now);
    if (arr.length >= this.limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((this.windowMs - (now - arr[0])) / 1000)) };
    }
    return { ok: true, retryAfterSec: 0 };
  }

  hit(key: string, now = Date.now()): void {
    const arr = this.fresh(key, now);
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 10000) this.hits.delete(this.hits.keys().next().value!);
  }

  check(key: string, now = Date.now()): LimitResult {
    const r = this.peek(key, now);
    if (r.ok) this.hit(key, now);
    return r;
  }

  private fresh(key: string, now: number): number[] {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, arr);
    return arr;
  }
}

/**
 * In-memory implementation of the durable limiter contract.
 * Process-local: resets on restart / isolate recycle. Used when the Workers DO binding is absent.
 */
export class MemoryLimiter implements Limiter {
  private ipLead: RateLimiter;
  private emailLead = new Map<string, number[]>();
  private globalLead = new Map<string, number>();
  private rateIp: RateLimiter;

  constructor(private cfg: LimiterConfig) {
    this.ipLead = new RateLimiter(cfg.leadPerIpPerHour, 60 * 60 * 1000);
    this.rateIp = new RateLimiter(cfg.ratePerIpPerHour, 60 * 60 * 1000);
  }

  async checkLead({ ip, email }: { ip: string; email: string }, now = Date.now()): Promise<LimitResult> {
    const day = utcDayKey(now);
    const emailKey = `${email.trim().toLowerCase()}:${day}`;
    const emailHits = (this.emailLead.get(emailKey) ?? []).filter((t) => utcDayKey(t) === day);
    const globalHits = this.globalLead.get(day) ?? 0;
    const endOfDaySec = Math.max(1, Math.ceil((Date.parse(`${day}T23:59:59.999Z`) - now) / 1000));

    if (emailHits.length >= this.cfg.leadPerEmailPerDay) {
      return { ok: false, retryAfterSec: endOfDaySec, reason: "email" };
    }
    if (globalHits >= this.cfg.leadDailyCap) {
      return { ok: false, retryAfterSec: endOfDaySec, reason: "global" };
    }
    const ipHit = this.ipLead.peek(`lead:${ip}`, now);
    if (!ipHit.ok) return { ...ipHit, reason: "ip" };

    this.ipLead.hit(`lead:${ip}`, now);
    emailHits.push(now);
    this.emailLead.set(emailKey, emailHits);
    this.globalLead.set(day, globalHits + 1);
    if (this.emailLead.size > 10000) this.emailLead.delete(this.emailLead.keys().next().value!);
    for (const k of this.globalLead.keys()) if (k < day) this.globalLead.delete(k);
    return { ok: true, retryAfterSec: 0 };
  }

  async checkRate({ ip }: { ip: string }, now = Date.now()): Promise<LimitResult> {
    const r = this.rateIp.check(`rate:${ip}`, now);
    return r.ok ? r : { ...r, reason: "rate" };
  }
}
