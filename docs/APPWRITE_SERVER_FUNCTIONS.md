# Appwrite server Functions

The backend is intentionally deny-by-default. The browser can execute only account provisioning, age-submission finalization, entitlement evaluation for itself, and protected-content authorization. It cannot write rows directly. Administrative review is executable only by the `administrators` Team. Scheduled cleanup Functions have no client execute role. The payment endpoint is public only because a provider must reach it and verifies an HMAC-SHA256 signature before processing an idempotent event.

## Deployed resources

Database `6a64f96800187b534953` uses Appwrite TablesDB. The following row-secured tables have no table-level browser permissions: `user_profiles`, `age_verification_cases`, `verification_attempts`, `products`, `subscriptions`, `entitlements`, `content_items`, `registered_devices`, `admin_audit_events`, and `deletion_jobs`. User-owned rows receive read permission only. Consequently status, tier, payment, entitlement, jurisdiction, retention, reviewer, and expiry columns are server-maintained.

The `content_and_verification` bucket has file security enabled. Authenticated users may create verification files but receive no bucket-level read, update, or delete permission. Function code uses an automatically generated, scope-limited `APPWRITE_FUNCTION_API_KEY`; Appwrite stores it as an encrypted system variable. Never add an API key to Sites, `VITE_*`, source files, build artifacts, logs, or deployment archives.

## Function scope matrix

| Function ID | Execute role | Dynamic API-key scopes | Schedule |
|---|---|---|---|
| `account-provisioning` | users | `rows.read`, `rows.write`, `users.read` | request |
| `age-verification-finalize` | users | `rows.read`, `rows.write`, `files.read` | request |
| `admin-review` | team `administrators` | `rows.read`, `rows.write` | request |
| `payment-webhook` | any (HMAC required) | `rows.read`, `rows.write` | webhook |
| `entitlement-evaluation` | users | `rows.read`, `rows.write` | request |
| `protected-content-authorization` | users | `rows.read` | request |
| `retention-cleanup` | none | `rows.read`, `rows.write`, `files.read`, `files.write` | `0 3 * * *` |
| `inactive-account-cleanup` | none | `rows.read`, `rows.write` | `0 4 * * *` |

Set `PAYMENT_WEBHOOK_SECRET` as a secret Function variable and configure the provider to send the lowercase hex HMAC over the unmodified request body in `X-Webhook-Signature`. No payment integration is enabled until a reviewed provider supplies the event contract. Add administrators through Appwrite Console Team membership; do not use a frontend flag.

## Cloud plan note

At provisioning time the project plan accepted two Function resources and returned `additional_resource_not_allowed` for further Functions. `account-provisioning` and `age-verification-finalize` were created and deployed. The remaining six are committed as deployment-ready sources and must be created after increasing the Function quota. This limitation does not weaken table or bucket permissions; affected workflows remain disabled rather than falling back to browser writes.
