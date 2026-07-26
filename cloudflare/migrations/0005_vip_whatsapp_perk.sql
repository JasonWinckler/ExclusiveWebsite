PRAGMA foreign_keys = ON;

INSERT INTO product_perks (
  id, product_id, title, description, sort_order, active, created_at, updated_at
)
SELECT
  'perk-vip-whatsapp-' || id,
  id,
  'Meine private WhatsApp-Nummer',
  'Wird ausschließlich nach Bezahlung im persönlichen Dashboard für die aktive VIP-30-Tage-Laufzeit freigeschaltet.',
  35,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p
WHERE sku = 'exclusive-vip-30d'
  AND NOT EXISTS (
    SELECT 1 FROM product_perks k
    WHERE k.id = 'perk-vip-whatsapp-' || p.id
  );
