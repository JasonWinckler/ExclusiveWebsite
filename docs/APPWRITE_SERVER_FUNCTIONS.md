# Appwrite: historischer Rollback-Status

Appwrite ist nicht mehr Teil des produktiven Anfragewegs. Der Quellcode unter
`appwrite/functions/` wird nur vorübergehend als historische Referenz und für
einen kontrollierten Rollback aufbewahrt. Er darf nicht parallel aktiviert und
nicht als zweite Wahrheitsquelle verwendet werden.

Passwörter wurden nicht exportiert. Bestandsnutzer übernehmen ihr Konto über
den einmaligen Cloudflare-Passwortreset. Fachliche Daten lagen bereits in D1
und bleiben über die stabile interne Subject-ID zugeordnet.

Entfernung der verbliebenen Appwrite-Ressourcen ist ein separater späterer
Vorgang. Voraussetzung sind ein abgeschlossenes Beobachtungsfenster, bestätigte
Cloudflare-Backups/Time-Travel, ein Daten-/Retention-Inventar und ein expliziter
Löschentscheid des Betreibers.
