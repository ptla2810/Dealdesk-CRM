/**
 * Permission catalogue. Keys are `<module>.<action>`. The catalogue is seeded into the
 * `Permission` table; which roles hold which keys is configurable in Settings → Roles.
 * Server-side checks always go through `ctx.require(key)` (src/server/context.ts).
 */
export const PERMISSIONS = {
  "dashboard.view": "View the sales dashboard",

  "lead.view": "View leads",
  "lead.create": "Create leads",
  "lead.edit": "Edit leads and add discussion updates",
  "lead.assign": "Reassign lead owner",
  "lead.change_stage": "Move leads between stages",
  "lead.convert": "Convert leads into accounts",
  "lead.export": "Export leads to CSV",
  "lead.delete": "Archive leads",

  "account.view": "View accounts",
  "account.create": "Create accounts",
  "account.edit": "Edit accounts",
  "account.assign": "Reassign account owner",
  "account.override_duplicate": "Create an account despite a duplicate warning",
  "account.export": "Export accounts to CSV",
  "account.delete": "Archive accounts",

  "contact.view": "View contacts",
  "contact.create": "Create contacts",
  "contact.edit": "Edit contacts and consent",
  "contact.export": "Export contacts to CSV",
  "contact.delete": "Archive contacts",

  "meeting.view": "View meetings and MOM",
  "meeting.create": "Schedule meetings",
  "meeting.edit": "Edit meetings, record MOM and action items",
  "meeting.assign": "Reassign meetings to other salespeople",
  "meeting.delete": "Archive meetings",

  "product.view": "View the product catalogue",
  "product.create": "Create products",
  "product.edit": "Edit, activate and deactivate products",
  "product.delete": "Archive products",

  "ticket.view": "View support tickets",
  "ticket.create": "Create support tickets",
  "ticket.edit": "Update tickets, status and internal notes",
  "ticket.assign": "Assign tickets to agents",
  "ticket.reply_customer": "Write customer-visible replies",
  "ticket.delete": "Archive tickets",

  "order.view": "View orders",
  "order.create": "Create orders",
  "order.edit": "Edit draft orders",
  "order.change_status": "Change order status and record delivery events",
  "order.override_price": "Set unit prices that differ from the catalogue",
  "order.export": "Export orders to CSV",
  "order.delete": "Archive draft orders",

  "report.view": "View reports",
  "report.export": "Export reports",

  "settings.manage_users": "Invite, edit and deactivate users",
  "settings.manage_roles": "Configure roles and permissions",
  "settings.manage_config": "Configure lead sources, catalogue settings and workflows",
  "audit.view": "View the audit log",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export const PERMISSION_MODULES: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "lead", label: "Leads" },
  { key: "account", label: "Accounts" },
  { key: "contact", label: "Contacts" },
  { key: "meeting", label: "Meetings & MOM" },
  { key: "product", label: "Products" },
  { key: "ticket", label: "Support Tickets" },
  { key: "order", label: "Orders & Delivery" },
  { key: "report", label: "Reports" },
  { key: "settings", label: "Settings" },
  { key: "audit", label: "Audit" },
];

export const SYSTEM_ROLES = {
  ADMIN: "ADMIN",
  SALES_MANAGER: "SALES_MANAGER",
  SALES_REP: "SALES_REP",
  SUPPORT_AGENT: "SUPPORT_AGENT",
} as const;

const view = (m: string) => ALL_PERMISSIONS.filter((k) => k === `${m}.view`);
const all = (m: string) => ALL_PERMISSIONS.filter((k) => k.startsWith(`${m}.`));
const except = (keys: PermissionKey[], drop: PermissionKey[]) => keys.filter((k) => !drop.includes(k));

/** Initial grants. Administrators can change these in Settings → Roles (except ADMIN, which keeps everything). */
export const DEFAULT_ROLE_GRANTS: Record<string, { name: string; description: string; dataScope: "ALL" | "OWN"; permissions: PermissionKey[] }> = {
  ADMIN: {
    name: "Administrator",
    description: "Full access, including users, roles and configuration.",
    dataScope: "ALL",
    permissions: ALL_PERMISSIONS,
  },
  SALES_MANAGER: {
    name: "Sales Manager",
    description: "Manages the sales team, sees all records and reports.",
    dataScope: "ALL",
    permissions: [
      "dashboard.view",
      ...all("lead"),
      ...all("account"),
      ...all("contact"),
      ...all("meeting"),
      ...except(all("product"), ["product.delete"]),
      ...except(all("ticket"), ["ticket.delete"]),
      ...all("order"),
      ...all("report"),
      "audit.view",
    ],
  },
  SALES_REP: {
    name: "Sales Representative",
    description: "Works their own leads, accounts, meetings and orders.",
    dataScope: "OWN",
    permissions: [
      "dashboard.view",
      ...except(all("lead"), ["lead.assign", "lead.export", "lead.delete"]),
      ...except(all("account"), ["account.assign", "account.override_duplicate", "account.export", "account.delete"]),
      ...except(all("contact"), ["contact.export", "contact.delete"]),
      ...except(all("meeting"), ["meeting.assign", "meeting.delete"]),
      ...view("product"),
      "ticket.view",
      "ticket.create",
      ...except(all("order"), ["order.override_price", "order.export", "order.delete"]),
      "report.view",
    ],
  },
  SUPPORT_AGENT: {
    name: "Support Agent",
    description: "Handles customer tickets; read access to customer and order context.",
    dataScope: "ALL",
    permissions: [
      "dashboard.view",
      "account.view",
      "contact.view",
      "contact.create",
      "contact.edit",
      "lead.view",
      ...view("product"),
      "order.view",
      ...except(all("ticket"), ["ticket.delete"]),
    ],
  },
};
