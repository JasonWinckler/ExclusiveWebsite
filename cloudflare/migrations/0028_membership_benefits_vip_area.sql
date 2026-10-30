PRAGMA foreign_keys = ON;

-- Extend the scope vocabulary without rebuilding content_items. Renaming and
-- adding columns preserves every dependent upload, comment and newsletter FK;
-- it avoids ON DELETE side effects from the usual SQLite table-copy pattern.
-- content_scope_before_vip is an audit-only snapshot, never an authorization
-- input. All application access decisions use the new content_scope column.
DROP INDEX content_music_catalog_idx;
ALTER TABLE content_items RENAME COLUMN content_scope TO content_scope_before_vip;
ALTER TABLE content_items ADD COLUMN content_scope TEXT NOT NULL DEFAULT 'LEGACY_ADULT'
  CHECK (content_scope IN ('LEGACY_ADULT', 'MUSIC', 'VIP_ADULT'));
UPDATE content_items SET content_scope = content_scope_before_vip;
CREATE INDEX content_music_catalog_idx
  ON content_items(content_scope, content_status, published_at);

-- No legacy post is republished or reclassified here. A separate, explicit
-- administrator review is required before anything enters the VIP adult area.
-- Product identifiers, prices, terms, purchase limits and existing contracts
-- remain unchanged; only current catalog presentation is updated.
UPDATE products SET
  display_name = CASE tier
    WHEN 'EXCLUSIVE_BASIC' THEN 'Basic Shadow'
    WHEN 'EXCLUSIVE_PREMIUM' THEN 'Premium Shadow'
    WHEN 'EXCLUSIVE_VIP' THEN 'VIP Shadow'
  END || CASE WHEN instr(display_name, ' – ') > 0
    THEN substr(display_name, instr(display_name, ' – ')) ELSE '' END,
  display_name_en = CASE tier
    WHEN 'EXCLUSIVE_BASIC' THEN 'Basic Shadow'
    WHEN 'EXCLUSIVE_PREMIUM' THEN 'Premium Shadow'
    WHEN 'EXCLUSIVE_VIP' THEN 'VIP Shadow'
  END || CASE WHEN instr(COALESCE(display_name_en, display_name), ' – ') > 0
    THEN substr(COALESCE(display_name_en, display_name), instr(COALESCE(display_name_en, display_name), ' – '))
    ELSE '' END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- Every paid tier receives the same music and voice behind-the-scenes posts.
UPDATE tier_perks SET
  title = 'Alle Einblicke hinter die Kulissen',
  title_en = 'All behind-the-scenes content',
  description = 'Derselbe vollständige Zugang zu Musik-, Studio-, Proben- und Sprecher-Einblicken mit Basic Shadow, Premium Shadow und VIP Shadow während deiner aktiven Laufzeit.',
  description_en = 'The same full access to music, studio, rehearsal and voice-work insights with Basic Shadow, Premium Shadow and VIP Shadow during your active term.',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id LIKE 'perk-basic-gallery-%'
  OR id LIKE 'perk-premium-galleries-%'
  OR id LIKE 'perk-vip-galleries-%';

UPDATE tier_perks SET
  title = 'Neue Beiträge hinter den Kulissen',
  title_en = 'New behind-the-scenes posts',
  description = 'Alle neuen Musik- und Sprecherbeiträge während deiner aktiven Laufzeit, unabhängig vom bezahlten Tarif.',
  description_en = 'Every new music and voice-work post during your active term, regardless of paid tier.',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id LIKE 'perk-basic-drops-%'
  OR id LIKE 'perk-premium-drops-%'
  OR id LIKE 'perk-vip-drops-%';

-- Extended editions and early-access gallery copy no longer represent separate
-- content entitlements. Existing personal-reply and other non-content perks stay.
UPDATE tier_perks SET active = 0,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id LIKE 'perk-premium-extended-%'
  OR (id LIKE 'perk-vip-priority-%' AND id NOT LIKE 'perk-vip-priority-replies-%')
  OR (tier = 'EXCLUSIVE_VIP' AND id LIKE '%telegram%');

UPDATE tier_perks SET
  description = 'Verbinde dein Telegram-Konto im Dashboard für persönlichen Zugang während deiner aktiven Premium-Shadow-Mitgliedschaft. Dieser Vorteil ist ausschließlich in Premium Shadow enthalten.',
  description_en = 'Link your Telegram account in the dashboard for personal access during an active Premium Shadow membership. This benefit is exclusive to Premium Shadow.',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE tier = 'EXCLUSIVE_PREMIUM' AND id LIKE '%telegram%';

INSERT INTO tier_perks (
  id, tier, title, title_en, description, description_en, sort_order,
  active, created_at, updated_at
) VALUES
(
  'perk-premium-services-discount', 'EXCLUSIVE_PREMIUM',
  '15 % auf alle Dienstleistungen', '15% off all services',
  'Als aktives Premium-Shadow-Mitglied erhältst du 15 % Rabatt auf alle Musik-, Sprecher- und sonstigen geschäftlichen Dienstleistungen von Jason. Frage persönlich ein Angebot an; deine aktive Mitgliedschaft wird dabei geprüft.',
  'As an active Premium Shadow member, receive 15% off all of Jason’s music, voice and other business services. Request a personal quote; your active membership is verified as part of the quote.',
  15, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
),
(
  'perk-vip-services-discount', 'EXCLUSIVE_VIP',
  '15 % auf alle Dienstleistungen', '15% off all services',
  'Als aktives VIP-Shadow-Mitglied erhältst du 15 % Rabatt auf alle Musik-, Sprecher- und sonstigen geschäftlichen Dienstleistungen von Jason. Frage persönlich ein Angebot an; deine aktive Mitgliedschaft wird dabei geprüft.',
  'As an active VIP Shadow member, receive 15% off all of Jason’s music, voice and other business services. Request a personal quote; your active membership is verified as part of the quote.',
  15, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
),
(
  'perk-vip-optional-adult-area', 'EXCLUSIVE_VIP',
  'Optionaler separater 18+-Bereich', 'Optional separate 18+ area',
  'Ein separater Bereich für Erwachsene ist ausschließlich mit aktiver VIP-Shadow-Mitgliedschaft und bestätigter Altersverifikation zugänglich. Er ist freiwillig und vom Musikbereich und Musiknewsletter getrennt.',
  'A separate adult area is available only with an active VIP Shadow membership and approved age verification. It is optional and separate from the music area and music newsletter.',
  50, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
