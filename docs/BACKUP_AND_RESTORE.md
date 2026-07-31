# Backup und Wiederherstellung

- Quellcode und Konfiguration ohne Secrets werden über Git versioniert.
- D1-Wiederherstellung darf nur über die genehmigten Cloudflare-Funktionen
  erfolgen und muss Retention- und Löschfristen respektieren.
- Altersnachweise werden nicht als langfristige Backups exportiert. Sie müssen
  nach Entscheidung beziehungsweise Fristablauf auch aus temporären
  Wiederherstellungspfaden entfernt bleiben.
- Private R2-Objekte dürfen nicht in lokale Entwicklerbackups, GitHub-Artefakte
  oder Supportarchive kopiert werden.
- Secrets, Appwrite-API-Keys und Microsoft-Graph-Zugangsdaten werden getrennt
  rotiert und niemals aus Git wiederhergestellt.
- Nach einer Wiederherstellung sind Autorisierung, Auditretention und fällige
  Löschjobs vor Wiederfreigabe der Website auszuführen.

Ein Wiederherstellungstest muss mit synthetischen Daten erfolgen und darf keine
echten Ausweise, Videos oder Bankdaten enthalten.
