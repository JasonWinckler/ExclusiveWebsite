# Backup und Wiederherstellung

## Produktiver Sicherungsweg

- Quellcode und Konfiguration ohne Secrets werden über Git versioniert.
- D1 Time Travel ist bei produktiven D1-Datenbanken automatisch aktiv und
  ermöglicht auf dem Free-Plan eine punktgenaue Wiederherstellung innerhalb
  der letzten sieben Tage. Es wird nicht als dauerhaftes Archiv behandelt.
- Zusätzlich exportiert `.github/workflows/d1-private-backup.yml` die
  produktive D1-Datenbank einmal täglich verschlüsselt über HTTPS in den
  privaten EU-R2-Bucket `exclusive-system-backups`.
- Der stündliche Maintenance Worker behält unter `d1/` ausschließlich die zwei
  neuesten Exporte. Ältere Stände werden automatisch gelöscht.
- Backup-Objekte besitzen keine öffentliche URL und werden im Admin-Reiter
  „System Monitoring“ nur als Metadaten (Zeit, Größe, Objektname) angezeigt.

Für den Workflow muss im GitHub-Repository `CLOUDFLARE_ACCOUNT_ID` als normale
Actions-Variable und ausschließlich ein minimal berechtigtes
`CLOUDFLARE_API_TOKEN` als verschlüsseltes Actions-Secret vorliegen. Das Token
benötigt nur D1-Export- und Schreibzugriff auf den Sicherungsbucket.

## Wiederherstellung

- Eine D1-Wiederherstellung darf nur nach dokumentierter Freigabe über Time
  Travel oder einen der zwei privaten Exporte erfolgen und muss Retention- und
  Löschfristen respektieren.
- Altersnachweise werden nicht als langfristige Backups exportiert. Sie müssen
  nach Entscheidung beziehungsweise Fristablauf auch aus temporären
  Wiederherstellungspfaden entfernt bleiben.
- Private R2-Medien oder Rechnungskopien dürfen nicht in lokale
  Entwicklerbackups, GitHub-Artefakte oder Supportarchive kopiert werden.
- Secrets und Microsoft-Graph-Zugangsdaten werden getrennt rotiert und niemals
  aus Git oder einer D1-Sicherung wiederhergestellt.
- Nach einer Wiederherstellung sind Autorisierung, Auditretention, fällige
  Löschjobs und die zwei-Backup-Grenze vor Wiederfreigabe der Website zu prüfen.

Ein Wiederherstellungstest muss mit synthetischen Daten erfolgen und darf keine
echten Ausweise, Videos, Bank-, Kunden- oder Rechnungsdaten enthalten.
