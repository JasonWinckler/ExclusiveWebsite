PRAGMA foreign_keys = ON;

-- Keep one normalized perk row per tier while presenting polished, localized
-- copy from the shared catalog in every client.
UPDATE tier_perks
SET
  title = CASE
    WHEN id LIKE 'perk-basic-gallery-%' THEN 'Basic-Galerie'
    WHEN id LIKE 'perk-basic-drops-%' THEN 'Neue Basic-Veröffentlichungen'
    WHEN id LIKE 'perk-paid-comments-%' THEN 'Kommentare für Exclusive Member'
    WHEN id LIKE 'perk-premium-galleries-%' THEN 'Basic- und Premium-Galerien'
    WHEN id LIKE 'perk-premium-telegram-%' THEN 'Privater Telegram-Kanal'
    WHEN id LIKE 'perk-premium-drops-%' THEN 'Premium-Veröffentlichungen'
    WHEN id LIKE 'perk-premium-extended-%' THEN 'Hinter den Kulissen & erweiterte Editionen'
    WHEN id LIKE 'perk-premium-voting-%' THEN 'Creator-Themen-Votings'
    WHEN id LIKE 'perk-vip-galleries-%' THEN 'Alle Galerien + VIP'
    WHEN id LIKE 'perk-vip-drops-%' THEN 'Exklusive VIP-Veröffentlichungen'
    WHEN id LIKE 'perk-vip-priority-%' AND id NOT LIKE 'perk-vip-priority-replies-%' THEN 'Bevorzugter Zugang'
    WHEN id LIKE 'perk-vip-priority-replies-%' THEN 'Priorisierte persönliche Antworten'
    WHEN id LIKE 'perk-vip-whatsapp-%' THEN 'Meine private WhatsApp-Nummer'
    WHEN id LIKE 'perk-vip-meeting-%' THEN 'Persönliches Treffen'
    ELSE title
  END,
  description = CASE
    WHEN id LIKE 'perk-basic-gallery-%' THEN 'Zugang zur kuratierten Basic-Galerie während der gewählten Laufzeit.'
    WHEN id LIKE 'perk-basic-drops-%' THEN 'Alle neuen Basic-Veröffentlichungen innerhalb der aktiven Laufzeit.'
    WHEN id LIKE 'perk-paid-comments-%' THEN 'Kommentiere freigeschaltete Beiträge und werde während deiner aktiven Laufzeit Teil der privaten Community.'
    WHEN id LIKE 'perk-premium-galleries-%' THEN 'Zugang zu Basic- und Premium-Galerien während der gewählten Laufzeit.'
    WHEN id LIKE 'perk-premium-telegram-%' THEN 'Der Einladungslink wird ausschließlich während einer aktiven Premium-Membership im persönlichen Dashboard freigeschaltet.'
    WHEN id LIKE 'perk-premium-drops-%' THEN 'Alle neuen Premium-Veröffentlichungen innerhalb der aktiven Laufzeit.'
    WHEN id LIKE 'perk-premium-extended-%' THEN 'Ausgewählte längere Fassungen, persönliche Einblicke und Premium-exklusive Begleitbeiträge.'
    WHEN id LIKE 'perk-premium-voting-%' THEN 'Premium-Mitglieder werden in ausgewählte Themen- und Formatentscheidungen einbezogen.'
    WHEN id LIKE 'perk-vip-galleries-%' THEN 'Zugang zu Basic-, Premium- und exklusiven VIP-Galerien während der gewählten Laufzeit.'
    WHEN id LIKE 'perk-vip-drops-%' THEN 'VIP-exklusive Veröffentlichungen und besondere Creator-Updates während der aktiven Laufzeit.'
    WHEN id LIKE 'perk-vip-priority-%' AND id NOT LIKE 'perk-vip-priority-replies-%' THEN 'Vorrangiger Zugang zu neuen VIP-Veröffentlichungen und exklusiven Ankündigungen.'
    WHEN id LIKE 'perk-vip-priority-replies-%' THEN 'VIP-Kommentare und Themenwünsche werden bei meinen persönlichen Antworten bevorzugt berücksichtigt – ohne starre Antwortzeit.'
    WHEN id LIKE 'perk-vip-whatsapp-%' THEN 'Wird ausschließlich nach Bezahlung im persönlichen Dashboard für jede aktive VIP-Laufzeit freigeschaltet.'
    WHEN id LIKE 'perk-vip-meeting-%' THEN 'Nach Vereinbarung – lass dich überraschen!'
    ELSE description
  END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
