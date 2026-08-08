# Shadow's Temptation · ExclusiveWebsite

Production React frontend and Cloudflare backend for the single-creator
membership platform at `exclusive.jason-shadow.com`.

## Production architecture

- Cloudflare Pages serves the frontend and its same-origin `/api/*` gateway.
- `exclusive-auth-api` owns registration, passwords, email state, sessions and
  TOTP MFA. The browser derives a salted PBKDF2-HMAC-SHA-256 verifier with
  600,000 iterations; D1 stores only a second server-peppered HMAC. Session
  tokens are stored only as SHA-256 hashes and sent in `Secure`, `HttpOnly`,
  `SameSite=Strict` cookies.
- D1 is authoritative for accounts, privacy choices, age decisions, products,
  SEPA orders, entitlements, devices, posts, comments and audit state.
- Private R2 buckets store short-lived age evidence and creator media.
- Membership, Admin, Identity and Maintenance Workers communicate through
  Cloudflare service bindings. The private Identity Worker sends branded mail
  through Microsoft Graph and has no public route.
- Appwrite is outside the production request path after the migration. Its
  previous site and auth data are retained temporarily as rollback material;
  they are not an authorization or data source.

Every protected operation fails closed. The browser never chooses its user ID,
role, age status, tier or R2 object key.

## Development and validation

```sh
npm install
npm run build

cd cloudflare
pnpm install
pnpm run check
```

Public optional overrides are documented in `.env.example`. Worker secret names
are documented in `cloudflare/.dev.vars.example`; values belong only in
Cloudflare encrypted secrets.

Operational documentation:

- [Architecture](docs/ARCHITECTURE_PLAN.md)
- [Deployment and rollback](docs/DEPLOYMENT.md)
- [Security](docs/SECURITY.md)
- [Age verification](docs/AGE_VERIFICATION.md)
- [Data deletion and retention](docs/DATA_DELETION.md)
- [Data protection impact assessment](docs/DATENSCHUTZ-FOLGENABSCHAETZUNG.md)
