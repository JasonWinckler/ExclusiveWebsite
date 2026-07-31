# AGENTS.md

## Scope
These instructions apply to the whole repository.

## Project direction
This repository contains the production React frontend and Cloudflare membership
backend for a single-creator adult membership application. Appwrite owns
authentication; Cloudflare Workers, D1 and private R2 own membership, age
review, SEPA orders, protected content and administration. Keep production
behavior conservative and document operator responsibility and implemented
technical safeguards accurately.

## Content and safety rules
- Do not commit adult media, customer data, identity documents, challenge videos, secrets, real bank details, production `.env` files, databases, or backups.
- Keep all protected-content previews neutral placeholders only; never blur real adult media for unauthenticated users.
- Protected operations must remain server-authorized and fail closed. Never
  replace Appwrite authentication, D1 authorization or private R2 delivery with
  frontend-only checks.
- Age evidence must remain private, accessible only through the protected admin
  API, and subject to the documented immediate/48-hour deletion process.
- Audit events are retained for at most 730 days and at most 30 days after the
  affected account is deleted.
- Do not add external analytics, advertising pixels, social-media pixels, or unnecessary cookies.

## Implementation notes
- Preserve the dark red/ember/gold visual design.
- `/linktree/` must remain available but should route users back into the single-page site experience rather than linking to external adult platforms.
- Visible UI copy should be maintained through the central translation file (`assets/js/translations.js`) where practical for the static frontend.
