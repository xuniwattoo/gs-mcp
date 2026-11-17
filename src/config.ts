/**
 * Runtime configuration. Works with Cloudflare Workers `env`, Node `process.env`, or any plain record.
 * Every value is optional; defaults point at GS's public endpoints.
 */
export type EnvRecord = Record<string, string | undefined>;

export interface Config {
  ratesUrl: string;
  ratesReferer: string;
  ratesHeaderName?: string;
  ratesHeaderValue?: string;
  ratesTimeoutMs: number;
  userAgent: string;
  ghlApiToken?: string;
  ghlLocationId?: string;
  ghlApiBase: string;
  leadWebhookUrl?: string;
  leadWebhookSecret?: string;
  easyshipApiKey?: string;
  easyshipTaxUrl: string;
  assistedFeePct: number;
  assistedFeeMinUsd: number;
  assistedFeeWaivedMethods: string[];
  leadRateLimitPerHour: number;
  leadEmailLimitPerDay: number;
  leadDailyCap: number;
  rateLimitPerHour: number;
  allowedOrigins: string[];
  publicBaseUrl?: string;
}

const num = (v: string | undefined, d: number) => {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};
const list = (v: string | undefined, d: string[]) =>
  v === undefined ? d : v.split(",").map((s) => s.trim()).filter(Boolean);
const str = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function loadConfig(env: EnvRecord = {}): Config {
  return {
    ratesUrl: str(env.GS_RATES_URL) ?? "https://globalshopaholics.com/wp-json/rate-calculator/v2/getrates",
    ratesReferer: str(env.GS_RATES_REFERER) ?? "https://globalshopaholics.com/international-shipping-calculator/",
    ratesHeaderName: str(env.GS_RATES_HEADER_NAME),
    ratesHeaderValue: str(env.GS_RATES_HEADER_VALUE),
    ratesTimeoutMs: num(env.GS_RATES_TIMEOUT_MS, 25000),
    userAgent: str(env.GS_USER_AGENT) ?? "GlobalShopaholics-MCP/0.1 (+https://globalshopaholics.com)",
    ghlApiToken: str(env.GHL_API_TOKEN),
    ghlLocationId: str(env.GHL_LOCATION_ID),
    ghlApiBase: str(env.GHL_API_BASE) ?? "https://services.leadconnectorhq.com",
    leadWebhookUrl: str(env.LEAD_WEBHOOK_URL),
    leadWebhookSecret: str(env.LEAD_WEBHOOK_SECRET),
    easyshipApiKey: str(env.EASYSHIP_API_KEY),
    easyshipTaxUrl: str(env.EASYSHIP_TAX_URL) ?? "https://public-api.easyship.com/2024-09/taxes_and_duties",
    // Owner-confirmed policy (Nov 2026): 0% when paying by bank transfer or crypto, otherwise 5%.
    // The public FAQ states 5% with a $5 minimum for a standard request.
    assistedFeePct: num(env.GS_ASSISTED_FEE_PCT, 5),
    assistedFeeMinUsd: num(env.GS_ASSISTED_FEE_MIN_USD, 5),
    assistedFeeWaivedMethods: list(env.GS_ASSISTED_FEE_WAIVED_METHODS, ["bank_transfer", "crypto"]),
    leadRateLimitPerHour: num(env.LEAD_RATE_LIMIT_PER_HOUR, 5),
    leadEmailLimitPerDay: num(env.LEAD_EMAIL_LIMIT_PER_DAY, 3),
    leadDailyCap: num(env.LEAD_DAILY_CAP, 200),
    rateLimitPerHour: num(env.RATE_LIMIT_PER_HOUR, 30),
    allowedOrigins: list(env.ALLOWED_ORIGINS, ["*"]),
    publicBaseUrl: str(env.PUBLIC_BASE_URL),
  };
}
