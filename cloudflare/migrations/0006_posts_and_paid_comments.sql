PRAGMA foreign_keys = ON;

ALTER TABLE content_items ADD COLUMN body_text TEXT NOT NULL DEFAULT '';
ALTER TABLE content_items ADD COLUMN allow_comments INTEGER NOT NULL DEFAULT 1 CHECK (allow_comments IN (0, 1));

CREATE TABLE content_comments (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL,
  appwrite_user_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1200),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'HIDDEN', 'DELETED')),
  idempotency_key TEXT NOT NULL,
  moderated_by_appwrite_user_id TEXT,
  moderation_reason TEXT,
  moderated_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
  FOREIGN KEY (appwrite_user_id) REFERENCES user_profiles(appwrite_user_id) ON DELETE CASCADE,
  UNIQUE (appwrite_user_id, idempotency_key)
);

CREATE INDEX idx_content_comments_item_status_created
  ON content_comments(content_item_id, status, created_at DESC);
CREATE INDEX idx_content_comments_user_created
  ON content_comments(appwrite_user_id, created_at DESC);
