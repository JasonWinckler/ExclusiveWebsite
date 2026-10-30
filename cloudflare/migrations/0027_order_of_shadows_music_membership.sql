PRAGMA foreign_keys = ON;

-- Existing accounts, orders, invoices, entitlements, prices and term lengths
-- remain intact. Old media must never become accessible when the age gate is
-- retired. Classification defaults fail closed; only the new admin creator
-- writes MUSIC explicitly. This migration does not delete R2 objects.
ALTER TABLE content_items ADD COLUMN content_scope TEXT NOT NULL DEFAULT 'LEGACY_ADULT'
  CHECK (content_scope IN ('LEGACY_ADULT', 'MUSIC'));
CREATE INDEX content_music_catalog_idx ON content_items(content_scope, content_status, published_at);
UPDATE content_items
SET content_status = CASE WHEN content_status = 'RETIRED' THEN 'RETIRED' ELSE 'DISABLED' END,
    version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE content_scope = 'LEGACY_ADULT';

-- Do not send any queued legacy editorial or content announcement after the
-- purpose change. Previously sent records and consent evidence are preserved.
UPDATE newsletter_campaigns SET status = 'CANCELLED',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status IN ('DRAFT', 'QUEUED', 'SENDING');
UPDATE newsletter_deliveries SET status = 'SKIPPED',
  last_error_code = 'MUSIC_MEMBERSHIP_MIGRATION',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status IN ('PENDING', 'SENDING', 'FAILED');
UPDATE newsletter_subscriptions SET status = 'PENDING',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'SUBSCRIBED' AND consent_text_version <> 'newsletter-music-v2';
UPDATE newsletter_action_tokens SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE purpose = 'CONFIRM' AND used_at IS NULL;

-- Expire pre-cutover external invitation capabilities. The existing Telegram
-- sync job revokes the encrypted invite links through the Bot API; the webhook
-- also rejects joins until the music community is explicitly reviewed.
UPDATE telegram_link_tokens SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
UPDATE telegram_invites SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

UPDATE products SET
  display_name = replace(display_name, 'Exclusive ', 'Order of Shadows · '),
  display_name_en = replace(COALESCE(display_name_en, display_name), 'Exclusive ', 'Order of Shadows · '),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

UPDATE tier_perks SET
  title = CASE
    WHEN id LIKE 'perk-vip-priority-replies-%' THEN 'Priorisierte persönliche Antworten'
    WHEN id LIKE 'perk-premium-galleries-%' THEN 'Basic- und Premium-Einblicke'
    WHEN id LIKE 'perk-premium-telegram-%' THEN 'Privater Telegram-Kanal'
    WHEN id LIKE 'perk-premium-extended-%' THEN 'Mehr aus Studio und Proben'
    WHEN id LIKE 'perk-premium-voting-%' THEN 'Themen-Votings'
    WHEN id LIKE 'perk-basic-gallery-%' THEN 'Einblicke hinter die Kulissen'
    WHEN id LIKE 'perk-paid-comments-%' THEN 'Kommentare für Mitglieder'
    WHEN id LIKE 'perk-premium-drops-%' THEN 'Premium-Veröffentlichungen'
    WHEN id LIKE 'perk-vip-galleries-%' THEN 'Alle Einblicke inklusive VIP'
    WHEN id LIKE 'perk-vip-priority-%' THEN 'Bevorzugter Zugang'
    WHEN id LIKE 'perk-vip-whatsapp-%' THEN 'Persönlicher WhatsApp-Kontakt'
    WHEN id LIKE 'perk-basic-drops-%' THEN 'Neue Basic-Beiträge'
    WHEN id LIKE 'perk-vip-meeting-%' THEN 'Persönliches VIP-Treffen'
    WHEN id LIKE 'perk-vip-telegram' THEN 'Privater Telegram-Kanal'
    WHEN id LIKE 'perk-vip-drops-%' THEN 'Exklusive VIP-Updates'
    ELSE title
  END,
  title_en = CASE
    WHEN id LIKE 'perk-vip-priority-replies-%' THEN 'Priority personal replies'
    WHEN id LIKE 'perk-premium-galleries-%' THEN 'Basic and Premium access'
    WHEN id LIKE 'perk-premium-telegram-%' THEN 'Private Telegram channel'
    WHEN id LIKE 'perk-premium-extended-%' THEN 'More from the studio and rehearsals'
    WHEN id LIKE 'perk-premium-voting-%' THEN 'Community theme voting'
    WHEN id LIKE 'perk-basic-gallery-%' THEN 'Behind-the-scenes access'
    WHEN id LIKE 'perk-paid-comments-%' THEN 'Member comments'
    WHEN id LIKE 'perk-premium-drops-%' THEN 'Premium updates'
    WHEN id LIKE 'perk-vip-galleries-%' THEN 'All access, including VIP'
    WHEN id LIKE 'perk-vip-priority-%' THEN 'Priority access'
    WHEN id LIKE 'perk-vip-whatsapp-%' THEN 'Personal WhatsApp contact'
    WHEN id LIKE 'perk-basic-drops-%' THEN 'New Basic updates'
    WHEN id LIKE 'perk-vip-meeting-%' THEN 'Personal VIP meet-up'
    WHEN id LIKE 'perk-vip-telegram' THEN 'Private Telegram channel'
    WHEN id LIKE 'perk-vip-drops-%' THEN 'Exclusive VIP updates'
    ELSE title_en
  END,
  description = CASE
    WHEN id LIKE 'perk-vip-priority-replies-%' THEN 'VIP-Kommentare und Themenwünsche werden bevorzugt berücksichtigt, ohne feste Antwortzeit.'
    WHEN id LIKE 'perk-premium-galleries-%' THEN 'Alle Basic- und Premium-Beiträge zu Musik und Sprecherarbeit während deiner Laufzeit.'
    WHEN id LIKE 'perk-premium-telegram-%' THEN 'Verbinde dein Telegram-Konto im Dashboard für persönlichen Zugang während deiner aktiven Premium- oder VIP-Mitgliedschaft.'
    WHEN id LIKE 'perk-premium-extended-%' THEN 'Ausgewählte längere Fassungen, persönliche Einblicke und Begleitbeiträge zu Musik- und Sprecherprojekten.'
    WHEN id LIKE 'perk-premium-voting-%' THEN 'Nimm an ausgewählten Abstimmungen über künftige Themen und Formate teil.'
    WHEN id LIKE 'perk-basic-gallery-%' THEN 'Begleite Jason bei Musik, Proben und Sprecherprojekten mit Basic-Beiträgen während deiner Laufzeit.'
    WHEN id LIKE 'perk-paid-comments-%' THEN 'Tausche dich unter freigeschalteten Beiträgen mit der Community aus.'
    WHEN id LIKE 'perk-premium-drops-%' THEN 'Zusätzliche Einblicke und Beiträge zur kreativen Arbeit während deiner aktiven Laufzeit.'
    WHEN id LIKE 'perk-vip-galleries-%' THEN 'Basic-, Premium- und VIP-Beiträge während deiner aktiven Laufzeit.'
    WHEN id LIKE 'perk-vip-priority-%' THEN 'Vorrangiger Zugang zu neuen VIP-Beiträgen und exklusiven Ankündigungen.'
    WHEN id LIKE 'perk-vip-whatsapp-%' THEN 'Persönlicher Kontakt im Dashboard während jeder aktiven VIP-Laufzeit.'
    WHEN id LIKE 'perk-basic-drops-%' THEN 'Neue Einblicke aus Musik und Sprecherarbeit während deiner aktiven Laufzeit.'
    WHEN id LIKE 'perk-vip-meeting-%' THEN 'Ein persönliches Treffen ist enthalten; Termin und Ort vereinbaren wir gemeinsam nach Verfügbarkeit. Reise- und Nebenkosten sind nicht enthalten.'
    WHEN id LIKE 'perk-vip-telegram' THEN 'Verbinde dein Telegram-Konto im Dashboard für persönlichen Zugang während deiner aktiven VIP-Mitgliedschaft.'
    WHEN id LIKE 'perk-vip-drops-%' THEN 'Zusätzliche persönliche Updates zu Musik und Sprecherarbeit.'
    ELSE description
  END,
  description_en = CASE
    WHEN id LIKE 'perk-vip-priority-replies-%' THEN 'VIP comments and ideas receive priority for personal replies, without a fixed response time.'
    WHEN id LIKE 'perk-premium-galleries-%' THEN 'All Basic and Premium posts about music and voice work during your membership.'
    WHEN id LIKE 'perk-premium-telegram-%' THEN 'Link your Telegram account in the dashboard for personal access during an active Premium or VIP membership.'
    WHEN id LIKE 'perk-premium-extended-%' THEN 'Selected extended editions, personal insights and companion posts about music and voice projects.'
    WHEN id LIKE 'perk-premium-voting-%' THEN 'Take part in selected votes on future themes and formats.'
    WHEN id LIKE 'perk-basic-gallery-%' THEN 'Follow Jason’s music, rehearsals and voice projects through Basic posts during your membership.'
    WHEN id LIKE 'perk-paid-comments-%' THEN 'Join the community conversation beneath posts included in your membership.'
    WHEN id LIKE 'perk-premium-drops-%' THEN 'Additional insights and updates from the creative process during your active membership.'
    WHEN id LIKE 'perk-vip-galleries-%' THEN 'Basic, Premium and VIP posts during your active membership.'
    WHEN id LIKE 'perk-vip-priority-%' THEN 'Priority access to new VIP posts and exclusive announcements.'
    WHEN id LIKE 'perk-vip-whatsapp-%' THEN 'Personal contact details in your dashboard during every active VIP membership.'
    WHEN id LIKE 'perk-basic-drops-%' THEN 'New insights into music and voice work during your active membership.'
    WHEN id LIKE 'perk-vip-meeting-%' THEN 'A personal meet-up is included; we arrange the date and place together, subject to availability. Travel and incidental expenses are not included.'
    WHEN id LIKE 'perk-vip-telegram' THEN 'Link your Telegram account in the dashboard for personal access during your active VIP membership.'
    WHEN id LIKE 'perk-vip-drops-%' THEN 'Additional personal updates about music and voice work.'
    ELSE description_en
  END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
