PRAGMA foreign_keys = ON;

CREATE TABLE user_profiles (
  appwrite_user_id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  account_status TEXT NOT NULL DEFAULT 'EMAIL_PENDING'
    CHECK (account_status IN ('EMAIL_PENDING', 'ACTIVE', 'RESTRICTED', 'DELETION_PENDING', 'DELETED')),
  age_status TEXT NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (age_status IN ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'RETRY_REQUIRED')),
  jurisdiction_code TEXT,
  last_active_at TEXT,
  last_appwrite_access_at TEXT,
  restricted_at TEXT,
  restriction_reason TEXT,
  administrative_hold INTEGER NOT NULL DEFAULT 0 CHECK (administrative_hold IN (0, 1)),
  administrative_hold_reason TEXT,
  legal_retention_until TEXT,
  deletion_job_hold INTEGER NOT NULL DEFAULT 0 CHECK (deletion_job_hold IN (0, 1)),
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX user_profiles_status_idx ON user_profiles(account_status);
CREATE INDEX user_profiles_last_active_idx ON user_profiles(last_active_at);
CREATE INDEX user_profiles_last_appwrite_access_idx ON user_profiles(last_appwrite_access_at);
CREATE INDEX user_profiles_retention_idx ON user_profiles(legal_retention_until);

CREATE TABLE age_verification_cases (
  id TEXT PRIMARY KEY NOT NULL,
  appwrite_user_id TEXT NOT NULL REFERENCES user_profiles(appwrite_user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'RETRY_REQUIRED')),
  threshold TEXT NOT NULL DEFAULT 'OVER_18',
  review_method TEXT NOT NULL DEFAULT 'MANUAL_R2'
    CHECK (review_method = 'MANUAL_R2'),
  manual_review_status TEXT NOT NULL DEFAULT 'UPLOADING'
    CHECK (manual_review_status IN (
      'UPLOADING', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'
    )),
  instructions_version TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  liveness_challenge_json TEXT NOT NULL,
  reviewed_by_appwrite_user_id TEXT,
  review_reason TEXT,
  review_checklist_json TEXT,
  submitted_at TEXT,
  decided_at TEXT,
  upload_expires_at TEXT NOT NULL,
  expires_at TEXT,
  retention_until TEXT,
  evidence_deleted_at TEXT,
  label_sync_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (label_sync_status IN ('PENDING', 'SYNCED', 'FAILED', 'NOT_REQUIRED')),
  label_sync_last_error_code TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  submission_idempotency_key TEXT UNIQUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX age_cases_user_idx ON age_verification_cases(appwrite_user_id);
CREATE INDEX age_cases_status_idx ON age_verification_cases(status);
CREATE INDEX age_cases_expiry_idx ON age_verification_cases(expires_at);
CREATE INDEX age_cases_retention_idx ON age_verification_cases(retention_until);
CREATE INDEX age_cases_cleanup_idx ON age_verification_cases(evidence_deleted_at, retention_until);

CREATE TABLE age_verification_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  age_case_id TEXT NOT NULL REFERENCES age_verification_cases(id) ON DELETE CASCADE,
  appwrite_user_id TEXT NOT NULL REFERENCES user_profiles(appwrite_user_id) ON DELETE RESTRICT,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('DOCUMENT_FRONT', 'DOCUMENT_BACK', 'VIDEO')),
  r2_object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  object_etag TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (age_case_id, evidence_kind)
);

CREATE INDEX age_uploads_case_idx ON age_verification_uploads(age_case_id);
CREATE INDEX age_uploads_user_idx ON age_verification_uploads(appwrite_user_id);
CREATE INDEX age_uploads_deleted_idx ON age_verification_uploads(deleted_at);

CREATE TABLE products (
  id TEXT PRIMARY KEY NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN (
    'EXCLUSIVE_BASIC', 'EXCLUSIVE_PREMIUM', 'EXCLUSIVE_VIP'
  )),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  duration_unit TEXT NOT NULL CHECK (duration_unit IN ('DAYS', 'MONTHS')),
  duration_value INTEGER NOT NULL CHECK (duration_value > 0),
  purchase_limit_per_user INTEGER CHECK (purchase_limit_per_user IS NULL OR purchase_limit_per_user > 0),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX products_active_idx ON products(active, tier);

CREATE TABLE product_perks (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX product_perks_product_idx ON product_perks(product_id, active, sort_order);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  appwrite_user_id TEXT NOT NULL REFERENCES user_profiles(appwrite_user_id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  payment_method TEXT NOT NULL
    CHECK (payment_method = 'SEPA_CREDIT_TRANSFER'),
  transfer_reference TEXT NOT NULL UNIQUE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  status TEXT NOT NULL
    CHECK (status IN (
      'PENDING', 'PROCESSING', 'PAID', 'ACTIVE', 'GRACE_PERIOD', 'FAILED',
      'CANCELLED', 'EXPIRED', 'REFUNDED', 'DISPUTED', 'REVERSED'
    )),
  current_period_start TEXT,
  current_period_end TEXT,
  payment_due_at TEXT NOT NULL,
  grace_until TEXT,
  settled_at TEXT,
  settled_by_appwrite_user_id TEXT,
  settlement_note TEXT,
  dispute_open INTEGER NOT NULL DEFAULT 0 CHECK (dispute_open IN (0, 1)),
  retention_until TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX subscriptions_user_idx ON subscriptions(appwrite_user_id);
CREATE INDEX subscriptions_status_idx ON subscriptions(status);
CREATE INDEX subscriptions_payment_due_idx ON subscriptions(status, payment_due_at);
CREATE INDEX subscriptions_expiry_idx ON subscriptions(current_period_end, grace_until);
CREATE INDEX subscriptions_retention_idx ON subscriptions(retention_until);

CREATE TABLE bank_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('N26_CSV', 'BANK_API', 'CAMT053', 'ADMIN')),
  external_transaction_id TEXT NOT NULL UNIQUE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  creditor_reference TEXT,
  remittance_information TEXT,
  booked_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  matched_subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  match_status TEXT NOT NULL
    CHECK (match_status IN ('MATCHED', 'UNMATCHED', 'DUPLICATE', 'REVIEW_REQUIRED')),
  processing_error_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX bank_transactions_subscription_idx ON bank_transactions(matched_subscription_id);
CREATE INDEX bank_transactions_reference_idx ON bank_transactions(creditor_reference);
CREATE INDEX bank_transactions_status_idx ON bank_transactions(match_status, booked_at);

CREATE TABLE bank_statement_imports (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('N26_CSV', 'CAMT053')),
  file_sha256 TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  administrator_appwrite_user_id TEXT NOT NULL,
  summary_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX bank_statement_imports_created_idx ON bank_statement_imports(created_at);

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY NOT NULL,
  appwrite_user_id TEXT NOT NULL REFERENCES user_profiles(appwrite_user_id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  tier TEXT NOT NULL CHECK (tier IN (
    'EXCLUSIVE_BASIC', 'EXCLUSIVE_PREMIUM', 'EXCLUSIVE_VIP'
  )),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revocation_reason TEXT,
  source_event_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (appwrite_user_id, product_id, subscription_id)
);

CREATE INDEX entitlements_user_idx ON entitlements(appwrite_user_id);
CREATE INDEX entitlements_active_idx ON entitlements(status, expires_at);
CREATE INDEX entitlements_tier_idx ON entitlements(tier, status);

CREATE TABLE content_items (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content_status TEXT NOT NULL DEFAULT 'DISABLED'
    CHECK (content_status IN ('DISABLED', 'REVIEW', 'ACTIVE', 'RETIRED')),
  required_tier TEXT NOT NULL CHECK (required_tier IN (
    'FREE', 'EXCLUSIVE_BASIC', 'EXCLUSIVE_PREMIUM', 'EXCLUSIVE_VIP'
  )),
  jurisdiction_policy TEXT,
  storage_key TEXT UNIQUE,
  creation_idempotency_key TEXT NOT NULL UNIQUE,
  published_at TEXT,
  retired_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX content_items_status_tier_idx ON content_items(content_status, required_tier);

CREATE TABLE content_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE RESTRICT,
  r2_object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  object_etag TEXT NOT NULL,
  uploaded_by_appwrite_user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REPLACED', 'DELETED')),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX content_uploads_active_item_idx
  ON content_uploads(content_item_id) WHERE status = 'ACTIVE';
CREATE INDEX content_uploads_status_idx ON content_uploads(status, created_at);

CREATE TABLE registered_devices (
  id TEXT PRIMARY KEY NOT NULL,
  appwrite_user_id TEXT NOT NULL REFERENCES user_profiles(appwrite_user_id) ON DELETE RESTRICT,
  device_token_hash TEXT NOT NULL,
  registration_idempotency_key TEXT NOT NULL UNIQUE,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (appwrite_user_id, device_token_hash)
);

CREATE INDEX registered_devices_user_status_idx ON registered_devices(appwrite_user_id, status);
CREATE INDEX registered_devices_last_seen_idx ON registered_devices(last_seen_at);

CREATE TABLE admin_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  administrator_appwrite_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  previous_state_json TEXT,
  new_state_json TEXT,
  reason TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX admin_audit_target_idx ON admin_audit_events(target_type, target_id, created_at);
CREATE INDEX admin_audit_admin_idx ON admin_audit_events(administrator_appwrite_user_id, created_at);
CREATE INDEX admin_audit_created_idx ON admin_audit_events(created_at);

CREATE TABLE maintenance_locks (
  job_name TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  locked_until TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER admin_audit_events_no_update
BEFORE UPDATE ON admin_audit_events
BEGIN
  SELECT RAISE(ABORT, 'admin audit events are immutable');
END;

CREATE TRIGGER admin_audit_events_no_delete
BEFORE DELETE ON admin_audit_events
WHEN NOT EXISTS (
  SELECT 1 FROM maintenance_locks
  WHERE job_name = 'audit-retention-delete'
    AND locked_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
BEGIN
  SELECT RAISE(ABORT, 'admin audit events are immutable');
END;

CREATE TABLE deletion_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  appwrite_user_id TEXT NOT NULL REFERENCES user_profiles(appwrite_user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL
    CHECK (status IN ('DELETION_PENDING', 'EXECUTING', 'BLOCKED', 'FAILED', 'COMPLETED')),
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  inactivity_cutoff_at TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  retention_checks_json TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  started_at TEXT,
  completed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX deletion_jobs_open_user_idx
  ON deletion_jobs(appwrite_user_id)
  WHERE status IN ('DELETION_PENDING', 'EXECUTING', 'BLOCKED', 'FAILED');
CREATE INDEX deletion_jobs_status_schedule_idx ON deletion_jobs(status, scheduled_at);
CREATE INDEX deletion_jobs_completed_idx ON deletion_jobs(completed_at);

CREATE TABLE label_sync_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  appwrite_user_id TEXT NOT NULL REFERENCES user_profiles(appwrite_user_id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('AGE', 'ACCESS')),
  desired_label TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SYNCED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  next_retry_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX label_sync_retry_idx ON label_sync_attempts(status, next_retry_at);
CREATE INDEX label_sync_user_idx ON label_sync_attempts(appwrite_user_id);

INSERT INTO products (
  id, sku, display_name, tier, currency, amount_minor, duration_unit, duration_value,
  purchase_limit_per_user, active, version, created_at, updated_at
) VALUES
(
  'exclusive_basic_trial_7d', 'exclusive-basic-trial-7d', 'Exclusive Basic – 7 Tage Schnupperangebot',
  'EXCLUSIVE_BASIC', 'EUR', 199, 'DAYS', 7, 1, 1, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
),
(
  'exclusive_basic_30d', 'exclusive-basic-30d', 'Exclusive Basic – 30 Tage',
  'EXCLUSIVE_BASIC', 'EUR', 499, 'DAYS', 30, NULL, 1, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
),
(
  'exclusive_premium_30d', 'exclusive-premium-30d', 'Exclusive Premium – 30 Tage',
  'EXCLUSIVE_PREMIUM', 'EUR', 1999, 'DAYS', 30, NULL, 1, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
),
(
  'exclusive_vip_30d', 'exclusive-vip-30d', 'Exclusive VIP – 30 Tage',
  'EXCLUSIVE_VIP', 'EUR', 4999, 'DAYS', 30, NULL, 1, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
),
(
  'exclusive_basic_6m', 'exclusive-basic-6m', 'Exclusive Basic – 6 Monate',
  'EXCLUSIVE_BASIC', 'EUR', 2499, 'MONTHS', 6, NULL, 1, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
),
(
  'exclusive_basic_12m', 'exclusive-basic-12m', 'Exclusive Basic – 12 Monate',
  'EXCLUSIVE_BASIC', 'EUR', 4999, 'MONTHS', 12, NULL, 1, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
),
(
  'exclusive_premium_6m', 'exclusive-premium-6m', 'Exclusive Premium – 6 Monate',
  'EXCLUSIVE_PREMIUM', 'EUR', 9999, 'MONTHS', 6, NULL, 1, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
),
(
  'exclusive_premium_12m', 'exclusive-premium-12m', 'Exclusive Premium – 12 Monate',
  'EXCLUSIVE_PREMIUM', 'EUR', 14999, 'MONTHS', 12, NULL, 1, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
),
(
  'exclusive_vip_6m', 'exclusive-vip-6m', 'Exclusive VIP – 6 Monate',
  'EXCLUSIVE_VIP', 'EUR', 19999, 'MONTHS', 6, NULL, 1, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
),
(
  'exclusive_vip_12m', 'exclusive-vip-12m', 'Exclusive VIP – 12 Monate',
  'EXCLUSIVE_VIP', 'EUR', 39999, 'MONTHS', 12, NULL, 1, 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
