import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { GS_ABOUT, GS_CONTACT, GS_FEES, GS_PLANS, GS_SERVICES, GS_URLS, LAST_CHECKED, OWNER_POLICY_NOTE } from "./data/gs.js";
import { DUTY_RULES } from "./data/duties.js";
import { getShippingRates, RatesError } from "./lib/rates.js";
import { estimateLandedCost } from "./lib/landed.js";
import { submitLead } from "./lib/leads.js";
import { RateLimiter } from "./lib/ratelimit.js";
import { trackingLinks } from "./lib/tracking.js";

export const SERVER_NAME = "global-shopaholics";
export const SERVER_VERSION = "0.1.0";

export interface ServerDeps {
  fetch?: typeof fetch;
  /** Identifies the caller for rate limiting (client IP). */
  clientKey?: string;
  limiter?: RateLimiter;
}

let sharedLimiter: RateLimiter | undefined;
function getLimiter(cfg: Config) {
  sharedLimiter ??= new RateLimiter(cfg.leadRateLimitPerHour, 60 * 60 * 1000);
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
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION, title: "Global Shopaholics – US shopping & international shipping" },
    {
      instructions:
        "Global Shopaholics (GS) lets people anywhere buy from any US store and ship worldwide. Typical flow: get_shipping_rates or estimate_landed_cost → get_services_and_fees → get_started (free US address) or request_assisted_purchase (GS buys for them) / request_shipment_quote → track_shipment. Always present costs as GS's live rates or labelled estimates, never as guarantees. Only submit request_* tools after the user confirms their name, email and request details.",
    },
  );

  const checkLimit = (tool: string) => limiter.check(`${deps.clientKey ?? "anon"}:${tool}`);

  server.registerTool(
    "get_shipping_rates",
    {
      title: "Get GS international shipping rates",
      description:
        "Live shipping prices from Global Shopaholics' US warehouse (Delaware) to a destination country, for DHL, FedEx, UPS and USPS services. Returns each service's USD price, transit time, max weight/size, insurance terms and whether dimensional weight applies, sorted cheapest first. Prices exclude import duties/taxes. Use for 'how much to ship X kg to <country>'.",
      inputSchema: {
        country: z.string().min(2).describe("Destination country: ISO 2-letter code (AO, SA, AE, GB, NG...) or name ('Angola')."),
        city: z.string().max(80).optional().describe("Destination city. Defaults to the capital GS's calculator uses."),
        zip: z.string().max(20).optional().describe("Destination postal code. Defaults to the calculator's capital zip (00000 where none)."),
        ...packageShape,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        return json(await getShippingRates({ ...a, unit: a.unit ?? "kg" }, cfg, f));
      } catch (e) {
        const err = e as RatesError;
        return fail(err.message, { kind: err.kind, calculator: GS_URLS.calculator });
      }
    },
  );

  server.registerTool(
    "estimate_landed_cost",
    {
      title: "Estimate total landed cost (item + GS fee + shipping + duties)",
      description:
        "Estimates what a buyer pays in total to get US goods delivered: item price, optional US sales tax, GS Assisted Purchase fee, live GS shipping (if package weight given) and estimated import duty/VAT for the destination from a sourced rules table (Angola, Saudi Arabia, UAE, UK, Canada, Australia, Nigeria, Pakistan, India, Brazil, Germany, France, Netherlands). Returns a low–high range. Results are ESTIMATES, not quotes.",
      inputSchema: {
        destination_country: z.string().min(2).describe("ISO 2-letter code or country name."),
        items_total_usd: z.number().positive().describe("Total price of the items in USD (all quantities)."),
        us_sales_tax_pct: z.number().min(0).max(15).optional().describe("US sales tax % if the store charges it. Default 0 (GS address is in Delaware: no sales tax)."),
        assisted_purchase: z.enum(["none", "standard", "expedited", "executive"]).default("standard").describe("'standard' if GS buys it for you; 'none' if the shopper buys and ships to their GS address."),
        payment_method: paymentMethod.default("card").describe("How the GS invoice will be paid. Bank transfer or crypto: 0% standard assisted-purchase fee."),
        shipping_usd: z.number().min(0).optional().describe("Known shipping cost. Omit and pass package to fetch live GS rates."),
        package: z.object(packageShape).optional().describe("Package for a live shipping quote."),
        preferred_carrier: z.string().optional().describe("Pick the cheapest service of this carrier (DHL, FedEx, UPS, USPS)."),
        item_categories: z.number().int().min(1).max(50).optional().describe("Distinct product types (EU €3-per-category duty). Default 1."),
        hs_code: z.string().optional().describe("Optional HS code; used with Easyship's duty API when configured."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        return json(await estimateLandedCost({ ...a, assisted_purchase: a.assisted_purchase ?? "standard", payment_method: a.payment_method ?? "card", package: a.package ? { ...a.package, unit: a.package.unit ?? "kg" } : undefined }, cfg, f));
      } catch (e: any) {
        return fail(e?.message ?? String(e));
      }
    },
  );

  server.registerTool(
    "get_services_and_fees",
    {
      title: "GS services, plans and published fees",
      description: "Global Shopaholics' services (US address, consolidation, Assisted Purchase, shipping), subscription plans (Basic free, Premium $9.99/mo, Business $14.99/mo) and published fees, each with its source URL and last-checked date.",
      inputSchema: { topic: z.enum(["all", "plans", "fees", "services", "assisted_purchase", "payment"]).default("all").describe("Narrow the answer.") },
      annotations: { readOnlyHint: true },
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
      title: "How to get a free GS US address",
      description: "Step-by-step instructions to sign up for a free Global Shopaholics US shipping address and start shopping and shipping. Use when a user wants to start or asks how GS works.",
      inputSchema: { country: z.string().optional().describe("Optional: user's country, to tailor tips.") },
      annotations: { readOnlyHint: true },
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
      title: "Ask GS to buy a US product for the user",
      description:
        "Sends an Assisted Purchase request to the Global Shopaholics team: GS checks price/availability, confirms the total with the customer by email, buys from the US store, and ships it. Nothing is charged by this tool. Only call after the user has confirmed product link(s), quantity, destination, name and email. Returns a reference id and next steps.",
      inputSchema: {
        product_urls: z.array(z.string().url()).min(1).max(20).describe("Product page URL(s) at US stores."),
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
      const lim = checkLimit("request_assisted_purchase");
      if (!lim.ok) return fail(`Rate limit reached. Try again in ${lim.retryAfterSec}s or use ${GS_URLS.assistedPurchase}.`);
      const summary = [
        "Assisted Purchase request via AI agent (MCP)",
        `Name: ${a.name} | Email: ${a.email}${a.phone ? ` | Phone: ${a.phone}` : ""}`,
        `Ship to: ${a.destination_city ? a.destination_city + ", " : ""}${a.destination_country}`,
        `Products (qty ${a.quantity ?? 1}): ${a.product_urls.join(" , ")}`,
        a.variant ? `Variant: ${a.variant}` : "",
        a.budget_usd ? `Budget: $${a.budget_usd}` : "",
        a.payment_method ? `Payment: ${a.payment_method}` : "",
        a.notes ? `Notes: ${a.notes}` : "",
      ].filter(Boolean).join("\n");
      const r = await submitLead({ kind: "assisted_purchase", name: a.name, email: a.email, phone: a.phone, destination_country: a.destination_country, destination_city: a.destination_city, details: a, summary }, cfg, f);
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
      title: "Request a GS shipping quote / help with labels and customs paperwork",
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
      const lim = checkLimit("request_shipment_quote");
      if (!lim.ok) return fail(`Rate limit reached. Try again in ${lim.retryAfterSec}s or email ${GS_CONTACT.email}.`);
      const pk = (a.packages ?? []).map((p, i) => `#${i + 1}: ${p.weight}${p.unit ?? "kg"}${p.length ? ` ${p.length}x${p.width ?? "?"}x${p.height ?? "?"}` : ""}`).join("; ");
      const summary = [
        "Shipment request via AI agent (MCP)",
        `Name: ${a.name} | Email: ${a.email}${a.phone ? ` | Phone: ${a.phone}` : ""}`,
        `Ship to: ${a.destination_city ? a.destination_city + ", " : ""}${a.destination_country}`,
        `Contents: ${a.contents}${a.declared_value_usd !== undefined ? ` | Declared value: $${a.declared_value_usd}` : ""}`,
        pk ? `Packages: ${pk}` : "",
        `Needs: ${(a.needs ?? ["quote"]).join(", ")}`,
        a.notes ? `Notes: ${a.notes}` : "",
      ].filter(Boolean).join("\n");
      const r = await submitLead({ kind: "shipment_quote", name: a.name, email: a.email, phone: a.phone, destination_country: a.destination_country, destination_city: a.destination_city, details: a, summary }, cfg, f);
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
    "track_shipment",
    {
      title: "Get tracking links for a GS shipment",
      description: "Returns the official carrier tracking URL for a DHL, FedEx, UPS or USPS tracking number (carrier auto-detected from the number format if not given). GS ships with these carriers and emails the tracking number on dispatch.",
      inputSchema: {
        tracking_number: z.string().min(6).max(40),
        carrier: z.enum(["dhl", "fedex", "ups", "usps"]).optional(),
      },
      annotations: { readOnlyHint: true },
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
    `## Duty estimate coverage\n${DUTY_RULES.map((r) => r.country).join(", ")}`,
    "",
    `_Facts from ${GS_URLS.home} pages, last checked ${LAST_CHECKED}._`,
  ].join("\n");
}
