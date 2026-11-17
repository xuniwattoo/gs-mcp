import { loadConfig } from "../config.js";
import { handleRequest } from "../http.js";
import { DurableLimiter } from "../lib/limiter-do.js";
import { cacheApiRatesCache } from "../lib/rates.js";
import { limiterConfigFrom, type ServerDeps } from "../server.js";

export { LimiterDO } from "../lib/limiter-do.js";

/** Cloudflare Workers entry (`wrangler deploy`). Vars/secrets arrive on `env`. */
export default {
  async fetch(request: Request, env: Record<string, unknown> & { LIMITER?: import("../lib/limiter-do.js").DurableObjectNamespace }): Promise<Response> {
    const strEnv: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env ?? {})) if (typeof v === "string") strEnv[k] = v;
    const cfg = loadConfig(strEnv);
    const deps: ServerDeps = {};
    if (env?.LIMITER) {
      const durable = new DurableLimiter(env.LIMITER, limiterConfigFrom(cfg));
      deps.limiter = durable;
      deps.limiterBackend = "durable-object";
      const path = new URL(request.url).pathname;
      if (path === "/" || path === "/health") deps.limiterStatus = await durable.status();
    } else {
      deps.limiterBackend = "memory";
    }
    try {
      const cacheApi = (globalThis as unknown as { caches?: { default: { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> } } }).caches?.default;
      if (cacheApi) deps.ratesCache = cacheApiRatesCache(cacheApi);
    } catch {
      /* Cache API unavailable */
    }
    return handleRequest(request, strEnv, deps);
  },
};
