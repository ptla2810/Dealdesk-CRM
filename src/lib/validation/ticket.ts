import { z } from "zod";
import { optionalText, optionalUuid, requiredText, uuid, versionField } from "./common";

const category = z.enum([
  "GENERAL_INQUIRY",
  "PRODUCT_QUESTION",
  "ORDER_ISSUE",
  "DELIVERY_ISSUE",
  "BILLING",
  "COMPLAINT",
  "TECHNICAL",
  "OTHER",
]);
const priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const status = z.enum(["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"]);

export const ticketFields = z.object({
  subject: requiredText("Subject", 200),
  description: requiredText("Description", 10000),
  accountId: uuid("Account"),
  contactId: optionalUuid,
  leadId: optionalUuid,
  orderId: optionalUuid,
  category,
  priority,
  assignedToId: optionalUuid,
});

export const ticketCreateSchema = ticketFields.extend({ internalNote: optionalText(5000) });
export type TicketCreateInput = z.input<typeof ticketCreateSchema>;

export const ticketUpdateSchema = ticketFields.omit({ assignedToId: true, priority: true }).extend({ id: uuid(), version: versionField });
export type TicketUpdateInput = z.input<typeof ticketUpdateSchema>;

export const ticketStatusSchema = z.object({
  id: uuid(),
  version: versionField,
  status,
  resolutionNote: optionalText(5000),
});
export const ticketPrioritySchema = z.object({ id: uuid(), version: versionField, priority });
export const ticketAssignSchema = z.object({ id: uuid(), version: versionField, assignedToId: optionalUuid });

export const ticketMessageSchema = z.object({
  ticketId: uuid(),
  kind: z.enum(["INTERNAL_NOTE", "CUSTOMER_REPLY"]),
  body: requiredText("Message", 10000),
});
