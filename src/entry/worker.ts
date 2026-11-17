import { handleRequest } from "../http.js";

/** Cloudflare Workers entry (`wrangler deploy`). Vars/secrets arrive on `env`. */
export default {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    const strEnv: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env ?? {})) if (typeof v === "string") strEnv[k] = v;
    return handleRequest(request, strEnv);
  },
};
