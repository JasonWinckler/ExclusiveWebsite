# Produktionskonfiguration

## Cloudflare-Ressourcen

- Pages-Projekt `shadows-temptation` mit GitHub-Branch `main`;
- D1 `exclusive-membership` mit allen Migrationen unter
  `cloudflare/migrations`;
- private R2-Buckets `exclusive-age-evidence` (EU-Jurisdiktion) und
  `exclusive-content-media`;
- Worker `exclusive-auth-api`, `exclusive-membership-api`,
  `exclusive-admin-api`, `exclusive-maintenance-jobs` und der nicht öffentlich
  geroutete `exclusive-identity-projection`;
- Pages-Service-Bindings `AUTH_API`, `MEMBERSHIP_API`, `ADMIN_API`;
- Worker-Secrets ausschließlich verschlüsselt im Cloudflare-Dashboard.

Aktive Grenzwerte: drei Geräte/Sitzungen, 30 Tage normale Sitzung, zehn Minuten
Admin-Sitzung, 48 Stunden Altersprüffenster, 730 Tage allgemeine Auditretention.
Admin-MFA ist verpflichtend; Nutzer-MFA optional.

## Domain

Namecheap bleibt Registrar. Die autoritativen Nameserver werden nach dem
kontrollierten Cutover von Cloudflare betrieben; der vollständige Record-Export,
die Cutover-Gates und der Rückfallweg stehen in
`DNS_CUTOVER_2026-08-11.md`. `exclusive.jason-shadow.com` ist ausschließlich
mit dem Pages-Projekt `shadows-temptation` verbunden. Der Apex,
`www.jason-shadow.com` und `order.jason-shadow.com` gehören zu ihren jeweils
eigenen Pages-Projekten und dürfen nicht auf dieses Projekt zeigen.

## Validierung

```sh
cd cloudflare
pnpm run typecheck
pnpm test
cd ..
npm run build
```

Danach sind Healthcheck, Registrierung, E-Mail-Verifikation, Passwortreset,
Login/MFA, Nutzer- und Admin-Dashboard, Altersprüfung, SEPA-Auftrag,
Contentstreaming, Accountlöschung sowie die automatischen Retention-Jobs zu
prüfen.
