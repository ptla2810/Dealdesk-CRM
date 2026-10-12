import { z } from "zod";
import {
  dateOnly,
  money,
  optionalDateOnly,
  optionalText,
  optionalUuid,
  requiredEmail,
  requiredPhone,
  requiredText,
  uuid,
  versionField,
} from "./common";
import { accountFields } from "./account";

const openStage = z.enum(["QUALIFIED", "IN_DISCUSSION", "MATURE"], { error: "Lead stage is required" });

export const leadFields = z.object({
  name: requiredText("Lead name", 160),
  email: requiredEmail,
  phone: requiredPhone,
  companyName: requiredText("Company name", 200),
  accountId: optionalUuid,
  sourceId: uuid("Lead source"),
  ownerId: uuid("Lead owner"),
  estimatedValue: money("Estimated deal value"),
  description: requiredText("Description and sales insights", 5000),
  nextFollowUpAt: dateOnly("Next follow-up date"),
});

export const leadCreateSchema = leadFields.extend({ stage: openStage });
export type LeadCreateInput = z.input<typeof leadCreateSchema>;

export const leadUpdateSchema = leadFields.extend({ id: uuid(), version: versionField });
export type LeadUpdateInput = z.input<typeof leadUpdateSchema>;

export const leadStageChangeSchema = z.object({
  id: uuid(),
  version: versionField,
  toStage: z.enum(["QUALIFIED", "IN_DISCUSSION", "MATURE", "CONVERTED"]),
  note: optionalText(1000),
});
export type LeadStageChangeInput = z.input<typeof leadStageChangeSchema>;

export const leadAssignSchema = z.object({ id: uuid(), version: versionField, ownerId: uuid("Lead owner") });

export const discussionSchema = z.object({
  leadId: uuid(),
  meetingId: optionalUuid,
  discussedAt: dateOnly("Discussion date"),
  summary: requiredText("Summary", 5000),
  requirements: optionalText(),
  objections: optionalText(),
  nextSteps: optionalText(),
  nextFollowUpAt: optionalDateOnly,
  responsibleUserId: uuid("Responsible salesperson"),
});
export type DiscussionInput = z.input<typeof discussionSchema>;

export const leadConvertSchema = z
  .object({
    id: uuid(),
    version: versionField,
    accountMode: z.enum(["existing", "new"]),
    accountId: optionalUuid,
    newAccount: accountFields.partial().optional(),
    acknowledgeDuplicates: z.boolean().optional(),
    contactIds: z.array(z.string().uuid()).max(50).default([]),
    createContactFromLead: z.boolean().default(true),
    note: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.accountMode === "existing" && !v.accountId) {
      ctx.addIssue({ code: "custom", path: ["accountId"], message: "Select the account to link" });
    }
  });
export type LeadConvertInput = z.input<typeof leadConvertSchema>;
