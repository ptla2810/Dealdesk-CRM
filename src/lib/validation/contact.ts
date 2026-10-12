import { z } from "zod";
import { optionalPhone, optionalText, optionalUuid, requiredEmail, requiredText, uuid } from "./common";

export const contactFields = z.object({
  firstName: requiredText("First name", 100),
  lastName: requiredText("Last name", 100),
  email: requiredEmail,
  phone: optionalPhone,
  designation: optionalText(120),
  department: optionalText(120),
  accountId: optionalUuid,
  ownerId: uuid("Contact owner"),
  preferredChannel: z.enum(["EMAIL", "PHONE", "WHATSAPP", "IN_PERSON", "VIDEO_CALL"]),
  status: z.enum(["ACTIVE", "INACTIVE", "LEFT_COMPANY"]),
  source: optionalText(120),
  notes: optionalText(5000),
  marketingConsent: z.boolean(),
  consentSource: optionalText(200),
  subscriptionStatus: z.enum(["NOT_SUBSCRIBED", "SUBSCRIBED", "UNSUBSCRIBED"]),
});

const consentRules = <T extends z.ZodType<{ marketingConsent: boolean; subscriptionStatus: string }>>(s: T) =>
  s.superRefine((v, ctx) => {
    if (v.subscriptionStatus === "SUBSCRIBED" && !v.marketingConsent) {
      ctx.addIssue({
        code: "custom",
        path: ["subscriptionStatus"],
        message: "A contact can only be subscribed after giving marketing consent",
      });
    }
  });

export const contactCreateSchema = consentRules(contactFields);
export type ContactCreateInput = z.input<typeof contactCreateSchema>;
export const contactUpdateSchema = consentRules(contactFields.extend({ id: uuid() }));
export type ContactUpdateInput = z.input<typeof contactUpdateSchema>;
