PRAGMA foreign_keys = ON;

ALTER TABLE age_verification_cases ADD COLUMN review_expires_at TEXT;

CREATE INDEX age_cases_review_expiry_idx
  ON age_verification_cases(status, manual_review_status, review_expires_at);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  administrator_appwrite_user_id TEXT NOT NULL
    REFERENCES user_profiles(appwrite_user_id) ON DELETE CASCADE,
  session_token_sha256 TEXT NOT NULL UNIQUE,
  device_token_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent_label TEXT,
  CHECK (length(session_token_sha256) = 64),
  CHECK (length(device_token_sha256) = 64)
);

CREATE INDEX admin_sessions_active_idx
  ON admin_sessions(administrator_appwrite_user_id, expires_at, revoked_at);

