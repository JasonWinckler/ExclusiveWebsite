-- Persist the exact legal acceptance recorded when a payment order is created.
ALTER TABLE subscriptions ADD COLUMN terms_version TEXT;
ALTER TABLE subscriptions ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE subscriptions ADD COLUMN digital_content_consent_at TEXT;
ALTER TABLE subscriptions ADD COLUMN withdrawal_acknowledged_at TEXT;

CREATE INDEX IF NOT EXISTS idx_subscriptions_terms_version
  ON subscriptions(terms_version, created_at);
