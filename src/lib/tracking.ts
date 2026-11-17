export type Carrier = "dhl" | "fedex" | "ups" | "usps";

const URLS: Record<Carrier, (n: string) => string> = {
  dhl: (n) => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(n)}`,
  fedex: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  ups: (n) => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(n)}`,
  usps: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
};

/** Best-effort carrier guess from the tracking number format. */
export function guessCarrier(n: string): Carrier | undefined {
  const t = n.replace(/\s+/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return "ups";
  if (/^(94|93|92|95)\d{20,24}$/.test(t) || /^[A-Z]{2}\d{9}US$/.test(t)) return "usps";
  if (/^\d{10}$/.test(t) || /^JJD\d+$/.test(t) || /^JD\d{18}$/.test(t)) return "dhl";
  if (/^\d{12}$/.test(t) || /^\d{15}$/.test(t) || /^\d{20}$/.test(t)) return "fedex";
  return undefined;
}

export function trackingLinks(trackingNumber: string, carrier?: Carrier) {
  const n = trackingNumber.replace(/\s+/g, "");
  const guessed = carrier ?? guessCarrier(n);
  return {
    tracking_number: n,
    carrier: guessed ?? null,
    carrier_detected: carrier ? "provided" : guessed ? "guessed_from_format" : "unknown",
    tracking_url: guessed ? URLS[guessed](n) : null,
    all_carrier_links: Object.fromEntries((Object.keys(URLS) as Carrier[]).map((c) => [c, URLS[c](n)])),
    gs_account: "Logged-in GS customers also see shipment status in their dashboard: https://login.globalshopaholics.com/login",
    note: "GS has no public tracking-lookup page; tracking comes from the carrier. GS emails the tracking number when the shipment leaves the warehouse.",
  };
}
