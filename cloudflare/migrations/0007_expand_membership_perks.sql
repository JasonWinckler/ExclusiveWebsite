PRAGMA foreign_keys = ON;

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-paid-comments-' || id, id, 'Paid Member Comments',
  'Kommentiere freigeschaltete Beiträge und werde Teil der privaten Community während deiner aktiven Laufzeit.',
  25, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-paid-comments-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-premium-extended-' || id, id, 'Behind the Scenes & Extended Editions',
  'Ausgewählte längere Fassungen, persönliche Einblicke und Premium-exklusive Begleitposts.',
  35, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p
WHERE tier = 'EXCLUSIVE_PREMIUM'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-premium-extended-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-premium-voting-' || id, id, 'Creator Themen-Votings',
  'Premium-Mitglieder werden in ausgewählte Themen- und Formatentscheidungen einbezogen.',
  40, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p
WHERE tier = 'EXCLUSIVE_PREMIUM'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-premium-voting-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-vip-priority-replies-' || id, id, 'Priority Creator Replies',
  'VIP-Kommentare und Themenwünsche werden bei meinen persönlichen Antworten bevorzugt berücksichtigt – ohne starre Antwortzeit.',
  35, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p
WHERE tier = 'EXCLUSIVE_VIP'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-vip-priority-replies-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-vip-meeting-' || id, id, 'Persönliches Treffen',
  'Nach Vereinbarung – lass dich überraschen!',
  45, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p
WHERE tier = 'EXCLUSIVE_VIP'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-vip-meeting-' || p.id);

UPDATE product_perks
SET title = 'Persönliches Treffen',
    description = 'Nach Vereinbarung – lass dich überraschen!',
    sort_order = 45,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id IN (
  SELECT 'perk-vip-meeting-' || id FROM products WHERE tier = 'EXCLUSIVE_VIP'
);
