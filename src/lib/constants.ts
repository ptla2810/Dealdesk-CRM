/** Display labels and ordering for enum values. Shared by server and client. */
import type {
  AccountStatus,
  ActionItemStatus,
  CommunicationChannel,
  ContactStatus,
  DeliveryStatus,
  LeadStage,
  MeetingStatus,
  MeetingType,
  OrderStatus,
  ProductStatus,
  SubscriptionStatus,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@prisma/client";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

type Meta<T extends string> = Record<T, { label: string; tone: Tone }>;

export const LEAD_STAGES: LeadStage[] = ["QUALIFIED", "IN_DISCUSSION", "MATURE", "CONVERTED"];
export const LEAD_STAGE_META: Meta<LeadStage> = {
  QUALIFIED: { label: "Qualified Lead", tone: "info" },
  IN_DISCUSSION: { label: "In Discussion", tone: "primary" },
  MATURE: { label: "Lead Mature", tone: "warning" },
  CONVERTED: { label: "Lead Converted", tone: "success" },
};

export const ACCOUNT_STATUSES: AccountStatus[] = ["PROSPECT", "ACTIVE", "INACTIVE", "ON_HOLD"];
export const ACCOUNT_STATUS_META: Meta<AccountStatus> = {
  PROSPECT: { label: "Prospect", tone: "info" },
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
  ON_HOLD: { label: "On Hold", tone: "warning" },
};

export const CONTACT_STATUSES: ContactStatus[] = ["ACTIVE", "INACTIVE", "LEFT_COMPANY"];
export const CONTACT_STATUS_META: Meta<ContactStatus> = {
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
  LEFT_COMPANY: { label: "Left Company", tone: "warning" },
};

export const CHANNELS: CommunicationChannel[] = ["EMAIL", "PHONE", "WHATSAPP", "IN_PERSON", "VIDEO_CALL"];
export const CHANNEL_LABEL: Record<CommunicationChannel, string> = {
  EMAIL: "Email",
  PHONE: "Phone",
  WHATSAPP: "WhatsApp",
  IN_PERSON: "In person",
  VIDEO_CALL: "Video call",
};

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["NOT_SUBSCRIBED", "SUBSCRIBED", "UNSUBSCRIBED"];
export const SUBSCRIPTION_META: Meta<SubscriptionStatus> = {
  NOT_SUBSCRIBED: { label: "Not subscribed", tone: "neutral" },
  SUBSCRIBED: { label: "Subscribed", tone: "success" },
  UNSUBSCRIBED: { label: "Unsubscribed", tone: "danger" },
};

export const MEETING_TYPES: MeetingType[] = ["IN_PERSON", "VIDEO_CALL", "PHONE_CALL", "SITE_VISIT", "DEMO", "OTHER"];
export const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  IN_PERSON: "In person",
  VIDEO_CALL: "Video call",
  PHONE_CALL: "Phone call",
  SITE_VISIT: "Site visit",
  DEMO: "Product demo",
  OTHER: "Other",
};

export const MEETING_STATUSES: MeetingStatus[] = ["SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED"];
export const MEETING_STATUS_META: Meta<MeetingStatus> = {
  SCHEDULED: { label: "Scheduled", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  RESCHEDULED: { label: "Rescheduled", tone: "warning" },
};

export const ACTION_ITEM_STATUSES: ActionItemStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
export const ACTION_ITEM_STATUS_META: Meta<ActionItemStatus> = {
  OPEN: { label: "Open", tone: "info" },
  IN_PROGRESS: { label: "In progress", tone: "primary" },
  DONE: { label: "Done", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const PRODUCT_STATUSES: ProductStatus[] = ["ACTIVE", "INACTIVE", "OUT_OF_STOCK", "DISCONTINUED"];
export const PRODUCT_STATUS_META: Meta<ProductStatus> = {
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
  OUT_OF_STOCK: { label: "Out of stock", tone: "warning" },
  DISCONTINUED: { label: "Discontinued", tone: "danger" },
};

export const TICKET_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"];
export const TICKET_STATUS_META: Meta<TicketStatus> = {
  OPEN: { label: "Open", tone: "info" },
  IN_PROGRESS: { label: "In Progress", tone: "primary" },
  WAITING_FOR_CUSTOMER: { label: "Waiting for Customer", tone: "warning" },
  RESOLVED: { label: "Resolved", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export const TICKET_PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
export const TICKET_PRIORITY_META: Meta<TicketPriority> = {
  LOW: { label: "Low", tone: "neutral" },
  MEDIUM: { label: "Medium", tone: "info" },
  HIGH: { label: "High", tone: "warning" },
  URGENT: { label: "Urgent", tone: "danger" },
};

export const TICKET_CATEGORIES: TicketCategory[] = [
  "GENERAL_INQUIRY",
  "PRODUCT_QUESTION",
  "ORDER_ISSUE",
  "DELIVERY_ISSUE",
  "BILLING",
  "COMPLAINT",
  "TECHNICAL",
  "OTHER",
];
export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  GENERAL_INQUIRY: "General inquiry",
  PRODUCT_QUESTION: "Product question",
  ORDER_ISSUE: "Order issue",
  DELIVERY_ISSUE: "Delivery issue",
  BILLING: "Billing",
  COMPLAINT: "Complaint",
  TECHNICAL: "Technical",
  OTHER: "Other",
};

export const ORDER_STATUSES: OrderStatus[] = ["DRAFT", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];
export const ORDER_STATUS_META: Meta<OrderStatus> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  CONFIRMED: { label: "Confirmed", tone: "info" },
  PROCESSING: { label: "Processing", tone: "primary" },
  SHIPPED: { label: "Shipped", tone: "warning" },
  DELIVERED: { label: "Delivered", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

export const DELIVERY_STATUSES: DeliveryStatus[] = ["NOT_SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION", "CANCELLED"];
export const DELIVERY_STATUS_META: Meta<DeliveryStatus> = {
  NOT_SHIPPED: { label: "Not shipped", tone: "neutral" },
  IN_TRANSIT: { label: "In transit", tone: "primary" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "warning" },
  DELIVERED: { label: "Delivered", tone: "success" },
  EXCEPTION: { label: "Exception", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const INDUSTRIES = [
  "Manufacturing",
  "Retail",
  "Wholesale & Distribution",
  "Healthcare",
  "Pharmaceuticals",
  "Construction",
  "Automotive",
  "Information Technology",
  "Logistics",
  "Food & Beverage",
  "Energy",
  "Education",
  "Hospitality",
  "Financial Services",
  "Other",
];

export const DEFAULT_LEAD_SOURCES = ["Email Campaign", "Social Media Campaign", "Events", "Manual Entry", "Client Meetings"];

/** ISO-4217 codes offered in pickers. Any 3-letter code is accepted by validation. */
export const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SGD", "AUD", "CAD", "JPY", "CNY"];
