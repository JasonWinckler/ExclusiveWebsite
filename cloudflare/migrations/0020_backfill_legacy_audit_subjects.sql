PRAGMA foreign_keys = ON;

INSERT INTO maintenance_locks (job_name, owner_id, locked_until, updated_at)
VALUES (
  'audit-retention-delete',
  'migration:0020',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+10 minutes'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(job_name) DO UPDATE SET
  owner_id = excluded.owner_id,
  locked_until = excluded.locked_until,
  updated_at = excluded.updated_at
WHERE maintenance_locks.locked_until <= excluded.updated_at;

UPDATE admin_audit_events
SET subject_appwrite_user_id = (
  SELECT d.appwrite_user_id
  FROM registered_devices d
  WHERE d.id = admin_audit_events.target_id
)
WHERE target_type = 'REGISTERED_DEVICE'
  AND subject_appwrite_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM registered_devices d
    WHERE d.id = admin_audit_events.target_id
  );

UPDATE admin_audit_events
SET subject_appwrite_user_id = (
  SELECT d.appwrite_user_id
  FROM registered_devices d
  WHERE d.appwrite_session_id = admin_audit_events.target_id
  ORDER BY d.updated_at DESC
  LIMIT 1
)
WHERE target_type = 'APPWRITE_SESSION'
  AND subject_appwrite_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM registered_devices d
    WHERE d.appwrite_session_id = admin_audit_events.target_id
  );

UPDATE admin_audit_events
SET subject_appwrite_user_id = (
  SELECT c.appwrite_user_id
  FROM content_comments c
  WHERE c.id = admin_audit_events.target_id
)
WHERE target_type = 'CONTENT_COMMENT'
  AND subject_appwrite_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM content_comments c
    WHERE c.id = admin_audit_events.target_id
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
WHERE job_name = 'audit-retention-delete' AND owner_id = 'migration:0020';
