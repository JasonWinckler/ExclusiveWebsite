# Produktionsarchitektur

| Ebene | Verantwortung |
|---|---|
| Cloudflare Pages | React-Frontend, statische Rechtstexte, Same-Origin-API-Gateway |
| Auth Worker | Registrierung, E-Mail-Verifikation, Passwörter, Sitzungen, TOTP-MFA, Recovery-Codes |
| Membership Worker | Nutzerprofil, Altersfälle, SEPA-Aufträge, Berechtigungen, geschützter Content |
| Admin Worker | Altersprüfung, Nutzer-, Zahlungs-, Content- und Kommentarmoderation |
| Identity Worker | privater E-Mail-Versand über Microsoft Graph |
| Maintenance Worker | Ablauf, Löschung, Retention, Erinnerungen und E-Mail-Retries |
| D1 | maßgebliche Identitäts-, Geschäfts-, Mitgliedschafts- und Auditdaten |
| private R2-Buckets | kurzlebige Altersnachweise und geschützter Creator-Content |

## Anfrageweg

1. Der Browser ruft ausschließlich relative `/api/auth`, `/api/member` oder
   `/api/admin`-Routen auf.
2. Pages Functions leiten intern über Service Bindings weiter.
3. Der Auth Worker setzt eine nicht aus JavaScript lesbare
   `__Host-shadow_session`-Sitzung.
4. Membership und Admin validieren den gehashten Sitzungstoken in D1 und leiten
   Nutzer-ID, Rolle, MFA-, Alters- und Membershipstatus ausschließlich
   serverseitig ab.
5. R2-Objekte werden erst nach vollständiger D1-Autorisierung gestreamt; Namen
   und Objekt-Keys werden nicht als öffentliche URL ausgegeben.

Die historischen Spaltennamen `appwrite_user_id` bleiben als stabile interne
Subject-ID bestehen. Der Name bezeichnet keine aktive Abhängigkeit und wurde
bewusst nicht massenhaft umgeschrieben, damit bestehende Bestellungen,
Entitlements, Altersentscheidungen und Audits unverändert zugeordnet bleiben.

## Datenschutz

- Altersnachweise: sofort nach Entscheidung, ansonsten spätestens nach Ablauf
  des 48-Stunden-Prüffensters im nächsten Wartungslauf.
- Auditdaten: höchstens 730 Tage und höchstens 30 Tage nach Accountlöschung.
- Finanz- und Rechnungsdaten: getrennte gesetzliche Aufbewahrung; kein
  pauschales Löschen vor Fristablauf.
- Appwrite bleibt während des begrenzten Rollback-Fensters unverändert, ist aber
  nicht Teil des produktiven Anfragewegs.
