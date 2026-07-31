# ExclusiveWebsite

This repository contains the production React frontend and the production
Cloudflare membership backend for Shadow's Temptation.

## Security boundary

Appwrite owns authentication identities, password login, MFA, sessions and the
authoritative E-Mail status. Branded verification and recovery messages use
hashed, single-use D1 tokens and the private Identity Worker. The browser
creates a short-lived Appwrite JWT for Cloudflare API calls. Cloudflare Workers
and D1 own membership state, manual age-verification cases, SEPA orders,
entitlements, device state, administration, transactional email and account
deletion.

Protected authorization never trusts Appwrite labels alone. D1 is canonical;
labels are a coarse server-maintained projection. Production uses the
owner-operated manual R2 age-review flow, EPC-QR SEPA transfers with
administrator-confirmed settlement and private R2 content delivery. Every
protected path fails closed.

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

## Production status

The Cloudflare architecture is live on `exclusive.jason-shadow.com` and is
built from GitHub `main`. The frontend no longer calls Appwrite Functions,
TablesDB or Storage for membership or identity evidence. Legacy Function source
is retained only as historical rollback material and is not an authorization
path. Any remaining legacy cloud resource may be removed only after an explicit
inventory confirms that it contains neither required production data nor data
subject to a retention or deletion duty.

Current operational documentation:

- [Architecture and migration](docs/CLOUDFLARE_MIGRATION.md)
- [Provider decisions](docs/PROVIDER_DECISIONS.md)
- [Age verification](docs/AGE_VERIFICATION.md)
- [Security](docs/SECURITY.md)
- [Data deletion and retention](docs/DATA_DELETION.md)
- [Data protection impact assessment](docs/DATENSCHUTZ-FOLGENABSCHAETZUNG.md)
