PRAGMA foreign_keys = ON;

INSERT INTO product_perks (
  id, product_id, title, description, sort_order, active, created_at, updated_at
)
SELECT
  'perk-vip-whatsapp-' || p.id,
  p.id,
  'Meine private WhatsApp-Nummer',
  'Wird ausschließlich nach Bezahlung im persönlichen Dashboard für jede aktive VIP-Laufzeit freigeschaltet.',
  35,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p
WHERE p.tier = 'EXCLUSIVE_VIP'
  AND NOT EXISTS (
    SELECT 1 FROM product_perks k
    WHERE k.id = 'perk-vip-whatsapp-' || p.id
  );

UPDATE product_perks
SET title = 'Meine private WhatsApp-Nummer',
    description = 'Wird ausschließlich nach Bezahlung im persönlichen Dashboard für jede aktive VIP-Laufzeit freigeschaltet.',
    sort_order = 35,
    active = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id IN (
  SELECT 'perk-vip-whatsapp-' || id
  FROM products
  WHERE tier = 'EXCLUSIVE_VIP'
);
