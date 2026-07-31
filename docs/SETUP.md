# Production configuration

This document records the active production baseline. It is also the
reconstruction checklist for preview or disaster-recovery environments.

## Appwrite

Appwrite owns registration, login, E-Mail-Status, JWTs, MFA and Sitzungen.
Active production requirements:

- project endpoint `https://fra.cloud.appwrite.io/v1`;
- production domain and deployment hosts as Web platforms;
- password minimum eight characters with at least one special character;
- password dictionary and personal-data checks enabled;
- at most three active user sessions/devices at the application layer;
- only the dedicated private identity Worker receives the scoped server API
  key.

The frontend does not use Appwrite TablesDB, Storage or Functions as the
canonical membership backend.

## Cloudflare

Active resources:

- D1 membership database with every migration in `cloudflare/migrations`;
- private R2 bucket `exclusive-age-evidence` with EU jurisdiction;
- private R2 bucket `exclusive-content-media`;
- `exclusive-identity-projection` without a public route;
- Membership, Admin and Maintenance Workers;
- service bindings exactly as declared by the Wrangler configurations;
- encrypted secrets from `cloudflare/.dev.vars.example`, never committed.

Production modes:

- `AGE_REVIEW_MODE=manual-r2-v1`;
- `SEPA_TRANSFER_MODE=epc-qr-credit-transfer-v1`;
- `PROTECTED_CONTENT_MODE=private-r2-v1`;
- `AUTH_EMAIL_MODE=CUSTOM`;
- `DEVICE_LIMIT=3`;
- `AGE_REVIEW_WINDOW_HOURS=48`;
- `ADMIN_SESSION_MINUTES=10`;
- `AUDIT_RETENTION_DAYS=730`.

The maintenance Worker runs hourly and enforces expirations, evidence deletion,
decision-metadata minimization, email retries and audit retention.

## Change validation

```sh
cd cloudflare
pnpm run typecheck
pnpm test
cd ..
npm run build
```

For every production change, verify Worker health, D1 migrations, private R2 access,
registration/login, negative authorization paths, admin-session expiry,
age-evidence deletion and account-erasure retention.
