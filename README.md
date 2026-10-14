# LeadZen — B2B Sales CRM

A B2B sales, CRM and order-management web app covering the customer lifecycle from **inquiry to order** and **order to delivery**: leads, accounts and buyers, contacts, meetings and minutes (MOM), a product catalogue, support tickets, orders with delivery tracking, dashboards and reports.

The product name is configurable through `NEXT_PUBLIC_APP_NAME`.

| | |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui (Radix), Lucide icons, Recharts |
| Data | PostgreSQL + Prisma 6 (migrations + seed) |
| Auth | Auth.js v5: email/username + password, Google OAuth, enterprise SSO (OIDC) |
| Validation & forms | Zod 4 (shared client/server schemas), React Hook Form |
| Tests | Vitest (unit + integration against PostgreSQL), Playwright (E2E, desktop + mobile) |

More documentation:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): structure, data model, security model, business rules, KPI definitions
- [docs/API.md](docs/API.md): server actions and HTTP routes
- [docs/ROADMAP.md](docs/ROADMAP.md): completed features, known limitations, prioritized roadmap

---

## Quick start (local development)

**Prerequisites:** Node.js ≥ 20.9 (developed on Node 24 LTS). PostgreSQL is optional: the project can run its own local PostgreSQL server through the `embedded-postgres` package, with no Docker or system install needed.

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # then set AUTH_SECRET:  openssl rand -base64 32

# Terminal 1: local PostgreSQL on port 5433 (data in ./.pgdata).
# Creates the `salesflow` and `salesflow_test` databases on first start.
npm run db:start

# Terminal 2
npm run db:deploy           # apply migrations
npm run db:seed             # load demo data (only seeds an empty database)
npm run dev                 # http://localhost:3000
```

To use your own PostgreSQL, point `DATABASE_URL` (and `TEST_DATABASE_URL`) at it and skip `db:start`.

### Demo accounts (seed data only)

All seeded records are fictional and labelled "(Demo)". Every demo user's password is **`Demo@12345`**.

| Role | Login | Sees |
|---|---|---|
| Administrator | `admin@salesflow.demo` (or username `admin`) | everything, incl. settings |
| Sales Manager | `manager@salesflow.demo` | all records, reports, audit log |
| Sales Representative | `priya@salesflow.demo`, `daniel@salesflow.demo`, `meera@salesflow.demo` | only records they own or are assigned |
| Support Agent | `support@salesflow.demo`, `lena@salesflow.demo` | tickets plus read-only customer and order context |
| Second tenant (isolation demo) | `admin@globex.demo` | only the separate "Globex" organization |

The login page shows these hints in development only.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript (`tsc --noEmit`) |
| `npm run db:start` | Local PostgreSQL via embedded-postgres (dev only) |
| `npm run db:migrate` | Create and apply a new migration (`prisma migrate dev`, interactive) |
| `npm run db:deploy` | Apply existing migrations (CI and production) |
| `npm run db:seed` | Seed demo data into an empty database |
| `npm run db:reset` | **Destructive.** Drop, re-migrate and re-seed the dev database |
| `npm test` | Unit and integration tests (rebuilds the `*_test` database on every run) |
| `npm run test:e2e` | Playwright end-to-end tests (needs the seeded dev database; starts `npm run dev` if it isn't running) |

First-time E2E setup: `npx playwright install chromium`.

> **Test safety:** integration tests refuse to run unless the database name in `TEST_DATABASE_URL` contains `test`, because they drop and rebuild its schema.

---

## Environment variables

See [`.env.example`](.env.example). Secrets never belong in source control.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `TEST_DATABASE_URL` | for tests | Separate database for integration tests (name must contain "test") |
| `AUTH_SECRET` | yes | Auth.js signing/encryption secret (`openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | prod behind proxy | `true` when running behind a reverse proxy or load balancer |
| `APP_URL` | yes | Public base URL, used in password-reset links and shown for OAuth redirect URIs |
| `NEXT_PUBLIC_APP_NAME` | no | Product name shown in the UI (default "SalesFlow B2B") |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | no | Enables Google sign-in |
| `AUTH_SSO_ISSUER`, `AUTH_SSO_CLIENT_ID`, `AUTH_SSO_CLIENT_SECRET`, `AUTH_SSO_NAME` | no | Enables enterprise SSO through OpenID Connect |
| `SMTP_URL`, `EMAIL_FROM` | no | Enables outbound email (password resets, customer ticket replies) |
| `ANTHROPIC_API_KEY` | no | Enables Zeni, the read-only conversational assistant ("Ask Zeni" button), powered by Claude |
| `NEXT_PUBLIC_ASSISTANT_NAME` | no | Assistant name shown in the UI (default "Zeni") |

### Google sign-in
1. Create an OAuth client at https://console.cloud.google.com/apis/credentials (type: Web application).
2. Authorized redirect URI: `{APP_URL}/api/auth/callback/google`.
3. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, then restart.

### Enterprise SSO (OpenID Connect)
Works with Okta, Microsoft Entra ID, Auth0, Keycloak, OneLogin and other OIDC-compliant providers.
1. Register a web application in the IdP with redirect URI `{APP_URL}/api/auth/callback/sso` and scopes `openid email profile`.
2. Set `AUTH_SSO_ISSUER` (for example `https://login.microsoftonline.com/<tenant>/v2.0`), `AUTH_SSO_CLIENT_ID` and `AUTH_SSO_CLIENT_SECRET`. `AUTH_SSO_NAME` sets the button label.
3. SAML-only IdPs need an OIDC bridge (for example, Keycloak brokering SAML). Native SAML is on the roadmap.

**Invite-only:** Google or SSO sign-in succeeds only when the verified email matches an existing, active user. Administrators create users in *Settings → Users*. OAuth never creates accounts on its own.

**Not yet verified:** Google and SSO sign-in are implemented but have not been tested against real identity providers, because no credentials were available during development. Credentials sign-in, sessions, password reset (dev log fallback) and RBAC are covered by automated tests.

### Email
Without `SMTP_URL`:
- Password-reset links are written to the server log in development and never in production.
- Customer ticket replies are stored and clearly marked "Recorded only — not sent".
- No marketing email is ever sent.

---

## Deployment

1. Provision PostgreSQL 14+ and set the environment variables above (`AUTH_SECRET`, `APP_URL`, `AUTH_TRUST_HOST=true` behind a proxy).
2. `npm ci && npm run build`. `postinstall` runs `prisma generate`.
3. `npm run db:deploy` to apply migrations. Run this before starting new code on every release.
4. `npm start` (port 3000 by default; set `PORT` to change it). Any Node host works: a VM, a container, Render, Railway, Fly.io, or Vercel with a managed Postgres.
5. Create the first organization and administrator. In a fresh production database, adapt `prisma/seed.ts` or run a one-off script; **do not load demo data in production**. Self-service tenant sign-up is on the roadmap.

Operational notes:
- Login rate limiting is in-memory, so it is per instance. Use a shared store such as Redis when running several instances.
- Security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.ts`. Add a CSP that suits your hosting.
- `npm audit` reports advisories in dev-only tooling (the ESLint config and Prisma CLI dependency chain: `braces`, `deepmerge-ts`). These are not part of the runtime bundle; the suggested `--force` fix would downgrade majors.

---

## Project structure

```
prisma/
  schema.prisma          relational model (multi-tenant, UUID keys, soft delete)
  migrations/            SQL migrations
  seed.ts                reproducible demo data (two tenants)
src/
  app/
    (auth)/              login, forgot/reset password, auth server actions
    (app)/               authenticated app: one folder per module, each with
                         page.tsx (list), new/, [id]/ (detail), [id]/edit/, actions.ts
    api/                 auth, search, notifications, CSV export
  components/
    ui/                  shadcn/ui primitives
    app/                 shell: sidebar, top bar, global search, notifications, user menu
    data/                DataTable, FilterBar, PageHeader, KpiCard, StatusBadge, Timeline …
    forms/               accessible RHF field wrappers, server-form hook, dialogs
    charts/              dashboard charts (Recharts) with table views, period filter
  features/<module>/     module-specific client components (forms, dialogs)
  lib/                   shared pure code: Zod schemas, permissions, workflows, order math,
                         dates/timezones, normalization, settings, constants
  server/
    services/            business logic, one file per module (authorization, validation,
                         transactions, audit, notifications)
    context.ts           request context: user, tenant, permissions, data scope
    auth.ts, credentials.ts   Auth.js configuration
tests/unit, tests/integration   Vitest
e2e/                     Playwright
scripts/local-postgres.ts       embedded PostgreSQL for development
```
