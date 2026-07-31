# Architektur

## Zuständigkeiten

| Ebene | Verantwortung |
|---|---|
| Cloudflare Pages | öffentliches React-Frontend |
| Appwrite Auth | Registrierung, E-Mail-Status, Login, JWT, MFA, Sitzungen |
| Membership Worker | Nutzerprojektion, Altersfälle, SEPA-Aufträge, Berechtigungen, geschützter Content |
| Admin Worker | Altersprüfung, Nutzerverwaltung, Zahlungen, Content und Moderation |
| Identity Worker | private Appwrite- und Microsoft-Graph-Operationen über Service Bindings |
| Maintenance Worker | Ablauf, Löschung, Retention, Synchronisations- und E-Mail-Retries |
| D1 | maßgebliche Geschäfts-, Mitgliedschafts- und Auditdaten |
| private R2-Buckets | kurzlebige Altersnachweise und geschützter Creator-Content |

## Sicherheitsmodell

- Der Browser bestimmt niemals Nutzer-ID, Labels oder Berechtigungen.
- Jeder Worker leitet die Nutzeridentität aus einem serverseitig geprüften
  Appwrite-JWT ab.
- D1 ist maßgeblich; Appwrite-Labels sind nur Projektionen.
- Interne privilegierte Aktionen laufen über Service Bindings.
- Altersnachweise und Content besitzen keine öffentlichen R2-URLs.
- Geschützter Zugriff ist fail closed und verlangt aktives Konto, bestätigte
  E-Mail, Altersfreigabe, Membership und registriertes Gerät.
- Adminaktionen verlangen zusätzlich eine gerätegebundene Sitzung von höchstens
  zehn Minuten.

## Datenschutzmodell

- Altersnachweise werden nach Entscheidung unmittelbar oder nach Ablauf des
  48-Stunden-Fensters automatisch gelöscht.
- Nachweismetadaten werden auf den notwendigen Status reduziert.
- Auditdaten werden höchstens 730 Tage und nach Accountlöschung höchstens
  30 Tage gespeichert.
- Finanzdaten besitzen getrennte gesetzliche Aufbewahrungsregeln.

Details stehen in [Sicherheit](SECURITY.md),
[Datenlöschung](DATA_DELETION.md) und der
[Datenschutz-Folgenabschätzung](DATENSCHUTZ-FOLGENABSCHAETZUNG.md).
