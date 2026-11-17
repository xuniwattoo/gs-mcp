/** In-memory fixed-window limiter. Per isolate/process: fine for an MVP on Workers free plan or one Node box. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}
  check(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return { ok: false, retryAfterSec: Math.ceil((this.windowMs - (now - arr[0])) / 1000) };
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 10000) this.hits.delete(this.hits.keys().next().value!);
    return { ok: true, retryAfterSec: 0 };
  }
}
