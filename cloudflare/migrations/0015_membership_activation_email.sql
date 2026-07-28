PRAGMA foreign_keys = ON;

ALTER TABLE user_profiles
  ADD COLUMN preferred_locale TEXT NOT NULL DEFAULT 'de'
  CHECK (preferred_locale IN ('de', 'en'));

ALTER TABLE entitlements
  ADD COLUMN activation_email_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE'
  CHECK (activation_email_status IN ('NOT_APPLICABLE', 'PENDING', 'SENT', 'FAILED'));
ALTER TABLE entitlements ADD COLUMN activation_email_message_id TEXT;
ALTER TABLE entitlements ADD COLUMN activation_email_sent_at TEXT;
ALTER TABLE entitlements ADD COLUMN activation_email_last_error_code TEXT;

CREATE INDEX entitlements_activation_email_idx
  ON entitlements(activation_email_status, created_at);
