# GS cashback, discount and price-search plan

_Research only — nothing signed up for. Compiled Nov 18, 2026 (ET). Terms change; re-check a clause before relying on it._

## TL;DR

* **The honest bottom line:** almost every affiliate and cashback program bans, or lets the merchant claw back, commissions on purchases that **GS itself makes** for its customers. GS buying for a customer counts as one of three banned things: a self-purchase, a purchase "on behalf of" a third party, or a purchase for "resale or commercial use". Consumer cashback portals add more bans on automation and bots, and AI agents placing orders are exactly that.
* **Legit money in "buy-for-you" mode** comes from the **buyer side**:
  * business credit-card rewards: 2% flat, or 5% on Amazon;
  * Amazon Business pricing;
  * Best Buy price matching;
  * finding a cheaper seller;
  * selectively, discounted gift cards.
* **Legit affiliate money** comes from a second mode, **"link mode"**. For US domestic customers, the MCP returns a tagged link and the *customer* checks out on the store's site. That is ordinary affiliate traffic, so it's allowed by Walmart, Target, Best Buy, eBay, and CJ/Impact/Awin brands. Amazon is allowed only with care (see Agent Terms). GS must **not** buy through its own link, and must **not** pass commissions back to the customer where a program bans incentives.
* **CJ is the one network that says publisher dropshipping is OK at network level** (subject to each brand). Use it to approach brands directly for a "purchasing-agent" deal.
* **Recommended price API:** **Serper.dev Google Shopping** for the MCP `find_cheaper` tool. It gives 2,500 free queries with no card, then about $1 per 1k. Add **Best Buy's free Products API** for exact Best Buy SKU and price checks.

---

## 1. Which programs allow GS to earn on purchases it makes for customers

Legend: ✅ allowed · ⚠️ allowed only with brand approval or in link mode · ❌ banned / claw-back risk for GS-placed orders

| Program | GS buys for customer (self / proxy / resale) | Link mode (customer buys) | Key clause |
|---|---|---|---|
| **Amazon Associates** | ❌ **Explicit ban** | ⚠️ OK, but Agent Terms apply | See below |
| **Walmart Affiliates** (Impact) | ❌ | ✅ (no incentives) | See below |
| **Target Partners** (Impact) | ❌ (withheld if resale intent) | ✅ | See below |
| **Best Buy Affiliate/Creator** (Impact) | ❌ | ✅ | See below |
| **eBay Partner Network** | ❌ | ✅ / Buy API by contract | See below |
| **Rakuten Rewards** (consumer portal) | ❌ | n/a | See below |
| **Capital One Shopping** | ❌ (forfeit risk) | n/a | See below |
| **TopCashback** | ❌ | n/a | See below |
| **Honey / PayPal** | ❌ **Explicit** | n/a | See below |
| **Rakuten Advertising** (publisher network) | ⚠️ per advertiser | ✅ | See below |
| **Impact** (network) | ⚠️ per brand contract (EIO) | ✅ | See below |
| **CJ Affiliate** | ⚠️ **dropshipping permitted at network level** | ✅ | See below |
| **Awin / ShareASale** | ⚠️ per advertiser; self-purchase bans are common | ✅ | See below |
| **Business card cashback** | ✅ **Fully legit** (GS's own business spend) | n/a | See below |

### Clause detail

**Amazon Associates** — [Participation Requirements](https://affiliate-program.amazon.com/help/operating/participation):
* (k) "You will not make any orders or engage in other transactions of any kind on an Amazon Site **on behalf of any other person or entity**, or authorize, assist, or encourage any other person or entity to do so."
* (u) "…you will not purchase any Product(s) through Special Links … **for resale or commercial use (of any kind)**."
* The Agent Terms (same page) say any software that acts "on behalf of … any person" must identify itself and follow Amazon's rules.
* Amazon also forbids using Program Content for ML/LLM training, and it withholds **all** commissions on any violation ([Operating Agreement §2](https://affiliate-program.amazon.com/help/operating/agreement)).
* **Verdict: ban plus total claw-back. Never tag GS's own Amazon orders.**

**Walmart Affiliates** — [terms](https://affiliates.walmart.com/terms):
* You may not "purchase products or services sold or promoted on the Sites through a Qualifying Link **for resale or commercial use of any kind**".
* You also may not "offer any person or entity any consideration, reward, or incentive (including any money, rebate, discount, points…) for using Qualifying Links".
* **Verdict: no tagging of GS orders, and no sharing commission with customers.**

**Target Partners** — [terms](https://partners.target.com/termsandconditions):
* §10.1: "We have the right to cancel or withhold Referral Fees for any Qualifying Product(s) or Actions we suspect to be made **with intent to resell**…"
* §7 also requires "Notifying Target prior to implementing or removing any **cashback offerings**."

**Best Buy Affiliate/Creator** — [terms](https://www.bestbuy.com/site/best-buy-affiliate-program/creator-terms-and-conditions/pcmcat1741014869361.c?id=pcmcat1741014869361):
* "Customers" are defined as persons "**other than Creator or the Creator's agent**", so GS's own orders never qualify.
* §(e): "You may not act as or present yourself as a **reseller** … If Best Buy suspects any order was made with the intent to resell, we may determine it is not a Qualified Purchase."

**eBay Partner Network** — [Network Agreement and Participation Requirements](https://partnernetwork.ebay.com/page/network-agreement):
* "Personal Network: You may promote to your family members, relatives, and friends … However, the products purchased must be used for their personal use, and **not for resale**."
* "You may not promote the Network through any Software Application that … **automatically makes purchases on behalf of end users**."
* There is a separate contracted **eBay Buy API Program** that permits approved partners to "display and facilitate the purchase of products through eBay's API". That is the only sanctioned agent-buying path on eBay.

**Rakuten Rewards** (consumer portal) — [terms](https://www.rakuten.com/terms):
* §4.1 grants the licence "for your **personal use**".
* The prohibited uses include "(iv) access the Services by **expert system, electronic agent, 'bot'** or other automated means".
* Merchant pages routinely exclude "purchases made for resale or wholesale purposes" (e.g. [Temu](https://www.rakuten.com/shop/temu.com), [Lenovo](https://www.rakuten.com/shop/lenovo)).
* Rakuten also closes linked "families" of accounts and keeps the balance.

**Capital One Shopping** — [ToS §6.8](https://capitaloneshopping.com/our-terms/terms-of-service):
* It may "withhold, cancel, or subtract any pending or prior Rewards and/or terminate your … Account" for "engaging in activity that **resembles reseller behavior**, … having multiple individuals use the same … account, … **using automation**". The balance is then forfeited.
* §9.1 grants a "personal, non-commercial" licence.

**TopCashback** — [terms](https://www.topcashback.com/terms/):
* "The provision of Cash Back is **intended for consumers**."
* "Certain merchants do not permit bulk buying due to the potential for reselling in a commercial capacity … the merchant may decline the commission."
* It also requires that "you must purchase for genuine reasons."

**Honey / PayPal** — [terms](https://www.joinhoney.com/terms):
* "The Service is for **personal, non-commercial use**. You agree that you are **not using the Service for or on behalf of any third-party**, or for any commercial purpose."

**Rakuten Advertising** (publisher network) — [Publisher Membership Agreement §1.2](https://rakutenadvertising.com/legal-notices/publisher-membership-agreement/):
* "You may only use the Network … to conduct business activity and **not as a consumer**."
* The publisher's property must provide "a user-requested benefit".
* Self-purchase rules are set per advertiser.

**Impact** (network) — [Master Campaign Agreement §4.2](https://app.impact.com/public/legal/content/MCA.ihtml):
* Bans "Actions that are not in good faith, such as those using any **automated device, robot**…" and "the use of **incentives** to procure Actions".
* Brands add self-referral bans in their EIO (the brand's contract), so the brand's EIO decides.

**CJ Affiliate** — [CJ fraud guide](https://junction.cj.com/article/preventing-identifying-taking-action-against-fraud):
* "Self-submitting transactions … is prohibited."
* But also: "**Dropshipping is permitted in the CJ network**, but some brands may want to discuss this promotional type with publishers."
* **This is the best opening for GS's buy-for-you model. Pitch it as a disclosed purchasing-agent publisher.**

**Awin / ShareASale** — [Publisher Code of Conduct](https://awin.foleon.com/code-of-conduct-publisher/en-us/):
* Requires genuine user interaction with tracking links, and no automatic cashback activation.
* Many advertiser profiles explicitly ban self-purchases.

**Business card cashback** — cardholder agreements:
* Business cards are *meant* for business purchases, and buying inventory or goods for customers is normal business spend.
* Watch out for exclusions on gift cards, cash equivalents and money orders.

**Practical rule:** in buy-for-you mode, assume **$0 affiliate/portal income** unless a brand has approved GS in writing (CJ/Impact/Awin brand deal). Consumer portals (Rakuten Rewards, Capital One Shopping, TopCashback, Honey) are a **no**. They can also burn the account and the email/PayPal attached to it.

---

## 2. Price and discount levers GS can use as the buyer

| Lever | How | Terms / caveats | Typical gain |
|---|---|---|---|
| **Business credit card** | Put all customer purchases on a business card | Needs EIN, owner SSN (personal guarantee) and revenue. Rewards on business spend are a purchase rebate (ask the accountant about tax treatment). | **1.5–2% everywhere; 5% Amazon** |
| **Amazon Business (free account)** | Business-only prices and quantity discounts; tax-exempt programme where applicable | **Do not use Business Prime shipping for customer orders.** [Business Prime terms](https://www.amazon.com/gp/help/customer/display.html?nodeId=202159880) bar using it to buy for resale or "ship products to your customers or other parties". A free Amazon Business account itself allows business buying. | 0–10% on eligible items |
| **Best Buy Price Match** | Ask Best Buy to match Amazon, Walmart, Target, Costco, etc. (19 competitors; must be sold *by* the competitor, not a marketplace seller) — [policy](https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat290300050002.c?id=pcmcat290300050002) | No signup. Useful when the customer wants Best Buy (warranty, pickup). | Equal to the price gap |
| **Target price adjustment** | Target **stopped matching competitors in July 2025**; it now only adjusts to its own lower price within 14 days — [policy](https://www.target.com/help/articles/policies-guidelines/price-match-guarantee) | Claim back own-price drops. | Small |
| **Cheaper-seller search** | Find the same UPC/model at another authorised retailer, an outlet, or open-box/refurbished (Best Buy Open-Box, Amazon Resale (ex-Warehouse), Walmart Restored, brand outlets, Woot) | Must tell the customer when an item is open-box or refurbished | 5–30% on the minority of items where it applies |
| **Coupon / promo codes** | Codes from store newsletters (sign up with a GS address), the RetailMeNot / Slickdeals / DealNews public feeds, and brand first-order codes | Don't use the **Honey / Capital One Shopping** extensions: their terms are personal-only. Check codes by hand or by scraping public pages. | 5–15% on first orders / sales |
| **Discounted gift cards** | Buy store gift cards below face value. CardCash currently lists Target up to ~2.4% off and Walmart ~1% off. | CardCash licence is "for your own personal use" for site content. Raise has a separate "For Business" product, so read its terms before use. Main risks are drained or fraudulent cards and retailers voiding cards. Paying with a gift card also voids most cashback. Use only for big, steady merchants. | 1–5% |
| **Store loyalty** | Target Circle, My Best Buy, Walmart+ | Consumer programmes, usually "personal use". **Don't rely on them**: account closure risk. | — |

---

## 3. Price-search APIs for an MCP `find_cheaper` tool

| Source | Free tier | Commercial use | Rate limit | Fit |
|---|---|---|---|---|
| **Serper.dev** (`POST google.serper.dev/shopping`) | **2,500 free queries, no card**, then about $0.30–$1 per 1k | ToS has no non-commercial restriction; it resells scraped Google data (Google-ToS risk sits with Serper) | Generous | ⭐ **Recommended**: one call returns many US stores and prices for a product name or UPC |
| **SerpApi** (`engine=google_shopping`) | 250 searches/mo, 50/hr | Commercial OK; paid plans include its "Legal Shield" | 50/hr free | Backup / upgrade path ($75/mo for 5k) |
| **Best Buy Products API** | Free key | Allowed in apps you run; **cache ≤72 h**; no sharing the key — [terms](https://developer.bestbuy.com/legal) | 5 req/s, 50k/day | Add-on for exact Best Buy SKU, price and open-box |
| **eBay Browse API** | 5,000 calls/day default | Production use of Buy APIs needs an eBay partner contract + EPN + Growth Check — [requirements](https://developer.ebay.com/api-docs/buy/static/buy-requirements.html) | 5k/day | Later; heavy paperwork |
| **Walmart affiliate API** | Free after approval | Requires an approved Walmart (Impact) affiliate account; data is for affiliate use | — | Link mode only |
| **Amazon Creators API / PA-API** | Free with Associates | Associates-only. Amazon forbids using it in buying flows for others and bans ML use, and agents must follow Agent Terms. | Tied to sales | ❌ avoid for buy-for-you |
| **Keepa** | None (from €49/mo) | Commercial OK | Token based | Amazon price history only; paid |
| **Rainforest (Traject)** | 100 trial requests | Commercial OK | Paid after trial | Amazon only; paid |

**Recommendation:** wire **Serper Shopping** into a new MCP tool, `find_cheaper(url | product name | UPC)`:

1. Resolve the product title or UPC from the link (open-graph/JSON-LD on the store page).
2. Query Serper Shopping.
3. Filter to US authorised retailers.
4. Return the 3–5 lowest prices with links and a "GS can buy this for you" CTA.

Cache results for 24 h per product in the existing Durable Object. Add the Best Buy API when the link is bestbuy.com. Budget: 2,500 free queries ≈ the first few hundred requests, then about $1 per 1k.

---

## 4. Ranked action list

Earnings are per **$1,000 GS purchases** and assume a typical mix (≈40% Amazon, 60% other).

| # | Action | Needs | Est. $/1k | Notes |
|---|---|---|---|---|
| 1 | **Business card for all customer purchases.** Amex Blue Business Cash (2% to $50k/yr, $0 fee), or Capital One Spark Cash Plus (2% unlimited, $150 fee), plus the **Amazon Business Prime Amex** for Amazon (5% on first $120k/yr with eligible Prime) | **Zuni: EIN, SSN, business revenue, bank account** | **$20 (non-Amazon) / $50 (Amazon) → about $32 blended** | Safest, biggest, works on 100% of orders |
| 2 | **`find_cheaper` MCP tool on Serper** (+ Best Buy API) | Serper signup with muhammad@ (**no card**); Best Buy dev key (no card) | $10–30 (margin kept from savings shared with the customer) | Also a strong AI-agent selling point |
| 3 | **Free Amazon Business account** for business pricing (not Business Prime shipping for customer orders) | EIN + business address; card on file | $5–20 | Low effort |
| 4 | **Link mode for US domestic requests**: MCP returns affiliate links where the customer buys directly. Apply to Impact (Walmart, Target, Best Buy), CJ and EPN. | Application (needs a website, i.e. globalshopaholics.com); **W-9 / tax ID + bank before payout** | $10–40 on link-mode orders (Walmart 1–4%, Target 1–8%, eBay 1–4%, Best Buy small) | GS never buys through its own link. Disclose "GS may earn a commission." No rebating to customers where banned (Walmart, Impact). |
| 5 | **CJ purchasing-agent brand deals**: after CJ approval, message brands to say GS is a disclosed purchasing-agent/dropship publisher, and ask for commission on GS-placed orders | CJ account (tax info before payout) | 3–8% on approved brands only | The only path to commission in buy-for-you mode |
| 6 | **Best Buy price-match workflow** | Nothing | Varies | Manual step when the customer wants Best Buy |
| 7 | **Discounted gift cards** (CardCash) for Target and other big merchants | Account; payment method | $10–25 where used | Fraud and void risk; small scale only |
| ✗ | **Do not:** Amazon Associates on GS orders; Rakuten Rewards, Capital One Shopping, TopCashback or Honey for GS purchases; Amazon Business Prime shipping to customers; sharing commissions as customer rebates on Walmart/Impact | — | — | Banned / claw-back / account loss |

**Can do today with muhammad@ (no card or tax info):** Serper key, Best Buy developer key, eBay developer account (sandbox), CJ / Impact / Awin publisher *applications* (tax info is requested before the first payout, not at signup).

**Needs Zuni:** business card applications (EIN, SSN, income, bank), Amazon Business (EIN, card), and W-9 / tax and bank details for any affiliate payout.

**Realistic blended uplift in buy-for-you mode:** about **$30–60 per $1,000**, mostly card rewards plus price savings. Link mode adds commissions on top for domestic customers who are happy to check out themselves.
