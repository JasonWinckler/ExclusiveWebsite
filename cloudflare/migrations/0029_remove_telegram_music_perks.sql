PRAGMA foreign_keys = ON;

-- Telegram is an adult-only channel, not a music-membership benefit. Retire
-- its catalog entries in every tier while keeping their text/history intact.
-- This does not change any account, order, price, term or external Telegram
-- connection, invitation or claim token; no external membership is modified.
UPDATE tier_perks
SET active = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE active = 1 AND (
  lower(id) LIKE '%telegram%'
  OR lower(title) LIKE '%telegram%'
  OR lower(COALESCE(title_en, '')) LIKE '%telegram%'
);
