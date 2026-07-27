ALTER TABLE user_profiles ADD COLUMN country_code TEXT;
ALTER TABLE user_profiles ADD COLUMN region_code TEXT;
ALTER TABLE user_profiles ADD COLUMN privacy_regime TEXT;
ALTER TABLE user_profiles ADD COLUMN privacy_notice_version TEXT;
ALTER TABLE user_profiles ADD COLUMN privacy_notice_acknowledged_at TEXT;
ALTER TABLE user_profiles ADD COLUMN marketing_opt_out INTEGER NOT NULL DEFAULT 0
  CHECK (marketing_opt_out IN (0, 1));
ALTER TABLE user_profiles ADD COLUMN sale_share_opt_out INTEGER NOT NULL DEFAULT 0
  CHECK (sale_share_opt_out IN (0, 1));
ALTER TABLE user_profiles ADD COLUMN targeted_ads_opt_out INTEGER NOT NULL DEFAULT 0
  CHECK (targeted_ads_opt_out IN (0, 1));
ALTER TABLE user_profiles ADD COLUMN profiling_opt_out INTEGER NOT NULL DEFAULT 0
  CHECK (profiling_opt_out IN (0, 1));
ALTER TABLE user_profiles ADD COLUMN sensitive_data_limit INTEGER NOT NULL DEFAULT 0
  CHECK (sensitive_data_limit IN (0, 1));
ALTER TABLE user_profiles ADD COLUMN privacy_choices_updated_at TEXT;

CREATE INDEX user_profiles_country_region_idx
  ON user_profiles(country_code, region_code);

CREATE TABLE privacy_requests (
  id TEXT PRIMARY KEY NOT NULL,
  appwrite_user_id TEXT NOT NULL
    REFERENCES user_profiles(appwrite_user_id) ON DELETE RESTRICT,
  request_type TEXT NOT NULL
    CHECK (request_type IN (
      'ERASURE',
      'RESTRICT_PROCESSING',
      'OBJECT_PROCESSING',
      'APPEAL'
    )),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_REVIEW', 'COMPLETED', 'DENIED', 'CANCELLED')),
  request_note TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  privacy_regime TEXT NOT NULL,
  statutory_deadline_at TEXT NOT NULL,
  response_summary TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX privacy_requests_open_type_idx
  ON privacy_requests(appwrite_user_id, request_type)
  WHERE status IN ('PENDING', 'IN_REVIEW');

CREATE INDEX privacy_requests_user_created_idx
  ON privacy_requests(appwrite_user_id, created_at DESC);

CREATE INDEX privacy_requests_status_deadline_idx
  ON privacy_requests(status, statutory_deadline_at);
