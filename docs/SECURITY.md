# Sicherheit

## Vertrauensgrenzen

- Appwrite authentifiziert Nutzer, E-Mail-Status und Sitzungen.
- Cloudflare D1 ist maßgeblich für Altersstatus, Mitgliedschaften, Geräte,
  Zahlungen, Inhalte und Datenschutzvorgänge.
- Appwrite-Labels sind nur serverseitig gepflegte Projektionen und keine
  alleinige Zugriffsentscheidung.
- R2-Buckets für Content und Altersnachweise bleiben privat.

## Adminzugriff

Die Admin-API verlangt bei jeder geschützten Anfrage:

1. ein gültiges, serverseitig geprüftes Appwrite-JWT;
2. das Appwrite-Label `admin`;
3. in Appwrite aktivierte Multi-Faktor-Authentifizierung;
4. eine zusätzliche zufällige Admin-Sitzung;
5. dass diese Sitzung demselben Administrator und Geräte-Token zugeordnet ist;
6. dass die höchstens zehn Minuten lange Sitzung noch gültig ist;
7. einen erlaubten Origin.

Altersnachweise sind nur während eines aktiven, eingereichten und noch nicht
abgelaufenen Prüffalls abrufbar. Größe und ETag des privaten R2-Objekts werden
vor der Ausgabe gegen D1 geprüft. Antworten sind nicht cachebar, jeder Abruf
wird protokolliert und die Browser-Vorschau wird automatisch geschlossen.

## Weitere Maßnahmen

- HSTS, CSP, `frame-ancestors 'none'`, `nosniff` und restriktive CORS-Regeln;
- kryptografische UUIDs, Tokens und Challenges;
- keine Secrets in `VITE_*`, Quellcode, Logs oder Git;
- Service Bindings statt öffentlicher interner Worker-Endpunkte;
- Dateigrößen- und Magic-Byte-Prüfung;
- idempotente Zahlungs- und Löschvorgänge;
- Fail-closed-Autorisierung bei Appwrite-, D1- oder Workerfehlern;
- maximal drei registrierte Geräte; Geräte können abgemeldet oder gesperrt
  werden;
- MFA ist für Nutzer optional. Admins werden vor dem ersten Zugriff zur
  TOTP-Einrichtung gezwungen; die Admin-API prüft den MFA-Status zusätzlich
  serverseitig und verweigert den Zugriff ohne MFA.
- Cloudflare Web Analytics misst ausschließlich cookiefreie, aggregierte
  Seiten- und Leistungsdaten; Werbe-, Profiling- und Social-Media-Pixel bleiben
  ausgeschlossen.

Sicherheitsvorfälle sind anhand der
[Datenschutz-Folgenabschätzung](DATENSCHUTZ-FOLGENABSCHAETZUNG.md) sowie der
DSGVO-Meldepflichten zu bewerten.
