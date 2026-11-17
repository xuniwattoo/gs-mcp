import { resolveCountry } from "./countries.js";

const CTRL = /[\u0000-\u001F\u007F]/g;
const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;

export function stripControls(input: string): string {
  return input.replace(CTRL, "").trim();
}

export function normalizeEmail(input: string): string {
  return stripControls(input).toLowerCase();
}

export function isValidEmail(input: string): boolean {
  const e = normalizeEmail(input);
  return e.length >= 6 && e.length <= 254 && EMAIL_RE.test(e);
}

export function isValidHttpUrl(input: string): boolean {
  try {
    const u = new URL(stripControls(input));
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export interface FieldError { error: string }

export function cleanText(input: string | undefined, max: number): string | undefined {
  if (input === undefined) return undefined;
  const s = stripControls(input);
  if (!s) return undefined;
  return s.slice(0, max);
}

export function validateName(name: string): string | FieldError {
  const s = stripControls(name);
  if (s.length < 2 || s.length > 120) return { error: "Name must be 2–120 characters after removing control characters." };
  return s;
}

export function validateEmail(email: string): string | FieldError {
  const e = normalizeEmail(email);
  if (!isValidEmail(e)) return { error: "A valid email address is required (GS replies here)." };
  return e;
}

export function validatePhone(phone: string | undefined): string | undefined | FieldError {
  if (phone === undefined || phone === "") return undefined;
  const s = stripControls(phone).slice(0, 40);
  if (s.length < 5) return { error: "Phone must be at least 5 characters if provided." };
  return s;
}

export function validateCountry(input: string): { code: string; name: string } | FieldError {
  const s = stripControls(input);
  const c = resolveCountry(s);
  if (!c) return { error: `Unknown or unsupported destination country "${s}". Use a 2-letter ISO code (e.g. AO, SA, GB) or a country name GS ships to.` };
  return { code: c.code, name: c.name };
}

export function validateHttpUrls(urls: string[], maxCount = 20): string[] | FieldError {
  if (!urls.length) return { error: "At least one product URL is required." };
  if (urls.length > maxCount) return { error: `At most ${maxCount} product URLs are accepted.` };
  const out: string[] = [];
  for (const raw of urls) {
    const u = stripControls(raw);
    if (!isValidHttpUrl(u) || u.length > 2000) return { error: `Invalid product URL (must be http or https): ${u.slice(0, 80)}` };
    out.push(u);
  }
  return out;
}

export function isFieldError(v: unknown): v is FieldError {
  return typeof v === "object" && v !== null && "error" in v && typeof (v as FieldError).error === "string";
}
