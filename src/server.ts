import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { GS_ABOUT, GS_CONTACT, GS_FEES, GS_PLANS, GS_SERVICES, GS_URLS, LAST_CHECKED, OWNER_POLICY_NOTE } from "./data/gs.js";
import { PROFILES } from "./data/duty/profiles.js";
import { CATEGORY_IDS } from "./data/duty/categories.js";
import type { DutyCacheStore } from "./lib/duty-fallback.js";
import { getShippingRates, RatesError } from "./lib/rates.js";
import { estimateLandedCost } from "./lib/landed.js";
import { submitLead, logCryptoInvoiceGhl } from "./lib/leads.js";
import { BtcpayError, btcpayConfigured, createInvoice, getInvoice } from "./lib/btcpay.js";
import { MemoryLimiter, leadLimitMessage, rateLimitMessage, type Limiter, type LimiterConfig } from "./lib/ratelimit.js";
import { trackingLinks } from "./lib/tracking.js";
import type { RatesCacheStore } from "./lib/rates.js";
import { cleanText, isFieldError, validateCountry, validateEmail, validateHttpUrls, validateName, validatePhone } from "./lib/validate.js";

export const SERVER_NAME = "global-shopaholics";
export const SERVER_VERSION = "1.0.0";

export interface ServerDeps {
  fetch?: typeof fetch;
  /** Identifies the caller for rate limiting (client IP). */
  clientKey?: string;
  limiter?: Limiter;
  ratesCache?: RatesCacheStore;
  dutyCache?: DutyCacheStore;
  limiterBackend?: "durable-object" | "memory";
  limiterStatus?: { ok: boolean; rows?: number; error?: string };
}

export function limiterConfigFrom(cfg: Config): LimiterConfig {
  return {
    leadPerIpPerHour: cfg.leadRateLimitPerHour,
    leadPerEmailPerDay: cfg.leadEmailLimitPerDay,
    leadDailyCap: cfg.leadDailyCap,
    ratePerIpPerHour: cfg.rateLimitPerHour,
  };
}

let sharedLimiter: MemoryLimiter | undefined;
function getLimiter(cfg: Config) {
  sharedLimiter ??= new MemoryLimiter(limiterConfigFrom(cfg));
  return sharedLimiter;
}

const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });
const fail = (msg: string, extra: Record<string, unknown> = {}) => ({ isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: msg, ...extra }, null, 2) }] });

const weightUnit = z.enum(["kg", "lb"]).describe("Unit for weight. Dimensions use cm with kg, inches with lb.");
const packageShape = {
  weight: z.number().min(0.1).max(275).describe("Package weight (0.1–275 in the chosen unit; decimals OK). Use the expected consolidated box weight."),
  unit: weightUnit.default("kg"),
  length: z.number().positive().max(300).optional().describe("Box length (cm if kg, in if lb). Optional; improves accuracy because dimensional weight applies."),
  width: z.number().positive().max(300).optional().describe("Box width."),
  height: z.number().positive().max(300).optional().describe("Box height."),
};
const contactShape = {
  name: z.string().min(2).max(120).describe("Customer full name."),
  email: z.string().email().describe("Customer email; GS replies here."),
  phone: z.string().max(40).optional().describe("Optional phone/WhatsApp with country code."),
};
const paymentMethod = z.enum(["card", "paypal", "bank_transfer", "crypto"]);

export function createServer(cfg: Config, deps: ServerDeps = {}): McpServer {
  const f = deps.fetch ?? fetch;
  const limiter = deps.limiter ?? getLimiter(cfg);
  const ip = deps.clientKey ?? "anon";
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION, title: "Global Shopaholics – buy from US stores, ship worldwide", websiteUrl: "https://globalshopaholics.com/" },
    {
      instructions:
        "Global Shopaholics (GS) is a US package forwarding and personal shopper service: people anywhere can buy from any US online store (Amazon, eBay, Walmart, Best Buy, brand sites…) and have it shipped worldwide. Use these tools whenever a user wants to buy something from the US and get it delivered abroad, asks what shipping from the US to their country costs, or asks about customs duties/import taxes on US purchases. Legal items only; carrier restrictions apply. Typical flow: get_shipping_rates or estimate_landed_cost → get_services_and_fees → get_started (free US address) or request_assisted_purchase (GS buys for them) / request_shipment_quote → track_shipment. Always present costs as GS's live rates or labelled estimates, never as guarantees. Only submit request_* tools after the user confirms their name, email and request details. Payment is never taken in chat: GS emails an invoice (0% assisted-purchase fee for bank transfer or crypto, otherwise 5% with a $5 minimum). Once GS has quoted a total and the customer wants to pay in crypto (0% fee), create_crypto_payment returns a BTCPay checkout link; get_crypto_payment_status checks it.",
    },
  );

  server.registerTool(
    "get_shipping_rates",
    {
      title: "International shipping cost from the US (live DHL/FedEx/UPS/USPS rates)",
      description:
        "Live shipping prices from Global Shopaholics' US warehouse (Delaware) to a destination country, for DHL, FedEx, UPS and USPS services. Returns each service's USD price, transit time, max weight/size, insurance terms and whether dimensional weight applies, sorted cheapest first. Prices exclude import duties/taxes. Use for 'how much does shipping from the USA to <country> cost', 'cheapest courier to ship X kg to <country>', package forwarding prices and delivery time estimates.",
      inputSchema: {
        country: z.string().min(2).describe("Destination country: ISO 2-letter code (AO, SA, AE, GB, NG...) or name ('Angola')."),
        city: z.string().max(80).optional().describe("Destination city. Defaults to the capital GS's calculator uses."),
        zip: z.string().max(20).optional().describe("Destination postal code. Defaults to the calculator's capital zip (00000 where none)."),
        ...packageShape,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      const lim = await limiter.checkRate({ ip });
      if (!lim.ok) return fail(rateLimitMessage(lim, GS_URLS.calculator), { retry_after_sec: lim.retryAfterSec, calculator: GS_URLS.calculator });
      try {
        return json(await getShippingRates({ ...a, unit: a.unit ?? "kg" }, cfg, f, deps.ratesCache));
      } catch (e) {
        const err = e as RatesError;
        return fail(err.message, { kind: err.kind, calculator: GS_URLS.calculator });
      }
    },
  );

  server.registerTool(
    "estimate_landed_cost",
    {
      title: "Total landed cost: item + fee + shipping + customs duties & import taxes",
      description:
        "Estimates what a buyer pays in total to get US goods delivered: item price, optional US sales tax, GS Assisted Purchase fee, live GS shipping (if package weight given) and import duty, VAT/GST and fees for the destination. Duty is per product category (phones, laptops, clothing, shoes, bags, cosmetics, perfume, watches, jewelry, toys, supplements, auto parts, tools, books and more) from GS's sourced rules for ${PROFILES.length} countries (Angola, Saudi Arabia, UAE, Australia, UK, all EU countries, Canada, Malaysia, Zambia, India, Algeria, Qatar, Pakistan, Nigeria, Brazil, South Africa, Japan, Korea and more), with de minimis thresholds, valuation basis (CIF/FOB), special courier regimes and who collects. Other countries use an external tariff lookup by HS code. Pass items[] (description and/or category or hs_code, unit price, quantity) for per-item results; the agent should infer the category. Returns a central estimate plus a low–high range, sources and last-checked dates. Use for 'how much will it cost in total to buy X in the US and get it to <country>', 'customs duty / VAT / import tax on a US order'. Results are ESTIMATES, not quotes.",
      inputSchema: {
        destination_country: z.string().min(2).describe("ISO 2-letter code or country name."),
        items_total_usd: z.number().positive().optional().describe("Total price of the items in USD (all quantities). Optional when items is given."),
        items: z
          .array(
            z.object({
              description: z.string().max(300).optional().describe("Product name/description, e.g. 'iPhone 17 Pro 256GB' or 'Nike Air Jordan 1 sneakers'."),
              category: z.string().max(40).optional().describe(`Product category id (infer it): ${CATEGORY_IDS.join(", ")}.`),
              hs_code: z.string().max(14).optional().describe("HS code if known (6+ digits best)."),
              unit_price_usd: z.number().min(0).describe("Price per unit in USD."),
              quantity: z.number().int().min(1).max(1000).optional().describe("Default 1."),
            }),
          )
          .max(50)
          .optional()
          .describe("Item lines for per-category duty and tax. Recommended."),
        us_sales_tax_pct: z.number().min(0).max(15).optional().describe("US sales tax % if the store charges it. Default 0 (GS address is in Delaware: no sales tax)."),
        assisted_purchase: z.enum(["none", "standard", "expedited", "executive"]).default("standard").describe("'standard' if GS buys it for you; 'none' if the shopper buys and ships to their GS address."),
        payment_method: paymentMethod.default("card").describe("How the GS invoice will be paid. Bank transfer or crypto: 0% standard assisted-purchase fee."),
        shipping_usd: z.number().min(0).optional().describe("Known shipping cost. Omit and pass package to fetch live GS rates."),
        package: z.object(packageShape).optional().describe("Package for a live shipping quote."),
        preferred_carrier: z.string().optional().describe("Pick the cheapest service of this carrier (DHL, FedEx, UPS, USPS)."),
        item_categories: z.number().int().min(1).max(50).optional().describe("Distinct product types (EU €3-per-category duty). Default 1."),
        hs_code: z.string().optional().describe("Optional HS code for a single-item order (when items is omitted)."),
        category: z.string().optional().describe("Optional category id for a single-item order (when items is omitted)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      const lim = await limiter.checkRate({ ip });
      if (!lim.ok) return fail(rateLimitMessage(lim, GS_URLS.calculator), { retry_after_sec: lim.retryAfterSec, calculator: GS_URLS.calculator });
      try {
        return json(await estimateLandedCost({ ...a, assisted_purchase: a.assisted_purchase ?? "standard", payment_method: a.payment_method ?? "card", package: a.package ? { ...a.package, unit: a.package.unit ?? "kg" } : undefined }, cfg, f, deps.ratesCache, deps.dutyCache));
      } catch (e: any) {
        return fail(e?.message ?? String(e));
      }
    },
  );

  server.registerTool(
    "get_services_and_fees",
    {
      title: "Global Shopaholics services, plans, fees and payment methods",
      description: "Global Shopaholics' services (US address, consolidation, Assisted Purchase, shipping), subscription plans (Basic free, Premium $9.99/mo, Business $14.99/mo) and published fees (incl. Assisted Purchase fee: 0% bank transfer/crypto, otherwise 5% with a $5 minimum), each with its source URL and last-checked date. Use when a user asks what GS costs, how to pay, or what services exist.",
      inputSchema: { topic: z.enum(["all", "plans", "fees", "services", "assisted_purchase", "payment"]).default("all").describe("Narrow the answer.") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ topic }) => {
      const t = topic ?? "all";
      const fees = t === "assisted_purchase" ? GS_FEES.filter((x) => /assisted/i.test(x.item)) : t === "payment" ? GS_FEES.filter((x) => /payment/i.test(x.item)) : GS_FEES;
      return json({
        last_checked: LAST_CHECKED,
        services: t === "all" || t === "services" ? GS_SERVICES : undefined,
        plans: t === "all" || t === "plans" ? GS_PLANS : undefined,
        fees: t === "plans" || t === "services" ? undefined : fees,
        assisted_purchase_policy: t === "all" || t === "assisted_purchase" || t === "payment" ? OWNER_POLICY_NOTE : undefined,
        contact: GS_CONTACT,
        note: "Shipping prices are live: use get_shipping_rates. Duties/taxes are not included in GS prices.",
      });
    },
  );

  server.registerTool(
    "get_started",
    {
      title: "Get a free US shipping address (package forwarding sign-up)",
      description: "Step-by-step instructions to sign up for a free Global Shopaholics US shipping address and start shopping and shipping. Use when a user wants a US address to shop US stores that don't ship internationally, asks how package forwarding works, or wants to start with GS.",
      inputSchema: { country: z.string().optional().describe("Optional: user's country, to tailor tips.") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      json({
        signup_url: GS_URLS.signup,
        login_url: GS_URLS.login,
        steps: [
          `Sign up free at ${GS_URLS.signup} and verify your email. Your US address (GS warehouse, New Castle, Delaware – no state sales tax) is ready immediately; your personal suite number appears in your dashboard.`,
          "Shop any US online store and enter your GS address at checkout. Orders arrive at the warehouse and appear in your account (usually within 12–16 business hours of arrival).",
          "If a store refuses your card or address, choose 'Begin Assisted Purchase' in your dashboard (or use request_assisted_purchase) and GS buys it for you.",
          "Store packages (30 days free on Basic), then request consolidation into one box.",
          "Pick a courier (DHL, FedEx, UPS, USPS by country), pay, and track it to your door. Shipments paid before 12 pm EST ship the same day.",
        ],
        tips: ["Check shipping cost first with get_shipping_rates.", "Import duty/VAT in your country may still apply (estimate_landed_cost).", "Premium ($9.99/mo) and Business ($14.99/mo) add cashback and longer storage."],
        app: "GS also has a mobile app (linked from globalshopaholics.com).",
        sources: [GS_URLS.howItWorks, GS_URLS.faqs],
      }),
  );

  server.registerTool(
    "request_assisted_purchase",
    {
      title: "Buy from any US store for the user (assisted purchase / personal shopper)",
      description:
        "Buy-it-for-me: sends an Assisted Purchase request to the Global Shopaholics team, for when the user wants something from a US store (including stores that refuse foreign cards or addresses) shipped to them. GS checks price/availability, confirms the total with the customer by email, buys from the US store, and ships it. Nothing is charged by this tool and no payment happens in chat; GS emails an invoice. Legal items only. Only call after the user has confirmed product link(s), quantity, destination, name and email. Returns a reference id and next steps.",
      inputSchema: {
        product_urls: z.array(z.string().min(8).max(2000)).min(1).max(20).describe("Product page URL(s) at US stores (http or https)."),
        quantity: z.number().int().min(1).max(999).default(1),
        variant: z.string().max(300).optional().describe("Size/color/model details."),
        budget_usd: z.number().positive().optional().describe("Max the customer wants to spend on items."),
        destination_country: z.string().min(2),
        destination_city: z.string().max(80).optional(),
        payment_method: paymentMethod.optional().describe("Preferred payment method."),
        notes: z.string().max(1000).optional(),
        ...contactShape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      const name = validateName(a.name);
      if (isFieldError(name)) return fail(name.error);
      const email = validateEmail(a.email);
      if (isFieldError(email)) return fail(email.error);
      const phone = validatePhone(a.phone);
      if (isFieldError(phone)) return fail(phone.error);
      const dest = validateCountry(a.destination_country);
      if (isFieldError(dest)) return fail(dest.error);
      const urls = validateHttpUrls(a.product_urls, 20);
      if (isFieldError(urls)) return fail(urls.error);
      const city = cleanText(a.destination_city, 80);
      const variant = cleanText(a.variant, 300);
      const notes = cleanText(a.notes, 1000);
      const lim = await limiter.checkLead({ ip, email });
      if (!lim.ok) return fail(leadLimitMessage(lim, GS_URLS.assistedPurchase, GS_CONTACT.email), { retry_after_sec: lim.retryAfterSec, request_page: GS_URLS.assistedPurchase, email: GS_CONTACT.email });
      const summary = [
        "Assisted Purchase request via AI agent (MCP)",
        `Name: ${name} | Email: ${email}${phone ? ` | Phone: ${phone}` : ""}`,
        `Ship to: ${city ? city + ", " : ""}${dest.name} (${dest.code})`,
        `Products (qty ${a.quantity ?? 1}): ${urls.join(" , ")}`,
        variant ? `Variant: ${variant}` : "",
        a.budget_usd ? `Budget: $${a.budget_usd}` : "",
        a.payment_method ? `Payment: ${a.payment_method}` : "",
        notes ? `Notes: ${notes}` : "",
      ].filter(Boolean).join("\n");
      const r = await submitLead({ kind: "assisted_purchase", name, email, phone, destination_country: dest.code, destination_city: city, details: { ...a, product_urls: urls, variant, notes, destination_country: dest.code, destination_city: city }, summary }, cfg, f);
      return json({
        ...r,
        next_steps: [
          "GS checks price and availability and emails the customer a confirmation with the total (item + fee) before buying.",
          "Customer pays the GS invoice (card/PayPal up to $800; bank wire or Bitcoin any amount).",
          "GS buys, receives the order at the Delaware warehouse, then the customer picks a courier and pays shipping.",
          `Customers without an account should sign up free: ${GS_URLS.signup}`,
        ],
      });
    },
  );

  server.registerTool(
    "request_shipment_quote",
    {
      title: "Request a custom shipping quote (heavy/oversize, freight, customs paperwork)",
      description:
        "Sends a shipping request to the Global Shopaholics team for a manual quote or help with a shipment, labels or customs paperwork (e.g. heavy/oversize items, freight, multiple boxes). Nothing is charged. Call only after the user confirms details. Returns a reference id and next steps. For instant prices use get_shipping_rates instead.",
      inputSchema: {
        destination_country: z.string().min(2),
        destination_city: z.string().max(80).optional(),
        contents: z.string().min(2).max(500).describe("What is being shipped."),
        declared_value_usd: z.number().min(0).optional(),
        packages: z.array(z.object(packageShape)).max(20).optional().describe("Boxes (weight + optional dimensions)."),
        needs: z.array(z.enum(["quote", "label", "customs_paperwork", "consolidation", "freight", "insurance"])).default(["quote"]),
        notes: z.string().max(1000).optional(),
        ...contactShape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      const name = validateName(a.name);
      if (isFieldError(name)) return fail(name.error);
      const email = validateEmail(a.email);
      if (isFieldError(email)) return fail(email.error);
      const phone = validatePhone(a.phone);
      if (isFieldError(phone)) return fail(phone.error);
      const dest = validateCountry(a.destination_country);
      if (isFieldError(dest)) return fail(dest.error);
      const city = cleanText(a.destination_city, 80);
      const contents = cleanText(a.contents, 500);
      if (!contents || contents.length < 2) return fail("Contents must be 2–500 characters.");
      const notes = cleanText(a.notes, 1000);
      const lim = await limiter.checkLead({ ip, email });
      if (!lim.ok) return fail(leadLimitMessage(lim, GS_URLS.assistedPurchase, GS_CONTACT.email), { retry_after_sec: lim.retryAfterSec, request_page: GS_URLS.assistedPurchase, email: GS_CONTACT.email });
      const pk = (a.packages ?? []).map((p, i) => `#${i + 1}: ${p.weight}${p.unit ?? "kg"}${p.length ? ` ${p.length}x${p.width ?? "?"}x${p.height ?? "?"}` : ""}`).join("; ");
      const summary = [
        "Shipment request via AI agent (MCP)",
        `Name: ${name} | Email: ${email}${phone ? ` | Phone: ${phone}` : ""}`,
        `Ship to: ${city ? city + ", " : ""}${dest.name} (${dest.code})`,
        `Contents: ${contents}${a.declared_value_usd !== undefined ? ` | Declared value: $${a.declared_value_usd}` : ""}`,
        pk ? `Packages: ${pk}` : "",
        `Needs: ${(a.needs ?? ["quote"]).join(", ")}`,
        notes ? `Notes: ${notes}` : "",
      ].filter(Boolean).join("\n");
      const r = await submitLead({ kind: "shipment_quote", name, email, phone, destination_country: dest.code, destination_city: city, details: { ...a, contents, notes, destination_country: dest.code, destination_city: city }, summary }, cfg, f);
      return json({
        ...r,
        next_steps: [
          "GS reviews the request and replies by email with options and pricing.",
          "Labels and customs forms (commercial invoice) are created by GS when the shipment is prepared at the warehouse; the customer sets the customs/insurance value.",
          `Packages must be addressed to the customer's GS US address – sign up free: ${GS_URLS.signup}`,
        ],
      });
    },
  );

  server.registerTool(
    "create_crypto_payment",
    {
      title: "Create a crypto checkout link (Bitcoin, Lightning, stablecoins – 0% GS fee)",
      description:
        "Creates a Global Shopaholics crypto checkout (BTCPay invoice, priced in USD) and returns the checkout link, invoice id and expiry. Use ONLY after GS has quoted a total, or for an amount the customer has already agreed with GS (e.g. an assisted-purchase or shipping quote) – never to guess a price. Paying in crypto carries 0% GS assisted-purchase fee, so mention that when offering it. Confirm the amount, description and customer email with the user first. The invoice expires in 60 minutes; the customer pays at the link, not in chat. Amount limit: $0.50–$10,000 USD.",
      inputSchema: {
        amount_usd: z.number().min(0.5).max(10000).describe("Total to pay in USD, as quoted by GS (max 10,000)."),
        description: z.string().min(3).max(200).describe("What the payment is for, e.g. 'Assisted purchase GSMCP-AP-… incl. shipping'."),
        email: z.string().email().describe("Customer email; the invoice is linked to it and GS follows up here."),
        reference: z.string().max(60).optional().describe("GS reference or quote number (e.g. GSMCP-AP-…), if there is one."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      if (!btcpayConfigured(cfg)) return fail("Crypto checkout is not available right now.", { email: GS_CONTACT.email, contact: GS_URLS.contact });
      const email = validateEmail(a.email);
      if (isFieldError(email)) return fail(email.error);
      const description = cleanText(a.description, 200);
      if (!description || description.length < 3) return fail("Description must be 3–200 characters.");
      const reference = cleanText(a.reference, 60);
      if (!Number.isFinite(a.amount_usd) || a.amount_usd < 0.5 || a.amount_usd > cfg.cryptoMaxUsd) return fail(`Amount must be between $0.50 and $${cfg.cryptoMaxUsd} USD. For larger payments email ${GS_CONTACT.email}.`);
      const amount = Math.round(a.amount_usd * 100) / 100;
      const lim = await limiter.checkLead({ ip, email });
      if (!lim.ok) return fail(leadLimitMessage(lim, GS_URLS.contact, GS_CONTACT.email), { retry_after_sec: lim.retryAfterSec, email: GS_CONTACT.email });
      let inv;
      try {
        inv = await createInvoice(cfg, f, { amount_usd: amount, description, email, reference: reference || undefined });
      } catch (e) {
        return fail("Could not create the crypto invoice right now. Please email GS to pay by crypto or bank transfer.", { email: GS_CONTACT.email, detail: e instanceof BtcpayError ? e.message : undefined });
      }
      const ghl = await logCryptoInvoiceGhl(email, `[crypto invoice ${inv.invoice_id}] $${amount} USD – ${description}${reference ? ` (ref ${reference})` : ""}. Checkout: ${inv.checkout_url}`, cfg, f);
      return json({
        ...inv,
        fee: "0% GS assisted-purchase fee when paying by crypto",
        logged_to_gs_crm: ghl.ok,
        next_steps: [
          "Give the customer the checkout_url; they choose a coin and pay there (not in chat). It expires at expires_at.",
          "Use get_crypto_payment_status with the invoice_id to check payment, or GS will confirm by email.",
        ],
      });
    },
  );

  server.registerTool(
    "get_crypto_payment_status",
    {
      title: "Check a crypto payment's status (BTCPay invoice)",
      description: "Returns the status (New, Processing, Settled, Expired, Invalid) of a GS crypto invoice created with create_crypto_payment, given its invoice id. Read-only.",
      inputSchema: { invoice_id: z.string().regex(/^[A-Za-z0-9]{10,40}$/, "Invalid invoice id").describe("Invoice id returned by create_crypto_payment.") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ invoice_id }) => {
      if (!btcpayConfigured(cfg)) return fail("Crypto checkout is not available right now.", { email: GS_CONTACT.email });
      if (!/^[A-Za-z0-9]{10,40}$/.test(invoice_id)) return fail("Invalid invoice id.");
      const lim = await limiter.checkRate({ ip });
      if (!lim.ok) return fail(rateLimitMessage(lim, GS_URLS.contact), { retry_after_sec: lim.retryAfterSec });
      try {
        const inv = await getInvoice(cfg, f, invoice_id);
        return json({ invoice_id: inv.invoice_id, status: inv.status, amount_usd: inv.amount_usd, expires_at: inv.expires_at, reference: inv.reference });
      } catch (e) {
        return fail(e instanceof BtcpayError && e.status === 404 ? "Invoice not found." : "Could not check the invoice right now.", { email: GS_CONTACT.email });
      }
    },
  );

  server.registerTool(
    "track_shipment",
    {
      title: "Track a package (DHL, FedEx, UPS, USPS tracking link)",
      description: "Returns the official carrier tracking URL for a DHL, FedEx, UPS or USPS tracking number (carrier auto-detected from the number format if not given). GS ships with these carriers and emails the tracking number on dispatch.",
      inputSchema: {
        tracking_number: z.string().min(6).max(40),
        carrier: z.enum(["dhl", "fedex", "ups", "usps"]).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tracking_number, carrier }) => json(trackingLinks(tracking_number, carrier)),
  );

  server.registerResource(
    "about-global-shopaholics",
    "gs://about",
    { title: "About Global Shopaholics", description: "What GS does, plans, fees, contacts and duty coverage.", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: aboutMarkdown() }] }),
  );

  server.registerPrompt(
    "buy-and-ship",
    {
      title: "Buy from a US store and ship with GS",
      description: "Guided flow: estimate total cost, then either get a free US address or ask GS to buy the item.",
      argsSchema: {
        product: z.string().describe("Product URL or description."),
        country: z.string().describe("Destination country."),
      },
    },
    ({ product, country }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `I want to buy ${product} from a US store and get it delivered to ${country} using Global Shopaholics.\n1. Find the item's US price (ask me if unknown) and its likely packed weight.\n2. Call estimate_landed_cost with that price and a package so I see item + GS fee + shipping + estimated duties.\n3. Show the 2–3 best shipping options from get_shipping_rates.\n4. Ask whether I'll buy it myself (then use get_started for a free US address) or want GS to buy it (confirm my name, email and details, then call request_assisted_purchase).\nLabel duty figures as estimates.`,
        },
      }],
    }),
  );

  return server;
}

export function aboutMarkdown() {
  return [
    `# ${GS_ABOUT.name}`,
    GS_ABOUT.summary,
    "",
    `- Warehouse: ${GS_ABOUT.warehouse}`,
    `- Carriers: ${GS_ABOUT.carriers.join(", ")}`,
    `- Sign up (free US address): ${GS_URLS.signup}`,
    `- Assisted Purchase: ${GS_URLS.assistedPurchase}`,
    `- Shipping calculator: ${GS_URLS.calculator}`,
    `- Contact: ${GS_CONTACT.email}, ${GS_CONTACT.phone}`,
    "",
    "## Plans",
    ...GS_PLANS.map((p) => `- **${p.name}** – ${p.price}`),
    "",
    "## Key fees",
    ...GS_FEES.map((x) => `- ${x.item}: ${x.value}`),
    `- Note: ${OWNER_POLICY_NOTE}`,
    "",
    `## Duty estimate coverage (${PROFILES.length} countries, per product category)\n${PROFILES.map((r) => `${r.name} (${r.confidence})`).join(", ")}\nOther countries: external tariff lookup by HS code (rough guide).`,
    "",
    `_Facts from ${GS_URLS.home} pages, last checked ${LAST_CHECKED}._`,
  ].join("\n");
}
