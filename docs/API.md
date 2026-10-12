# API & business-logic reference

SalesFlow exposes its business logic in three ways. Each uses the same service functions in `src/server/services`, so authorization and validation are identical everywhere:

1. **Server Actions** (`src/app/(app)/<module>/actions.ts`): used by the UI for every mutation.
2. **HTTP route handlers** (`src/app/api/*`): search, notifications, CSV export, Auth.js.
3. **Service functions**: `fn(ctx, input)`. They can be called from scripts and tests with a `Ctx` from `buildContext(userId)`.

## Conventions

**Server-action result**
```ts
type ActionResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: ErrorCode; fieldErrors?: Record<string, string>; details?: unknown };
```

**Error codes** (`src/server/errors.ts`). HTTP routes return `{ error: { code, message, fieldErrors? } }` with the status shown.

| code | HTTP | meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | no valid session (or session invalidated) |
| `FORBIDDEN` | 403 | missing permission |
| `NOT_FOUND` | 404 | missing, archived, other tenant, or outside the caller's data scope |
| `VALIDATION` | 422 | input invalid; `fieldErrors` keyed by dotted path (e.g. `lines.0.unitPrice`) |
| `BUSINESS_RULE` | 422 | invalid workflow transition or rule violation |
| `CONFLICT` | 409 | stale `version` (someone else changed the record) or unique-constraint clash |
| `DUPLICATE_WARNING` | 409 | possible duplicate account; `details = { matches[], canOverride }` |
| `INTERNAL` | 500 | unexpected; details are logged server-side, never returned |

Field formats: dates are `YYYY-MM-DD` (date-only fields); date-times are `YYYY-MM-DDTHH:mm`, interpreted in the organization's timezone; money is a decimal string with up to 2 places; optional relations use `""` for "none".

## HTTP routes

| Method & path | Auth | Description |
|---|---|---|
| `GET /api/search?q=` | session | Global search (≥ 2 chars) across leads, accounts, contacts, products, tickets and orders. Respects permissions, tenant and scope. → `{ results: { type, id, title, subtitle, href }[] }` |
| `GET /api/notifications` | session | Generates due reminders (idempotent), then → `{ items: Notification[], unread: number }` |
| `POST /api/notifications` | session | Body `{ ids?: uuid[] }`: marks the given notifications (or all) as read → `{ ok: true }` |
| `GET /api/export/{leads\|accounts\|contacts\|orders}` | `<module>.export` | CSV (UTF-8 with BOM) using the same query-string filters as the list page |
| `GET /api/export/report?period=&from=&to=&owner=&source=&groupBy=` | `report.export` | Grouped lead report plus salesperson performance as CSV |
| `GET/POST /api/auth/*` | – | Auth.js (sign-in, callbacks for `google` and `sso`, session, sign-out) |

List pages accept these query parameters: `q`, `page`, `pageSize` (10/25/50/100), `sort` (whitelisted column), `dir` (`asc`/`desc`), plus module filters. Examples: leads `stage, source, owner, account, createdFrom, createdTo, followUpFrom, followUpTo, overdue=1`; orders `status, delivery, account, owner, from, to, active=1`; tickets `status, priority, category, assignee (uuid|me|unassigned), open=1`.

Dashboard and reports accept `period=today|week|month|quarter|half|year|custom` (with `from`, `to` for custom), `owner`, `source`, and, for reports, `groupBy=owner|source|account|stage`.

## Server actions and services by module

Inputs are validated by the Zod schemas in `src/lib/validation/*`. Permission keys are in brackets.

### Leads: `services/leads.ts`
| Action | Input | Rules |
|---|---|---|
| `createLead` [lead.create] | `leadCreateSchema` | owner forced to the caller without `lead.assign`; source must be active; account in scope |
| `updateLead` [lead.edit] | `leadUpdateSchema` (+`id`, `version`) | optimistic lock; a converted lead's account cannot change |
| `assignLead` [lead.assign] | `{ id, version, ownerId }` | notifies the new owner |
| `changeLeadStage` [lead.change_stage] | `{ id, version, toStage, note? }` | `checkLeadStageChange`; never converts |
| `addDiscussion` [lead.edit] | `discussionSchema` | requires In Discussion (or a meeting link on an open lead); updates the next follow-up |
| `convertLead` [lead.convert] | `leadConvertSchema` | transactional; `accountMode: existing\|new`; duplicate checks; single conversion |
| `archiveLead` [lead.delete] | `id` | soft delete |

### Accounts: `services/accounts.ts`
`createAccount` [account.create], `updateAccount` [account.edit] (owner change needs account.assign), `archiveAccount` [account.delete], `checkAccountDuplicates` (live hint used by the form). `acknowledgeDuplicates: true` is honoured only with [account.override_duplicate].

### Contacts: `services/contacts.ts`
`createContact` [contact.create], `updateContact` [contact.edit], `archiveContact` [contact.delete]. Email is unique per tenant. Consent rules are described in ARCHITECTURE. `campaignEligibility(contact)` derives eligibility.

### Meetings: `services/meetings.ts`
`createMeeting` [meeting.create] (optional `minutes` with `actionItems`), `updateMeeting` [meeting.edit], `addMinutes` [meeting.edit] (`markCompleted?`), `updateActionItemStatus` (owner, or [meeting.edit]), `archiveMeeting` [meeting.delete], `getFollowUps(ctx, { mine?, days? })`.

### Products: `services/products.ts`
`createProduct` [product.create], `updateProduct` [product.edit] (SKU unique case-insensitively, including archived products), `setProductStatus` [product.edit], `archiveProduct` [product.delete].

### Tickets: `services/tickets.ts`
`createTicket` [ticket.create] (assignee honoured only with ticket.assign), `updateTicket`, `changeTicketStatus` (`resolutionNote` required to resolve when configured), `changeTicketPriority` [ticket.edit], `assignTicket` [ticket.assign], `addTicketMessage` [ticket.edit; `CUSTOMER_REPLY` also needs ticket.reply_customer], `archiveTicket` [ticket.delete]. All status, priority and assignment updates carry `version`.

### Orders: `services/orders.ts`
| Action | Input | Rules |
|---|---|---|
| `createOrder` [order.create] | `orderCreateSchema` with `lines[]` | server pricing; creates a Draft; owner forced to the caller for OWN-scope roles |
| `updateOrder` [order.edit] | + `id`, `version` | drafts only; re-prices |
| `changeOrderStatus` [order.change_status] | `{ id, version, toStatus, note?, carrier?, trackingNumber?, actualDeliveryDate? }` | configured workflow; conditional update |
| `addDeliveryEvent` [order.change_status] | `deliveryEventSchema` (+`version`) | shipped orders only; not in the future or before shipment; `DELIVERED` completes the order |
| `archiveOrder` [order.delete] | `id` | drafts or cancelled orders only |

### Dashboard & reports: `services/dashboard.ts`
`getDashboard(ctx, { range, ownerId?, sourceId? })` returns KPIs, funnel, by-stage, sources, conversion and sales trends, salesperson performance and order-status distribution. `getGroupedLeadReport(ctx, filters, groupBy)`. Definitions are in ARCHITECTURE.

### Settings: `services/settings.ts`, `services/users.ts`
Users [settings.manage_users]: `createUser`, `updateUser`. Roles [settings.manage_roles]: `createRole`, `updateRolePermissions`. Configuration [settings.manage_config]: `addLeadSource`, `toggleLeadSource`, `addCategory`, `addTaxRate`, `toggleTaxRate`, `updateOrganization`, `updateWorkflow`. Audit [audit.view]: `listAuditLogs`, `entityActivity`. Any user may call `updateProfile` and `changePassword`.

### Auth: `server/credentials.ts`, `services/password-reset.ts`
`verifyCredentials(identifier, password)`, `requestPasswordReset({ email })` (same response whether or not the email exists; rate-limited), `resetPassword({ token, password, confirmPassword })` (single-use SHA-256-hashed token, 1-hour expiry; signs out all sessions).
