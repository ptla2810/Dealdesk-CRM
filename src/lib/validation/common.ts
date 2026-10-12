import { z } from "zod";
import { isValidPhone } from "../normalize";
import { parseDateOnly } from "../dates";

export const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

export const optionalText = (max = 5000) => z.string().trim().max(max, `Must be at most ${max} characters`).optional();

export const requiredEmail = z.string().trim().min(1, "Email is required").email("Enter a valid email address").max(254);

export const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address")
  .optional();

export const PHONE_HINT = "Enter a valid phone number including country code, e.g. +1 415 555 0123";

export const requiredPhone = z.string().trim().min(1, "Phone number is required").max(32).refine((v) => isValidPhone(v), PHONE_HINT);

export const optionalPhone = z
  .string()
  .trim()
  .max(32)
  .refine((v) => v === "" || isValidPhone(v), PHONE_HINT)
  .optional();

export const uuid = (label = "Record") => z.string().uuid(`${label} is required`);
export const optionalUuid = z
  .string()
  .refine((v) => v === "" || z.uuid().safeParse(v).success, "Invalid selection")
  .optional();

export const money = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d{1,13}(\.\d{1,2})?$/, `${label} must be a non-negative amount with up to 2 decimals`);

export const percent = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, `${label} must be a number`)
    .refine((v) => Number(v) <= 100, `${label} cannot exceed 100%`);

export const quantity = z
  .string()
  .trim()
  .min(1, "Quantity is required")
  .regex(/^\d{1,12}(\.\d{1,3})?$/, "Quantity must be a positive number")
  .refine((v) => Number(v) > 0, "Quantity must be greater than zero");

export const dateOnly = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((v) => parseDateOnly(v) !== null, `${label} must be a valid date`);
export const optionalDateOnly = z
  .string()
  .refine((v) => v === "" || parseDateOnly(v) !== null, "Enter a valid date")
  .optional();

export const dateTimeLocal = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, `${label} is required`);
export const optionalDateTimeLocal = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v), "Enter a valid date and time")
  .optional();

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code");

export const versionField = z.number().int().nonnegative();

/** Standard result shape returned by every server action. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; code?: string; details?: unknown };
