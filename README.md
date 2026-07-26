# ExclusiveWebsite

This repository contains the public React frontend plus the staged Cloudflare membership backend.

## Security boundary

Appwrite owns email/password registration, verification, recovery, login and sessions. The browser creates a short-lived Appwrite JWT for Cloudflare API calls. Cloudflare Workers and D1 own membership state, hosted age-verification sessions, provider webhooks, SEPA checkout sessions, entitlements, device state, administration and inactive-account deletion.

Protected authorization never trusts Appwrite labels alone. D1 is canonical; labels are a coarse server-maintained projection. Age verification, payments and protected content remain fail-closed until a reviewed provider integration is explicitly enabled.

## Local development

Frontend:

```sh
npm install
npm run dev
```

Cloudflare:

```sh
cd cloudflare
pnpm install
pnpm run typecheck
pnpm test
```

The frontend public variables are listed in `.env.example`. Cloudflare secret names are listed without values in `cloudflare/.dev.vars.example`; real values must be stored with Wrangler secrets or the Cloudflare dashboard.

## Migration status

The repository is in the reversible implementation phase. Legacy Appwrite Function source is intentionally retained as rollback material, but the frontend no longer calls Appwrite Functions, TablesDB or Storage for membership. Do not remove deployed Appwrite resources until the Cloudflare replacement is deployed and production negative-path tests pass.

See [docs/CLOUDFLARE_MIGRATION.md](docs/CLOUDFLARE_MIGRATION.md) and [docs/PROVIDER_DECISIONS.md](docs/PROVIDER_DECISIONS.md).
