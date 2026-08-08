# AGENTS.md

## Scope

These instructions apply to the entire repository.

## Project direction

This is the production Cloudflare-native single-creator adult membership
platform. Cloudflare Pages, Workers, D1 and private R2 own frontend delivery,
authentication, authorization, age review, SEPA orders, content and
administration. Appwrite is legacy rollback material only and must not be added
back to the production request path.

## Content and safety rules

- Never commit adult media, customer data, identity evidence, challenge videos,
  secrets, real bank details, production environments, databases or backups.
- Unauthenticated previews use neutral placeholders, never blurred real adult
  media.
- Protected operations remain server-authorized and fail closed. Never replace
  Cloudflare session validation, D1 authorization or private R2 delivery with a
  frontend-only check.
- Age evidence is private, admin-only, `no-store`, and subject to immediate or
  48-hour deletion.
- Audit events are retained at most 730 days and at most 30 days after deletion
  of the affected account.
- Do not add ad/social pixels, cross-site identifiers or unnecessary cookies.
  Only cookieless aggregate Cloudflare Web Analytics is permitted.

## Implementation notes

- Preserve the dark red, ember and gold brand design.
- Keep `/linktree/` available and free of explicit sexual copy except the
  clearly marked 18+ Exclusive Content link.
- Maintain German and English copy together and avoid duplicate text.
