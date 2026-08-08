PRAGMA foreign_keys = ON;

-- Cloudflare-native identity. The legacy appwrite_user_id column remains the
-- stable internal subject identifier so every existing business record keeps
-- its owner without an error-prone table rewrite.
CREATE TABLE auth_accounts (
  user_id TEXT PRIMARY KEY NOT NULL
    REFERENCES user_profiles(appwrite_user_id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT,
  password_salt TEXT,
  password_iterations INTEGER NOT NULL DEFAULT 600000
    CHECK (password_iterations BETWEEN 100000 AND 2000000),
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  mfa_required INTEGER NOT NULL DEFAULT 0 CHECK (mfa_required IN (0, 1)),
  mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0, 1)),
  totp_secret_ciphertext TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until TEXT,
  migration_required INTEGER NOT NULL DEFAULT 0 CHECK (migration_required IN (0, 1)),
  password_changed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX auth_accounts_role_idx ON auth_accounts(role, mfa_required);
CREATE INDEX auth_accounts_lock_idx ON auth_accounts(locked_until);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_accounts(user_id) ON DELETE CASCADE,
  token_sha256 TEXT NOT NULL UNIQUE CHECK (length(token_sha256) = 64),
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'MFA_PENDING')),
  device_id TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT,
  user_agent_label TEXT
);

CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions(user_id, revoked_at, expires_at, state);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at, revoked_at);

CREATE TABLE auth_action_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_accounts(user_id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'VERIFY_EMAIL', 'RESET_PASSWORD', 'CHANGE_EMAIL'
  )),
  token_sha256 TEXT NOT NULL UNIQUE CHECK (length(token_sha256) = 64),
  pending_email TEXT COLLATE NOCASE,
  locale TEXT NOT NULL DEFAULT 'de' CHECK (locale IN ('de', 'en')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX auth_action_tokens_user_idx
  ON auth_action_tokens(user_id, purpose, used_at, expires_at);
CREATE INDEX auth_action_tokens_expiry_idx
  ON auth_action_tokens(expires_at, used_at);

CREATE TABLE auth_recovery_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_accounts(user_id) ON DELETE CASCADE,
  code_sha256 TEXT NOT NULL UNIQUE CHECK (length(code_sha256) = 64),
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX auth_recovery_codes_user_idx
  ON auth_recovery_codes(user_id, used_at);

-- Preserve all projected users. Passwords are deliberately not copied because
-- Appwrite never exposes them; a one-time password reset completes migration.
INSERT INTO auth_accounts (
  user_id, email, role, mfa_required, migration_required, created_at, updated_at
)
SELECT
  p.appwrite_user_id,
  p.email,
  CASE WHEN EXISTS (
    SELECT 1 FROM admin_sessions a
    WHERE a.administrator_appwrite_user_id = p.appwrite_user_id
  ) THEN 'ADMIN' ELSE 'USER' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM admin_sessions a
    WHERE a.administrator_appwrite_user_id = p.appwrite_user_id
  ) THEN 1 ELSE 0 END,
  1,
  p.created_at,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM user_profiles p
WHERE p.account_status <> 'DELETED'
ON CONFLICT(user_id) DO NOTHING;
