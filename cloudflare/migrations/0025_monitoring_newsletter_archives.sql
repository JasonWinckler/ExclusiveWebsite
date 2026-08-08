PRAGMA foreign_keys = ON;

-- Secrets can be rotated without invalidating every account at once. Existing
-- rows deliberately remain on v1 until a successful login/MFA verification
-- upgrades them to the active key version.
ALTER TABLE auth_accounts
  ADD COLUMN password_pepper_version TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE auth_accounts
  ADD COLUMN totp_key_version TEXT NOT NULL DEFAULT 'v1';

-- Exact, immutable invoice renderings live in a private R2 bucket. D1 only
-- stores the integrity hash and private object key required for authorised
-- retrieval and statutory retention.
ALTER TABLE invoices ADD COLUMN archive_object_key TEXT;
ALTER TABLE invoices ADD COLUMN archive_sha256 TEXT;
ALTER TABLE invoices ADD COLUMN archive_content_type TEXT;
ALTER TABLE invoices ADD COLUMN archive_created_at TEXT;
CREATE UNIQUE INDEX invoices_archive_object_idx
  ON invoices(archive_object_key)
  WHERE archive_object_key IS NOT NULL;

CREATE TABLE newsletter_subscriptions (
  appwrite_user_id TEXT PRIMARY KEY NOT NULL
    REFERENCES user_profiles(appwrite_user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED')),
  locale TEXT NOT NULL DEFAULT 'de' CHECK (locale IN ('de', 'en')),
  source TEXT NOT NULL DEFAULT 'DASHBOARD'
    CHECK (source IN ('DASHBOARD', 'REGISTRATION')),
  consent_text_version TEXT NOT NULL DEFAULT 'newsletter-v1',
  consented_at TEXT,
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX newsletter_subscription_status_idx
  ON newsletter_subscriptions(status, locale, updated_at);

CREATE TABLE newsletter_action_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  appwrite_user_id TEXT NOT NULL
    REFERENCES user_profiles(appwrite_user_id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('CONFIRM', 'UNSUBSCRIBE')),
  token_sha256 TEXT NOT NULL UNIQUE CHECK (length(token_sha256) = 64),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX newsletter_action_token_expiry_idx
  ON newsletter_action_tokens(expires_at, used_at);

CREATE TABLE newsletter_campaigns (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'NEW_DROP'
    CHECK (campaign_type IN ('NEW_DROP', 'EDITORIAL')),
  content_item_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
  subject_de TEXT NOT NULL,
  subject_en TEXT NOT NULL,
  preview_de TEXT NOT NULL,
  preview_en TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'QUEUED', 'SENDING', 'COMPLETED', 'CANCELLED')),
  created_by_appwrite_user_id TEXT NOT NULL,
  queued_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX newsletter_campaign_status_idx
  ON newsletter_campaigns(status, created_at);

CREATE TABLE newsletter_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL
    REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  appwrite_user_id TEXT NOT NULL
    REFERENCES user_profiles(appwrite_user_id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('de', 'en')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT,
  last_error_code TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (campaign_id, appwrite_user_id)
);

CREATE INDEX newsletter_delivery_queue_idx
  ON newsletter_deliveries(status, next_attempt_at, created_at);

-- Privacy-preserving first-party analytics. The browser identifier is random
-- per tab session and stored only as a one-way digest; no IP, user agent,
-- account id or cross-site identifier is retained.
CREATE TABLE analytics_daily_sessions (
  day TEXT NOT NULL,
  session_sha256 TEXT NOT NULL CHECK (length(session_sha256) = 64),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 1 CHECK (page_views > 0),
  locale TEXT NOT NULL DEFAULT 'de' CHECK (locale IN ('de', 'en')),
  PRIMARY KEY (day, session_sha256)
);

CREATE INDEX analytics_daily_sessions_day_idx
  ON analytics_daily_sessions(day, last_seen_at);

CREATE TABLE analytics_daily_events (
  day TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'page_view', 'registration_started', 'registration_completed',
    'age_started', 'age_submitted', 'checkout_started', 'order_created',
    'newsletter_opt_in'
  )),
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, event_name)
);

CREATE TABLE system_job_runs (
  id TEXT PRIMARY KEY NOT NULL,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  summary_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX system_job_runs_name_idx
  ON system_job_runs(job_name, started_at DESC);

-- Telegram invitations are generated by the Bot API with member_limit=1.
-- The URL itself is encrypted; the database only exposes it through a valid
-- Premium/VIP entitlement after authentication.
CREATE TABLE telegram_invites (
  id TEXT PRIMARY KEY NOT NULL,
  appwrite_user_id TEXT NOT NULL
    REFERENCES user_profiles(appwrite_user_id) ON DELETE CASCADE,
  entitlement_id TEXT NOT NULL
    REFERENCES entitlements(id) ON DELETE CASCADE,
  invite_ciphertext TEXT NOT NULL,
  encryption_key_version TEXT NOT NULL DEFAULT 'v1',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (appwrite_user_id, entitlement_id)
);

CREATE INDEX telegram_invites_expiry_idx ON telegram_invites(expires_at);

-- Premium and VIP share the Telegram benefit. Normalising it here also fixes
-- the formerly incomplete English catalogue independently of term length.
INSERT INTO tier_perks (
  id, tier, title, description, sort_order, active, created_at, updated_at
) VALUES (
  'perk-vip-telegram',
  'EXCLUSIVE_VIP',
  'Privater Telegram-Kanal',
  'Dein persönlicher Einladungslink wird ausschließlich während einer aktiven VIP-Membership im Dashboard freigeschaltet.',
  20,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = excluded.updated_at;

UPDATE tier_perks
SET title_en = CASE
      WHEN id LIKE 'perk-basic-gallery-%' THEN 'Basic gallery'
      WHEN id LIKE 'perk-basic-drops-%' THEN 'Regular new drops'
      WHEN id LIKE 'perk-paid-comments-%' THEN 'Exclusive Member comments'
      WHEN id LIKE 'perk-premium-galleries-%' THEN 'Basic and Premium galleries'
      WHEN id LIKE 'perk-premium-telegram-%' THEN 'Private Telegram channel'
      WHEN id LIKE 'perk-premium-drops-%' THEN 'Premium releases'
      WHEN id LIKE 'perk-premium-extended-%' THEN 'Behind the scenes and extended editions'
      WHEN id LIKE 'perk-premium-voting-%' THEN 'Creator theme voting'
      WHEN id LIKE 'perk-vip-galleries-%' THEN 'All galleries plus VIP'
      WHEN id LIKE 'perk-vip-drops-%' THEN 'Exclusive VIP releases'
      WHEN id LIKE 'perk-vip-priority-replies-%' THEN 'Priority personal replies'
      WHEN id LIKE 'perk-vip-priority-%' THEN 'Priority access'
      WHEN id LIKE 'perk-vip-whatsapp-%' THEN 'Private WhatsApp contact'
      WHEN id LIKE 'perk-vip-meeting-%' THEN 'Personal meet-up'
      WHEN id = 'perk-vip-telegram' THEN 'Private Telegram channel'
      ELSE title_en
    END,
    description_en = CASE
      WHEN id LIKE 'perk-basic-gallery-%'
        THEN 'Access the curated Basic gallery throughout your selected term.'
      WHEN id LIKE 'perk-basic-drops-%'
        THEN 'See every new Basic release published during your active term.'
      WHEN id LIKE 'perk-paid-comments-%'
        THEN 'Comment beneath unlocked posts and join the private community throughout your active term.'
      WHEN id LIKE 'perk-premium-galleries-%'
        THEN 'Access both the Basic and Premium galleries throughout your selected term.'
      WHEN id LIKE 'perk-premium-telegram-%' OR id = 'perk-vip-telegram'
        THEN 'Your personal invitation is available only while your Premium or VIP membership is active.'
      WHEN id LIKE 'perk-premium-drops-%'
        THEN 'See every new Premium release published during your active term.'
      WHEN id LIKE 'perk-premium-extended-%'
        THEN 'Selected extended editions, personal behind-the-scenes moments and Premium-only companion posts.'
      WHEN id LIKE 'perk-premium-voting-%'
        THEN 'Take part in selected votes on future themes and formats.'
      WHEN id LIKE 'perk-vip-galleries-%'
        THEN 'Access Basic, Premium and the private VIP gallery throughout your selected term.'
      WHEN id LIKE 'perk-vip-drops-%'
        THEN 'Receive VIP-only releases and selected personal creator updates.'
      WHEN id LIKE 'perk-vip-priority-replies-%'
        THEN 'VIP comments and ideas receive priority for personal replies, without a fixed response-time promise.'
      WHEN id LIKE 'perk-vip-priority-%'
        THEN 'Be first to see new VIP releases and private announcements.'
      WHEN id LIKE 'perk-vip-whatsapp-%'
        THEN 'Your private VIP dashboard reveals the direct Business WhatsApp contact while your membership is active.'
      WHEN id LIKE 'perk-vip-meeting-%'
        THEN 'A personal meet-and-greet by arrangement, subject to availability and the linked meet-up terms.'
      ELSE description_en
    END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id LIKE 'perk-basic-%'
   OR id LIKE 'perk-premium-%'
   OR id LIKE 'perk-vip-%';
