import type { Config } from "../config.js";

export class BtcpayError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export function btcpayConfigured(cfg: Config): boolean {
  return !!(cfg.btcpayUrl && cfg.btcpayApiKey && cfg.btcpayStoreId);
}

export interface CryptoInvoice {
  invoice_id: string;
  checkout_url: string;
  status: string;
  amount_usd: number;
  expires_at: string | null;
  reference?: string;
}

function headers(cfg: Config) {
  return { authorization: `token ${cfg.btcpayApiKey}`, "content-type": "application/json", accept: "application/json" };
}

function shape(inv: any): CryptoInvoice {
  const exp = Number(inv?.expirationTime);
  return {
    invoice_id: String(inv.id),
    checkout_url: String(inv.checkoutLink),
    status: String(inv.status),
    amount_usd: Number(inv.amount),
    expires_at: Number.isFinite(exp) && exp > 0 ? new Date(exp * 1000).toISOString() : null,
    reference: inv?.metadata?.orderId,
  };
}

export async function createInvoice(
  cfg: Config,
  f: typeof fetch,
  i: { amount_usd: number; description: string; email: string; reference?: string },
): Promise<CryptoInvoice> {
  const body = {
    amount: i.amount_usd.toFixed(2),
    currency: "USD",
    metadata: {
      ...(i.reference ? { orderId: i.reference } : {}),
      buyerEmail: i.email,
      itemDesc: i.description,
      source: "gs-mcp",
    },
    checkout: { speedPolicy: "MediumSpeed", expirationMinutes: 60 },
  };
  const res = await f(`${cfg.btcpayUrl}/api/v1/stores/${encodeURIComponent(cfg.btcpayStoreId!)}/invoices`, { method: "POST", headers: headers(cfg), body: JSON.stringify(body) });
  if (!res.ok) throw new BtcpayError(`BTCPay HTTP ${res.status}`, res.status);
  return shape(await res.json());
}

export async function getInvoice(cfg: Config, f: typeof fetch, invoiceId: string): Promise<CryptoInvoice> {
  const res = await f(`${cfg.btcpayUrl}/api/v1/stores/${encodeURIComponent(cfg.btcpayStoreId!)}/invoices/${encodeURIComponent(invoiceId)}`, { headers: headers(cfg) });
  if (res.status === 404) throw new BtcpayError("Invoice not found", 404);
  if (!res.ok) throw new BtcpayError(`BTCPay HTTP ${res.status}`, res.status);
  return shape(await res.json());
}
