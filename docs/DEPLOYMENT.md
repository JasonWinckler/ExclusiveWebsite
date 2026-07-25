# DEPLOYMENT

This static repository now prepares a conservative frontend for a future self-hosted adult membership platform.

## Appwrite Sites deployment

This repository targets Appwrite Sites exclusively. Configure the site in the **Jason Shadow Enterprises** Appwrite project with these settings:

- Project ID: `6a64cbeb0009826c9efc`
- Endpoint and region: `https://fra.cloud.appwrite.io/v1` (Frankfurt)
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

The build first copies every static route and asset into `dist`, then bundles the Appwrite Web SDK client. Opening the deployed home page automatically calls `client.ping()`; use the browser console and network panel to confirm connectivity. Add every Appwrite Sites deployment hostname and the production custom domain as Web platforms in the Appwrite project before testing from those origins.

No GitHub Pages deployment configuration is used or required.

## Required production blockers
- Registration remains disabled until a Laravel backend, email verification, jurisdiction checks, legal texts, and AVS review are complete.
- Manual age verification remains disabled until professional legal review approves the documented process.
- Adult content, thumbnails, videos, media URLs, payment instructions, and protected catalog data must not be delivered publicly.
- No real customer data, adult media, identity documents, challenge videos, bank details, secrets, production databases, or backups may be committed.

## Future backend requirements
- Laravel monolith, PHP 8.3+, private storage, queues, scheduler, PostgreSQL or MariaDB.
- Account statuses: EMAIL_PENDING, PENDING_AGE_VERIFICATION, CAPTURE_PENDING, CAPTURE_IN_PROGRESS, MANUAL_REVIEW_PENDING, LIVE_REVIEW_REQUIRED, APPROVED_PENDING_PURGE, PURGE_IN_PROGRESS, PURGE_ERROR, APPROVED_PENDING_CREDENTIAL, ACTIVE, REJECTED, LOCKED, REVERIFICATION_REQUIRED, CANCELLED, EXPIRED.
- Access must fail closed. Only ACTIVE accounts with confirmed email, valid AVS, jurisdiction permission, step-up authentication, and active entitlement may access protected media.
- Manual SEPA may be added only after age verification and must never bypass AVS.

## Legal placeholders
Use placeholders only until reviewed: [LEGAL_BUSINESS_NAME], [OWNER_NAME], [BUSINESS_ADDRESS], [EMAIL_ADDRESS], [DOMAIN], [TAX_NUMBER], [VAT_ID], [YOUTH_PROTECTION_CONTACT], [HOSTING_PROVIDER].
