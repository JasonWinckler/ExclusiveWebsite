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

Transactional email also runs only inside the private identity Worker. Configure `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` and `GRAPH_CLIENT_SECRET` as encrypted Worker secrets and grant the Microsoft Entra service principal the Microsoft Graph application permission `Mail.Send` with administrator consent. The identity Worker has no public route, resolves recipients from Appwrite and fixes the sender to `GRAPH_SENDER_MAILBOX=info@exclusive.jason-shadow.com`. Production uses `AUTH_EMAIL_MODE=CUSTOM`, so verification and recovery use the branded, hashed, single-use D1 token flow. The `EMAIL_ASSETS` static-assets binding embeds the existing brand banner as an inline CID image, so mail clients do not need to load a remote tracking image. Authentication and invoice messages link to the Legal Center; invoice links select the EU/German or US legal page from the stored customer country. A future Exchange Online Application RBAC assignment can additionally restrict the service principal itself to the shared mailbox without changing the Worker.

Store the seller's invoice identifier only as the encrypted `INVOICE_TAX_IDENTIFIER` secret on the membership Worker. New invoices fail closed when that secret is absent or malformed and persist the identifier used for the invoice as a D1 snapshot; never add the value to Wrangler config or the repository.
