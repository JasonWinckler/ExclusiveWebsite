PRAGMA foreign_keys = ON;

ALTER TABLE deletion_jobs ADD COLUMN request_source TEXT NOT NULL DEFAULT 'AUTOMATIC'
  CHECK (request_source IN ('AUTOMATIC', 'USER_ERASURE', 'ADMIN_ERASURE'));

CREATE INDEX deletion_jobs_source_status_idx
  ON deletion_jobs(request_source, status, scheduled_at);

UPDATE tier_perks
SET title = 'Exclusive Member Comments',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE title = 'Paid Member Comments';
