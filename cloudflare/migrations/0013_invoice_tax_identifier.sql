PRAGMA foreign_keys = ON;

ALTER TABLE invoices ADD COLUMN seller_tax_identifier TEXT;
