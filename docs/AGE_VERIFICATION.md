# Altersverifikation

## Produktiver Ablauf

Appwrite ist die Authentifizierungsgrenze. Nur ein angemeldeter Nutzer mit
bestätigter E-Mail-Adresse und aktivem Konto kann eine Altersprüfung beginnen.
Der Cloudflare Membership Worker erzeugt einen Fall mit einem kryptografisch
zufälligen sechsstelligen Code und einem höchstens 60 Minuten geöffneten
Uploadfenster.

Der Browser nimmt die erforderliche Dokumentseite beziehungsweise Vorder- und
Rückseite live auf. Anschließend wird ein 10 bis 20 Sekunden langes Video ohne
Ton aufgenommen. Darin müssen Gesicht, Dokument und der handschriftliche Code
sichtbar sein; außerdem folgt der Nutzer einer zufällig zusammengestellten
Bewegungsabfolge. Vorhandene Dateien können über die Oberfläche nicht
ausgewählt werden.

Der Server akzeptiert nur die für den Dokumenttyp notwendigen Dateien, prüft
Größe, MIME-Typ, Dateisignatur, Fall- und Nutzerzuordnung sowie das
Uploadfenster. Die Objekte werden ausschließlich im privaten R2-Bucket
`exclusive-age-evidence` mit EU-Jurisdiktion gespeichert.

## Adminprüfung

Nachweise können nur abgerufen werden, wenn:

- Appwrite den aktuellen Nutzer als Administrator authentifiziert;
- der Administrator zusätzlich eine gerätegebundene Sitzung besitzt, die
  höchstens zehn Minuten gültig ist;
- der Fall `PENDING` und `READY_FOR_REVIEW` ist;
- das 48-Stunden-Prüffenster noch nicht abgelaufen ist;
- der Nachweis nicht bereits gelöscht wurde.

Jeder Abruf wird protokolliert. Der Browser schließt einen Nachweis beim
Tabwechsel oder spätestens nach zwei Minuten. Die Freigabe verlangt die
vollständige serverseitige Checkliste einschließlich Code-, Gesichts-,
Dokument- und Bewegungsprüfung.

## Datenminimierung und Löschung

- Nach einer Entscheidung werden R2-Dateien und Upload-Metadaten unmittelbar
  gelöscht.
- Nicht bearbeitete Fälle laufen nach 48 Stunden ab; der stündliche
  Wartungsjob entfernt die Nachweise im nächsten Lauf.
- Einmalcode und vollständige Checkliste werden bei Entscheidung oder Ablauf
  entfernt.
- Reviewer-Zuordnung, Freitextbegründung und Länder-Snapshot werden spätestens
  30 Tage nach der Entscheidung minimiert.
- Nach erfolgreicher Freigabe und bestätigter Dateilöschung erhält der Nutzer
  eine lokalisierte Löschbestätigung per E-Mail.
- Löschzeitpunkt und Löschreferenz sind anschließend ausschließlich in der
  persönlichen Datenschutz-Datenkopie enthalten, nicht dauerhaft in der
  normalen Profilübersicht.
- Auditereignisse werden höchstens 730 Tage gespeichert; Ereignisse zu einem
  gelöschten Konto höchstens 30 Tage nach dessen Löschung.

Die vollständige Bewertung steht in der
[Datenschutz-Folgenabschätzung](DATENSCHUTZ-FOLGENABSCHAETZUNG.md).

## Betreiberverantwortung

Der Prozess ist eigenbetrieben, manuell und ohne Drittanbieter für die
Identitätsentscheidung. Jason Winckler trägt als Seitenbetreiber die
Verantwortung für Auswahl, Betrieb, manuelle Entscheidungen, Löschkontrollen
und die regelmäßige Anpassung des Verfahrens. Die dafür umgesetzten
technischen und organisatorischen Maßnahmen sowie verbleibende Risiken sind in
der Datenschutz-Folgenabschätzung dokumentiert.
