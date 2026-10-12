import { z } from "zod";
import { optionalText, requiredEmail, requiredText, uuid } from "./common";
import { isValidPhone, PHONE_HINT_COUNTRY } from "./phone";

export const accountFields = z.object({
  name: requiredText("Company name", 200),
  email: requiredEmail,
  phone: z.string().trim().min(1, "Business phone is required").max(32),
  website: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v), "Enter a valid website, e.g. acme.com")
    .optional(),
  industry: optionalText(100),
  addressLine: optionalText(300),
  country: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Za-z]{2}$/.test(v), "Use a 2-letter country code, e.g. US")
    .optional(),
  state: optionalText(100),
  city: optionalText(100),
  postalCode: optionalText(20),
  ownerId: uuid("Account owner"),
  description: optionalText(5000),
  status: z.enum(["PROSPECT", "ACTIVE", "INACTIVE", "ON_HOLD"]),
});

const withPhoneCheck = <T extends z.ZodType<{ phone?: string; country?: string }>>(schema: T) =>
  schema.superRefine((v, ctx) => {
    if (v.phone && !isValidPhone(v.phone, v.country)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: PHONE_HINT_COUNTRY });
    }
  });

export const accountCreateSchema = withPhoneCheck(accountFields.extend({ acknowledgeDuplicates: z.boolean().optional() }));
export type AccountCreateInput = z.input<typeof accountCreateSchema>;

export const accountUpdateSchema = withPhoneCheck(accountFields.extend({ id: uuid(), acknowledgeDuplicates: z.boolean().optional() }));
export type AccountUpdateInput = z.input<typeof accountUpdateSchema>;
