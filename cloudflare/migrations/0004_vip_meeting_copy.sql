PRAGMA foreign_keys = ON;

UPDATE product_perks
SET
  title = 'Persönliches Treffen',
  description = 'Nach Vereinbarung – lass dich überraschen!',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id IN (
  SELECT 'perk-vip-meeting-' || id
  FROM products
  WHERE sku = 'exclusive-vip-6m'
);
