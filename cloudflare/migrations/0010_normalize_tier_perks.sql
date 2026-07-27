PRAGMA foreign_keys = ON;

CREATE TABLE tier_perks (
  id TEXT PRIMARY KEY NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN (
    'EXCLUSIVE_BASIC', 'EXCLUSIVE_PREMIUM', 'EXCLUSIVE_VIP'
  )),
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tier, title)
);

CREATE INDEX tier_perks_active_idx
  ON tier_perks(tier, active, sort_order, id);

INSERT INTO tier_perks (
  id, tier, title, description, sort_order, active, created_at, updated_at
)
SELECT
  MIN(k.id),
  p.tier,
  k.title,
  MAX(k.description),
  MIN(k.sort_order),
  1,
  MIN(k.created_at),
  MAX(k.updated_at)
FROM product_perks k
INNER JOIN products p ON p.id = k.product_id
WHERE k.active = 1
GROUP BY p.tier, k.title;

DROP TABLE product_perks;
