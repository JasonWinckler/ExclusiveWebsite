# Deployment

## Frontend

Die Produktionsdomain `exclusive.jason-shadow.com` wird über Cloudflare
ausgeliefert und aus dem GitHub-Branch `main` gebaut. Der Build lautet:

```sh
npm install
npm run build
```

Ausgabeverzeichnis ist `dist`. Die Appwrite-Site bleibt als kontrollierte
Rollback-/Staging-Möglichkeit bestehen, ist aber keine zweite Daten- oder
Autorisierungsquelle.

## Backend

Die Reihenfolge für Schema- und Workeränderungen ist:

1. D1-Migrationen anwenden;
2. `identity-projection` bereitstellen;
3. `membership-api` bereitstellen;
4. `admin-api` bereitstellen;
5. `maintenance-jobs` bereitstellen;
6. Frontend bauen und veröffentlichen;
7. Health-, Negativ- und Positivpfade testen.

Interne Kommunikation erfolgt über Service Bindings. Secrets werden nur als
Cloudflare Worker Secrets gespeichert. Der private Identity Worker besitzt
keine öffentliche Route.

## Aktive Produktionskontrollen

- private R2-Buckets für Altersnachweise und Content;
- D1 als maßgebliche Mitgliedschafts- und Auditdatenbank;
- stündlicher Wartungsjob für Ablauf, Löschung, E-Mail-Retries und Retention;
- Adminsitzungen höchstens zehn Minuten;
- Auditretention höchstens 730 Tage beziehungsweise 30 Tage nach
  Accountlöschung;
- HSTS, CSP, Origin-Prüfung und `no-store` für API-Antworten.

Ein Rollout ist erst abgeschlossen, wenn Migration, Typecheck, Worker-Tests,
Frontend-Build und Produktions-Healthchecks erfolgreich sind.
