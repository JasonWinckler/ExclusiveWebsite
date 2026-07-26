PRAGMA foreign_keys = ON;

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-basic-gallery-' || id, id, 'Basic Gallery', 'Zugang zur kuratierten Basic Gallery während der gewählten Laufzeit.', 10, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p WHERE tier = 'EXCLUSIVE_BASIC'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-basic-gallery-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-basic-drops-' || id, id, 'Neue Basic Drops', 'Alle neuen Basic-Veröffentlichungen innerhalb der aktiven Laufzeit.', 20, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p WHERE tier = 'EXCLUSIVE_BASIC'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-basic-drops-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-premium-galleries-' || id, id, 'Basic + Premium Galleries', 'Zugang zu Basic- und Premium-Galerien während der gewählten Laufzeit.', 10, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p WHERE tier = 'EXCLUSIVE_PREMIUM'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-premium-galleries-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-premium-telegram-' || id, id, 'Privater Telegram Channel', 'Der Invite-Link wird ausschließlich während einer aktiven Premium-Berechtigung im persönlichen Dashboard freigeschaltet.', 20, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p WHERE tier = 'EXCLUSIVE_PREMIUM'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-premium-telegram-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-premium-drops-' || id, id, 'Premium Drops', 'Alle neuen Premium-Veröffentlichungen innerhalb der aktiven Laufzeit.', 30, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p WHERE tier = 'EXCLUSIVE_PREMIUM'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-premium-drops-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-vip-galleries-' || id, id, 'Alle Galleries + VIP', 'Zugang zu Basic-, Premium- und exklusiven VIP-Galerien während der gewählten Laufzeit.', 10, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p WHERE tier = 'EXCLUSIVE_VIP'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-vip-galleries-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-vip-drops-' || id, id, 'VIP-only Drops', 'VIP-exklusive Veröffentlichungen und besondere Creator-Updates während der aktiven Laufzeit.', 20, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p WHERE tier = 'EXCLUSIVE_VIP'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-vip-drops-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-vip-priority-' || id, id, 'Priority Access', 'Vorrangiger Zugang zu neuen VIP-Veröffentlichungen und exklusiven Ankündigungen.', 30, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p WHERE tier = 'EXCLUSIVE_VIP'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-vip-priority-' || p.id);

INSERT INTO product_perks (id, product_id, title, description, sort_order, active, created_at, updated_at)
SELECT 'perk-vip-meeting-' || id, id, 'Persönliches Creator Meet & Greet', 'Ein einmaliges, nicht-sexuelles Treffen nach separater Termin- und Ortsvereinbarung, ab 18 Jahren, nach Verfügbarkeit und unter Einhaltung der Sicherheitsregeln. Reise- und Nebenkosten sind nicht enthalten.', 40, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM products p WHERE sku = 'exclusive-vip-6m'
  AND NOT EXISTS (SELECT 1 FROM product_perks k WHERE k.id = 'perk-vip-meeting-' || p.id);
