# Jason Shadow · Exclusive Membership

The membership service remains at **https://exclusive.jason-shadow.com/** and
uses the official Jason Shadow music logo and burgundy/ivory/gold design.
**Exclusive Membership / Exklusive Mitgliedschaft** is the public offer;
**Order of Shadows** is the secondary community name. Do not translate the name
into a German religious-order theme. There is no domain, DNS or subpath change.

## Membership benefits

| Membership | Shared music content | Additional benefits |
| --- | --- | --- |
| Basic Shadow | All music behind-the-scenes posts and member comments | Direct support for Jason’s music and voice work |
| Premium Shadow | The same music content as every paid tier | Private Telegram community, topic voting and 15% off all Jason Shadow services |
| VIP Shadow | The same music content as every paid tier | 15% off all Jason Shadow services, private WhatsApp contact, meet-ups by arrangement and a separate optional age-verified adult area |

VIP does **not** inherit Premium’s Telegram channel. The 15% benefit covers all
services offered by Jason Shadow. Redemption uses the existing quote/enquiry
process: the member identifies their active membership, and the service, date
and discounted price are agreed before booking. No discount code or automated
service-booking system is introduced.

Existing product IDs, prices and term lengths remain unchanged. Registration,
email confirmation, profiles, devices, MFA, orders, invoices, privacy rights and
entitlements are preserved. Membership is a fixed-term purchase paid by a
one-time SEPA transfer, without automatic renewal. It is not represented as a
tax-deductible charitable donation. Existing VIP meet-and-greet arrangements
and travel conditions continue to apply.

## Separate content areas

Music behind-the-scenes content is shared by all active paid tiers and does not
require age verification. Existing public/free previews remain distinct.

The private adult area is optional and must be selected separately. The server
requires an actual active VIP entitlement, approved age verification, confirmed
email, active account without holds, a registered authorized device and an
allowed jurisdiction. Simulated membership cannot unlock adult media. Public
marketing contains no adult previews, and music/newsletter content must remain
separate from the private area.

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
and separate private-area policy. Apply both before deploying code that uses
their schema. Read the exact migration files for the final SQL contract.

Legacy media is not bulk-republished or deleted by the conversion. A deliberate
per-item administrator review, explicit confirmation and reason are required
before moving an eligible legacy post into the new private VIP area. It must
never be reclassified into the general music collection. Authorization checks
must continue to reject remaining legacy posts, media and comments.

Customer records, orders, invoices and entitlements remain intact. Historical
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
uses `ORDER-2026-10-30-V2`. Keep frontend and backend versions aligned, retaining
historical acceptance snapshots.

`MUSIC_COMMUNITY_REVIEWED` remains false until the owner checks the configured
Premium Telegram channel, bot copy and VIP WhatsApp destination. Old invitation
capabilities are expired by migration and must be revoked through Telegram sync
before reopening enrollment. Join webhooks recheck review status, current
eligibility and invite validity. Revocation/expiry must keep working while the
review gate is false. Premium-only authorization must also remove Telegram
access when an account’s actual highest active tier becomes VIP.

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
stack and refuses any pending migration other than the reviewed 0027/0028 pair.

The deployment first deploys maintenance with newsletter delivery paused and
waits for an existing scheduled invocation to finish before schema changes. The
wait checks only the maintenance lock and stops after 21 minutes; retention work
continues with delivery paused. It then records a D1 Time Travel recovery
bookmark, applies the reviewed migrations, deploys the other Workers and
publishes the built frontend to the existing Pages production branch.

Before resuming ordinary opted-in newsletter delivery, the script verifies
canonical API health and service bindings, renamed products and benefits,
Premium/VIP discounts, the absence of a VIP Telegram benefit, exact built
JavaScript/CSS entry hashes and the successful canonical Pages deployment’s
commit. These public checks send no test email, make no payment and perform no
authenticated member operation.

If a rollout stops while delivery is paused, delivery stays paused and retention
continues. Correct the reported failure and verify the release before resuming
maintenance using the command in the workflow summary. Do not automatically
restore the D1 recovery bookmark after new production writes.

The optional owner repair runs only after the application rollout has passed
its checks. Its [operation guide](../cloudflare/operations/README.md) documents
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
2. Apply both schema/catalog migrations before deploying dependent Workers.
3. Deploy private Workers with existing bindings/secrets. Preserve all identity,
   entitlement, device, private R2, admin MFA and evidence-deletion controls.
4. Revoke expired external invitations; publish the frontend and localized
   static/legal pages together on the existing domain.
5. Check registration, login/MFA, profile and consent, orders/payment status,
   shared paid music access, Premium-only Telegram, Premium/VIP discounts,
   VIP WhatsApp/meet-ups and the separately age-gated VIP content path.
6. Verify legacy content remains inaccessible unless individually approved for
   the private area. Verify non-VIP, unverified, expired, held and simulated
   accounts cannot access private-area listings, metadata, media or comments.
7. Check newsletter double-opt-in and an authorized delivery using controlled
   test accounts. Keep private-area content out of the music newsletter.
8. Enable community disclosure only after its real destinations are reviewed.

A local build or PR is reviewable source, not evidence of a production release.
Do not perform production migrations, payments, sends or publication merely to
test frontend behavior.

## Search metadata

Root and DE/EN pages use current-domain canonicals, language alternates, the
original music artwork and structured WebSite/WebPage/Person/BreadcrumbList
data. Prices are omitted from structured data to avoid divergence from D1.
Public metadata leads with Jason Shadow and Exclusive Membership. The optional
private area is not advertised through explicit imagery or search copy.
