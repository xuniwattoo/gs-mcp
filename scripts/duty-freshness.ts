/**
 * Lists duty profiles whose last_checked is older than N days (default 180).
 * Usage: npm run duty:freshness [-- --days 180 --strict]   (--strict exits 1 when anything is stale)
 */
import { staleProfiles } from "../src/lib/duty-freshness.js";
import { PROFILES } from "../src/data/duty/profiles.js";
import WITS from "../src/data/duty/wits-mfn.json" with { type: "json" };

const args = process.argv.slice(2);
const days = Number(args[args.indexOf("--days") + 1]) || 180;
const stale = staleProfiles(args.includes("--days") ? days : 180);
console.log(`Duty profiles: ${PROFILES.length}. WITS tariff snapshot fetched ${(WITS as any).fetched}.`);
if (!stale.length) console.log(`All profiles checked within ${days} days.`);
else {
  console.log(`${stale.length} profile(s) older than ${days} days (GS priority first):`);
  for (const s of stale) console.log(`  ${s.code.padEnd(3)} ${s.name.padEnd(24)} last_checked ${s.last_checked} (${s.age_days} d) priority ${s.priority ?? "-"} confidence ${s.confidence}`);
}
const witsAge = Math.floor((Date.now() - Date.parse((WITS as any).fetched)) / 86_400_000);
if (witsAge > days) console.log(`WITS snapshot is ${witsAge} days old: re-run npx tsx scripts/fetch-wits.ts`);
if (args.includes("--strict") && (stale.length || witsAge > days)) process.exit(1);
