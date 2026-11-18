/**
 * Global Shopaholics public facts. Every value below was read from the cited public page.
 * Re-check these pages when GS changes pricing and bump LAST_CHECKED.
 */
export const LAST_CHECKED = "2026-11-17";

export const GS_URLS = {
  home: "https://globalshopaholics.com/",
  signup: "https://login.globalshopaholics.com/register",
  login: "https://login.globalshopaholics.com/login",
  howItWorks: "https://globalshopaholics.com/how-it-works/",
  plans: "https://globalshopaholics.com/subscription-plan/",
  faqs: "https://globalshopaholics.com/faqs/",
  assistedPurchase: "https://globalshopaholics.com/assisted-purchase/",
  calculator: "https://globalshopaholics.com/international-shipping-calculator/",
  taxFree: "https://globalshopaholics.com/tax-free/",
  returnPolicy: "https://globalshopaholics.com/return-policy/",
  shipmentCancellation: "https://globalshopaholics.com/shipment-cancellation/",
  contact: "https://globalshopaholics.com/contact-us/",
} as const;

export const GS_CONTACT = {
  email: "help@globalshopaholics.com",
  phone: "+1 302 725 0586",
  source: GS_URLS.contact,
};

export const GS_ABOUT = {
  name: "Global Shopaholics",
  summary:
    "US package forwarding and assisted purchase. Sign up free for a US shipping address at the GS warehouse in New Castle, Delaware (no state sales tax), shop any US store, consolidate packages and ship worldwide with DHL, FedEx, UPS or USPS. If a store refuses foreign cards or addresses, GS buys the item for you (Assisted Purchase).",
  warehouse: "New Castle, Delaware, USA (your personal suite address is shown in your dashboard after sign-up)",
  carriers: ["DHL", "FedEx", "UPS", "USPS"],
  source: GS_URLS.howItWorks,
};

export interface Fee { item: string; value: string; source: string }
export interface Plan { name: string; price: string; highlights: string[]; source: string }

export const GS_PLANS: Plan[] = [
  {
    name: "Basic",
    price: "Free (forever free)",
    highlights: [
      "Free US address (no sales tax in Delaware)",
      "Package consolidation",
      "Up to 30 days free storage",
      "Express Processing – $5",
      "Fast Lane – 2 free packages/month (rest $1 per package)",
      "Photo of package upon arrival / package content",
      "Extra Padding – $3",
      "Equipment Testing – $10",
      "Detailed Item Photo – $10",
      "Private Address – 10% of items cost",
      "Insurance: $10 minimum, at most 2% of declared value",
      "Shipment Cancellation – $10",
    ],
    source: GS_URLS.plans,
  },
  {
    name: "Premium",
    price: "$9.99/month",
    highlights: [
      "Everything in Basic",
      "Unlimited 2% cashback",
      "Up to 180 days storage",
      "Express Processing – 3 shipments/month",
      "Free Private Address – 2 times/month",
      "Insurance: $10 minimum, at most 2% of declared value",
      "Extra Padding included",
      "Equipment Testing – $5",
      "Detailed Item Photo – $5",
      "Shipment Cancellation – $7",
      "Free Address Correction",
    ],
    source: GS_URLS.plans,
  },
  {
    name: "Business",
    price: "$14.99/month",
    highlights: [
      "3% cashback",
      "Free US address, package consolidation",
      "Up to 210 days storage",
      "Express processing – 8 shipments/month (rest $3 per shipment)",
      "Fast Lane – unlimited",
      "Dedicated account manager",
      "Extra Padding",
      "Equipment Testing – 3 items/shipment",
      "Detailed Item Photo – $2.5",
    ],
    source: GS_URLS.plans,
  },
];

export const GS_FEES: Fee[] = [
  { item: "Assisted Purchase – standard request (published)", value: "0% bank transfer/crypto, otherwise 5% with a $5 minimum", source: GS_URLS.faqs },
  { item: "Assisted Purchase – expedited request", value: "10% of order cost, $10 minimum", source: GS_URLS.assistedPurchase },
  { item: "Assisted Purchase – executive (special address, e.g. Sephora, ULTA, Coach)", value: "$10 special address + 10% of order cost", source: GS_URLS.assistedPurchase },
  { item: "Payment methods", value: "Credit/debit card, PayPal, bank wire transfer, Bitcoin. All methods up to $800 total; above $800 bank wire or Bitcoin", source: GS_URLS.faqs },
  { item: "Express Processing", value: "$5 (shipment prepared within 8–10 working hours vs standard 4–5 working days)", source: GS_URLS.faqs },
  { item: "Insurance (GS)", value: "$10 minimum, at most 2% of declared value", source: GS_URLS.faqs },
  { item: "Return to seller", value: "$15 per package (plus return shipping if you don't provide a label)", source: GS_URLS.faqs },
  { item: "Perfume", value: "Extra $15 on perfume bottles; carrier surcharges vary by destination", source: GS_URLS.faqs },
  { item: "Vape products", value: "$5 vape liquids, $15 vape devices (handling)", source: GS_URLS.faqs },
  { item: "Shipment cancellation (after prepared)", value: "$10 Basic, $7 Premium, $5 Business", source: GS_URLS.faqs },
  { item: "Storage after free period", value: "$1 per lb per day (free: 30 days Basic, 180 Premium, 210 Business)", source: GS_URLS.faqs },
  { item: "Unpaid prepared shipment", value: "Pay within 15 days; then $1 per lb per day for the next 15 days", source: GS_URLS.faqs },
  { item: "Shipping rates", value: "Vary by country, weight and box size; do NOT include customs duties, tariffs or taxes", source: GS_URLS.faqs },
];

export const GS_SERVICES = [
  { name: "US address / package forwarding", description: "Free US address at the Delaware warehouse; ship any US store order there and GS forwards it.", source: GS_URLS.howItWorks },
  { name: "Package consolidation", description: "Combine several orders into one box and remove extra packaging to lower shipping cost.", source: GS_URLS.howItWorks },
  { name: "Assisted Purchase (buy for me)", description: "Send a product link; GS checks price/availability, buys with US payment methods, receives and ships it.", source: GS_URLS.assistedPurchase },
  { name: "International shipping", description: "DHL, FedEx, UPS or USPS depending on country; tracking provided. Typically 3–15 days by service.", source: GS_URLS.faqs },
  { name: "Freight forwarding & mail forwarding", description: "Listed under Our Services on the GS website.", source: GS_URLS.home },
  { name: "Cashback", description: "2% (Premium) or 3% (Business) cashback on paid plans.", source: GS_URLS.plans },
];

/** Owner-stated assisted purchase pricing that is not yet on the public site. */
export const OWNER_POLICY_NOTE =
  "GS management confirmed (Nov 2026): 0% standard assisted-purchase fee when paying by bank transfer or crypto, otherwise 5% with a $5 minimum. GS staff confirm the final fee before buying.";
