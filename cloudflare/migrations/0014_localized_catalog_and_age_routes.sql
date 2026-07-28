PRAGMA foreign_keys = ON;

ALTER TABLE products ADD COLUMN display_name_en TEXT;
ALTER TABLE tier_perks ADD COLUMN title_en TEXT;
ALTER TABLE tier_perks ADD COLUMN description_en TEXT;

ALTER TABLE age_verification_cases
  ADD COLUMN verification_route TEXT NOT NULL DEFAULT 'MANUAL_DOCUMENT_VIDEO'
  CHECK (verification_route = 'MANUAL_DOCUMENT_VIDEO');
ALTER TABLE age_verification_cases
  ADD COLUMN document_type TEXT NOT NULL DEFAULT 'NATIONAL_ID'
  CHECK (document_type IN ('NATIONAL_ID', 'PASSPORT', 'DRIVING_LICENCE'));
ALTER TABLE age_verification_cases
  ADD COLUMN country_code_snapshot TEXT;

UPDATE products
SET display_name_en = CASE sku
  WHEN 'exclusive-basic-trial-7d' THEN 'Exclusive Basic – 7-day trial'
  WHEN 'exclusive-basic-30d' THEN 'Exclusive Basic – 30 days'
  WHEN 'exclusive-basic-6m' THEN 'Exclusive Basic – 6 months'
  WHEN 'exclusive-basic-12m' THEN 'Exclusive Basic – 12 months'
  WHEN 'exclusive-premium-30d' THEN 'Exclusive Premium – 30 days'
  WHEN 'exclusive-premium-6m' THEN 'Exclusive Premium – 6 months'
  WHEN 'exclusive-premium-12m' THEN 'Exclusive Premium – 12 months'
  WHEN 'exclusive-vip-30d' THEN 'Exclusive VIP – 30 days'
  WHEN 'exclusive-vip-6m' THEN 'Exclusive VIP – 6 months'
  WHEN 'exclusive-vip-12m' THEN 'Exclusive VIP – 12 months'
  ELSE display_name
END;

UPDATE tier_perks
SET
  title_en = CASE title
    WHEN 'Basic Gallery' THEN 'Basic Gallery'
    WHEN 'Neue Basic Drops' THEN 'New Basic drops'
    WHEN 'Basic + Premium Galleries' THEN 'Basic + Premium galleries'
    WHEN 'Privater Telegram Channel' THEN 'Private Telegram channel'
    WHEN 'Premium Drops' THEN 'Premium drops'
    WHEN 'Alle Galleries + VIP' THEN 'All galleries + VIP'
    WHEN 'VIP-only Drops' THEN 'VIP-only drops'
    WHEN 'Priority Access' THEN 'Priority access'
    WHEN 'Exclusive Member Comments' THEN 'Exclusive Member comments'
    WHEN 'Behind the Scenes & Extended Editions' THEN 'Behind the scenes & extended editions'
    WHEN 'Creator Themen-Votings' THEN 'Creator theme voting'
    WHEN 'Priority Creator Replies' THEN 'Priority creator replies'
    WHEN 'Meine private WhatsApp-Nummer' THEN 'My private WhatsApp number'
    WHEN 'Persönliches Treffen' THEN 'Personal meet-up'
    ELSE title
  END,
  description_en = CASE title
    WHEN 'Basic Gallery' THEN 'Access the curated Basic Gallery throughout your selected term.'
    WHEN 'Neue Basic Drops' THEN 'See every new Basic release published during your active term.'
    WHEN 'Basic + Premium Galleries' THEN 'Access both the Basic and Premium galleries throughout your selected term.'
    WHEN 'Privater Telegram Channel' THEN 'Your personal invite appears only in your dashboard while Premium access is active.'
    WHEN 'Premium Drops' THEN 'See every new Premium release published during your active term.'
    WHEN 'Alle Galleries + VIP' THEN 'Access Basic, Premium and the private VIP Gallery throughout your selected term.'
    WHEN 'VIP-only Drops' THEN 'Receive VIP-only releases and selected personal creator updates.'
    WHEN 'Priority Access' THEN 'Be first to see new VIP releases and private announcements.'
    WHEN 'Exclusive Member Comments' THEN 'Comment beneath unlocked posts and join the private community throughout your active term.'
    WHEN 'Behind the Scenes & Extended Editions' THEN 'Selected extended editions, personal behind-the-scenes moments and Premium-only companion posts.'
    WHEN 'Creator Themen-Votings' THEN 'Take part in selected votes on future themes and formats.'
    WHEN 'Priority Creator Replies' THEN 'VIP comments and ideas receive priority for personal replies, without a fixed response-time promise.'
    WHEN 'Meine private WhatsApp-Nummer' THEN 'Revealed only inside your personal dashboard while any VIP term is active.'
    WHEN 'Persönliches Treffen' THEN 'By arrangement – let yourself be surprised!'
    ELSE description
  END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
