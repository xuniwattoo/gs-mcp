import { PROFILES } from "../data/duty/profiles.js";
import { PRIORITY_RANK } from "../data/duty/priority.js";
import type { CountryDutyProfile } from "../data/duty/types.js";

export interface StaleEntry { code: string; name: string; last_checked: string; age_days: number; priority?: number; confidence: string }

/** Countries whose last_checked is older than maxAgeDays, most important (GS volume) first. */
export function staleProfiles(maxAgeDays = 180, today: Date = new Date(), profiles: CountryDutyProfile[] = PROFILES): StaleEntry[] {
  const out: StaleEntry[] = [];
  for (const p of profiles) {
    const age = Math.floor((today.getTime() - Date.parse(`${p.last_checked}T00:00:00Z`)) / 86_400_000);
    if (!Number.isFinite(age) || age > maxAgeDays) out.push({ code: p.code, name: p.name, last_checked: p.last_checked, age_days: age, priority: PRIORITY_RANK[p.code], confidence: p.confidence });
  }
  return out.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || b.age_days - a.age_days);
}
