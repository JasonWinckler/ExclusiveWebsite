# Appwrite production setup

The browser application connects to project `6a64cbeb0009826c9efc`, TablesDB database `registered_users` (`6a64f96800187b534953`), and the private `content_and_verification` bucket (`6a657e2b0008347358ee`). Public resource IDs may use the `VITE_*` variables in `.env.example`. API keys, webhook secrets, and other credentials must never use `VITE_*` or be added to Sites builds.

## Authentication and platforms

Add each production hostname and `localhost` as Web platforms. Enable Email/Password authentication, configure SMTP, use a strong password policy, and disable anonymous authentication before production. Verification and recovery redirects must use registered origins.

## Server-owned membership data

The current database and permission model are documented in [Appwrite server Functions](APPWRITE_SERVER_FUNCTIONS.md). All ten TablesDB tables use row security, have no table-level browser permissions, and grant an owner read-only permission only when a Function creates a user-owned row. The browser uploads files to the file-secured verification bucket and asks a server Function to finalize the case; it cannot create a case, choose its status, or update a profile.

Do not add browser create/update/delete permissions as a workaround when a Function is unavailable. A missing or quota-blocked Function means the corresponding workflow remains disabled.

## Function configuration

Deploy each directory under `appwrite/functions/` with Node.js 22, entrypoint `src/main.js`, and build command `npm install`. Apply exactly the execution roles, schedules, and scopes in the scope matrix. Appwrite injects a scope-limited `APPWRITE_FUNCTION_API_KEY` as an encrypted system variable. Required non-secret variables are:

- `FUNCTION_KIND` — the handler name represented by the directory.
- `APPWRITE_DATABASE_ID=6a64f96800187b534953`.
- `VERIFICATION_BUCKET_ID=6a657e2b0008347358ee` for verification finalization and retention cleanup.
- `INACTIVE_DAYS=730` for inactive-account cleanup.

`PAYMENT_WEBHOOK_SECRET` is the only application secret currently required. Create it as a secret Function variable and share it only through the payment provider's secret configuration. Payments remain disabled until a provider contract and legal review are complete.

## Sites build

- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`

Protected files are never public, previewed, or addressed by a browser-constructed URL. Authorization must be evaluated server-side on every request. Account approval, administrative review, payments, entitlements, and cleanup must not fall back to frontend logic.
