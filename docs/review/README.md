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

The website/backend release remains blocked. [Read-only inspection](https://github.com/JasonWinckler/ExclusiveWebsite/actions/runs/41046283377)
confirmed D1 is still at migration 0026 and migrations 0027/0028 are pending.
All five Worker metadata requests and the Pages project request returned HTTP
403; Pages reported Cloudflare code 10000. No site deployment, schema migration,
newsletter queue change or test mail was performed by this task.

Extend the existing token used by GitHub Actions secret `CLOUDFLARE_API_TOKEN`
with account-level **Workers Scripts: Edit** and **Cloudflare Pages: Edit** for
the existing account, retaining **D1: Edit** and its other existing permissions.
If replacing the token, update it in the repository’s Actions secrets. Rerun
inspection before using the exact-revision production deployment workflow.
