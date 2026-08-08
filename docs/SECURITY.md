# Sicherheit

## Identität und Sitzungen

- Passwörter: Der Browser leitet mit individuellem 128-Bit-Salt und 600.000
  PBKDF2-HMAC-SHA-256-Iterationen einen Verifier ab. Der Auth-Worker speichert
  davon ausschließlich einen zweiten HMAC mit separatem Cloudflare-Secret.
  Klartextpasswörter und der direkt nutzbare Browser-Verifier werden weder in
  D1 gespeichert noch geloggt; die teure Ableitung überschreitet dadurch nicht
  das kostenlose Worker-CPU-Limit.
- Browser-Sitzung: 256-Bit-Zufallstoken; in D1 liegt nur SHA-256. Das Cookie ist
  `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` und besitzt kein `Domain`-
  Attribut.
- Maximal drei aktive Sitzungen/Geräte. Entfernen meldet ab; eine explizite
  Gerätesperre bleibt getrennt und kann wieder aufgehoben werden.
- Nach fünf falschen Passwörtern gilt eine 15-minütige Kontobremse. Antworten
  unterscheiden nicht zwischen unbekannter Adresse und falschem Passwort.
- MFA: TOTP nach RFC 6238, verschlüsselte Secrets (AES-GCM) und einmalige,
  ausschließlich beim Erstellen angezeigte Recovery-Codes. Für Admins Pflicht.
- Verbrauchte oder abgelaufene Auth-Aktionstoken, Sitzungen und verwendete
  Recovery-Codes werden nach zwei Tagen durch den stündlichen Wartungslauf
  entfernt; eine Accountlöschung entfernt Authdaten unmittelbar per Cascade.

## Adminzugriff

Jede Adminaktion verlangt gleichzeitig eine aktive Cloudflare-Sitzung, die
serverseitige D1-Rolle `ADMIN`, aktiviertes MFA, ein registriertes Gerät, einen
erlaubten Origin und eine zusätzliche gerätegebundene Admin-Sitzung von
höchstens zehn Minuten. Fehlt eine Bedingung, wird der Zugriff verweigert.

Altersnachweise sind nur bei einem eingereichten, noch nicht abgelaufenen Fall
abrufbar. D1-Größe/ETag werden gegen das private R2-Objekt geprüft, Antworten
sind `no-store`, Abrufe werden auditiert und die Vorschau schließt bei
Tabwechsel beziehungsweise spätestens nach zwei Minuten.

## Plattformkontrollen

- HSTS (zwei Jahre, Subdomains, Preload), CSP, `frame-ancestors 'none'`,
  `nosniff`, restriktive Permissions Policy und exakte Origin-Prüfung;
- Same-Origin-Gateway und private Service Bindings statt öffentlicher interner
  Auth-/Identity-Routen;
- Magic-Byte-, Typ- und Größenprüfung für Medien;
- private R2-Buckets ohne öffentliche Objekt-URLs;
- idempotente Zahlungs-, E-Mail- und Löschvorgänge;
- verschlüsselte Worker Secrets; keine Credentials in `VITE_*`, Git oder Logs;
- personenbezogene API-Antworten und alle Bilder sind nicht cachebar;
- keine Werbe-, Profiling- oder Social-Media-Pixel.
