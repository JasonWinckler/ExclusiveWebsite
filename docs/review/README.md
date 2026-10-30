# Jason Shadow · Exclusive Membership — design review

The redesigned membership stays at https://exclusive.jason-shadow.com/.
These screenshots use a local build and synthetic member data. They are review
artifacts, not evidence of a production deployment.

## Website

![Desktop website design](website-preview.png)

![Mobile website design](website-mobile.png)

## Member dashboard

The dashboard presents the shared music content and the selected membership’s
benefits. The separate private VIP area is optional and remains age-controlled.

![Desktop member dashboard](membership-dashboard.png)

![Mobile member dashboard](membership-dashboard-mobile.png)

## Newsletter

This is illustrative newsletter content rendered with the production email template.
No real test email or newsletter was sent for this review.

![Music newsletter design](newsletter-preview.png)

## Verification

- Production frontend build and existing bundle budgets pass.
- Backend TypeScript checks and all 152 tests in 20 files pass, including
  migration preservation, content separation, newsletter consent, owner-role
  repair guards and maintenance compatibility during migration.
- All ten rollout guard and diagnostic tests pass.
- All 68 Playwright checks pass on desktop and mobile with synthetic API fixtures,
  including the final layout and age-review refresh corrections.
- Original logo and owned artist photographs were copied from the music website.

No production deployment, production migration, owner-role repair or real mail
send is claimed by these local checks. Live email delivery and authenticated
membership/payment behavior still need controlled production verification.
The [transition guide](../ORDER_OF_SHADOWS_TRANSITION.md) documents the guarded
production workflow and release checks.

## Production status — 2026-10-30

The independent owner operation [succeeded in production](https://github.com/JasonWinckler/ExclusiveWebsite/actions/runs/41046845875):
the existing `business@jason-shadow.com` account has ADMIN access with MFA
required. Previous sessions were revoked; password/MFA credentials and profile
data were preserved. The owner must sign in again.

The updated API token passed the [read-only production inspection](https://github.com/JasonWinckler/ExclusiveWebsite/actions/runs/41046781892).
The coordinated [production rollout succeeded](https://github.com/JasonWinckler/ExclusiveWebsite/actions/runs/41050723595)
at reviewed revision `ea3a904ceb09055e9c47eb45b36103191c1df012`:

- Newsletter maintenance was paused and drained before recording a D1 recovery
  bookmark and applying migrations 0027/0028.
- All five Workers and the existing Pages project were deployed. The canonical
  Pages commit and frontend asset hashes matched the reviewed release.
- Public API health/service bindings, Basic/Premium/VIP Shadow names, both 15%
  service discounts and removal of the VIP Telegram benefit passed live checks.
  A separate anonymous request to private VIP content returned HTTP 401.
- Ordinary opted-in newsletter delivery was resumed after verification. No
  test email, payment, private media publication or customer impersonation occurred.

The workflow uses `CLOUDFLARE_API_TOKEN`; the global API key is not used. Worker
configurations preserve existing operational variables during both scripted and
automatic Cloudflare deployments; explicit configuration still takes precedence.

Remaining operational checks: external Premium Telegram/VIP WhatsApp destinations
remain behind `MUSIC_COMMUNITY_REVIEWED=false` until owner review; archived adult
posts require individual administrator publication; earlier newsletter consent
requires a new music opt-in. Actual mailbox delivery and provider/cached sender
names have not been verified by sending a test message.
