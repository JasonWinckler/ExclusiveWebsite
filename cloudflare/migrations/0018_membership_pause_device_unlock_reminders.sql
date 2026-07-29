PRAGMA foreign_keys = ON;

-- Before this release, "remove device" wrote REVOKED and therefore blocked that
-- browser permanently. Those rows were not explicit security locks and can be
-- removed safely so the browser may register again after a normal sign-in.
DELETE FROM registered_devices WHERE status = 'REVOKED';

ALTER TABLE registered_devices ADD COLUMN appwrite_session_id TEXT;
CREATE INDEX registered_devices_session_idx
  ON registered_devices(appwrite_user_id, appwrite_session_id);

ALTER TABLE entitlements ADD COLUMN paused_at TEXT;
ALTER TABLE entitlements ADD COLUMN paused_remaining_seconds INTEGER
  CHECK (paused_remaining_seconds IS NULL OR paused_remaining_seconds > 0);
ALTER TABLE entitlements ADD COLUMN paused_by_entitlement_id TEXT;
ALTER TABLE entitlements ADD COLUMN resume_at TEXT;

ALTER TABLE entitlements
  ADD COLUMN renewal_reminder_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (renewal_reminder_status IN ('PENDING', 'SENT', 'FAILED'));
ALTER TABLE entitlements ADD COLUMN renewal_reminder_message_id TEXT;
ALTER TABLE entitlements ADD COLUMN renewal_reminder_sent_at TEXT;
ALTER TABLE entitlements ADD COLUMN renewal_reminder_last_error_code TEXT;

CREATE INDEX entitlements_pause_idx
  ON entitlements(appwrite_user_id, paused_at, resume_at, expires_at);
CREATE INDEX entitlements_renewal_reminder_idx
  ON entitlements(renewal_reminder_status, status, expires_at);
