# Jason Shadow · Exclusive Membership

The membership service remains at **https://exclusive.jason-shadow.com/** and
uses the official Jason Shadow music logo and burgundy/ivory/gold design.
**Exclusive Membership / Exklusive Mitgliedschaft** is the public offer;
**Order of Shadows** is the secondary community name. Do not translate the name
into a German religious-order theme. There is no domain, DNS or subpath change.

## Membership benefits

| Membership | Shared music content | Additional benefits |
| --- | --- | --- |
| Basic Shadow | All music behind-the-scenes posts and member comments | Direct support for preparation and craft for private celebrations and corporate events |
| Premium Shadow | The same music content as every paid tier | 15% off all Jason Shadow services |
| VIP Shadow | The same music content as every paid tier | 15% off all Jason Shadow services, private WhatsApp contact, meet-ups by arrangement and a separate optional age-verified adult area |

Telegram is **not included in any music membership**. The owner has approved
VIP WhatsApp contact for the music business. The 15% benefit covers all services
offered by Jason Shadow. Redemption uses the existing quote/enquiry
process: the member identifies their active membership, and the service, date
and discounted price are agreed before booking. No discount code or automated
service-booking system is introduced.

Existing product IDs, prices and term lengths remain unchanged. Registration,
email confirmation, profile/device management, MFA, orders, invoices, privacy
rights and entitlement management remain supported. Membership is a fixed-term purchase paid by a
one-time SEPA transfer, without automatic renewal. It is not represented as a
tax-deductible charitable donation. Existing VIP meet-and-greet arrangements
and travel conditions continue to apply.

## Registration email verification

Migration `0030_email_verification_codes.sql` adds verification-challenge
metadata to the existing authentication token table. Registration stays in its
dialog and accepts a cryptographically generated six-digit code from the email.
Leading zeroes are valid. Codes are scoped to the signed-in unverified account
and its current email/challenge, not looked up through a global six-digit code
search. Only a keyed digest is persisted; no plaintext code is stored in D1 or
returned by the API.

New registration challenges last **15 minutes**. The server permits at most
**five code attempts per challenge** and enforces a **60-second resend cooldown**.
A resend creates a new challenge and invalidates the previous code and link.
The high-entropy fallback link in the same email consumes the same single-use
challenge; successful use of either route prevents a second verification or
session creation. The fallback link remains an alternative when the code-entry
attempt limit is reached. Older already-issued links keep their recorded expiry
and remain compatible with the link-confirmation route.

Successful verification atomically consumes the challenge, confirms the email,
revokes pre-verification sessions and issues a fresh HttpOnly session. Accounts
with MFA enabled receive only an MFA-pending session until the second factor is
completed. Administrator or MFA-required accounts without configured MFA are
not silently given an active session by email access. Password-reset and
change-email links retain their separate purposes.

The fallback link opens `https://exclusive.jason-shadow.com/`; after processing,
the frontend removes the token from the URL and shows the localized email
confirmation popup. Normal code verification also keeps the member in the
website and signs them in after any required MFA. A delivery error leaves the
created account available for a controlled resend. Email verification does not
subscribe a member to the music newsletter; its consent remains separate.

## Separate content areas

Music behind-the-scenes content is shared by all active paid tiers and does not
require age verification. Existing public/free previews remain distinct.

The private adult area is optional and must be selected separately. The server
requires an actual active VIP entitlement, approved age verification, confirmed
email, active account without holds, a registered authorized device and an
allowed jurisdiction. Simulated membership cannot unlock adult media. Public
marketing contains no adult previews, and music/newsletter content must remain
separate from the private area.

For eligible VIP members the discreet private section is placed below the
shared music gallery, marked **18+** and titled **Shadow's Temptation**. Before
approval, **Tempted? Discover my secret side!** opens the retained age-review
flow. Already approved and otherwise authorized VIP members see the private
gallery inline and can hide it. The teaser itself grants no entitlement and
does not fetch private listings, metadata or media before authorization. Basic,
Premium, expired, held and simulated accounts cannot unlock the private area.

Age evidence creation, upload and submission are available only to eligible
active VIP members. The existing manual live-document/video procedure and
private evidence controls apply. Raw evidence is deleted immediately after a
decision or within 48 hours without one, with technical retry on failure. The
ordinary music membership and account registration do not require this process.

## Migration and legacy records

Migration `0027_order_of_shadows_music_membership.sql` establishes the initial
music conversion, cancels legacy newsletter campaigns and quarantines existing
posts as `LEGACY_ADULT`. Migration
`0028_membership_benefits_vip_area.sql` implements the corrected tier benefits
and separate private-area policy. Migration
`0029_remove_telegram_music_perks.sql` disables the remaining Telegram music
catalog benefits without removing historical records. Migration
`0030_email_verification_codes.sql` supports the registration code and fallback
link flow described above. Migration
`0031_supporter_membership_benefits.sql` retires duplicate gallery/update perks,
topic votes and priority-reply promises and installs the current bilingual
supporter offer. The optional private-area teaser is the only public catalog
use of "Shadow's Temptation"; the website and newsletter remain Jason Shadow.
Apply each required migration before deploying code that relies on it. Read the exact migration
files for the final SQL contract.

Legacy media is not bulk-republished or deleted by the conversion. A deliberate
per-item administrator review, explicit confirmation and reason are required
before moving an eligible legacy post into the new private VIP area. It must
never be reclassified into the general music collection. Authorization checks
must continue to reject remaining legacy posts, media and comments.

The catalog migrations themselves leave customer records, orders, invoices and
entitlements intact. The owner-requested production cleanup is a separate guarded
operation and must not be encoded in a migration. Historical
order and consent snapshots are not rewritten as though users had originally
purchased the new offer. Existing paid commitments and statutory remedies
remain applicable.

## Newsletter and external community

The music newsletter is optional and separate from membership. Earlier consent
for the previous offer is not automatically reused. Migration 0027 cancels
queued/draft/sending campaigns, skips unsent deliveries, consumes earlier
confirmation tokens and moves old subscribed records to `PENDING`, retaining
historical timestamps. Music newsletter consent uses `newsletter-music-v2` and
requires a new double opt-in. The migration sends no reconfirmation emails.

The privacy notice uses `PRIVACY-MUSIC-2026-10-30-V2` and new checkout acceptance
uses `ORDER-2026-10-30-V4` for the deduplicated service-supporter offer. Keep
frontend and backend versions aligned, retaining historical acceptance
snapshots. This change sends no re-consent email and does not rewrite existing
contracts. The privacy version remains V2 because historical data and its
lifecycle remain in place. Verification-challenge metadata implements the
existing account-security purpose; no new newsletter or marketing purpose is
introduced.

The destination gates are independent. The owner has approved WhatsApp for the
music business: the reviewed production source configuration sets
`VIP_WHATSAPP_MUSIC_REVIEWED=true` for the protected active-VIP contact.
`MUSIC_TELEGRAM_REVIEWED=false` blocks new Telegram linking, reconnection and
invitations for music memberships because the existing Telegram destination is
for adult content. The old shared `MUSIC_COMMUNITY_REVIEWED` flag is no longer
read. Do not enable it as a workaround or add Telegram access through the
optional onsite VIP area.

Migration 0029 disables Telegram music catalog promises; it does not erase
historical associations or itself remove current channel members. Retention,
revocation and deletion controls for those existing records continue to work.
No new adult Telegram routing is part of this change.

## Guarded production workflow

[Membership production rollout](../.github/workflows/membership-production.yml)
runs [the bounded rollout script](../scripts/prod-rollout.mjs) against the existing
`exclusive-membership` D1 database, existing `exclusive-*` Workers and existing
`shadows-temptation` Pages project. That project name is an infrastructure
identifier, not public branding. The workflow does not create replacement
resources or alter the domain/DNS.

Configure the repository Actions secret `CLOUDFLARE_API_TOKEN` and variable
`CLOUDFLARE_ACCOUNT_ID` for the existing account. Credentials and private
Wrangler/SQL responses are withheld from workflow logs. Local verification
commands run without those Cloudflare credentials in their environment.

Use `workflow_dispatch` with `operation: inspect` for read-only validation. It
checks credential access, applied/pending migration filenames, Worker deployment
metadata and the existing Pages production branch/custom domain. It performs no
migrations, deployments, role changes or mail sends. A matching workflow/script
push to `codex/membership-benefits-newsletter-fix` also selects inspection only.

After reviewing an exact revision, deployment has two supported entry points:

- Dispatch with `operation: deploy` and `expected_commit` set to its full
  40-character lowercase commit SHA. Set `restore_owner_admin: true` only when
  including the separately reviewed existing-owner repair.
- Push a lightweight tag named `exclusive-release-<full-commit-sha>`, or
  `exclusive-release-admin-<full-commit-sha>` to include that owner repair. The
  tag’s target must equal its SHA suffix. A release tag is a production deploy
  trigger; it is not an inspection or preview tag.

The workflow checks out and verifies that exact revision. Before any production
changes, it runs rollout guard tests, backend typechecking/tests, the frontend
production build and browser regression tests. It then inspects the existing
stack and refuses any pending migration outside the exact reviewed allowlist.

The deployment first deploys maintenance with newsletter delivery paused and
waits for an existing scheduled invocation to finish before schema changes. The
wait checks only the maintenance lock and stops after 21 minutes; retention work
continues with delivery paused. It then records a D1 Time Travel recovery
bookmark, applies the reviewed migrations, deploys the other Workers and
publishes the built frontend to the existing Pages production branch.

All Worker configurations set `keep_vars: true`, and the scripted deployment
also uses `--keep-vars`. Dashboard-only operational variables therefore survive
automatic Cloudflare deployments as well. Explicit source configuration and
the newsletter pause override still take precedence; secrets remain intact.

Before resuming ordinary opted-in newsletter delivery, the script verifies
canonical API health and service bindings, renamed products and benefits,
Premium/VIP discounts, the absence of Telegram benefits in every tier, exact
built JavaScript/CSS entry hashes and the successful canonical Pages deployment’s
commit. It also checks the membership Worker’s two review flags and the presence
and secret-binding type of `VIP_WHATSAPP_NUMBER`. Only boolean results are
logged: the contact number is not read or disclosed, and its hidden value’s
validity is not proven by checking the binding. Missing or incorrect
configuration stops the rollout before newsletter delivery resumes. These
checks send no test email, make no payment and perform no authenticated member
operation.

Catalog caches follow the checkout terms revision. The Worker uses a distinct
cache namespace for each offer revision; the browser and deployment verifier
share the revision-specific German/English URLs from
`src/lib/membership-policy.js`. This prevents retained cache entries from
advertising withdrawn benefits after a catalog change. Advance the terms and
catalog revision together when the offer changes; verify both visitor URLs
without a deployment-only cache bypass.

If a rollout stops while delivery is paused, delivery stays paused and retention
continues. Correct the reported failure and verify the release before resuming
maintenance using the command in the workflow summary. Do not automatically
restore the D1 recovery bookmark after new production writes.

During a full deployment, the optional owner repair runs only after the
application rollout has passed its checks. A separately requested `owner-admin`
operation, or lightweight `exclusive-owner-admin-<full-40-character-commit-SHA>`
tag, runs the same guarded account operation independently after backend checks.
It requires D1 access and performs no migration, deployment or mail operation.
Its [operation guide](../cloudflare/operations/README.md) documents
the exact-account assertions, session revocation, audit event and scalar
post-checks for `business@jason-shadow.com`. A missing, unverified or inconsistent
account stops the repair without bypassing those assertions; the application
rollout remains complete. No password or MFA secret is changed, and other
administrators are retained. The owner must sign in again and meet the admin
MFA requirement.

Preparing these files or passing local tests does not mean inspection or
production deployment has run. Check the Actions result and its exact revision
before reporting a live release or repaired owner access.

## Release checks

1. Review migration SQL and record the D1 recovery point. Quiesce newsletter
   sending during cutover so an already in-flight old message cannot survive
   campaign cancellation.
2. Apply the exact reviewed schema/catalog migrations, including 0030 for email
   codes and 0031 for the supporter benefits, before deploying dependent Workers.
3. Deploy private Workers with existing bindings/secrets. Preserve all identity,
   entitlement, device, private R2, admin MFA and evidence-deletion controls.
4. Revoke expired external invitations; publish the frontend and localized
   static/legal pages together on the existing domain.
5. Check registration, login/MFA, profile and consent, orders/payment status,
   shared paid music access, absence of Telegram music benefits, Premium/VIP
   discounts, VIP WhatsApp/meet-ups and the separately age-gated VIP content path.
   Confirm code expiry, attempt limits, resend cooldown, one-use fallback links
   and the localized success popup without bypassing existing MFA requirements.
6. Verify legacy content remains inaccessible unless individually approved for
   the private area. Verify non-VIP, unverified, expired, held and simulated
   accounts cannot access private-area listings, metadata, media or comments.
7. Check newsletter double-opt-in and an authorized delivery using controlled
   test accounts. Keep private-area content out of the music newsletter.
8. Confirm `VIP_WHATSAPP_MUSIC_REVIEWED=true` for the owner-approved music
   contact and `MUSIC_TELEGRAM_REVIEWED=false`. Verify protected WhatsApp access
   with an authorized VIP account; do not expose the number in logs or tests.

A local build or PR is reviewable source, not evidence of a production release.
Do not perform production migrations, payments, sends or publication merely to
test frontend behavior.

## Search metadata

Root and DE/EN pages use current-domain canonicals, language alternates, the
original music artwork and structured WebSite/WebPage/Person/BreadcrumbList
data. Prices are omitted from structured data to avoid divergence from D1.
Public metadata leads with Jason Shadow and Exclusive Membership. The optional
private area is not advertised through explicit imagery or search copy.
