# One-time owner administrator assignment

This is a separate, owner-authorized operation for the **existing registered
`business@jason-shadow.com` account**. It is deliberately outside the migration
chain: preview databases, new installs and other accounts are unaffected.
There is no runtime email allowlist or automatic privilege escalation.

The source operation has **not been applied to production by this task**. It
requires an authenticated Cloudflare operator with D1 write access. No live
account state is inferred from local tests.

From the repository's `cloudflare/` directory, inspect the bounded status:

```sh
npx wrangler d1 execute exclusive-membership --remote --config wrangler.auth-api.jsonc --file operations/owner-admin-check.sql
```

`matching_verified_active_accounts` must be `1`. The operation independently
asserts exactly one authentication account and one profile with the specified
email (standard case-insensitive email comparison), the same stable user ID,
verified email, ACTIVE status and no administrative/deletion hold. It aborts
with a named `OWNER_ADMIN_*` error for missing, mismatched, ambiguous, unverified
or inactive accounts. It does not manufacture or modify a missing account.

Apply the concrete operation once:

```sh
npx wrangler d1 execute exclusive-membership --remote --config wrangler.auth-api.jsonc --file operations/owner-admin-business.sql
```

The single audit INSERT and its narrowly scoped triggers atomically set
`role=ADMIN` and `mfa_required=1` and revoke the target's existing normal,
MFA-pending and administrator sessions. Existing password material, MFA secret,
recovery codes, profile/ID, devices, orders and entitlements remain intact. No
other administrator is demoted. The immutable audit event stores the previous
role/MFA requirement and the authorized change without copying credentials.

Run the read-only check again **before the owner signs back in**. Expected:
`matching_verified_active_accounts=1`, `owner_admin_with_mfa_required=1`, both
session counts `0`, and `operation_recorded=1`. The query returns only counts.

The owner then signs in again. Existing MFA remains usable; if not enrolled,
the application requires MFA setup before sensitive administration. A repeated
application aborts with `OWNER_ADMIN_ALREADY_APPLIED` while its audit record is
retained. Do not rerun as a routine deployment step.

The operation removes its helper triggers on success. A failed assertion leaves
no application-data changes but can leave those narrowly keyed helper triggers
installed. A retry recreates them safely. To remove them without retrying:

```sh
npx wrangler d1 execute exclusive-membership --remote --config wrangler.auth-api.jsonc --command 'DROP TRIGGER IF EXISTS owner_admin_business_apply; DROP TRIGGER IF EXISTS owner_admin_business_guard;'
```

Audit retention follows the platform's existing policy. The operation is not a
permanent alternative to administrator account management.
