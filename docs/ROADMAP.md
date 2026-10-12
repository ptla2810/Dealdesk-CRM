# Status, limitations & roadmap

## Implemented (initial release)

- **Authentication:** email or username + password, remember-me (30 days vs 12 hours), forgot/reset password with single-use hashed tokens, logout, server-side session invalidation, login rate limiting. Google OAuth and OIDC enterprise SSO are implemented and invite-only. **They have not been tested against real providers** (no credentials were available).
- **RBAC:** 4 system roles plus custom roles, 49 permissions, ALL/OWN data scope, a permissions matrix UI, server-side enforcement, escalation guards.
- **Multi-tenant data model:** organization isolation on every query, verified by tests.
- **Dashboard:** 8 KPIs and 8 charts, live data, period filters (today, week, month, quarter, half-year, year, custom), salesperson and source filters, table views, upcoming commitments, recent activity.
- **Leads:** list (search, sort, filters, pagination, CSV export), create/edit, assignment, stage workflow with configurable rules, discussion updates, stage history, transactional conversion with duplicate prevention, related meetings, orders and tickets.
- **Accounts & Buyers:** CRUD, duplicate detection with review dialog and permission-gated override, related leads, contacts, meetings, tickets and orders.
- **Contacts:** CRUD, multiple per account, consent, subscription and derived campaign eligibility, CSV export.
- **Meetings & MOM:** scheduling (org timezone), MOM entries, action items with owners, due dates and status, follow-ups view (mine/team, 7/14/30 days), lead progress updates from a meeting.
- **Products:** catalogue with categories, configurable tax classes, multi-currency prices, SKU uniqueness, activate/deactivate, order history.
- **Support tickets:** assignment, priorities, status workflow, resolution notes, internal notes separate from customer replies, field-change history.
- **Orders & delivery:** server-priced line items with discounts and tax, price snapshots, draft editing, configurable status workflow, carrier and tracking, delivery events, delivery timeline, related tickets.
- **Search & navigation:** global search (⌘K), module search and filters, breadcrumbs, related-record links throughout.
- **Audit log** for all important events. **In-app notifications** for assignments, status changes and reminders.
- **Settings:** profile and password, users, roles, lead sources, categories, tax rates, organization (currency, timezone), workflow and pricing rules, integration status.
- **Quality:** 80 unit and integration tests and 10 E2E tests (desktop + mobile). Lint, typecheck and production build are clean.

## Known limitations

| Area | Limitation |
|---|---|
| Finance | **No invoicing, payments, reconciliation or receivables.** Sales volume is order value, not cash collected. Delivered ≠ paid. |
| Currency | No exchange rates. Dashboards sum only base-currency orders and report the count of other-currency orders. Lead values use the base currency. |
| Tenancy | No self-service organization sign-up, tenant administration UI or subscription billing. Organizations are created by seed or script. One organization per user (email is globally unique). |
| SSO | A single OIDC provider configured through env vars. No native SAML, no per-domain IdP routing (the `SsoConnection` table is modelled but unused), no SCIM provisioning. Google and SSO are untested against live providers. |
| Email | Requires `SMTP_URL`. Without it, reset links go to the dev log only and customer replies are "recorded only". No inbound email-to-ticket. No marketing campaigns are sent. |
| Attachments | Ticket and product file uploads are not supported (no object storage configured). Product images are https URLs. |
| Calendar | No calendar sync (Google/Microsoft). Meetings live only in SalesFlow. |
| Scale | The login and reset rate limiter is in-memory, per instance. CSV export is capped at 10,000 rows. Reports compute on request with no caching or materialized views. |
| Lead model | Only the four specified stages. There is no "Lost/Disqualified" stage (archive is used instead), so conversion-rate cohorts include leads that went cold. |
| Data import | No bulk CSV import for leads, contacts or products. |
| i18n | English UI; formatting uses `en-US` number formats with ISO currencies. |

## Prioritized roadmap

1. **Invoicing & order-to-cash.** `Invoice` / `InvoiceLine` generated from confirmed or delivered orders (partial invoicing), tax invoices with numbering, PDF output; `Payment` with allocation to invoices; payment status on orders derived from allocations (never from delivery); AR ageing report; credit notes.
2. **Payment collection & reconciliation.** Payment-gateway integration (Stripe, Razorpay) and bank-statement import with matching rules; reconciliation queue; dunning reminders.
3. **Tenant lifecycle & subscription billing.** Self-service sign-up, organization switching, plan limits, metered seats, billing portal; super-admin console.
4. **Lead model extensions.** A Lost stage with reasons, win/loss analytics, lead scoring, duplicate detection for leads and contacts, bulk import and assignment rules (round-robin, territories).
5. **Integrations.** Email provider (SES, SendGrid, Postmark) for transactional mail and inbound email-to-ticket; marketing platforms (Mailchimp, HubSpot) synced only for campaign-eligible contacts; Google and Microsoft calendar sync for meetings; webhooks and a public REST API with tokens.
6. **Enterprise identity.** Native SAML, per-domain IdP routing (`SsoConnection`), SCIM provisioning, MFA (TOTP/WebAuthn), configurable session policies.
7. **Operations & scale.** Redis-backed rate limiting and caching, background jobs for reminders and exports, report snapshots, observability (OpenTelemetry), CSP hardening, data retention and GDPR export/erase tooling.
8. **Files & UX.** Object storage for attachments and product images, saved list views, Kanban pipeline board, dark-mode toggle, localization.
