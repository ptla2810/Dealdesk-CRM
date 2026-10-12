# Architecture

## Overview

SalesFlow is a single Next.js application. Pages are React Server Components that call a **service layer** directly. Mutations are **Server Actions** that call the same services. A few HTTP route handlers cover search, notifications, CSV export and Auth.js.

```
Browser ──► Page (RSC) ─────────────┐
        ──► Server Action ──────────┼──► getContext() ──► services/*.ts ──► Prisma ──► PostgreSQL
        ──► /api/* route handler ───┘     (auth, tenant,    (authorize, validate,
                                           permissions)      transact, audit, notify)
```

All business rules live in `src/server/services` and the shared pure modules in `src/lib`. The UI never enforces rules on its own: it only hides affordances the server would reject.

## Request context and security model

`src/server/context.ts` builds a `Ctx` for every request:

| Field | Source |
|---|---|
| `userId`, `orgId` | Auth.js JWT → user row (never from client input) |
| `permissions` | the user's role → `RolePermission` rows |
| `dataScope` | the role's `ALL` / `OWN` setting |
| `settings` | `Organization.settings` JSON, validated with Zod and defaulted |

Every service function starts with `ctx.require("<module>.<action>")` and builds its Prisma `where` clauses from helpers such as `leadWhere(ctx)`. These always include `organizationId = ctx.orgId`, `deletedAt IS NULL` and the data-scope filter (`ownerId = ctx.userId` for OWN roles). A record outside the caller's tenant or scope behaves as if it does not exist (`NotFoundError`).

**Authentication.** Auth.js v5 with JWT sessions.
- The Credentials provider calls `verifyCredentials()`: bcrypt (cost 12), a constant-time comparison against a dummy hash for unknown users, and an in-memory rate limit of 10 failures per identifier per 15 minutes.
- Google and OIDC SSO are invite-only: the `signIn` callback links an external identity (`UserIdentity`) only to an existing, active user with the same verified email.
- "Remember me" sets a 30-day lifetime; without it the session ends after 12 hours, enforced in the `jwt` callback.
- `User.sessionVersion` is embedded in the token and checked on every request. Password change or reset, deactivation, and role changes bump it, which signs the user out everywhere.

**Authorization.** 49 permission keys (`src/lib/permissions.ts`), grouped by module, with actions view, create, edit, assign, export, delete, plus specific ones such as `lead.convert`, `order.override_price` and `ticket.reply_customer`. The four system roles are seeded with defaults. Administrators edit grants and data scope in *Settings → Roles*. Guards against privilege escalation:
- Only administrators can assign the Administrator role or edit administrators.
- Non-administrators cannot edit the permissions of their own role.
- The Administrator role always holds every permission.
- The organization must keep at least one active administrator.

**Client input is never trusted for:**
- *User ids.* Owner and assignee ids are verified to be active users of the same tenant. Users without the assign permission always own what they create.
- *Prices and totals.* The server reprices every order line from the catalogue (see Orders).
- *Permissions and tenant.* These are always derived from the session.

**Other measures:**
- Zod validation on every input, and Prisma parameterized queries (raw SQL uses tagged templates).
- CSV export neutralizes formula injection.
- Login redirect targets are restricted to relative paths.
- Errors returned to the client are typed and user-safe (`src/server/errors.ts`). Unexpected errors are logged without payloads and shown generically.
- Security headers are set in `next.config.ts`.

**Multi-tenancy.** `Organization` is the tenant. Every business table carries `organizationId`, and every query filters by it. Integration tests verify cross-tenant reads, writes and references are rejected. Tenant provisioning and billing are not built yet (see ROADMAP).

## Data model

Defined in `prisma/schema.prisma`. Conventions:
- UUID primary keys, plus human-readable numbers per tenant (`LD-00001`, `ACC-…`, `CON-…`, `MTG-…`, `PRD-…`, `TKT-…`, `ORD-…`) allocated atomically from `Counter` with `INSERT … ON CONFLICT DO UPDATE … RETURNING`.
- `createdAt` / `updatedAt` plus `createdById` / `modifiedById` on business records.
- **Soft delete** (`deletedAt`, shown in the UI as "Archive") for leads, accounts, contacts, meetings, products, tickets and orders, so audit history and foreign keys stay intact.
- **Optimistic concurrency** (`version`) on leads, tickets and orders. Every workflow update is a conditional `updateMany … WHERE version = ? [AND status = ?]`, and a mismatch returns `CONFLICT`. This also prevents duplicate submissions such as double-clicking "Confirm" or converting twice.
- Money is `Decimal(18,2)`, quantities `Decimal(18,3)`, tax rates `Decimal(6,3)`.

| Area | Tables |
|---|---|
| Tenancy & identity | Organization, User, UserIdentity, PasswordResetToken, SsoConnection*, Role, Permission, RolePermission, Counter |
| CRM | Account, Contact, LeadSource, Lead, LeadContact, LeadStageHistory, LeadDiscussion |
| Activities | Meeting, MeetingContact, MeetingMinute, ActionItem |
| Catalogue | ProductCategory, TaxRate, Product |
| Support | Ticket, TicketMessage (internal note / customer reply), TicketEvent (field history) |
| Orders | Order, OrderLineItem (price snapshot), OrderStatusHistory, DeliveryEvent |
| Cross-cutting | AuditLog, Notification |

\* `SsoConnection` (email-domain → IdP mapping) is modelled for future multi-IdP routing. The current SSO setup is a single OIDC provider configured through environment variables.

## Business rules

### Leads
- Stages, in order: **Qualified Lead → In Discussion → Lead Mature → Lead Converted**. Pure rules live in `src/lib/workflows.ts`, configurable per organization:
  - `allowSkipStages` (default **off**): leads move one stage at a time.
  - `allowBackward` (default **on**): open leads may move back.
  - `allowReopenConverted` (default **off**): reopening clears `convertedAt` but keeps history.
- Conversion has its own action and is never a plain stage change. By default only "Lead Mature" leads can convert.
- Discussion updates may be added while a lead is "In Discussion", or at any open stage when logged from a linked meeting ("Add lead progress update"). A discussion's follow-up date becomes the lead's next follow-up date.
- **Conversion runs in a single transaction:**
  1. Link an existing account, or create one (with duplicate checks).
  2. Stamp `CONVERTED` / `convertedAt` / `convertedById` through a conditional update, which guarantees a single conversion.
  3. Associate the selected contacts, and optionally create (or reuse by email) a buyer contact from the lead.
  4. Write stage history, the audit log and a notification.

  If any step fails, nothing is changed.

### Accounts & contacts
- Duplicate detection runs on the normalized company name (case, punctuation and legal suffixes such as Inc/Ltd/Pvt are ignored), the lower-cased email and the E.164 phone. A possible duplicate raises `DUPLICATE_WARNING` listing the matches. Only users with `account.override_duplicate` can proceed, and the account is then flagged `duplicateOverride`. Records are never merged automatically.
- Phones are validated with libphonenumber, using the account's country when no `+` prefix is given.
- Contacts: email unique per tenant. Consent is tracked with `marketingConsent`, `consentAt` (set automatically), `consentSource`, `subscriptionStatus` and `unsubscribedAt`. Withdrawing consent unsubscribes the contact. **Campaign eligibility is derived:** an active contact with an email address, consent, and status SUBSCRIBED.

### Orders
- New orders start as **Draft**. Only drafts can be edited. Confirmed orders keep their agreed lines.
- **Server-side pricing** (`src/lib/order-math.ts`, shared with the form's live preview):
  - per line: `subtotal = round2(qty × unitPrice)`, `discount = round2(subtotal × d%)`, `tax = round2((subtotal − discount) × t%)`, `total = subtotal − discount + tax`
  - order totals are sums of the rounded line values, using half-up rounding and decimal.js (no floating point)
  - the unit price must equal the catalogue price unless the user holds `order.override_price`
  - the product currency must match the order currency (unless overriding)
  - the discount must not exceed the configured maximum; tax comes from the product's tax class when tax is enabled
  - only active products can be added (lines already on a draft may stay)
- Each line stores a **snapshot**: name, SKU, description, unit of measure, list price at sale, unit price, discount and tax rate. Catalogue changes never alter existing orders.
- Status workflow (configurable): Draft → Confirmed → Processing → Shipped → Delivered, and Draft/Confirmed/Processing → Cancelled. Delivered and Cancelled are final. Shipping records carrier, tracking number and an "in transit" delivery event. Delivered sets the actual delivery date.
- Delivery events (in transit, out for delivery, delivered, exception) can be recorded on shipped orders. They cannot be in the future or before the shipment. A "Delivered" event completes the order.
- **An order is never treated as paid.** Invoicing, payments and receivables are not modelled yet (see ROADMAP).

### Tickets
- Statuses: Open, In Progress, Waiting for Customer, Resolved, Closed. Transitions are defined in `workflows.ts`. A closed ticket can only be reopened to Open. Resolving requires a resolution note (configurable).
- Every status, priority and assignment change is recorded in `TicketEvent`.
- Internal notes and customer-visible replies are separate message kinds. Replies need `ticket.reply_customer`. They are emailed only when SMTP is configured; otherwise they are stored as `RECORDED_ONLY` and labelled as not sent.

### Meetings
- A meeting must be linked to an account or a lead. A lead's account is inherited. Customer contacts must belong to the meeting's account.
- MOM entries (summary, requirements, decisions, notes) can be added repeatedly. Action items have an owner, due date and status. Owners can update their own items without meeting-edit rights.
- The follow-ups view and dashboard list upcoming meetings, open action items and lead follow-ups, with overdue items first.

### Notifications & audit
- In-app notifications cover:
  - assignments (lead, account, meeting, ticket, order owner, action item)
  - stage, status and delivery changes
  - time-based reminders generated idempotently with dedupe keys: meetings within 24 hours, overdue action items, overdue lead follow-ups

  Users are never notified about their own actions.
- `AuditLog` records actor, timestamp, entity, action, a summary and field-level `{from, to}` changes for every important mutation. It is viewable in *Settings → Audit log* and on each record's Activity tab.

## Dates and timezones
- Date-and-time values (meetings, delivery events) are entered and displayed in the **organization timezone** (Settings → Organization) and stored as UTC instants.
- Date-only values (follow-ups, due dates, order and delivery dates) are stored as UTC midnight and always formatted in UTC, so they never shift by a day.
- Dashboard periods are computed in the organization timezone. Weeks start on Monday. "Half-Yearly" means the current calendar half (Jan–Jun or Jul–Dec).

## Dashboard & report definitions

All figures come from live SQL over the caller's tenant and data scope (`src/server/services/dashboard.ts`). "Period" is the selected range.

| KPI | Definition |
|---|---|
| Total Leads | leads **created** in the period |
| Active Leads | of those, leads not converted |
| Qualified Leads | of those, leads currently in "Qualified Lead" |
| Converted Leads | leads whose **conversion date** is in the period |
| Lead Conversion Rate | **cohort rate**: leads created in the period that are now converted ÷ leads created in the period. Shows "—" when the denominator is 0 |
| Sales Pipeline Value | sum of estimated value of **open** leads created in the period. A forecast, **not revenue**. The all-time open pipeline is shown as a hint |
| Total Sales Volume | sum of order totals (incl. tax) for orders **dated** in the period with status Confirmed, Processing, Shipped or Delivered, **in the base currency only**. Drafts and cancellations are excluded; each order counts once (totals stored on the order). Other-currency orders are counted and reported separately because no FX rates exist. **Not cash collected** |
| Orders in Progress | orders dated in the period with status Confirmed, Processing or Shipped |

Charts: cumulative sales funnel (leads created in the period that reached at least each stage, from stage history), leads by stage, lead sources (created and converted), conversion trend (created vs converted per day, week or month depending on range length), sales volume trend, salesperson performance, pipeline value by stage, and order status distribution. Each chart has a table view. Reports group leads by salesperson, source, account or stage and export to CSV.

## Testing

- `tests/unit`: order math, workflow rules, normalization, timezone and period logic.
- `tests/integration`: the service layer against a real PostgreSQL test database. Covers login and sessions, password reset, RBAC and escalation guards, tenant isolation, lead CRUD, stages, discussions and conversion (including duplicate prevention and atomicity), account validation and duplicate warnings, contacts and consent, meetings, MOM and follow-ups, SKU uniqueness, the ticket lifecycle, order pricing, snapshots, workflow and delivery, and dashboard KPI calculations with exact expected values.
- `e2e`: Playwright, desktop and mobile. Covers login errors, sign-out, permission gating, the full lead → discussion → conversion → order → confirm flow, the duplicate-account dialog, global search, meetings with MOM and action items, the ticket notes, replies and resolve flow, and the mobile navigation drawer.
