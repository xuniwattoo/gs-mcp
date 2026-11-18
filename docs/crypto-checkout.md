# Crypto checkout (BTCPay)

Tools: `create_crypto_payment` (USD amount 0.50-10,000, description, customer email, optional GS reference) and `get_crypto_payment_status` (invoice id).

- Creates `POST {BTCPAY_URL}/api/v1/stores/{BTCPAY_STORE_ID}/invoices` in USD; metadata: orderId, buyerEmail, itemDesc, source `gs-mcp`. Invoice expires in 60 minutes.
- Agents must call it only after GS quoted a total (or the customer agreed an amount with GS). Crypto carries 0% GS fee.
- Rate limited with the same Durable Object limiter as lead tools (per IP/hour, per email/day, daily cap). Each invoice is tagged `mcp-crypto-payment` with a note on the GHL contact (best effort).
- Config: secrets `BTCPAY_API_KEY`, `BTCPAY_STORE_ID`, `BTCPAY_URL` (set with `wrangler secret put`); optional var `CRYPTO_MAX_USD`.
- The API key should only hold `btcpay.store.cancreateinvoice` and `btcpay.store.canviewinvoices`. Never commit it.
