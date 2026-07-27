PRAGMA foreign_keys = ON;

CREATE TABLE auth_email_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  appwrite_user_id TEXT NOT NULL
    REFERENCES user_profiles(appwrite_user_id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD')),
  token_sha256 TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'USED', 'EXPIRED', 'REVOKED')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  email_message_id TEXT,
  email_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (email_status IN ('PENDING', 'SENT', 'FAILED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX auth_email_tokens_user_purpose_idx
  ON auth_email_tokens(appwrite_user_id, purpose, status, created_at);
CREATE INDEX auth_email_tokens_expiry_idx
  ON auth_email_tokens(status, expires_at);
CREATE INDEX user_profiles_email_nocase_idx
  ON user_profiles(email COLLATE NOCASE);
