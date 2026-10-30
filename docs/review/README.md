# The Order of Shadows — design review

The redesigned membership stays at https://exclusive.jason-shadow.com/.
These screenshots are local review artifacts, not evidence of a production deployment.

## Website

![Desktop website design](website-preview.png)

![Mobile website design](website-mobile.png)

## Newsletter

This is illustrative newsletter content rendered with the production email template.
No newsletter was sent.

![Music newsletter design](newsletter-preview.png)

## Verification

- Production frontend build and existing bundle budgets pass.
- TypeScript and 95 backend tests pass, including migration preservation,
  content quarantine, newsletter consent and webmail-link behavior.
- 44 Playwright checks pass on desktop and mobile with synthetic API fixtures.
- Original logo and owned artist photographs were copied from the music website.

Real email delivery, production payment processing, and production data migration
still require authenticated Cloudflare deployment and controlled live checks.
See [the transition guide](../ORDER_OF_SHADOWS_TRANSITION.md) for the release order.
