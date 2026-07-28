PRAGMA foreign_keys = ON;

ALTER TABLE user_profiles
  ADD COLUMN username_change_count INTEGER NOT NULL DEFAULT 0
  CHECK (username_change_count >= 0);
ALTER TABLE user_profiles ADD COLUMN username_last_changed_at TEXT;
ALTER TABLE user_profiles ADD COLUMN username_next_change_at TEXT;
ALTER TABLE user_profiles
  ADD COLUMN username_sync_status TEXT NOT NULL DEFAULT 'SYNCED'
  CHECK (username_sync_status IN ('PENDING', 'SYNCED', 'FAILED'));
ALTER TABLE user_profiles
  ADD COLUMN username_sync_attempt_count INTEGER NOT NULL DEFAULT 0
  CHECK (username_sync_attempt_count >= 0);
ALTER TABLE user_profiles ADD COLUMN username_sync_next_retry_at TEXT;
ALTER TABLE user_profiles ADD COLUMN username_sync_last_error_code TEXT;
ALTER TABLE user_profiles ADD COLUMN username_last_idempotency_key TEXT;

CREATE UNIQUE INDEX user_profiles_username_idempotency_idx
  ON user_profiles(username_last_idempotency_key)
  WHERE username_last_idempotency_key IS NOT NULL;
CREATE INDEX user_profiles_username_sync_idx
  ON user_profiles(username_sync_status, username_sync_next_retry_at);

ALTER TABLE auth_email_tokens ADD COLUMN email_accepted_at TEXT;
ALTER TABLE auth_email_tokens
  ADD COLUMN email_attempt_count INTEGER NOT NULL DEFAULT 0
  CHECK (email_attempt_count >= 0);
ALTER TABLE auth_email_tokens ADD COLUMN email_last_error_code TEXT;

CREATE INDEX auth_email_tokens_delivery_idx
  ON auth_email_tokens(email_status, created_at);
