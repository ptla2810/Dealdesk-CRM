import { z } from "zod";
import { currencyCode, optionalText, optionalUuid, requiredEmail, requiredText, uuid } from "./common";

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/\d/, "Include a number");

export const userCreateSchema = z.object({
  name: requiredText("Name", 120),
  email: requiredEmail,
  username: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === "" || /^[a-zA-Z0-9._-]{3,40}$/.test(v), "3–40 letters, numbers, dot, dash or underscore")
    .optional(),
  roleId: uuid("Role"),
  jobTitle: optionalText(120),
  managerId: optionalUuid,
  password: passwordSchema,
});
export type UserCreateInput = z.input<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  id: uuid(),
  name: requiredText("Name", 120),
  roleId: uuid("Role"),
  jobTitle: optionalText(120),
  managerId: optionalUuid,
  isActive: z.boolean(),
});

/** Administrator sets a new password for another user (no current password needed). */
export const adminSetPasswordSchema = z
  .object({
    id: uuid(),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
export type UserUpdateInput = z.input<typeof userUpdateSchema>;

export const profileSchema = z.object({
  name: requiredText("Name", 120),
  jobTitle: optionalText(120),
  phone: optionalText(32),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const roleCreateSchema = z.object({
  name: requiredText("Role name", 80),
  description: optionalText(300),
  dataScope: z.enum(["ALL", "OWN"]),
});

export const rolePermissionsSchema = z.object({
  roleId: uuid(),
  dataScope: z.enum(["ALL", "OWN"]),
  permissions: z.array(z.string()).max(200),
});

export const leadSourceSchema = z.object({ name: requiredText("Source name", 80) });
export const categorySchema = z.object({ name: requiredText("Category name", 80), description: optionalText(300) });
export const taxRateSchema = z.object({
  name: requiredText("Tax name", 80),
  ratePercent: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,3})?$/, "Enter a percentage")
    .refine((v) => Number(v) <= 100, "Cannot exceed 100%"),
});

export const organizationSchema = z.object({
  name: requiredText("Organization name", 120),
  baseCurrency: currencyCode,
  timezone: requiredText("Timezone", 64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown IANA timezone"),
});

export const workflowSchema = z.object({
  allowSkipStages: z.boolean(),
  allowBackward: z.boolean(),
  allowReopenConverted: z.boolean(),
  discountsEnabled: z.boolean(),
  maxDiscountPercent: z.number().min(0).max(100),
  taxEnabled: z.boolean(),
  requireResolutionNote: z.boolean(),
  orderTransitions: z.record(z.string(), z.array(z.string())),
});
