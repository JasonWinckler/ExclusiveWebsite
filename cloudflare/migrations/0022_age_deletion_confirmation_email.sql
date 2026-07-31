PRAGMA foreign_keys = ON;

ALTER TABLE age_verification_cases
  ADD COLUMN deletion_confirmation_email_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE'
  CHECK (
    deletion_confirmation_email_status IN (
      'NOT_APPLICABLE',
      'PENDING',
      'SENDING',
      'SENT',
      'FAILED'
    )
  );

ALTER TABLE age_verification_cases
  ADD COLUMN deletion_confirmation_email_message_id TEXT;

ALTER TABLE age_verification_cases
  ADD COLUMN deletion_confirmation_email_attempted_at TEXT;

ALTER TABLE age_verification_cases
  ADD COLUMN deletion_confirmation_email_sent_at TEXT;

ALTER TABLE age_verification_cases
  ADD COLUMN deletion_confirmation_email_last_error_code TEXT;

CREATE INDEX age_cases_deletion_confirmation_email_idx
  ON age_verification_cases(
    deletion_confirmation_email_status,
    evidence_deleted_at,
    updated_at
  );
