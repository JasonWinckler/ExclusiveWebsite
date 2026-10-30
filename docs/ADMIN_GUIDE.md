# Admin-Handbuch

Der Adminbereich ist nur mit serverseitiger D1-Adminrolle, aktivem TOTP-MFA und einer zusätzlichen,
gerätegebundenen Zehn-Minuten-Sitzung erreichbar.

## Altersprüfung

- Nachweise ausschließlich über „Sicher öffnen“ ansehen.
- Keine Screenshots oder lokalen Kopien erstellen.
- Die verbindliche Checkliste vollständig prüfen.
- Bei Zweifel ablehnen und eine neue Aufnahme verlangen.
- Nach Entscheidung den angezeigten Löschstatus kontrollieren.

## Nutzer und Geräte

- „Abmelden“ entfernt nur die Sitzung; das Gerät darf sich später erneut
  anmelden.
- „Sperren“ widerruft das Geräte-Token, bis es entsperrt wird.
- Manuelle Memberships ersetzen aktive und geplante Memberships dieses Nutzers.
- Accountrestriktion und Accountlöschung verlangen eine dokumentierte
  Begründung.

## Zahlungen und Content

- SEPA-Aufträge nur nach tatsächlichem Kontoeingang oder exaktem N26-CSV-Match
  aktivieren.
- CSV-Inhalte werden nicht gespeichert; verarbeitet werden nur die für den
  Abgleich notwendigen Felder und Hashes.
- Content wird direkt veröffentlicht. Vor Upload Titel, Zugriffsstufe,
  Beschreibung und Kommentarfreigabe kontrollieren.
- „New Drop senden“ stellt ausschließlich für bestätigte Newsletter-Empfänger
  eine lokalisierte Kampagne in die Warteschlange. Jede Nachricht enthält den
  direkten Abmeldelink; Newsletter dürfen nicht an offene Double-Opt-in-
  Anmeldungen versendet werden.

## System Monitoring und Simulation

- „System Monitoring“ zeigt 30-Tage-Besuche, Conversion-Schritte, operative
  D1-/R2-Zustände, Wartungsjobs, Memberships, offene Zahlungen und die maximal
  zwei privaten D1-Sicherungen. Die Reichweitenmessung speichert keine
  IP-Adresse, keinen User-Agent und keine kontoübergreifende Kennung.
- „Website-Simulation“ stellt Guest, registriert, Free, Basic, Premium und VIP
  ausschließlich mit neutralen Platzhaltern dar. Sie ruft keine geschützten
  Medien ab, ändert keine Berechtigungen und ersetzt keinen echten Rollentest.
- Rechnungskopien bleiben privat und dürfen nur für Support, Betroffenenrechte
  oder steuerliche Pflichten geöffnet werden.

## VIP-WhatsApp und historische Telegram-Zugänge

WhatsApp ist vom Betreiber für die Musik- und Sprecherarbeit freigegeben.
Aktive VIP-Mitglieder erhalten den Kontakt über den geschützten Vorteil;
`VIP_WHATSAPP_MUSIC_REVIEWED=true` kennzeichnet diese Freigabe.

Telegram ist kein Vorteil einer Musik-Mitgliedschaft. Das vorhandene Ziel ist
für Erwachsenen-Inhalte bestimmt und darf nicht mit der Musik-Mitgliedschaft
beworben oder verknüpft werden. `MUSIC_TELEGRAM_REVIEWED=false` sperrt neue
Verknüpfungen, Reaktivierungen und Einladungen. Die frühere gemeinsame Variable
`MUSIC_COMMUNITY_REVIEWED` wird nicht mehr ausgewertet. Der optionale separate
VIP-Bereich auf dieser Website eröffnet keinen Telegram-Zugang.

Vorhandene Telegram-Zuordnungen bleiben für die Verwaltung, Löschung und den
Entzug früherer Zugänge erhalten. Migration 0029 deaktiviert die Katalogvorteile,
löscht aber keine historischen Zuordnungen und entfernt für sich genommen keine
bestehenden Kanalmitglieder. Administrativer Entzug, Kontolöschung und der
bestehende Wartungsabgleich bleiben nutzbar. Telegram-Benutzernamen, Profilbilder
und Chats werden weiterhin nicht gespeichert.

MFA ist für das Administratorkonto organisatorisch verpflichtend. Siehe
[Sicherheit](SECURITY.md) und
[AVS-Prüfprozess](AVS_REVIEW_PROCESS.md).
