# README

This repository provides a React frontend connected to Appwrite Accounts and a conservative, manual age-review intake queue.

## Appwrite Sites

The frontend is built for Appwrite Sites and connects to the **Jason Shadow Enterprises** Appwrite project (`6a64cbeb0009826c9efc`) at `https://fra.cloud.appwrite.io/v1`, using database `registered_users` (`6a64f96800187b534953`). The Appwrite integration lives in `src/lib/appwrite.js`.

Run `npm install` and `npm run build`. The deployable static site is written to `dist/`. In Appwrite Sites, use `npm install` as the install command, `npm run build` as the build command, and `dist` as the output directory.

## Required production blockers
- Registration, login, logout, email confirmation, password recovery, and age-review intake are implemented with Appwrite.
- Manual approval and protected-content access require a professionally reviewed process and server-side authorization.
- Adult content, thumbnails, videos, media URLs, payment instructions, and protected catalog data must not be delivered publicly.
- No real customer data, adult media, identity documents, challenge videos, bank details, secrets, production databases, or backups may be committed.

## Future backend requirements
- Laravel monolith, PHP 8.3+, private storage, queues, scheduler, PostgreSQL or MariaDB.
- Account statuses: EMAIL_PENDING, PENDING_AGE_VERIFICATION, CAPTURE_PENDING, CAPTURE_IN_PROGRESS, MANUAL_REVIEW_PENDING, LIVE_REVIEW_REQUIRED, APPROVED_PENDING_PURGE, PURGE_IN_PROGRESS, PURGE_ERROR, APPROVED_PENDING_CREDENTIAL, ACTIVE, REJECTED, LOCKED, REVERIFICATION_REQUIRED, CANCELLED, EXPIRED.
- Access must fail closed. Only ACTIVE accounts with confirmed email, valid AVS, jurisdiction permission, step-up authentication, and active entitlement may access protected media.
- Manual SEPA may be added only after age verification and must never bypass AVS.

## Legal placeholders
Use placeholders only until reviewed: [LEGAL_BUSINESS_NAME], [OWNER_NAME], [BUSINESS_ADDRESS], [EMAIL_ADDRESS], [DOMAIN], [TAX_NUMBER], [VAT_ID], [YOUTH_PROTECTION_CONTACT], [HOSTING_PROVIDER].
