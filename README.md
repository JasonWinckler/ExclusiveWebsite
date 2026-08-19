# Shadow's Temptation — ExclusiveWebsite

Production repository for the single-creator membership platform at
[exclusive.jason-shadow.com](https://exclusive.jason-shadow.com/). The system
is Cloudflare-native: Cloudflare Pages serves the React frontend and Pages
Functions gateway, while Workers, D1 and private R2 provide the backend.

This README is the canonical technical handoff for a new Codex task or
maintainer. Read it together with `AGENTS.md` and the linked operational
documents before changing production behavior.

## Production identity

| Item | Production value |
| --- | --- |
| Repository | `JasonWinckler/ExclusiveWebsite` |
| Public domain | `https://exclusive.jason-shadow.com` |
| Frontend | Cloudflare Pages project/config `shadows-temptation` |
| Frontend branch | `main` |
| Build command | `npm run build` |
| Build output | `dist` |
| Primary D1 database | `exclusive-membership` |
| Runtime | Cloudflare Pages, Pages Functions, Workers, D1 and private R2 |
| Appwrite | No build, hosting, SDK, authentication, data or runtime dependency |

The platform is already in production. Documentation, UI text and operational
decisions must not describe it as a prototype or future launch.

## Product scope

The repository owns the complete customer and administrator experience:

- German and English public marketing, membership and legal pages;
- registration, email verification, login, password reset and profile changes;
- optional member TOTP MFA and mandatory administrator MFA;
- device/session management with a maximum of three active devices;
- manual age verification using live ID captures, a live video and a random
  six-digit paper challenge;
- free, Basic, Premium and VIP content feeds with posts and member comments;
- one-time SEPA credit-transfer orders, EPC QR data, invoices and N26 CSV
  reconciliation;
- account, order, content, comment, newsletter, privacy and age-review tools in
  the admin interface;
- administrator simulation of guest, registered, verified and membership
  perspectives without disclosing secret member values;
- transactional mail through the shared Microsoft 365 mailbox;
- data-minimised Telegram access for active Premium and VIP members;
- a public, non-explicit `/linktree/` surface kept separate from the music
  brand at `jason-shadow.com`.

This is a single-creator platform. Customers cannot upload public content;
their only uploads are private, short-lived age-verification evidence.

## Non-negotiable safety boundary

- Never commit credentials, production data, invoices, backups, bank details,
  age evidence, customer exports or adult media.
- Never make a private R2 bucket or object publicly addressable.
- Never replace server-side authorization with UI checks or trust a browser-
  supplied user ID, role, age state, tier, invoice key or media key.
- Never copy production evidence or customer data into local tests, CI
  artifacts, support archives or screenshots.
- Never run a production migration, restore, deletion, DNS change or bulk admin
  operation merely to validate documentation.
- Preserve the dark red, ember and gold Shadow's Temptation design and update
  German and English copy together.
- Preserve the legal separation between erasable account data and financial
  records that must be retained for statutory purposes.

## Architecture

```text
Browser
  |
  | HTTPS, same-origin /api/*, Secure HttpOnly cookie
  v
Cloudflare Pages: shadows-temptation
  |-- React/Vite frontend
  `-- Pages Function: functions/api/[[path]].js
       |-- AUTH_API --------> exclusive-auth-api
       |-- MEMBERSHIP_API --> exclusive-membership-api
       `-- ADMIN_API -------> exclusive-admin-api
                                |
Workers use private service bindings
  |-- exclusive-identity-projection --> Microsoft Graph / shared mailbox
  |-- exclusive-maintenance-jobs ----> expiry, retention, retries, cleanup
  |-- D1: exclusive-membership
  `-- private R2 buckets: evidence, content, invoices, backups
```

### Cloudflare services

| Component | Responsibility | Configuration |
| --- | --- | --- |
| Pages frontend | React UI, static legal pages, SEO assets | `wrangler.jsonc`, `vite.config.js` |
| Pages gateway | Canonical-host and same-origin enforcement; private routing | `functions/api/[[path]].js` |
| `exclusive-auth-api` | Accounts, passwords, email state, sessions, devices, TOTP MFA and recovery | `cloudflare/wrangler.auth-api.jsonc` |
| `exclusive-membership-api` | Profiles, age submissions, catalog, orders, invoices, entitlements, feeds, privacy and Telegram | `cloudflare/wrangler.membership-api.jsonc` |
| `exclusive-admin-api` | Admin sessions, age review, user/order/content/comment/newsletter management and monitoring | `cloudflare/wrangler.admin-api.jsonc` |
| `exclusive-identity-projection` | Private branded transactional email through Microsoft Graph | `cloudflare/wrangler.identity-projection.jsonc` |
| `exclusive-maintenance-jobs` | Expiry, evidence deletion, retention, reminders, email retries and backup pruning | `cloudflare/wrangler.maintenance-jobs.jsonc` |

The Identity Worker has no public route. Backend Workers use Cloudflare service
bindings instead of public Worker URLs.

### Request and trust flow

1. The browser calls only relative `/api/auth`, `/api/member` and `/api/admin`
   routes.
2. The Pages gateway requires the canonical HTTPS host and same-origin browser
   requests, then forwards through a service binding.
3. The Auth Worker issues `__Host-shadow_session` as a `Secure`, `HttpOnly`,
   `SameSite=Strict`, host-only cookie. D1 stores only its SHA-256 hash.
4. Membership and Admin derive identity, role, email, MFA, age and entitlement
   state from D1. They do not accept those decisions from React.
5. Protected R2 media is streamed only after authorization. R2 object keys are
   not exposed as public URLs and image responses remain non-cacheable.

Protected operations fail closed. `/api/health` reports whether the gateway's
three required service bindings are present; it is not a substitute for an
authenticated end-to-end test.

## Appwrite migration status

Appwrite has been removed from production runtime, dependencies, hosting and
authentication. Do not reintroduce its SDK, endpoints, credentials or build
configuration.

Some D1 columns and TypeScript properties still use historical names such as
`appwrite_user_id`, `appwrite_session_id` and `last_appwrite_access_at`. They
are stable internal subject identifiers retained to preserve relationships
among existing accounts, orders, entitlements, age decisions and audit events.
Their names are not evidence of an active Appwrite connection. Renaming them
would be a high-risk data migration and must not be attempted as cleanup.

## Data stores and retention

### D1

`exclusive-membership` is authoritative for accounts, sessions, devices,
privacy state, age-case metadata, products, SEPA orders, invoices,
entitlements, posts, comments, newsletters, reach aggregates, Telegram state
and auditable admin actions.

Schema migrations live in `cloudflare/migrations/` and are applied in filename
order. They are production history: do not edit an already-applied migration.
Add a new forward migration and keep it additive where possible.

### Private R2

| Bucket | Binding | Contents |
| --- | --- | --- |
| `exclusive-age-evidence` | `VERIFICATION_UPLOADS` | Short-lived ID images and challenge video; EU jurisdiction |
| `exclusive-content-media` | `CONTENT_MEDIA` | Creator post images and videos |
| `exclusive-invoice-archive` | `INVOICE_ARCHIVE` | Exact invoice copies with integrity metadata; EU jurisdiction |
| `exclusive-system-backups` | `SYSTEM_BACKUPS` | At most two private compressed D1 exports; EU jurisdiction |

### Retention summary

| Data | Policy implemented by the platform |
| --- | --- |
| Age evidence | Delete immediately after a decision; otherwise after the 48-hour review window in the next maintenance run |
| Age decision metadata | Minimise after the configured decision-retention period |
| Cancelled orders | Hide/archive from customer history after two days; retain the underlying financial record only for its applicable legal retention period |
| Authentication action tokens and spent recovery material | Purge after expiry/consumption according to the maintenance policy |
| Audit events | Maximum 730 days and maximum 30 days after deletion of the affected account |
| Cookieless reach/conversion aggregates | Maximum 90 days; no stored IP, user agent, account ID or cross-device identifier |
| Newsletter delivery details | Maximum 30 days; consent status remains only as required |
| D1 exports | Keep only the two newest objects under `d1/` |
| Invoice/financial records | Retain separately for applicable statutory obligations; do not erase prematurely with the interactive account profile |

The precise deletion behavior and exceptions are documented in
`docs/DATA_DELETION.md` and `docs/DATENSCHUTZ-FOLGENABSCHAETZUNG.md`.

## Membership catalog and payment flow

The catalog is data-driven in D1. Current production SKUs and seeded prices
are:

| Tier | Term | Price |
| --- | --- | ---: |
| Basic trial | 7 days | EUR 1.99 |
| Basic | 30 days | EUR 4.99 |
| Basic | 6 months | EUR 24.99 |
| Basic | 12 months | EUR 49.99 |
| Premium | 30 days | EUR 19.99 |
| Premium | 6 months | EUR 99.99 |
| Premium | 12 months | EUR 149.99 |
| VIP | 30 days | EUR 49.99 |
| VIP | 6 months | EUR 199.99 |
| VIP | 12 months | EUR 399.99 |

Perks are normalised by tier rather than duplicated for every term. Premium
and VIP include Telegram access; VIP adds its private benefits. The UI reads
the catalog rather than hardcoding a second source of truth.

The SEPA flow creates a pending order before presenting payment details. It
uses a unique, assignable purpose, an EPC QR credit transfer and a 48-hour
payment deadline. No bank login or payment initiation occurs. The admin can
reconcile N26 CSV exports or manually resolve documented support cases. A
membership entitlement is issued only after server-side payment confirmation.

Higher active tiers pause eligible lower-tier time; the lower entitlement can
resume after the higher tier ends. A deliberate manual admin grant replaces
the previous membership according to the admin workflow.

## Age-verification flow

There is no third-party age-verification provider.

1. An authenticated, email-verified customer starts a short-lived case.
2. The backend generates a random six-digit challenge.
3. The browser permits live capture only: ID front, ID back and a live video
   showing the face, ID, handwritten challenge and required head movement.
4. Files pass client and server type/size validation and are stored in private
   R2 with D1 metadata.
5. An MFA-authenticated admin opens the evidence through a short admin session,
   records a decision and closes the preview.
6. Evidence is deleted after the decision and the customer receives the
   result/deletion confirmation by email. Unreviewed evidence expires after 48
   hours and the customer must start again.

Evidence responses are `no-store`; object metadata is checked against D1;
access is audited. Only a qualified current admin may view it.

## Authentication and administration

- Passwords are transformed client-side with a per-user salt and 600,000
  PBKDF2-HMAC-SHA-256 iterations. The Auth Worker stores only a second HMAC
  protected by a server-side pepper.
- Login responses do not reveal whether an email address exists. Repeated
  failures trigger a temporary account-level throttle.
- Accounts may keep at most three active devices. Removing a device signs it
  out; a separate lock action can block it until explicitly unlocked.
- User sessions may persist for the configured duration. Admin actions require
  an additional device-bound session of at most ten minutes.
- Admin access requires the D1 `ADMIN` role, verified age, enabled TOTP MFA,
  a registered device, valid origin and active admin session.
- User and admin account deletion are separate two-step operations. Deletion
  must remain possible despite an entitlement; retained invoice/financial
  records are separated from interactive access.

## Email, newsletter and Telegram

`exclusive-identity-projection` sends branded transactional email as
`info@exclusive.jason-shadow.com` through Microsoft Graph. It handles account
verification, password recovery, invoice/order mail, membership activation and
expiry reminders, age decisions and privacy notifications. It is invoked only
through authenticated service bindings.

Newsletter subscription uses double opt-in. Every campaign email includes a
direct unsubscribe link. The system stores only the consent and limited
delivery state it needs.

Premium and VIP members can link one Telegram account. Claim tokens are random,
stored only as hashes and expire after ten minutes. The bot creates a single-
use, account-bound channel invitation with a short lifetime. The invitation is
revoked after joining, and access is removed when membership or account access
ends. Chats, usernames, profile photos and message content are not stored.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `src/` | React application, admin UI, localization and browser API client |
| `public/` | Static SEO, legal and public assets |
| `linktree/` | Non-explicit public link hub and email artwork source |
| `functions/api/[[path]].js` | Same-origin Cloudflare Pages gateway |
| `cloudflare/src/workers/` | Auth, membership, admin, identity and maintenance Workers |
| `cloudflare/src/shared/` | Shared authorization, database, email, Telegram and policy code |
| `cloudflare/migrations/` | Ordered D1 migrations |
| `cloudflare/test/` | Worker, policy and security-contract tests |
| `scripts/` | Sitemap generation, Pages preparation and bundle-budget checks |
| `tests/` | Playwright browser and responsive regression tests |
| `docs/` | Architecture, security, legal, privacy and operations runbooks |
| `.github/workflows/d1-private-backup.yml` | Scheduled private D1 export |

## Configuration and secrets

Public local overrides are listed in `.env.example`. `VITE_*` values are
compiled into the browser and must never contain credentials. Production uses
same-origin API paths and generally needs no browser-side secret or API URL.

Worker defaults, service bindings, database IDs and bucket names are
version-controlled in `cloudflare/wrangler.*.jsonc`. Secret values belong only
in Cloudflare encrypted secrets or local ignored `.dev.vars` files.

Important secret names include:

- authentication: `AUTH_PASSWORD_PEPPER`, current/previous pepper variants,
  `AUTH_ENCRYPTION_KEY`, current/previous encryption-key variants and
  `AUTH_EMAIL_SERVICE_SECRET`;
- internal services: `LABEL_SYNC_SERVICE_SECRET` and
  `ACCOUNT_LIFECYCLE_SERVICE_SECRET`;
- Microsoft Graph: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` and
  `GRAPH_CLIENT_SECRET`;
- SEPA/invoicing: `SEPA_BENEFICIARY_NAME`, `SEPA_IBAN`, `SEPA_BIC` and
  `INVOICE_TAX_IDENTIFIER`;
- member perks: `VIP_WHATSAPP_NUMBER`, `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` and
  `TELEGRAM_INVITE_ENCRYPTION_KEY`.

Never print, copy into chat, commit or expose these values in a `VITE_*`
variable. During key rotation, keep current and previous versions only for the
documented transition window.

## Local development

Prerequisites:

- Node.js compatible with the lockfiles and current Vite/Wrangler versions;
- npm for the frontend;
- pnpm 11.9.0 for `cloudflare/`;
- Chromium installed through Playwright for browser tests.

Install and run the frontend:

```bash
npm ci
npm run dev
```

Validate the production frontend build:

```bash
npm run build
npm run preview
npm test
```

Install and validate Workers:

```bash
cd cloudflare
pnpm install --frozen-lockfile
pnpm run check
```

Run the membership Worker against local preview bindings only after preparing
ignored local variables and applying local migrations:

```bash
cd cloudflare
pnpm run migrate:local
pnpm run dev:membership
```

Do not point local or automated browser tests at production accounts, R2
objects, mailboxes or bank data.

## Database migrations

Before deploying a new migration:

1. review the current production migration history;
2. create a new numbered SQL file instead of editing an applied file;
3. test it against a local or dedicated preview D1 database with synthetic
   data;
4. run Worker typecheck/tests;
5. record a D1 Time Travel bookmark;
6. apply the migration deliberately;
7. deploy dependent Workers in the required order;
8. verify positive and negative authorization paths.

Production and preview bindings must never share a D1 database or R2 bucket.
The placeholder preview database ID in config must be replaced only with the
actual dedicated preview resource when preview deployment is intentionally
configured.

## Deployment and rollback

### Frontend

Cloudflare Pages is connected to GitHub. Production pushes from `main` run
`npm run build` and publish `dist`, including the Pages Function gateway.

### Backend order

1. validate tests and a production frontend build;
2. record the D1 recovery point;
3. apply any additive D1 migration;
4. deploy `exclusive-identity-projection`;
5. deploy `exclusive-auth-api`;
6. deploy `exclusive-membership-api`;
7. deploy `exclusive-admin-api`;
8. deploy `exclusive-maintenance-jobs`;
9. validate the Pages deployment and canonical custom domain;
10. test registration/email, login, protected access, admin MFA, age review and
    a non-destructive SEPA-order path as applicable.

Worker deployment scripts are in `cloudflare/package.json`. Deploying or
changing production bindings is a mutating operation and requires deliberate
authorization; documentation work alone does not authorize it.

Rollback the frontend by promoting a known-good Pages deployment and Workers
by rolling traffic back to a known-good version. Do not roll back D1 blindly
after production writes. Review deltas and retention obligations first. Normal
code rollback never requires a DNS change.

## Backups and scheduled maintenance

- `exclusive-membership-api` runs hourly at minute 7 for membership-related
  scheduled work.
- `exclusive-maintenance-jobs` runs hourly at minute 17 for cleanup, retention,
  reminders and retry work.
- `.github/workflows/d1-private-backup.yml` runs daily at 02:23 UTC and can be
  dispatched manually. It exports D1, compresses the SQL file and uploads it
  directly to private EU R2 without publishing the signed export URL.
- The maintenance Worker retains only the newest two `d1/` backup objects.
- GitHub requires `CLOUDFLARE_ACCOUNT_ID` as an Actions variable and a minimal
  `CLOUDFLARE_API_TOKEN` secret with D1 export and R2 write permissions.
- D1 Time Travel is the short recovery layer; the two private exports are the
  additional daily recovery points.

Restore only after documented approval, with synthetic restore testing first.
After a restore, re-run due deletion/retention jobs and verify that previously
deleted age evidence or account data is not resurrected.

## Monitoring and release acceptance

Worker observability is enabled in the Wrangler configs with deliberate sample
rates. The admin **System Monitoring** view exposes operational summaries and
backup metadata, not backup contents or secrets.

A release is complete only when:

- frontend build, Worker typecheck/tests and relevant Playwright tests pass;
- GitHub checks and Cloudflare deployments succeed;
- `https://exclusive.jason-shadow.com/api/health` is healthy;
- the canonical domain presents valid HTTPS and no preview host reaches
  production bindings;
- guest, registered, age-verified, Basic, Premium, VIP and Admin boundaries
  behave correctly;
- protected media, invoices, Telegram/WhatsApp values and age evidence remain
  inaccessible outside their authorized path;
- no secret, customer data or generated production artifact entered Git.

## Troubleshooting

### `BACKEND_UNAVAILABLE` or generic service error

Check the Pages deployment, gateway service bindings and the specific Worker
deployment/logs. Use the user-facing reference ID to correlate sanitized logs.
Do not weaken authorization or expose raw exception details.

### Email is delayed or absent

Check Identity Worker logs, Microsoft Graph credentials/permissions, shared
mailbox send-as access, retry state and sender-domain SPF/DKIM/DMARC. Do not
fall back to a second auth provider or log reset/verification tokens.

### Login or registration state appears stale

Inspect the Auth response, `Set-Cookie`, the immediate `/api/member/v1/me`
refresh and device/session rows. A removed device may log in again; only an
explicit device lock should remain blocking.

### Admin is redirected or denied

Verify active login, `ADMIN` role, verified age, registered/unlocked device,
TOTP MFA and the ten-minute admin session. Do not bypass one requirement to
repair another.

### SEPA order cannot be created or reconciled

Verify the catalog SKU, verified customer state, required SEPA/invoice
configuration, idempotency key, D1 migration level and N26 CSV header mapping.
Never activate an entitlement from frontend state alone.

### Age evidence cannot be opened

Confirm a current pending case, admin MFA/session, R2 binding, object metadata
and review deadline. Expired or already-decided evidence should be gone; do not
restore it merely to make the UI render.

### D1 backup fails

Inspect the GitHub Actions validation step, Node/pnpm setup, minimal token
permissions, account variable, D1 export output and R2 jurisdiction. A failed
or empty export must never be uploaded as a valid backup.

## Documentation index

- `AGENTS.md` — repository-wide implementation and safety rules
- `docs/ARCHITECTURE_PLAN.md` — production topology and data flow
- `docs/DEPLOYMENT.md` — deployment order and rollback
- `docs/SECURITY.md` — authentication, admin, platform and Telegram controls
- `docs/AGE_VERIFICATION.md` — customer age-verification design
- `docs/AVS_REVIEW_PROCESS.md` — administrator review procedure
- `docs/ADMIN_GUIDE.md` — admin operations
- `docs/USER_STATUS_MODEL.md` — account and access states
- `docs/DATA_DELETION.md` — deletion and retention implementation
- `docs/DATENSCHUTZ-FOLGENABSCHAETZUNG.md` — data-protection impact assessment
- `docs/BACKUP_AND_RESTORE.md` — D1/R2 recovery runbook
- `docs/CLOUDFLARE_MIGRATION.md` — completed Appwrite-to-Cloudflare migration
- `docs/DNS_CUTOVER_2026-08-11.md` — historical DNS cutover record
- `docs/LEGAL_REVIEW_CHECKLIST.md` and `docs/LEGAL_NOTICES_SOURCES.md` — legal
  maintenance inputs
- `docs/PROVIDER_DECISIONS.md` — provider and data-flow decisions
- `docs/SETUP.md` — detailed setup notes

## Starting a new Codex task

Use this repository's current `main` branch and begin with:

> Read `README.md`, `AGENTS.md` and the linked document relevant to the task
> completely before acting. Treat Shadow's Temptation as a live Cloudflare-
> native production system. Inspect the current git status and deployment
> configuration, preserve unrelated work, never expose secrets or production
> data, and do not reintroduce Appwrite. Explain the intended production impact
> before any migration, deletion, DNS change or external mutation. Implement
> the requested change, run proportional tests and report the exact files,
> checks and deployment state.

For every handoff, state which layer is affected (Pages, gateway, Worker, D1,
R2, Microsoft Graph, Telegram, GitHub Actions or DNS), whether production was
mutated, which checks passed and what still requires an authenticated operator.
