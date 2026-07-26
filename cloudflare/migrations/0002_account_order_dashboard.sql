PRAGMA foreign_keys = ON;

ALTER TABLE subscriptions ADD COLUMN billing_name TEXT;
ALTER TABLE subscriptions ADD COLUMN billing_street TEXT;
ALTER TABLE subscriptions ADD COLUMN billing_postal_code TEXT;
ALTER TABLE subscriptions ADD COLUMN billing_city TEXT;
ALTER TABLE subscriptions ADD COLUMN billing_country_code TEXT;
ALTER TABLE subscriptions ADD COLUMN customer_locale TEXT NOT NULL DEFAULT 'de'
  CHECK (customer_locale IN ('de', 'en'));
ALTER TABLE subscriptions ADD COLUMN cancelled_at TEXT;
ALTER TABLE subscriptions ADD COLUMN cancellation_source TEXT
  CHECK (cancellation_source IS NULL OR cancellation_source IN ('CUSTOMER', 'ADMIN', 'SYSTEM'));
ALTER TABLE subscriptions ADD COLUMN cancellation_reason TEXT;
ALTER TABLE subscriptions ADD COLUMN archived_at TEXT;
ALTER TABLE subscriptions ADD COLUMN archived_by_appwrite_user_id TEXT;
ALTER TABLE subscriptions ADD COLUMN archive_reason TEXT;

CREATE INDEX subscriptions_user_visible_idx
  ON subscriptions(appwrite_user_id, archived_at, created_at);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY NOT NULL,
  subscription_id TEXT NOT NULL UNIQUE REFERENCES subscriptions(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'PAID', 'CANCELLED', 'VOID')),
  billing_name TEXT NOT NULL,
  billing_street TEXT NOT NULL,
  billing_postal_code TEXT NOT NULL,
  billing_city TEXT NOT NULL,
  billing_country_code TEXT NOT NULL,
  seller_name TEXT NOT NULL,
  seller_address TEXT NOT NULL,
  seller_email TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  tax_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  tax_note TEXT,
  issued_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  paid_at TEXT,
  cancelled_at TEXT,
  email_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (email_status IN ('PENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED')),
  email_message_id TEXT,
  email_last_error_code TEXT,
  emailed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX invoices_status_due_idx ON invoices(status, due_at);
CREATE INDEX invoices_email_status_idx ON invoices(email_status, created_at);
