PRAGMA foreign_keys = ON;

INSERT INTO maintenance_locks (job_name, owner_id, locked_until, updated_at)
VALUES (
  'audit-retention-delete',
  'migration:0021',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+10 minutes'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(job_name) DO UPDATE SET
  owner_id = excluded.owner_id,
  locked_until = excluded.locked_until,
  updated_at = excluded.updated_at
WHERE maintenance_locks.locked_until <= excluded.updated_at;

DELETE FROM admin_audit_events
WHERE target_type = 'REGISTERED_DEVICE'
  AND subject_appwrite_user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM registered_devices d
    WHERE d.id = admin_audit_events.target_id
  );

DELETE FROM admin_audit_events
WHERE target_type = 'APPWRITE_SESSION'
  AND subject_appwrite_user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM registered_devices d
    WHERE d.appwrite_session_id = admin_audit_events.target_id
  );

DELETE FROM admin_audit_events
WHERE target_type = 'CONTENT_COMMENT'
  AND subject_appwrite_user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_comments c
    WHERE c.id = admin_audit_events.target_id
  );

DELETE FROM maintenance_locks
WHERE job_name = 'audit-retention-delete' AND owner_id = 'migration:0021';
