# One-time owner administrator assignment

This is a separate, owner-authorized operation for the **existing registered
`business@jason-shadow.com` account**. It is deliberately outside the migration
chain: preview databases, new installs and other accounts are unaffected.
There is no runtime email allowlist or automatic privilege escalation.

The operation was **applied and verified in production on 2026-10-30** by
[Actions run 41046845875](https://github.com/JasonWinckler/ExclusiveWebsite/actions/runs/41046845875)
at reviewed revision `b14978a0e97fe40a588c637a3ab1d3594ef33780`. Post-checks
confirmed the exact verified active account, ADMIN role, required MFA, revoked
prior sessions and one audit event. Passwords and MFA secrets were preserved.
This evidence is separate from local tests and from the subsequently completed
[website rollout](https://github.com/JasonWinckler/ExclusiveWebsite/actions/runs/41050723595).

The reviewed GitHub workflow also supports an independent `owner-admin`
operation with an explicit full commit SHA, or a lightweight tag named
`exclusive-owner-admin-<full-40-character-commit-SHA>`. It runs backend checks
and these exact account guards without requiring Worker/Pages deployment
permissions and without applying migrations or sending mail.

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

## One-time owner-requested production D1 cleanup

This separate operation implements the owner's request of **2026-10-30** to
remove former account, privacy-request and billing records while keeping the
existing administrator account and the one current post. It is not an
application migration, routine maintenance task or reusable database reset.

The [cleanup workflow](../../.github/workflows/membership-cleanup.yml) runs
[the bounded runner](../../scripts/prod-cleanup.mjs) and
[its SQL plan](../../scripts/prod-cleanup-plan.mjs) against only the existing
`exclusive-membership` production database. The runner deliberately accepts
only the exact reviewed schema through migration **0029**. Later migrations,
unknown tables/triggers or other schema changes stop it. Do not relax that
baseline to reuse this operation after the new release or against later members.

### Records kept and removed

The guarded transaction preserves these existing D1 rows exactly:

- The sole verified, active `business@jason-shadow.com` ADMIN account, its
  matching profile, password material, MFA settings/secrets, recovery codes,
  normal/admin sessions and registered devices.
- The sole non-retired post, which must already be `ACTIVE`, `VIP_ADULT` and
  `EXCLUSIVE_VIP`, together with **all** its upload/attachment history. The
  operation neither republishes nor reclassifies any media.
- Products, tier perks and the earlier owner-role assignment audit event
  `owner-admin-business-2026-10-30`.

Anonymous analytics/Telegram aggregates and operational job summaries remain.
The operation removes other account identities and their session/device/recovery
rows; previous privacy requests, orders, invoices, bank-import/matching rows,
entitlements, comments, newsletter records, inactive Telegram associations,
completed age-review metadata and related legacy action/job records. These
historical transaction/request tables are cleared in full, including any former
transactions or requests associated with the retained administrator. Retired
post and upload **metadata** is removed. Older audit events are removed except
the preserved owner-role event, and one cleanup audit event is added.

The boundary is D1. The operation does not read, delete or rewrite R2 objects,
cancel external memberships, send account/newsletter messages, make payments,
change credentials or deploy the website. Live age-evidence object references,
private invoice-archive references, active Telegram connections, explicit future
retention holds or active maintenance locks cause the reset to stop for review.

### Inspection, execution and safeguards

Start with `operation: inspect` and the exact full `expected_commit` through
`workflow_dispatch`. A lightweight tag
`exclusive-cleanup-inspect-<full-40-character-commit-SHA>` is the equivalent
read-only entry point. Inspection checks the schema, keeper uniqueness,
dependencies and foreign keys, and reports counts/statuses plus a SHA-256
inventory digest. It does not create tables, export the database, make a backup
file or delete records. Private values and raw provider responses are withheld
from logs; identity/timestamp metadata used for the digest is kept in process.

After reviewing that exact inventory, `operation: reset` requires both the full
`expected_commit` and the exact 64-character `expected_inventory` digest. The
equivalent lightweight tag is
`exclusive-cleanup-reset-<full-40-character-commit-SHA>-<inventory-digest>`.
Reset execution is restricted to the reviewed GitHub Actions workflow, uses
`CLOUDFLARE_API_TOKEN`, and shares the production deployment concurrency group.
It does not use the global API key.

Before any deletion, the runner records a D1 Time Travel recovery bookmark.
It installs temporary, narrowly named guard objects and executes the deletes
through a single guarded SQLite statement. That statement rechecks the exact
schema/inventory and keeper conditions, deletes children before parents,
compares complete protected-row snapshots **inside D1**, and checks foreign-key
integrity and final counts before committing. A failed guard rolls the whole
data mutation back. The temporary objects are removed afterwards and their
absence is verified.

The audit marker `owner-requested-production-cleanup-2026-10-30` makes the
operation one-time: it rejects a second cleanup even if new accounts were
created after the first. If the client result is ambiguous, the runner checks
that marker rather than repeating the destructive statement. Failed final
checks require operator review. **Never automatically retry the reset or
restore its recovery bookmark**; a later restore could overwrite new writes.

Eleven local SQL/runner guard tests passed with synthetic data, including exact
keeper preservation, full rollback after a late protected-row change, inventory
replacement, new accounts, schema drift, external dependencies, retention and
maintenance guards, SQL quoting and one-time execution. These tests establish
local behavior only.

### Production evidence

Read-only [inspection run 41062824722](https://github.com/JasonWinckler/ExclusiveWebsite/actions/runs/41062824722)
and [reset run 41063101385](https://github.com/JasonWinckler/ExclusiveWebsite/actions/runs/41063101385)
both succeeded on 2026-10-30 from exact source
`8a8d73dc130aa03bdbc11bca71762bfc34ac2ae6`. The reset used reviewed inventory
digest `9e3237cb86d7b916100cac1f866f3103ddfe1658fb40accb4cec38cca1d4d140`.
The pre-cleanup recovery bookmark is
`00001244-00000000-00005114-9f2e472f364f859bb8de39affa4bcd2b`; it is a recovery
identifier, not an exported copy. Do not restore it automatically.

Verified after commit: one profile and one ADMIN identity remain; one active
post and its three attachment-history records remain; privacy requests,
invoices, orders, entitlements, old comments, newsletter records, completed
age-review metadata and legacy deletion/label-sync records are empty. Nine old
profiles, four privacy requests, two invoices, four orders and two retired post
records were removed. The administrator's ten recovery codes, three normal
sessions, one admin session and one registered device were preserved exactly,
along with password/MFA/profile values and the retained post/catalog snapshots.
Foreign keys were valid and temporary guard objects were removed. Two audit
events remain: the original owner-role repair and this cleanup. Operational
aggregates/job summaries and all R2 objects were outside this deletion scope.
