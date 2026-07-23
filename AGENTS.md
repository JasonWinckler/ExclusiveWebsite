# AGENTS.md

## Scope
These instructions apply to the whole repository.

## Project direction
This repository is a static, self-hosted frontend for a future secure adult membership application. Keep production behavior conservative: no external adult-platform links, no adult media, no third-party payment widgets, and no claim of legal/certification approval.

## Content and safety rules
- Do not commit adult media, customer data, identity documents, challenge videos, secrets, real bank details, production `.env` files, databases, or backups.
- Keep all protected-content previews neutral placeholders only; never blur real adult media for unauthenticated users.
- Registration, manual age verification, payments, free adult content, and exclusive adult content must remain frontend-only/disabled until reviewed and explicitly enabled in a future backend.
- Do not add external analytics, advertising pixels, social-media pixels, or unnecessary cookies.

## Implementation notes
- Preserve the dark red/ember/gold visual design.
- `/linktree/` must remain available but should route users back into the single-page site experience rather than linking to external adult platforms.
- Visible UI copy should be maintained through the central translation file (`assets/js/translations.js`) where practical for the static frontend.
