# Appwrite → Cloudflare: produktive Migration

## Ergebnis

Frontend, Authentifizierung, Autorisierung, Datenbank, private Medien,
Altersprüfung, Bestellungen, Adminfunktionen, Wartung und internes Routing
laufen in Cloudflare. Microsoft Graph bleibt ausschließlich der
Transaktionsmail-Transport. Namecheap PremiumDNS bleibt autoritativ; es wurde
kein Nameserverwechsel vorgenommen.

## Übernommene Daten

Die bisherigen D1-Datensätze waren bereits maßgeblich und wurden unverändert
weiterverwendet: Profile, Datenschutzpräferenzen, Altersfälle/-entscheidungen,
Produkte, SEPA-Aufträge, Rechnungen, Entitlements, Geräte, Posts, Kommentare und
Audits. Migration `0023_cloudflare_identity.sql` ergänzt Auth-Konten,
Sitzungen, MFA/Recovery und Einmalaktionen und verknüpft sie mit derselben
internen Nutzer-ID.

Appwrite kann Passwort-Hashes nicht exportieren. Deshalb enthält jedes
übernommene Bestandskonto zunächst `migration_required=1`. Der einmalige
branded Passwortreset setzt einen neuen Cloudflare-Hash; sämtliche fachlichen
Daten und Memberships bleiben erhalten. Neuregistrierungen landen direkt in
D1.

## Sicherheitsverbesserungen

- kein Appwrite-JWT und kein Auth-Token in Browser-JavaScript;
- hostgebundenes HttpOnly-Sessioncookie und ausschließlich gehashte Tokens in
  D1;
- serverseitig abgeleitete Rollen, Age- und Membership-Labels;
- verschlüsselte TOTP-Secrets, gehashte Einmal-Recovery-Codes und Pflicht-MFA
  für Admins;
- interne Auth-/Identity-Worker ohne öffentliche Route;
- Same-Origin-Pages-Gateway und exakte Origin-Prüfung;
- D1-Time-Travel-Rücksetzpunkt vor der additiven Migration.

## Cutover und Rückfall

Vor dem DNS-Wechsel wird die vollständige Seite auf einer Pages-Deployment-URL
getestet. Danach zeigt ausschließlich der Namecheap-CNAME `exclusive` auf
`shadows-temptation.pages.dev`. Der Apex-Host bleibt unverändert. Appwrite wird
für ein begrenztes Rückfallfenster nicht gelöscht, erhält aber keine
Produktivanfragen. Erst nach stabiler Beobachtung können Site, Plattform und
Authdaten dort in einem separaten, kontrollierten Löschvorgang entfernt werden.
