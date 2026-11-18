/**
 * Permanent duty-rate store (SQLite Durable Object, Workers free plan).
 * Key: duty:<country>:<hs6>. Rows are never expired: refresh by deleting or re-running a lookup.
 */
import type { DurableObjectNamespace, LimiterSql } from "./limiter-do.js";
import type { DutyCacheStore, DutyRateRecord } from "./duty-fallback.js";

type Req = { op: "get"; key: string } | { op: "put"; key: string; value: DutyRateRecord } | { op: "count" };

export class DutyCacheDO {
  private sql: LimiterSql;
  constructor(ctx: { storage: { sql: LimiterSql } }, _env: unknown) {
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS duty_rates (k TEXT PRIMARY KEY, v TEXT NOT NULL, t INTEGER NOT NULL)`);
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as Req;
      if (body.op === "get") {
        const rows = this.sql.exec(`SELECT v FROM duty_rates WHERE k = ?`, body.key).toArray() as { v: string }[];
        return Response.json({ value: rows[0] ? JSON.parse(rows[0].v) : null });
      }
      if (body.op === "put") {
        this.sql.exec(`INSERT OR REPLACE INTO duty_rates (k, v, t) VALUES (?, ?, ?)`, body.key, JSON.stringify(body.value), Date.now());
        return Response.json({ ok: true });
      }
      const row = this.sql.exec(`SELECT COUNT(*) AS n FROM duty_rates`).toArray()[0] as { n?: number } | undefined;
      return Response.json({ rows: Number(row?.n ?? 0) });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
}

export class DurableDutyCache implements DutyCacheStore {
  constructor(private binding: DurableObjectNamespace) {}
  private stub() {
    if (typeof this.binding.getByName === "function") return this.binding.getByName("duty-rates");
    return this.binding.get(this.binding.idFromName("duty-rates"));
  }
  private async rpc(body: Req): Promise<any> {
    const res = await this.stub().fetch(new Request("https://duty-cache/op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    const data = await res.json();
    if (!res.ok) throw new Error((data as any)?.error ?? `duty cache HTTP ${res.status}`);
    return data;
  }
  async get(key: string) { return ((await this.rpc({ op: "get", key })).value ?? undefined) as DutyRateRecord | undefined; }
  async put(key: string, value: DutyRateRecord) { await this.rpc({ op: "put", key, value }); }
  async count(): Promise<number> { return Number((await this.rpc({ op: "count" })).rows ?? 0); }
}
