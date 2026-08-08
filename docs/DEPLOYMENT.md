# Deployment und Rollback

## Automatischer Frontend-Rollout

Cloudflare Pages ist mit GitHub verbunden. Pushes auf `main` bauen mit
`npm run build` und veröffentlichen `dist`. Pages Functions in `functions/`
stellen das Same-Origin-Gateway bereit; Bindings stehen in `wrangler.jsonc`.

## Backend-Reihenfolge

1. D1-Time-Travel-Bookmark notieren.
2. Additive D1-Migration anwenden.
3. `identity-projection`, danach `auth-api`, `membership-api`, `admin-api` und
   `maintenance-jobs` bereitstellen.
4. Verschlüsselte Secrets/Bidings kontrollieren.
5. Pages-Preview veröffentlichen und negative/positive Pfade prüfen.
6. Produktion veröffentlichen.
7. Erst danach Namecheap-CNAME `exclusive` von Appwrite auf
   `shadows-temptation.pages.dev` ändern.

## Rollback

- Frontend: vorheriges Pages-Deployment als Produktion aktivieren.
- Worker: vorherige Worker-Version zu 100 Prozent ausrollen.
- Datenbank: ausschließlich bei bestätigtem Schemafehler den unmittelbar vor
  der Migration notierten D1-Time-Travel-Bookmark verwenden. Nach produktiven
  Schreibvorgängen ist zuerst eine fachliche Delta-Prüfung nötig.
- DNS: während des begrenzten Rollback-Fensters kann der vorherige Appwrite-
  CNAME wiederhergestellt werden. Appwrite ist ansonsten kein produktiver
  Authentifizierungs- oder Datenpfad.

Ein Rollout ist erst abgeschlossen, wenn Typecheck, Worker-Tests, Frontend-
Build, Pages-Healthcheck und die zentralen Produktivpfade erfolgreich sind.
