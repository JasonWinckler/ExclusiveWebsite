# Nutzer- und Zugriffsstatus

## Konto

- `EMAIL_PENDING`: Konto existiert, E-Mail noch nicht bestätigt.
- `ACTIVE`: Konto aktiv.
- `RESTRICTED`: manuell gesperrt; Sitzungen und geschützte Zugriffe werden
  widerrufen.
- `DELETION_PENDING`: Löschung läuft; neue geschützte Aktionen sind gesperrt.
- `DELETED`: Cloudflare-Authkonto und Sitzungen gelöscht, D1-Profil anonymisiert.

## Altersstatus

- `NOT_STARTED`, `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED`,
  `RETRY_REQUIRED`.
- Nur `APPROVED` mit nicht abgelaufener Entscheidung kann Zugang zu
  altersbeschränkten Bereichen ermöglichen.

## Membership

D1 ist maßgeblich. Eine aktive Berechtigung verlangt passenden Zeitraum,
Altersstatus, Kontostatus und registriertes Gerät. Beim Kauf einer höheren
Stufe kann die bisherige Laufzeit pausiert und später fortgesetzt werden.
Manuelle Adminvergabe ersetzt hingegen aktive und geplante Berechtigungen des
Nutzers.

Rollen- und Zugriffslabels werden bei der Anfrage ausschließlich aus D1
abgeleitet und dürfen nie vom Browser vorgegeben werden.
