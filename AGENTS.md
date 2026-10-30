# AGENTS.md

## Scope

These instructions apply to the entire repository.

## Project direction

This is the production Cloudflare-native single-creator music and voice supporter membership
platform. Cloudflare Pages, Workers, D1 and private R2 own frontend delivery,
authentication, authorization, SEPA orders, content and
administration. Do not introduce Appwrite code, configuration, credentials,
network calls or deployment dependencies.

## Content and safety rules

- Never commit adult media, customer data, identity evidence, challenge videos,
  secrets, real bank details, production environments, databases or backups.
- Unauthenticated previews use neutral placeholders, never blurred real adult
  media. Legacy adult media must stay quarantined and must never be republished
  into the music catalog without explicit content review.
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

- Use the official Jason Shadow music logo, burgundy, ivory and gold brand
  design, with The Order of Shadows as the membership identity.
- Keep `/linktree/` available as the music and membership link hub.
- The public host remains `exclusive.jason-shadow.com`. Do not move the
  application to a subpath or change DNS as part of visual work.
- New music memberships do not collect age evidence. Retained historical
  evidence still follows the existing private access and deletion rules.
- Maintain German and English copy together and avoid duplicate text.
