/**
 * Product categories used by the landed-cost estimator.
 * Each category maps to representative HS-6 codes (HS 2022). `hs` drives the WITS/UNCTAD TRAINS
 * MFN tariff pull (scripts/fetch-wits.ts); `hsPrefixes` map a caller-supplied HS code back to a category.
 * `keywords` power free-text matching (lower-case; matched on word boundaries, longest match wins).
 */
export interface Category {
  id: string;
  label: string;
  hs: string[]; // representative HS-6 codes (first = typical)
  hsPrefixes: string[]; // HS chapter/heading prefixes that belong to this category
  keywords: string[];
  /** Excise-type goods that often carry extra taxes in many countries. */
  excise?: boolean;
}

export const CATEGORIES: Category[] = [
  { id: "phones", label: "Mobile phones / smartphones", hs: ["851713", "851712"], hsPrefixes: ["851713", "851712", "851711", "851714"], keywords: ["iphone", "smartphone", "smart phone", "mobile phone", "cell phone", "cellphone", "galaxy s", "pixel", "phone", "android phone"] },
  { id: "laptops", label: "Laptops, tablets & computers", hs: ["847130", "847141", "847150"], hsPrefixes: ["8471"], keywords: ["laptop", "macbook", "notebook computer", "chromebook", "ipad", "tablet", "computer", "desktop pc", "pc", "mac mini", "imac"] },
  { id: "wearables", label: "Smartwatches & wearables", hs: ["851762"], hsPrefixes: ["851762"], keywords: ["apple watch", "smartwatch", "smart watch", "fitbit", "garmin", "galaxy watch", "fitness tracker", "airtag"] },
  { id: "audio", label: "Headphones, earbuds & speakers", hs: ["851830", "851822"], hsPrefixes: ["8518"], keywords: ["airpods", "headphones", "headphone", "earbuds", "earphones", "headset", "speaker", "soundbar", "beats"] },
  { id: "electronics_accessories", label: "Chargers, cables, cases & computer accessories", hs: ["850440", "854442", "847160", "847330"], hsPrefixes: ["850440", "854442", "847160", "847330", "852351", "847170"], keywords: ["charger", "cable", "power bank", "adapter", "keyboard", "mouse", "phone case", "case", "ssd", "hard drive", "memory card", "usb", "hub", "router", "webcam"] },
  { id: "tv_monitors", label: "TVs & monitors", hs: ["852872", "852852"], hsPrefixes: ["8528"], keywords: ["tv", "television", "monitor", "oled", "projector"] },
  { id: "cameras", label: "Cameras & drones", hs: ["852589", "900211"], hsPrefixes: ["8525", "9006", "9002", "880621"], keywords: ["camera", "gopro", "dslr", "mirrorless", "lens", "drone", "dji"] },
  { id: "gaming", label: "Video game consoles & games", hs: ["950450"], hsPrefixes: ["9504"], keywords: ["playstation", "ps5", "xbox", "nintendo", "switch 2", "game console", "console", "video game", "controller"] },
  { id: "clothing", label: "Clothing & apparel", hs: ["610910", "620342", "611030", "620462"], hsPrefixes: ["61", "62"], keywords: ["shirt", "t-shirt", "tshirt", "dress", "jeans", "pants", "trousers", "jacket", "hoodie", "sweater", "coat", "clothes", "clothing", "apparel", "leggings", "shorts", "underwear", "socks", "abaya", "suit", "skirt"] },
  { id: "shoes", label: "Shoes & sneakers", hs: ["640411", "640399", "640419"], hsPrefixes: ["64"], keywords: ["sneakers", "sneaker", "shoes", "shoe", "boots", "sandals", "trainers", "jordans", "jordan", "yeezy", "heels", "slippers", "footwear"] },
  { id: "bags", label: "Handbags, wallets & luggage", hs: ["420221", "420222", "420212", "420231"], hsPrefixes: ["4202"], keywords: ["handbag", "purse", "bag", "backpack", "wallet", "luggage", "suitcase", "tote", "clutch"] },
  { id: "cosmetics", label: "Cosmetics, makeup & skincare", hs: ["330499", "330420", "330410"], hsPrefixes: ["3304"], keywords: ["makeup", "make-up", "cosmetics", "skincare", "skin care", "lipstick", "foundation", "serum", "moisturizer", "moisturiser", "sunscreen", "cream", "mascara", "eyeshadow", "lotion"] },
  { id: "perfume", label: "Perfume & fragrance", hs: ["330300"], hsPrefixes: ["3303"], keywords: ["perfume", "fragrance", "cologne", "eau de parfum", "eau de toilette", "parfum", "body mist"] },
  { id: "haircare", label: "Hair care & personal care", hs: ["330510", "330590", "340130"], hsPrefixes: ["3305", "3306", "3307", "3401"], keywords: ["shampoo", "conditioner", "hair oil", "hair care", "deodorant", "toothpaste", "body wash", "soap", "wig", "hair extensions"] },
  { id: "watches", label: "Watches (non-smart)", hs: ["910211", "910111", "910219"], hsPrefixes: ["91"], keywords: ["watch", "rolex", "casio", "seiko", "wristwatch"] },
  { id: "jewelry", label: "Jewelry (precious & fashion)", hs: ["711319", "711311", "711719"], hsPrefixes: ["7113", "7114", "7116", "7117"], keywords: ["jewelry", "jewellery", "necklace", "ring", "bracelet", "earrings", "gold", "diamond", "pendant"] },
  { id: "eyewear", label: "Sunglasses & eyewear", hs: ["900410", "900311"], hsPrefixes: ["9003", "9004"], keywords: ["sunglasses", "glasses", "eyeglasses", "ray-ban", "frames"] },
  { id: "toys", label: "Toys & baby gear", hs: ["950300", "871500"], hsPrefixes: ["9503", "8715"], keywords: ["toy", "toys", "lego", "doll", "barbie", "stroller", "pram", "puzzle", "action figure", "plush"] },
  { id: "sports", label: "Sports & fitness equipment", hs: ["950691", "950699", "950631"], hsPrefixes: ["9506", "9507"], keywords: ["dumbbell", "treadmill", "yoga mat", "golf", "tennis", "fitness", "gym equipment", "football", "basketball", "fishing", "camping"] },
  { id: "bicycles", label: "Bicycles & parts", hs: ["871200", "871499"], hsPrefixes: ["8712", "8714", "871160"], keywords: ["bicycle", "bike", "e-bike", "ebike", "scooter"] },
  { id: "supplements", label: "Supplements & protein", hs: ["210690", "190190"], hsPrefixes: ["2106"], keywords: ["supplement", "supplements", "protein", "whey", "creatine", "pre-workout", "collagen", "gummies"] },
  { id: "medicines", label: "Vitamins & OTC medicines", hs: ["300450", "300490"], hsPrefixes: ["3004", "3003"], keywords: ["vitamin", "vitamins", "multivitamin", "medicine", "tylenol", "advil", "melatonin", "omega"] },
  { id: "food", label: "Food & snacks", hs: ["190590", "180690", "210111"], hsPrefixes: ["16", "17", "18", "19", "20", "2101", "0901", "0902"], keywords: ["food", "snacks", "candy", "chocolate", "coffee", "tea", "cereal", "chips", "cookies", "baby formula"] },
  { id: "auto_parts", label: "Auto parts & accessories", hs: ["870899", "870830", "851220"], hsPrefixes: ["8708", "8409", "8511", "8512", "4011"], keywords: ["auto parts", "car parts", "brake", "bumper", "headlight", "tail light", "exhaust", "spark plug", "tire", "tyre", "rim", "oem part", "car accessory"] },
  { id: "tools", label: "Tools & hardware", hs: ["846721", "820559", "820412"], hsPrefixes: ["82", "8467"], keywords: ["drill", "tool", "tools", "wrench", "screwdriver", "saw", "dewalt", "milwaukee", "socket set", "hardware"] },
  { id: "home_goods", label: "Home, kitchen & decor", hs: ["732393", "691200", "630260", "940520"], hsPrefixes: ["7323", "6911", "6912", "6302", "9405", "7013", "3924"], keywords: ["kitchen", "cookware", "pan", "pot", "dishes", "bedding", "sheets", "towel", "lamp", "decor", "home goods", "mug", "vase"] },
  { id: "appliances", label: "Small appliances", hs: ["850940", "851660", "850980", "851671"], hsPrefixes: ["8509", "8516", "8508", "8510"], keywords: ["blender", "air fryer", "coffee maker", "espresso machine", "vacuum", "dyson", "hair dryer", "straightener", "microwave", "kettle", "instant pot", "mixer"] },
  { id: "furniture", label: "Furniture", hs: ["940360", "940171", "940161"], hsPrefixes: ["9401", "9403", "9404"], keywords: ["furniture", "chair", "table", "desk", "sofa", "mattress", "shelf", "cabinet"] },
  { id: "books", label: "Books & printed matter", hs: ["490199", "490300"], hsPrefixes: ["49"], keywords: ["book", "books", "novel", "textbook", "magazine", "comic"] },
  { id: "general", label: "Other / general merchandise", hs: [], hsPrefixes: [], keywords: [] },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

/** Map an HS code (any length, dots allowed) to the most specific category prefix. */
export function categoryFromHs(hs: string): Category | undefined {
  const d = hs.replace(/\D/g, "");
  if (d.length < 2) return undefined;
  let best: { c: Category; len: number } | undefined;
  for (const c of CATEGORIES) for (const p of c.hsPrefixes) if (d.startsWith(p) && (!best || p.length > best.len)) best = { c, len: p.length };
  return best?.c;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Map free text (e.g. "Nike Air Jordan 1 sneakers") to a category by keyword. Longest keyword wins. */
export function categoryFromText(text: string): Category | undefined {
  const t = ` ${text.toLowerCase()} `;
  let best: { c: Category; len: number } | undefined;
  for (const c of CATEGORIES)
    for (const k of c.keywords) {
      if (k.length <= (best?.len ?? 0)) continue;
      if (new RegExp(`(^|[^a-z0-9])${escape(k)}([^a-z0-9]|$)`).test(t)) best = { c, len: k.length };
    }
  return best?.c;
}
