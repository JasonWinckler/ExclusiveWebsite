# Provider- und Verarbeitungsentscheidungen

## Cloudflare

Cloudflare Pages, Workers, D1 und private R2-Buckets bilden die produktive
Plattform. Pages liefert Frontend und Same-Origin-Gateway; Worker trennen Auth,
Membership, Admin, E-Mail und Wartung. D1 ist maßgeblich. Die R2-Buckets sind
nicht öffentlich.

Cloudflare Web Analytics ist nur cookiefrei und aggregiert zulässig. Werbe-,
Profiling- und Social-Media-Pixel sind ausgeschlossen. Auth-API, Altersnachweise,
Zahlungsdetails und geschützter Content werden nicht an Analytics übermittelt.

## Transaktionsmail

Der private `exclusive-identity-projection` Worker löst den Empfänger aus D1
auf und versendet über Microsoft Graph als
`info@exclusive.jason-shadow.com`. Graph-Credentials sind verschlüsselte Worker
Secrets; Browser und öffentliche Routen erhalten weder Credential noch freie
Empfängerauswahl. Verifikation, Passwortreset, Rechnung, Altersfreigabe/
Löschnachweis, Membership-Aktivierung und Ablaufhinweis sind lokalisierte,
gebrandete Transaktionsmails mit Legal-Link. Inline-Bilder werden als CID-
Attachment eingebettet, nicht aus einem Trackingserver nachgeladen.

## Altersprüfung

Es gibt keinen Drittanbieter. Der Browser erfasst Dokumentseiten und ein
stummes Livevideo mit Gesicht, Ausweis, zufälligem sechsstelligen Papiercode und
Bewegungs-Challenge. Die Dateien liegen kurzzeitig im privaten EU-R2-Bucket.
Nur ein MFA-geschützter Admin mit aktiver zehnminütiger Admin-Sitzung darf einen
eingereichten, nicht abgelaufenen Fall öffnen. Nach Entscheidung werden Dateien
sofort gelöscht; ungeprüfte Dateien spätestens nach dem 48-Stunden-Fenster im
nächsten stündlichen Wartungslauf.

## SEPA

Der Kunde erhält EPC-QR und identische Textdaten für eine gewöhnliche SEPA-
Überweisung. Es gibt keinen Banklogin, keine PISP-Auslösung, kein Lastschrift-
Mandat und keine automatische Verlängerung. Zugriff entsteht erst nach exaktem
Abgleich von Referenz, Betrag und Währung oder dokumentierter manueller
Adminfreigabe. Offene Aufträge verfallen nach 48 Stunden.

## Appwrite

Appwrite ist nach dem Cutover kein produktiver Provider mehr. Die alte Site und
Authdaten bleiben nur zeitlich begrenzt als Rollback-Material bestehen und
werden nicht abgefragt, beschrieben oder zur Autorisierung verwendet.
