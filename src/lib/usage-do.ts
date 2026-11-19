/** Usage counters in a SQLite Durable Object (Workers free plan). Aggregate counts only. */
import type { DurableObjectNamespace, LimiterSql } from "./limiter-do.js";
import type { Counts, UsageStore } from "./usage.js";

type Req = { op: "inc"; day: string; keys: Counts } | { op: "read"; days: string[] };

export class UsageDO {
  private sql: LimiterSql;
  constructor(ctx: { storage: { sql: LimiterSql } }, _env: unknown) {
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS usage (day TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, k))`);
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as Req;
      if (body.op === "inc") {
        for (const [k, n] of Object.entries(body.keys)) {
          this.sql.exec(`INSERT INTO usage (day, k, n) VALUES (?, ?, ?) ON CONFLICT(day, k) DO UPDATE SET n = n + excluded.n`, body.day, k, n);
        }
        // keep ~120 days
        this.sql.exec(`DELETE FROM usage WHERE day < ?`, new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10));
        return Response.json({ ok: true });
      }
      const out: Record<string, Counts> = {};
      for (const d of body.days) {
        const rows = this.sql.exec(`SELECT k, n FROM usage WHERE day = ?`, d).toArray() as { k: string; n: number }[];
        out[d] = Object.fromEntries(rows.map((r) => [r.k, Number(r.n)]));
      }
      return Response.json({ days: out });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
}

export class DurableUsage implements UsageStore {
  constructor(private binding: DurableObjectNamespace) {}
  private async rpc(body: Req): Promise<any> {
    const stub = typeof this.binding.getByName === "function" ? this.binding.getByName("usage") : this.binding.get(this.binding.idFromName("usage"));
    const res = await stub.fetch(new Request("https://usage/op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    const data = await res.json();
    if (!res.ok) throw new Error((data as any)?.error ?? `usage HTTP ${res.status}`);
    return data;
  }
  async increment(day: string, keys: Counts) { await this.rpc({ op: "inc", day, keys }); }
  async read(days: string[]) { return ((await this.rpc({ op: "read", days })).days ?? {}) as Record<string, Counts>; }
}
