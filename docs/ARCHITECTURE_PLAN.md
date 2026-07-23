# Architecture and Implementation Plan

## Current repository analysis
The repository is currently a static HTML/CSS/JavaScript site, not a Laravel application. Version 1 in this repository therefore implements the public frontend, safety gates, bilingual copy, and backend-readiness documentation without collecting sensitive data.

## Target backend architecture prepared by this frontend
- Laravel 11+/12-ready PHP 8.3+ monolith with Blade, Tailwind-compatible design tokens, queues, scheduler, and private storage.
- PostgreSQL or MariaDB database.
- Server-side feature flags defaulting to disabled for registration, AVS, adult content, and manual SEPA.
- Private media controller with short-lived signed URLs and authorization on every request.
- Manual age-verification workflow disabled until legal review.
- Admin-only review workflow with 2FA, step-up reauthentication, immutable audit logs, and purge-before-activation status flow.

## Static frontend phases implemented here
1. Remove all external adult-platform links and third-party donation behavior.
2. Keep `/linktree/` but make it a local entry page pointing back to the one-page membership landing page.
3. Add bilingual German/English copy via a central translation file.
4. Add neutral locked free/exclusive cards with lock design and blurred placeholder layers only.
5. Add pending-account and disabled AVS frontend sections for future backend integration.
6. Add conservative legal, security, status-model, deployment, and operations documentation.
7. Add automated static checks for removed third-party links and required safety copy.

## Backend blockers intentionally not bypassed
- No production age verification without documented legal approval.
- No collection of document photos or challenge video in the static site.
- No payments for pending or unverified users.
- No adult media delivery before a future server-side authorization layer exists.
