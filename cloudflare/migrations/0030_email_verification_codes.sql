-- Registration email code and fallback link share one single-use challenge.
-- Only a keyed digest is persisted; the six-digit value never enters D1.
ALTER TABLE auth_action_tokens ADD COLUMN code_sha256 TEXT
  CHECK (code_sha256 IS NULL OR length(code_sha256) = 64);
ALTER TABLE auth_action_tokens ADD COLUMN code_pepper_version TEXT;
ALTER TABLE auth_action_tokens ADD COLUMN code_attempts INTEGER NOT NULL DEFAULT 0
  CHECK (code_attempts BETWEEN 0 AND 5);
ALTER TABLE auth_action_tokens ADD COLUMN resend_after TEXT;
ALTER TABLE auth_action_tokens ADD COLUMN consumed_by TEXT;
CREATE INDEX auth_action_tokens_verification_cooldown_idx
  ON auth_action_tokens(user_id, purpose, created_at);
