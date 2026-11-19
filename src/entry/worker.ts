import { loadConfig } from "../config.js";
import { handleRequest } from "../http.js";
import { DurableLimiter } from "../lib/limiter-do.js";
import { cacheApiRatesCache } from "../lib/rates.js";
import { cacheApiJsonCache } from "../lib/price-search.js";
import { limiterConfigFrom, type ServerDeps } from "../server.js";

export { LimiterDO } from "../lib/limiter-do.js";
export { DutyCacheDO } from "../lib/duty-cache-do.js";
import { DurableUsage } from "../lib/usage-do.js";
export { UsageDO } from "../lib/usage-do.js";
import { DurableDutyCache } from "../lib/duty-cache-do.js";

/** Cloudflare Workers entry (`wrangler deploy`). Vars/secrets arrive on `env`. */
export default {
  async fetch(request: Request, env: Record<string, unknown> & { USAGE_DO?: import("../lib/limiter-do.js").DurableObjectNamespace } & { LIMITER?: import("../lib/limiter-do.js").DurableObjectNamespace; DUTY_CACHE?: import("../lib/limiter-do.js").DurableObjectNamespace }, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const strEnv: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env ?? {})) if (typeof v === "string") strEnv[k] = v;
    const cfg = loadConfig(strEnv);
    const deps: ServerDeps = {};
    if (env?.USAGE_DO) { deps.usageStore = new DurableUsage(env.USAGE_DO); if (ctx) deps.waitUntil = (p) => ctx.waitUntil(p); }
    if (env?.LIMITER) {
      const durable = new DurableLimiter(env.LIMITER, limiterConfigFrom(cfg));
      deps.limiter = durable;
      deps.limiterBackend = "durable-object";
      const path = new URL(request.url).pathname;
      if (path === "/" || path === "/health") deps.limiterStatus = await durable.status();
    } else {
      deps.limiterBackend = "memory";
    }
    if (env?.DUTY_CACHE) deps.dutyCache = new DurableDutyCache(env.DUTY_CACHE);
    try {
      const cacheApi = (globalThis as unknown as { caches?: { default: { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> } } }).caches?.default;
      if (cacheApi) { deps.ratesCache = cacheApiRatesCache(cacheApi); deps.priceCache = cacheApiJsonCache(cacheApi, "price-cache"); }
    } catch {
      /* Cache API unavailable */
    }
    return handleRequest(request, strEnv, deps);
  },
};
