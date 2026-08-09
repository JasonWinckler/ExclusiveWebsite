PRAGMA foreign_keys = ON;

-- A Telegram account is linked only after the member starts the bot with a
-- short-lived, one-time claim token. We intentionally store neither a
-- Telegram username nor profile data; the stable numeric Telegram user ID is
-- the minimum required to grant and later revoke channel access.
CREATE TABLE telegram_connections (
  appwrite_user_id TEXT PRIMARY KEY NOT NULL
    REFERENCES user_profiles(appwrite_user_id) ON DELETE CASCADE,
  telegram_user_id TEXT NOT NULL UNIQUE
    CHECK (telegram_user_id GLOB '[0-9]*' AND length(telegram_user_id) BETWEEN 1 AND 24),
  entitlement_id TEXT
    REFERENCES entitlements(id) ON DELETE SET NULL,
  status TEXT NOT NULL
    CHECK (status IN (
      'LINKED', 'INVITE_SENT', 'ACTIVE', 'MEMBERSHIP_INACTIVE',
      'LEFT', 'ADMIN_SUSPENDED', 'ERROR'
    )),
  linked_at TEXT NOT NULL,
  joined_at TEXT,
  removed_at TEXT,
  access_email_sent_at TEXT,
  last_invite_created_at TEXT,
  last_synced_at TEXT NOT NULL,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX telegram_connections_status_idx
  ON telegram_connections(status, updated_at);
CREATE INDEX telegram_connections_entitlement_idx
  ON telegram_connections(entitlement_id);

-- Only the SHA-256 digest is retained. The raw claim token exists solely in
-- the member's browser and Telegram deep-link and is removed from D1 after use.
CREATE TABLE telegram_link_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  appwrite_user_id TEXT NOT NULL
    REFERENCES user_profiles(appwrite_user_id) ON DELETE CASCADE,
  entitlement_id TEXT NOT NULL
    REFERENCES entitlements(id) ON DELETE CASCADE,
  token_sha256 TEXT NOT NULL UNIQUE CHECK (length(token_sha256) = 64),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX telegram_link_tokens_user_idx
  ON telegram_link_tokens(appwrite_user_id, expires_at);
CREATE INDEX telegram_link_tokens_expiry_idx
  ON telegram_link_tokens(expires_at);

-- Existing invite rows remain encrypted at rest. These additional fields bind
-- every new link to one Telegram account and allow webhook verification.
ALTER TABLE telegram_invites ADD COLUMN telegram_user_id TEXT;
ALTER TABLE telegram_invites ADD COLUMN invite_link_sha256 TEXT;
ALTER TABLE telegram_invites ADD COLUMN status TEXT NOT NULL DEFAULT 'ISSUED';
ALTER TABLE telegram_invites ADD COLUMN used_at TEXT;
ALTER TABLE telegram_invites ADD COLUMN revoked_at TEXT;
ALTER TABLE telegram_invites ADD COLUMN last_error_code TEXT;
ALTER TABLE telegram_invites ADD COLUMN updated_at TEXT;

CREATE UNIQUE INDEX telegram_invites_link_hash_idx
  ON telegram_invites(invite_link_sha256)
  WHERE invite_link_sha256 IS NOT NULL;
CREATE INDEX telegram_invites_status_idx
  ON telegram_invites(status, expires_at);

-- Operational monitoring is daily and aggregate-only: it carries no account,
-- Telegram, device or network identifier.
CREATE TABLE telegram_daily_metrics (
  day TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'CLAIM_CREATED', 'BOT_LINKED', 'INVITE_CREATED', 'INVITE_USED',
    'INVITE_REVOKED', 'MEMBER_REMOVED', 'MEMBER_RESTORED', 'API_FAILED'
  )),
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (day, event_name)
);

