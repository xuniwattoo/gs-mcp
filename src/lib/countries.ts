import { GS_COUNTRIES, type GsCountry } from "../data/countries.js";

const ALIASES: Record<string, string> = {
  UK: "GB", "GREAT BRITAIN": "GB", ENGLAND: "GB", BRITAIN: "GB", "UNITED KINGDOM": "GB",
  UAE: "AE", EMIRATES: "AE", DUBAI: "AE", "UNITED ARAB EMIRATES": "AE",
  KSA: "SA", SAUDI: "SA", "SAUDI ARABIA": "SA",
  HOLLAND: "NL", "THE NETHERLANDS": "NL", DEUTSCHLAND: "DE",
  "SOUTH KOREA": "KR", KOREA: "KR", RUSSIA: "RU", VIETNAM: "VN",
};

export function resolveCountry(input: string): GsCountry | undefined {
  const q = input.trim().toUpperCase();
  const code = ALIASES[q] ?? q;
  return (
    GS_COUNTRIES.find((c) => c.code === code) ??
    GS_COUNTRIES.find((c) => c.name.toUpperCase() === q) ??
    GS_COUNTRIES.find((c) => c.name.toUpperCase().startsWith(q) && q.length >= 4)
  );
}
