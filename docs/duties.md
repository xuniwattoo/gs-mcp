# Duty & tax estimator

`estimate_landed_cost` estimates import duty, VAT/GST and fees **per item and product category**. Output is always an
estimate: a `typical` figure plus a `low`–`high` range, with the sources and `last_checked` date of the rules used.

## Where the data lives

| File | What |
| --- | --- |
| `src/data/duty/profiles.ts` | One profile per country: tax name and rates (with category-specific rates), duty and tax de minimis (local currency + USD, goods or CIF basis, certainty), valuation basis (CIF/FOB), extra levies (Nigeria surcharge/CISS, Kenya IDF/RDL, Ghana levies, India SWS via the 9804 regime…), excise/surtax, special courier regimes, who collects, sources, `last_checked`, `confidence`. |
| `src/data/duty/categories.ts` | 30 product categories → HS-6 codes, HS prefixes and free-text keywords. |
| `src/data/duty/wits-mfn.json` | MFN applied tariff per category HS-6 for every profiled country (UNCTAD TRAINS via World Bank WITS). Refresh with `npm run duty:wits`. |
| `src/data/duty/priority.ts` | GS paid shipments by destination (last ~90 days). Used to rank review effort. |
| `src/data/duty/fallback-vat.ts` | Standard VAT rates + WITS reporter codes for countries without a profile (low confidence). |

Category duty = profile override → WITS MFN rate → profile default range. For US free-trade partners (`usFta`) the low
estimate uses 0% (US-made goods); typical/high use MFN because most retail goods are made elsewhere.

Special regimes: Angola courier flat 16% (≤ AOA 1.5M), India personal imports (heading 9804, 30.98%), Brazil 60% +
ICMS by inclusion, Algeria DZD 50k/100k parcel bands, EU €3 per tariff category for consignments ≤ €150
(1 Jul 2026 – 1 Jul 2028), Indonesia PMK 4/2025, Australia and Malaysia low-value goods taxed at sale.

## Countries without a profile

`src/lib/duty-fallback.ts`: permanent cache (Durable Object `DutyCacheDO`, key `duty:<country>:<hs6>`) →
Easyship Taxes & Duties API (only when the `EASYSHIP_API_KEY` secret is set; probed at a US$1,000 value) →
World Bank WITS MFN rate (free, no key). Results are stored forever so GS builds its own country × HS6 table.

## Updating

1. Edit the country's profile, add or replace `sources`, set `last_checked` to today.
2. `npm test`, then deploy.
3. `npm run duty:freshness` lists profiles older than 180 days (GS volume first); `-- --strict` exits 1 if any.
