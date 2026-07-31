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

Production D1, private R2 and Worker bindings are provisioned. For a new preview
environment or disaster recovery, create separate resources, replace only the
preview zero-UUID placeholders and apply migrations through the membership
configuration so every Worker binds to the same environment-specific database.

Deploy the private identity Worker first, then the callers. Set encrypted secrets per Worker with `wrangler secret put <NAME> --config <CONFIG> [--env preview]`. Do not place a secret value on a command line.

Production uses the in-house manual age-review flow (`manual-r2-v1`) and EPC QR/visible SEPA transfer instructions (`epc-qr-credit-transfer-v1`). N26 statement matching is an admin-only CSV import; no PISP or bank-login flow is used.

The private identity Worker requires separate encrypted `LABEL_SYNC_SERVICE_SECRET` and `ACCOUNT_LIFECYCLE_SERVICE_SECRET` values. Only `maintenance-jobs` receives the lifecycle secret. Protected media uses private R2 delivery (`private-r2-v1`); bucket names, object keys and secret values must never be exposed in frontend configuration.

Transactional email runs only inside the private identity Worker.
`GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` and `GRAPH_CLIENT_SECRET` are encrypted
Worker secrets; the Entra service principal uses the administrator-approved
Microsoft Graph application permission `Mail.Send`. The identity Worker has no
public route, resolves recipients from Appwrite and fixes the sender to
`GRAPH_SENDER_MAILBOX=info@exclusive.jason-shadow.com`. Production uses
`AUTH_EMAIL_MODE=CUSTOM`, so verification and recovery use the branded,
hashed, single-use D1 token flow. The `EMAIL_ASSETS` binding embeds the brand
banner as an inline CID image. Authentication and invoice messages link to the
Legal Center, with jurisdiction-specific invoice links. Exchange Online
Application RBAC remains an optional defense-in-depth improvement; if enabled,
the broader organization-wide Graph grant must be removed because the
permission systems are additive.

Store the seller's invoice identifier only as the encrypted `INVOICE_TAX_IDENTIFIER` secret on the membership Worker. New invoices fail closed when that secret is absent or malformed and persist the identifier used for the invoice as a D1 snapshot; never add the value to Wrangler config or the repository.
