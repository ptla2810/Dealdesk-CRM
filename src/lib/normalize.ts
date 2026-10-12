import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function normalizeOptionalEmail(email: string | null | undefined): string | null {
  const v = email?.trim();
  return v ? normalizeEmail(v) : null;
}

/** Phone numbers are validated with libphonenumber and stored in E.164 (+14155550123). */
export function normalizePhone(raw: string, defaultCountry?: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const parsed = parsePhoneNumberFromString(value, (defaultCountry?.toUpperCase() as CountryCode) || undefined);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function isValidPhone(raw: string, defaultCountry?: string) {
  return normalizePhone(raw, defaultCountry) !== null;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}

const LEGAL_SUFFIXES = /\b(incorporated|inc|llc|l\.l\.c|ltd|limited|pvt|private|plc|gmbh|corp|corporation|co|company|sa|ag|bv|pty|llp)\b\.?/g;

/** Company name key for duplicate detection: case-, punctuation- and legal-suffix-insensitive. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const normalizeSku = (sku: string) => sku.trim().toUpperCase();

export function normalizeWebsite(url: string | null | undefined): string | null {
  const v = url?.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
