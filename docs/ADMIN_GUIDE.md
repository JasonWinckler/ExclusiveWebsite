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

MFA ist für das Administratorkonto organisatorisch verpflichtend. Siehe
[Sicherheit](SECURITY.md) und
[AVS-Prüfprozess](AVS_REVIEW_PROCESS.md).
