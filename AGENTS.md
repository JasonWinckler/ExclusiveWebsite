# AGENTS.md

## Scope

These instructions apply to the entire repository.

## Project direction

This is the production Cloudflare-native single-creator music and voice supporter membership
platform. Cloudflare Pages, Workers, D1 and private R2 own frontend delivery,
authentication, authorization, optional VIP age review, SEPA orders, content and
administration. Do not introduce Appwrite code, configuration, credentials,
network calls or deployment dependencies.

## Content and safety rules

- Never commit adult media, customer data, identity evidence, challenge videos,
  secrets, real bank details, production environments, databases or backups.
- Unauthenticated previews use neutral placeholders, never blurred real adult
  media. Legacy adult media stays quarantined. Only a deliberate per-item administrator
  review may approve it for the separate VIP adult area; never publish it as music.
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
  design. Lead with Jason Shadow and Exclusive Membership / Exklusive
  Mitgliedschaft. Order of Shadows is the secondary community name; do not
  translate it into a German religious-order theme.
- Keep `/linktree/` available as the music and membership link hub.
- The affiliate program lives at `https://jason-shadow.com/affiliates`. Link
  there and permanently redirect the former local `/affiliates` routes.
- The public host remains `exclusive.jason-shadow.com`. Do not move the
  application to a subpath or change DNS as part of visual work.
- Music content does not require age evidence. The separate optional VIP adult
  area requires an active VIP membership and approved age verification, in
  addition to normal account, device and jurisdiction authorization.
- Tier labels are Basic Shadow, Premium Shadow and VIP Shadow. All paid tiers
  share the same music behind-the-scenes content. Premium and VIP include 15%
  off all Jason Shadow services. VIP includes owner-approved WhatsApp contact
  for the music business and meet-ups. Telegram is not included in any music
  membership; its existing adult-content destination must never be promoted or
  linked from music benefits. This owner clarification supersedes earlier
  Premium-only Telegram instructions. No adult Telegram routing is introduced.
- Keep the destination gates separate: `VIP_WHATSAPP_MUSIC_REVIEWED=true` for
  the approved production WhatsApp destination and `MUSIC_TELEGRAM_REVIEWED=false`.
  The historical shared `MUSIC_COMMUNITY_REVIEWED` flag is unused. Preserve
  legacy Telegram records and cleanup/revocation controls.
- Maintain German and English copy together and avoid duplicate text.
