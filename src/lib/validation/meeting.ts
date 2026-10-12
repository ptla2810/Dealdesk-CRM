import { z } from "zod";
import { dateTimeLocal, optionalDateOnly, optionalText, optionalUuid, requiredText, uuid } from "./common";

export const actionItemFields = z.object({
  description: requiredText("Action item", 1000),
  ownerId: uuid("Action item owner"),
  dueDate: optionalDateOnly,
});

export const meetingFields = z.object({
  title: requiredText("Meeting title", 200),
  scheduledAt: dateTimeLocal("Meeting date and time"),
  durationMins: z
    .string()
    .regex(/^\d{1,4}$/, "Duration must be in minutes")
    .refine((v) => Number(v) >= 5 && Number(v) <= 1440, "Duration must be between 5 and 1440 minutes"),
  type: z.enum(["IN_PERSON", "VIDEO_CALL", "PHONE_CALL", "SITE_VISIT", "DEMO", "OTHER"]),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED"]),
  location: optionalText(300),
  agenda: optionalText(5000),
  accountId: optionalUuid,
  leadId: optionalUuid,
  contactIds: z.array(z.string().uuid()).max(30),
  assignedToId: uuid("Assigned salesperson"),
  nextFollowUpAt: optionalDateOnly,
});

const needsCustomer = <T extends z.ZodType<{ accountId?: string; leadId?: string }>>(s: T) =>
  s.superRefine((v, ctx) => {
    if (!v.accountId && !v.leadId) {
      ctx.addIssue({ code: "custom", path: ["accountId"], message: "Link the meeting to an account or a lead" });
    }
  });

export const minuteFields = z.object({
  summary: requiredText("Discussion summary", 5000),
  requirements: optionalText(),
  decisions: optionalText(),
  notes: optionalText(),
  actionItems: z.array(actionItemFields).max(50),
});

export const meetingCreateSchema = needsCustomer(
  meetingFields.extend({
    // Optional MOM captured at creation (e.g. logging a meeting that already happened).
    minutes: minuteFields.extend({ summary: optionalText(5000) }).optional(),
  }),
);
export type MeetingCreateInput = z.input<typeof meetingCreateSchema>;

export const meetingUpdateSchema = needsCustomer(meetingFields.extend({ id: uuid() }));
export type MeetingUpdateInput = z.input<typeof meetingUpdateSchema>;

export const minuteCreateSchema = minuteFields.extend({ meetingId: uuid(), markCompleted: z.boolean().optional() });
export type MinuteCreateInput = z.input<typeof minuteCreateSchema>;

export const actionItemStatusSchema = z.object({
  id: uuid(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]),
});
