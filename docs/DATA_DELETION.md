# Datenlöschung und Aufbewahrung

## Grundsätze

Personenbezogene Daten werden zweckgebunden, getrennt nach Datenart und nur so
lange gespeichert, wie dies für Betrieb, Sicherheit oder gesetzliche
Aufbewahrung erforderlich ist. Eine Kontolöschung entzieht Zugriffe sofort und
löscht oder anonymisiert nicht aufbewahrungspflichtige Daten.

## Altersnachweise

- Uploadfenster: höchstens 60 Minuten.
- Manuelle Prüfung: höchstens 48 Stunden ab Einreichung.
- Entscheidung: R2-Dateien und Upload-Metadaten werden unmittelbar gelöscht.
- Fristablauf: Löschung im nächsten stündlichen Wartungslauf.
- Einmalcode und Checkliste: Löschung mit Entscheidung oder Ablauf.
- Reviewer, Freitext und Länder-Snapshot: Minimierung nach 30 Tagen.

Eine fehlgeschlagene R2-Löschung markiert den Vorgang als fehlerhaft. Der
stündliche Wartungsjob versucht die Löschung erneut; eine Freigabe macht den
Nachweis nicht öffentlich.

## Auditereignisse

- allgemeine Höchstfrist: 730 Tage;
- Ereignisse, die einen gelöschten Nutzer betreffen: höchstens 30 Tage nach
  Accountlöschung;
- Ereignisse eines gelöschten Administratorkontos: ebenfalls höchstens 30 Tage;
- die kontobezogene Frist hat Vorrang vor der allgemeinen Frist.

## Kontolöschung

Nutzer und Administrator können eine zweistufig bestätigte Löschung auslösen.
Der Prozess löscht das Cloudflare-Authkonto, Sitzungen, Geräte, Kommentare,
Authentifizierungs-Tokens und Altersnachweise. Das D1-Profil wird anonymisiert.
Gesetzlich notwendige Rechnungs- und Zahlungsdaten werden getrennt
weitergespeichert und soweit möglich pseudonymisiert.

Administrative oder gesetzliche Holds blockieren eine automatische Löschung.
Eine manuelle Betroffenenlöschung darf nur blockiert werden, wenn eine
dokumentierte Rechtsgrundlage die Aufbewahrung tatsächlich verlangt.

Siehe auch
[Datenschutz-Folgenabschätzung](DATENSCHUTZ-FOLGENABSCHAETZUNG.md) und
[Altersverifikation](AGE_VERIFICATION.md).
