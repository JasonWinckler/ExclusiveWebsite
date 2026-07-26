# Cloudflare membership migration

## Target ownership

Appwrite owns only:

- email/password registration;
- verification, login, recovery and sessions;
- Auth user ID, email, display name and server-maintained labels;
- final Auth user deletion requested by the cleanup Worker.

Cloudflare Workers and D1 own age-verification state, provider webhooks, checkout sessions, products, subscriptions, entitlements, protected-content authorization, registered devices, administrative review, audit records, retention and inactive-account deletion.

D1 is canonical for payment and entitlement. Appwrite labels are projections only:

- `age_pending`
- `age_verified`
- `age_rejected`
- `active_free`
- `active_exclusive`
- `admin` (temporary administrator gate; use an Appwrite Team when multiple roles are needed)

The browser cannot write labels. The private `identity-projection` Worker is the only component with an Appwrite server key. It has no `workers.dev` route and is reachable only through service bindings. Label projection and account lifecycle use different internal secrets, so a webhook Worker cannot invoke session revocation or user deletion.

## Workers

| Worker | Public surface | Privileges |
|---|---|---|
| `membership-api` | Authenticated member routes | Appwrite JWT validation, D1, age/payment session creation |
| `admin-api` | Authenticated admin routes | D1, private label-sync service binding |
| `age-verification-webhooks` | Public provider webhook | Age webhook secret, D1, private label-sync service binding |
| `payment-webhooks` | Public provider webhook | Payment webhook secret, D1, private label-sync service binding |
| `maintenance-jobs` | Cron only | D1, provider deletion, private Appwrite deletion service binding |
| `identity-projection` | Service binding only | Narrow Appwrite server key for user read, labels, sessions and deletion |

Public webhook handlers do not contain administrator or user-deletion handlers. Structured logs include only event code, route and correlation ID—never JWTs, API keys, bank data, identity media, raw webhooks or unnecessary personal data.

## D1 schema

Migration `cloudflare/migrations/0001_initial.sql` creates:

- `user_profiles`
- `age_verification_cases`
- `verification_attempts`
- `products`
- `subscriptions`
- `payment_events`
- `entitlements`
- `content_items`
- `registered_devices`
- `admin_audit_events`
- `deletion_jobs`
- `label_sync_attempts`
- `maintenance_locks`

Provider event IDs and retry idempotency keys are unique. Statuses use explicit checks. User, status, expiry, retention and cleanup columns are indexed. Optimistic versions protect mutable state. Audit events reject updates and ordinary deletes.

## Authentication bridge

The browser creates a fresh Appwrite JWT for every Cloudflare call. Appwrite JWTs are short-lived (15 minutes by default) and become invalid with their source session. The Worker validates a JWT by calling Appwrite `GET /account` with `X-Appwrite-JWT`, derives user ID and verified-email state server-side, and updates the D1 projection with server time plus Appwrite’s trusted `accessedAt`.

The API never accepts a body/query `userId`. Verified email is required before verification, payment or entitlement operations. Appwrite or D1 unavailability returns an error and grants no protected access.

References: [Appwrite JWT login](https://appwrite.io/docs/products/auth/jwt), [Appwrite REST authentication headers](https://appwrite.io/docs/apis/rest).

## Webhook and replay recovery

The committed adapter verifies HMAC-SHA256 over `<timestamp>.<unmodified raw body>`, enforces a five-minute tolerance, hashes rather than stores raw payloads, and inserts the provider event ID under a unique constraint.

Duplicates return a successful no-op and increment `replay_count`. Older payment events cannot reactivate a terminal subscription. `PENDING` and `PROCESSING` SEPA states never create an entitlement. Appwrite label-sync failure is recorded separately and retried; D1 remains canonical.

After selecting providers, replace the generic signature mapping with each provider’s native signature and event schema. Recovery steps:

1. verify the provider event ID and signature at the provider;
2. inspect the normalized D1 event record, never request/store the raw credential payload;
3. replay the provider event;
4. confirm the duplicate no-op or corrected state transition;
5. retry label synchronization from the admin API if D1 is correct and Appwrite projection is stale.

## Secrets and rotation

Real values must be created with Cloudflare encrypted secrets, never committed:

- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_SERVER_API_KEY`
- `AGE_VERIFICATION_API_KEY`
- `AGE_VERIFICATION_WEBHOOK_SECRET`
- `PAYMENT_PROVIDER_API_KEY`
- `PAYMENT_WEBHOOK_SECRET`
- `LABEL_SYNC_SERVICE_SECRET`
- `ACCOUNT_LIFECYCLE_SERVICE_SECRET`
- provider-specific account/signing identifiers

Use a dedicated Appwrite key with only the scopes needed to read users, replace labels, revoke sessions and delete users. Never reuse a project-administration key. If a key was exposed in chat, logs, repository history or a non-approved channel, rotate it before deployment.

Rotation order:

1. create a replacement provider/Appwrite credential;
2. add it as a new Worker secret;
3. deploy and verify negative and positive paths;
4. revoke the old credential;
5. record the rotation in the operational audit system without logging the value.

Secrets must not appear in `VITE_*`, `.env.example`, Wrangler JSON, frontend bundles, deployment archives, logs or documentation.

## Protected content and registered devices

`membership-api` exposes a fail-closed content authorization route. Every request derives the Appwrite user server-side and checks verified email, approved age state, D1 entitlement and expiry, account restrictions/deletion status, content status/tier, jurisdiction policy, the current registered device credential, and the global device limit. It never returns a bucket ID, object key, or browser-constructible protected URL.

Device registration accepts a browser-generated 256-bit random credential, binds its SHA-256 hash to the authenticated Appwrite user, and enforces at most three active credentials with a conditional D1 insert. The plaintext credential is never stored in D1 or logs. This limits registered browser credentials; it is not hardware attestation and must not be represented as such.

Production is configured with `PROTECTED_CONTENT_MODE=private-r2-v1`. Both R2 buckets remain private. The membership API performs the authorization checks above before reading protected media; it never exposes the R2 bucket or object key. Public NSFW launch still requires the separate legal/KJM and security sign-off described in this document.

## Inactive-account deletion

`INACTIVE_ACCOUNT_DAYS=30` is configurable. A user is eligible only if:

- the latest trusted timestamp from Appwrite `accessedAt` and D1 `last_active_at` is at least 30 complete days old;
- no subscription/payment is pending, processing, paid, active, in grace, disputed or legally retained;
- no age case is pending or retry-required;
- no administrative, deletion-job or legal hold applies;
- no completed deletion already exists.

Stage one creates `DELETION_PENDING`, records the cutoff, reason, retention check and `scheduled_at`. Stage two runs after `DELETION_GRACE_DAYS`, rechecks every blocker, deletes provider cases where required, revokes D1 entitlements/devices, deletes the Appwrite Auth user through the private service Worker and then marks the job complete. Provider, D1 or Appwrite failure stops the job and keeps authorization closed.

## Deployment order

1. Create the D1 database and the two private R2 buckets (`exclusive-content-media` and EU-jurisdiction `exclusive-age-evidence`).
2. Apply D1 migrations and seed the fixed product catalogue.
3. Create Worker secrets per least-privilege boundary.
4. Deploy the private `identity-projection` Worker without a public URL.
5. Deploy `membership-api` with manual R2 age review, private R2 content delivery and EPC-QR SEPA orders.
6. Deploy `admin-api` for age decisions, direct creator uploads and N26 CSV settlement matching.
7. Deploy `maintenance-jobs`, add the daily Cron trigger and disable its public URL.
8. Point the frontend API configuration at the membership and admin Workers and deploy through Appwrite Sites.
9. Run production positive and negative-path checks for authentication, age evidence, entitlements, settlement, content authorization and admin access.
10. Disable old Appwrite Functions only after the replacement passes those checks.
11. Remove obsolete TablesDB and Storage resources only after rollback and retention sign-off.

Never remove the old server path before the replacement is deployed and validated. Export configuration/schema metadata only; never commit users, rows, files, identity data, secrets or backups.

## Incident response and rollback

- Set provider modes to `disabled` and redeploy to stop new age/payment sessions.
- Keep membership authorization fail-closed; never bypass D1 because Appwrite or a provider is unavailable.
- Revoke compromised credentials, replace Worker secrets and redeploy.
- For a bad schema rollout, stop writes, restore through the approved Cloudflare backup/recovery procedure, then redeploy the last known-good Worker version.
- If frontend rollout fails, restore the previous frontend while leaving Cloudflare authorization closed. Registration and recovery remain available through Appwrite.
- Do not re-enable legacy membership authorization until its data/permissions and negative-path tests have been reviewed.

## Free-tier capacity and upgrade thresholds

As of July 2026, Workers Free includes 100,000 requests/day, 10 ms CPU per invocation, 128 MB memory, 50 external subrequests/invocation and five Cron Triggers/account. D1 Free includes 5 million rows read/day, 100,000 rows written/day and 5 GB total storage. Limits reset at 00:00 UTC; reaching D1 daily limits causes D1 errors, which this system treats as fail-closed.

Upgrade before production if:

- traffic or webhook retries can approach 70% of a daily request/read/write limit;
- 10 ms CPU is insufficient for signature checks and state transitions;
- authorization availability cannot tolerate the free plan’s hard daily cutoff;
- operational requirements need more Cron triggers, longer CPU or paid support.

Two private Standard R2 buckets are configured: `exclusive-content-media` for `free/` and tiered `exclusive/` prefixes, and EU-jurisdiction `exclusive-age-evidence` for ID images and live verification video. Standard R2 currently includes 10 GB-month, 1 million Class A and 10 million Class B operations/month in the free allowance; monitor storage and operations before crossing those thresholds.

References: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/).
