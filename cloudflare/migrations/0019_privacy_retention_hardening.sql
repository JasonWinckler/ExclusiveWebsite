PRAGMA foreign_keys = ON;

ALTER TABLE admin_audit_events
  ADD COLUMN subject_appwrite_user_id TEXT;

ALTER TABLE admin_audit_events
  ADD COLUMN subject_erasure_due_at TEXT;

CREATE INDEX admin_audit_subject_retention_idx
  ON admin_audit_events(subject_appwrite_user_id, subject_erasure_due_at);

ALTER TABLE age_verification_cases
  ADD COLUMN decision_metadata_erasure_due_at TEXT;

CREATE INDEX age_cases_decision_metadata_retention_idx
  ON age_verification_cases(decision_metadata_erasure_due_at);

DROP TRIGGER admin_audit_events_no_update;

CREATE TRIGGER admin_audit_events_no_update
BEFORE UPDATE ON admin_audit_events
WHEN NOT EXISTS (
  SELECT 1 FROM maintenance_locks
  WHERE job_name = 'audit-retention-delete'
    AND locked_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
BEGIN
  SELECT RAISE(ABORT, 'admin audit events are immutable');
END;

INSERT INTO maintenance_locks (job_name, owner_id, locked_until, updated_at)
VALUES (
  'audit-retention-delete',
  'migration:0019',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+10 minutes'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(job_name) DO UPDATE SET
  owner_id = excluded.owner_id,
  locked_until = excluded.locked_until,
  updated_at = excluded.updated_at
WHERE maintenance_locks.locked_until <= excluded.updated_at;

UPDATE age_verification_cases
SET decision_metadata_erasure_due_at =
  strftime('%Y-%m-%dT%H:%M:%fZ', decided_at, '+30 days')
WHERE decided_at IS NOT NULL
  AND decision_metadata_erasure_due_at IS NULL;

UPDATE admin_audit_events
SET subject_appwrite_user_id = target_id
WHERE target_type = 'USER' AND subject_appwrite_user_id IS NULL;

UPDATE admin_audit_events
SET subject_appwrite_user_id = (
  SELECT c.appwrite_user_id
  FROM age_verification_cases c
  WHERE c.id = admin_audit_events.target_id
)
WHERE target_type = 'AGE_CASE'
  AND subject_appwrite_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM age_verification_cases c
    WHERE c.id = admin_audit_events.target_id
  );

UPDATE admin_audit_events
SET subject_appwrite_user_id = (
  SELECT u.appwrite_user_id
  FROM age_verification_uploads u
  WHERE u.id = admin_audit_events.target_id
)
WHERE target_type = 'AGE_EVIDENCE'
  AND subject_appwrite_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM age_verification_uploads u
    WHERE u.id = admin_audit_events.target_id
  );

UPDATE admin_audit_events
SET subject_appwrite_user_id = (
  SELECT s.appwrite_user_id
  FROM subscriptions s
  WHERE s.id = admin_audit_events.target_id
)
WHERE target_type = 'SUBSCRIPTION'
  AND subject_appwrite_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.id = admin_audit_events.target_id
  );

UPDATE admin_audit_events
SET subject_appwrite_user_id = (
  SELECT r.appwrite_user_id
  FROM privacy_requests r
  WHERE r.id = admin_audit_events.target_id
)
WHERE target_type = 'PRIVACY_REQUEST'
  AND subject_appwrite_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM privacy_requests r
    WHERE r.id = admin_audit_events.target_id
  );

UPDATE admin_audit_events
SET subject_appwrite_user_id = (
  SELECT a.appwrite_user_id
  FROM label_sync_attempts a
  WHERE a.id = admin_audit_events.target_id
)
WHERE target_type = 'LABEL_SYNC_ATTEMPT'
  AND subject_appwrite_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM label_sync_attempts a
    WHERE a.id = admin_audit_events.target_id
  );

UPDATE admin_audit_events
SET subject_erasure_due_at = (
  SELECT strftime('%Y-%m-%dT%H:%M:%fZ', p.deleted_at, '+30 days')
  FROM user_profiles p
  WHERE p.appwrite_user_id = admin_audit_events.subject_appwrite_user_id
    AND p.account_status = 'DELETED'
    AND p.deleted_at IS NOT NULL
)
WHERE subject_appwrite_user_id IS NOT NULL
  AND subject_erasure_due_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM user_profiles p
    WHERE p.appwrite_user_id = admin_audit_events.subject_appwrite_user_id
      AND p.account_status = 'DELETED'
      AND p.deleted_at IS NOT NULL
  );

DELETE FROM maintenance_locks
WHERE job_name = 'audit-retention-delete' AND owner_id = 'migration:0019';
