# Appwrite production setup

The browser application is connected to project `6a64cbeb0009826c9efc` and database `registered_users` (`6a64f96800187b534953`). The database name is informational; Appwrite requests use its ID. No API key belongs in this repository or in a `VITE_*` variable.

## 1. Add the Web platform

In **Appwrite Console → Project → Overview → Add platform → Web**, add every hostname that will serve the site (production domain and `localhost` for local development). Account verification and password-recovery redirects must use one of these platform origins.

## 2. Configure authentication

In **Auth → Settings**:

1. Enable **Email/Password** authentication.
2. Set a password policy of at least 8 characters (a stronger production policy is recommended).
3. Configure the SMTP sender and test email verification and password recovery.
4. Keep session security and abuse protection enabled. Do not enable anonymous accounts.

## 3. Create the collections

In database `registered_users`, create these collections with **Document security enabled**. Use the IDs exactly as written, or override them with the matching variables in `.env.example`.

### `users`

Grant the **Users** role only the collection-level **Create documents** permission. Do not grant collection-level read, update, or delete. Create these required string attributes:

| Attribute | Size | Required |
|---|---:|:---:|
| `userId` | 36 | yes |
| `email` | 320 | yes |
| `name` | 128 | yes |
| `status` | 40 | yes |
| `ageVerificationStatus` | 40 | yes |

The frontend creates a document whose ID equals the Appwrite user ID and gives that user document-level **read only** access. Status changes must be made by trusted server code or an administrator, never by the browser.

### `age_verifications`

Grant the **Users** role only **Create documents**. Do not grant collection-level read, update, or delete. Create:

| Attribute | Type | Size | Required |
|---|---|---:|:---:|
| `userId` | string | 36 | yes |
| `legalName` | string | 128 | yes |
| `birthDate` | string | 10 | yes |
| `country` | string | 2 | yes |
| `status` | string | 40 | yes |
| `submittedAt` | datetime | — | yes |

The document ID is the user ID, which enforces one request per account. The submitting user receives document-level read access only. Do **not** add client update permission: otherwise a user could approve their own request.

## 4. Configure the Site build

Use:

- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`

Add the variables from `.env.example` to Appwrite Sites if your collection IDs differ. These values are public identifiers, not secrets.

## 5. Manual review procedure

1. Confirm the account's Appwrite Auth record has `emailVerification: true`.
2. Review the matching `age_verifications` document under a documented, legally reviewed process.
3. A mere date-of-birth declaration is **not** robust age assurance. Before approving access, integrate a suitable age-assurance provider or a legally reviewed manual process outside the public browser application.
4. Change `age_verifications.status` to `APPROVED` or `REJECTED` using Appwrite Console or trusted server code. Never provide update permission to the user.
5. Change `users.status` to `ACTIVE` only after all required checks pass. Protected media must be served by an authenticated backend that checks both records on every request.

The current site deliberately does not collect identity images or challenge videos. Do not place those files in public Storage buckets, logs, source control, or browser-accessible collections.

## What is not activated

Payments and protected adult media remain disabled because no payment provider, entitlement schema, protected storage design, or completed legal review was supplied. Enabling those solely in frontend code would expose content and allow authorization bypasses.
