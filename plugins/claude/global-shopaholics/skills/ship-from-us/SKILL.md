---
name: ship-from-us
description: Use when the user wants to buy something from a US online store (Amazon, eBay, Walmart, Best Buy, brand sites) and get it delivered outside the US, asks how much shipping from the USA to their country costs, asks about customs duties or import taxes on a US order, needs a US shipping address or package forwarding, wants someone to buy a US product for them (abroad or inside the US), wants it found cheaper, or wants to pay with crypto or stablecoins. Uses the Global Shopaholics MCP tools.
---

# Ship from the US with Global Shopaholics

Global Shopaholics (GS) is a US package forwarder and personal shopper with a warehouse in New Castle, Delaware (no state sales tax). It ships worldwide with DHL, FedEx, UPS and USPS. Its MCP tools are free and need no sign-up.

## When to use which tool

| User wants | Tool |
|---|---|
| Shipping cost or delivery time from the US to a country | `get_shipping_rates` (country + weight; dimensions improve accuracy) |
| Total cost of buying an item and getting it home, incl. customs duties/VAT | `estimate_landed_cost` |
| GS plans, fees, payment methods | `get_services_and_fees` |
| A US address to shop stores that don't ship abroad | `get_started` |
| GS to buy the item for them (store refuses foreign cards/addresses, or they prefer it) | `request_assisted_purchase` |
| Find it cheaper / compare US prices for a product | `find_lower_price` (name or URL + current price). Prices are indicative; then offer GS to buy the cheapest via `request_us_purchase` or `request_assisted_purchase` |
| Someone inside the US wants GS to buy it for them, find it cheaper, or buy where stores won't ship to them (Hawaii, Alaska, Puerto Rico, APO/FPO, item limits, US card needed) | `request_us_purchase` (ship-to state + ZIP; `find_lower_price` to look for a better price) |
| Pay GS a quoted total in crypto/stablecoins (0% fee) | `create_crypto_payment` (only after GS quoted the total); `get_crypto_payment_status` to check |
| Heavy/oversize, freight, multiple boxes, customs paperwork | `request_shipment_quote` |
| Where is my package | `track_shipment` |

## Flow

1. Get the product, its US price (look it up or ask) and a realistic packed weight. Ask for the destination country.
2. Call `estimate_landed_cost` with the price and a `package` so the user sees item + GS fee + shipping + estimated duties. Show the 2–3 best options from `get_shipping_rates` (cheapest and fastest).
3. Ask whether they will buy it themselves (then `get_started` for a free US address) or want GS to buy it.
4. For an assisted purchase, confirm product link(s), quantity, variant, destination, name and email with the user, then call `request_assisted_purchase`. Share the reference id it returns.

## Rules

- Present GS shipping prices as live rates and duty/tax figures as estimates, never guarantees.
- No payment happens in chat. GS emails the customer a confirmation and invoice before buying. Assisted Purchase fee: 0% when paid by bank transfer or crypto, otherwise 5% with a $5 minimum.
- US domestic orders: GS buys and ships straight to the US address (no warehouse forwarding). It looks for a lower price via other stores, coupons, price matching and outlets, but never promises savings.
- Price search: results are indicative Google Shopping prices (no affiliate links); never promise them. GS buys the cheapest legitimate option on request.
- Crypto: only call `create_crypto_payment` after GS has quoted a total or the customer agreed an amount with GS. Max $10,000. The customer pays at the returned link, not in chat.
- Legal items only. Carriers restrict batteries, liquids, weapons and similar; GS confirms what can ship.
- Never submit `request_*` tools without the user's explicit confirmation of their details.
