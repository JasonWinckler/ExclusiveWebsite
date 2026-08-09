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

## Persönliche Telegram-Einladungen

Premium und VIP erhalten den Telegram-Vorteil über den produktiven
`@ShadowsTemptationAccessBot`. Das Mitglied erzeugt im Dashboard einen zehn
Minuten gültigen Bot-Link. In D1 liegt nur dessen SHA-256-Digest. Erst nachdem
das Mitglied den Bot selbst gestartet hat, wird die minimale numerische
Telegram-Konto-ID mit dem Website-Konto verknüpft und ein 15 Minuten gültiger,
auf dieses Telegram-Konto gebundener Kanal-Link im privaten Bot-Chat gesendet.
Nach dem Beitritt widerruft der Webhook den Kanal-Link unmittelbar.

Der Reiter „Telegram“ zeigt Status und technische Fehler, aber weder
Telegram-Benutzernamen noch Profilbilder oder Chats. Dort kann der Zugang neu
gesendet, administrativ pausiert oder die Verknüpfung vollständig gelöscht
werden. Membership-Ende, Kontosperre und Kontolöschung entziehen den Zugang;
eine spätere Reaktivierung sendet automatisch einen neuen Einmal-Link. Der
stündliche Membership-Job dient zusätzlich als Abgleich-Failsafe.

MFA ist für das Administratorkonto organisatorisch verpflichtend. Siehe
[Sicherheit](SECURITY.md) und
[AVS-Prüfprozess](AVS_REVIEW_PROCESS.md).
