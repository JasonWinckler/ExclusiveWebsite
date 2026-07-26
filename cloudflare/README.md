# Cloudflare workspace

This directory is an independently testable Workers/D1 workspace. It contains no secret values.

## Validate locally

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm exec wrangler d1 migrations apply exclusive-membership-preview \
  --local --config wrangler.membership-api.jsonc --env preview
```

## Provision

Create separate production and preview D1 databases, then replace the zero UUID placeholders in every Wrangler config. Apply migrations using the membership config so all Workers bind to the same environment-specific database.

Deploy the private identity Worker first, then the callers. Set encrypted secrets per Worker with `wrangler secret put <NAME> --config <CONFIG> [--env preview]`. Do not place a secret value on a command line.

Production uses the in-house manual age-review flow (`manual-r2-v1`) and EPC QR/visible SEPA transfer instructions (`epc-qr-credit-transfer-v1`). N26 statement matching is an admin-only CSV import; no PISP or bank-login flow is used.

The private identity Worker requires separate encrypted `LABEL_SYNC_SERVICE_SECRET` and `ACCOUNT_LIFECYCLE_SERVICE_SECRET` values. Only `maintenance-jobs` receives the lifecycle secret. Protected media uses private R2 delivery (`private-r2-v1`); bucket names, object keys and secret values must never be exposed in frontend configuration.
