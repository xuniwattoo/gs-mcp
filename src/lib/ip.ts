/**
 * Canonical client key for rate limits.
 * IPv4 is used as-is. IPv6 is folded to the /64 prefix so privacy-address and
 * SNAT rotations on the same network share a bucket (standard IPv6 rate-limit practice).
 */
export function canonicalizeClientIp(ip: string): string {
  let s = ip.trim().toLowerCase();
  if (!s) return "unknown";
  if (s.startsWith("[") && s.includes("]")) s = s.slice(1, s.indexOf("]"));
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  const v4 = s.startsWith("::ffff:") ? s.slice(7) : s;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v4)) return v4;
  if (!s.includes(":")) return s;
  const parts = expandIPv6(s);
  if (!parts) return s;
  return `${parts.slice(0, 4).join(":")}::/64`;
}

function expandIPv6(addr: string): string[] | undefined {
  if (addr.includes(".")) return undefined;
  const sides = addr.split("::");
  if (sides.length > 2) return undefined;
  const parse = (side: string) => (side ? side.split(":") : []);
  if (sides.length === 2) {
    const head = parse(sides[0]);
    const tail = parse(sides[1]);
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return undefined;
    const parts = [...head, ...Array(missing).fill("0"), ...tail];
    return parts.length === 8 ? parts.map(normHextet) : undefined;
  }
  const parts = addr.split(":");
  return parts.length === 8 ? parts.map(normHextet) : undefined;
}

function normHextet(h: string): string {
  const hex = h.replace(/^0+(?=\w)/, "");
  return (hex || "0").toLowerCase();
}
