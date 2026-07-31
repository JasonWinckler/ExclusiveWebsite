# Datenschutz-Folgenabschätzung: manuelle Altersverifikation

Version: 1.2

Stand: 31. Juli 2026

Betriebsstatus: produktiv eingesetzt

Änderungsgrund: Produktiver Löschbestätigungsprozess und klare
Betreiberverantwortung

Verantwortlicher: Jason Winckler, handelnd unter Jason Shadow

Kontakt und ladungsfähige Anschrift: siehe [Legal Center](https://exclusive.jason-shadow.com/legal/)

## 1. Status und Zweck

Diese Datenschutz-Folgenabschätzung (DSFA) beschreibt die produktive manuelle
Altersverifikation von Shadow's Temptation. Sie ist eine technische und
organisatorische Bewertung nach Artikel 35 DSGVO und dokumentiert die vom
Verantwortlichen im laufenden Betrieb eingesetzten Schutzmaßnahmen.

Die Verarbeitung verfolgt ausschließlich den Zweck, Volljährigkeit und
Identitätsübereinstimmung vor dem Zugang zu einer geschlossenen Benutzergruppe
mit Erwachsenen-Inhalten zu prüfen. Nachweise dürfen nicht für Werbung,
Profiling, Gesichtserkennung, Training automatisierter Systeme oder andere
Zwecke verwendet werden.

## 2. Verarbeitung und Datenfluss

1. Appwrite authentifiziert den registrierten Nutzer und bestätigt dessen
   E-Mail-Adresse.
2. Der Cloudflare Membership Worker erzeugt einen neuen Prüffall mit einem
   kryptografisch zufälligen sechsstelligen Einmalcode.
3. Der Browser nimmt die erforderlichen Dokumentseiten und ein kurzes Live-Video
   auf. Vorhandene Dateien können über die Bedienoberfläche nicht ausgewählt
   werden.
4. Der Worker prüft Nutzer- und Fallzuordnung, Dateityp, Dateisignatur,
   Dateigröße, Uploadfenster und Vollständigkeit.
5. Die Nachweise werden unter zufälligen Objektschlüsseln in einem privaten
   Cloudflare-R2-Bucket mit EU-Jurisdiktion gespeichert. Es existiert keine
   öffentliche Bucket- oder Objekt-URL.
6. Nur ein von Appwrite als Administrator authentifizierter Nutzer mit einer
   zusätzlichen, gerätegebundenen Admin-Sitzung kann einen aktiven Prüffall
   öffnen. Diese Sitzung ist höchstens zehn Minuten gültig.
7. Der Administrator vergleicht Dokument, Gesicht, Einmalcode,
   Bewegungsabfolge, Dokumentgültigkeit und Volljährigkeit.
8. Nach der Entscheidung werden R2-Objekte und die zugehörigen
   Upload-Metadatensätze unmittelbar gelöscht. Bei einem nicht bearbeiteten Fall
   erfolgt die Löschung nach Ablauf des 48-Stunden-Prüffensters im nächsten
   stündlichen Löschlauf.
9. Nach einer Freigabe und bestätigter Dateilöschung erhält der Nutzer eine
   lokalisierte E-Mail mit Löschzeitpunkt und Löschreferenz. Dieser
   Löschvermerk ist zusätzlich in der authentifizierten Datenschutz-Datenkopie
   enthalten, nicht jedoch dauerhaft in der normalen Profilansicht.

## 3. Kategorien betroffener Personen und Daten

Betroffen sind registrierte Nutzer, die eine Altersverifikation beginnen.

Verarbeitet werden:

- interne Appwrite-Nutzer-ID und Fall-ID;
- Land, Dokumenttyp, Einwilligungs- und Prozesszeitpunkte;
- Vorderseite und gegebenenfalls Rückseite eines amtlichen Dokuments;
- kurzes Live-Video mit Gesicht, Dokument, Einmalcode und Bewegungsabfolge;
- technischer Dateityp, Größe und Integritätswert;
- Entscheidung, Gültigkeitszeitraum und minimierte Prüfprotokolle;
- Adminzugriffe und sicherheitsrelevante Aktionen.

Es findet keine automatisierte Gesichtserkennung, keine Erstellung biometrischer
Templates und keine automatisierte Entscheidung statt. Sollte später eine
technische biometrische Identifizierung oder Altersschätzung ergänzt werden,
müssen Rechtsgrundlage, Artikel 9 DSGVO und diese DSFA vorab vollständig neu
bewertet werden.

## 4. Rechtsgrundlage und Erforderlichkeit

Der Verantwortliche betreibt das Verfahren zur Erfüllung der
Jugendschutzpflichten für die geschlossene Benutzergruppe. Die dokumentierte
rechtliche Ausgangsbasis sind insbesondere Artikel 6 Absatz 1 Buchstabe c
DSGVO in Verbindung mit § 4 Absatz 2 Satz 2 JMStV sowie, soweit für einzelne
begleitende Verarbeitungen einschlägig, Artikel 6 Absatz 1 Buchstabe f DSGVO.
Die genaue Zuordnung jeder Verarbeitung und die fortlaufende Berücksichtigung
von Rechtsänderungen bleiben Gegenstand der regelmäßigen Rechts- und
Verfahrensprüfung durch den Verantwortlichen.

Der Verantwortliche verbindet die persönliche Identifizierung im manuellen
Prüfprozess mit einer authentifizierten, geschlossenen Zugangssteuerung bei
jedem Abruf geschützter Inhalte. Er trägt die Verantwortung für Auswahl,
Betrieb, Kontrolle und fortlaufende Anpassung beider Ebenen.

Eine bloße Selbsterklärung oder Eingabe eines Geburtsdatums wäre weniger
eingriffsintensiv, erfüllt aber nicht dasselbe Schutzniveau. Eine externe
Identitätslösung würde die unmittelbare Verarbeitung durch den Betreiber
reduzieren, widerspricht derzeit jedoch der Entscheidung für einen
eigenbetriebenen Prozess. Der manuelle Prozess ist daher nur vertretbar, wenn
die nachfolgenden Minimierungs- und Löschmaßnahmen eingehalten werden.

## 5. Datenminimierung

- Nutzer werden aufgefordert, nicht benötigte Dokumentfelder abzudecken.
- Erforderlich sichtbar bleiben Foto, Geburtsdatum, Gültigkeit und die für den
  Echtheitsvergleich notwendigen Dokumentmerkmale. Die konkrete
  Schwärzungsanweisung ist regelmäßig rechtlich zu prüfen.
- Der Browser erlaubt nur unmittelbare Kameraaufnahme.
- Das Video enthält keinen Ton.
- Es werden keine biometrischen Merkmale extrahiert oder als Template
  gespeichert.
- Der Einmalcode wird nach der Entscheidung oder dem Ablauf des Falls entfernt.
- Vollständige Checklisten werden nach erfolgreicher Validierung nicht
  dauerhaft gespeichert; im Audit bleibt nur der Abschlussstatus.
- Nachweis-Previews im Adminbrowser werden beim Verlassen des Tabs oder
  spätestens nach zwei Minuten geschlossen und der lokale Blob-Verweis wird
  widerrufen.
- IP-Adressen werden nicht in der Anwendungsdatenbank gespeichert.

## 6. Aufbewahrungs- und Löschkonzept

| Datenkategorie | Höchstfrist | Löschung/Minimierung |
|---|---:|---|
| Nicht abgeschlossener Uploadfall | Uploadfenster plus nächster stündlicher Lauf | R2-Objekte und Upload-Metadaten werden gelöscht |
| Eingereichter Nachweis | Entscheidung oder 48 Stunden plus nächster stündlicher Lauf | R2-Objekte und Upload-Metadaten werden gelöscht |
| Einmalcode und vollständige Checkliste | Bis zur Entscheidung bzw. zum Ablauf | Unmittelbare Entfernung |
| Reviewer-ID, Freitextbegründung und Länder-Snapshot | 30 Tage nach Entscheidung | Automatische Minimierung |
| Positiver Altersstatus | Höchstens bis zum konfigurierten Ablauf, derzeit 365 Tage | Status läuft ab; eine erneute Prüfung wird erforderlich |
| Admin-Auditereignis | Höchstens 730 Tage | Stündliche Löschung |
| Auditereignis zu einem gelöschten Konto | Höchstens 30 Tage nach Accountlöschung | Vorrangige vollständige Löschung |
| Admin-Sitzung | Höchstens 10 Minuten | Ablauf bzw. Widerruf |

Finanz- und Rechnungsdaten unterliegen einem getrennten, gesetzlich bestimmten
Aufbewahrungskonzept und sind nicht Gegenstand dieser DSFA. Eine
Accountlöschung darf deren gesetzlich notwendige Aufbewahrung nicht aufheben;
sie sind soweit möglich zu trennen und zu pseudonymisieren.

## 7. Empfänger und Auftragsverarbeiter

- Jason Winckler als alleiniger berechtigter Betreiber und Prüfer;
- Cloudflare als Infrastruktur- und Auftragsverarbeiter für Workers, D1 und R2;
- Appwrite ausschließlich für Authentifizierung und Sitzungen.

Appwrite und Microsoft erhalten keine Ausweis- oder Videonachweise aus diesem
Prozess. Im Produktivbetrieb sind gültige Auftragsverarbeitungsverträge,
Unterauftragnehmer, Speicherorte und gegebenenfalls eingesetzte
Übermittlungsinstrumente im internen Verfahrensregister dokumentiert und
werden regelmäßig überprüft. Vertragskopien werden aus Vertraulichkeits- und
Datensparsamkeitsgründen nicht im öffentlichen Repository veröffentlicht.

## 8. Technische und organisatorische Maßnahmen

- TLS, HSTS, restriktive Content-Security-Policy und `no-store`-Antworten;
- privater R2-Bucket ohne öffentliche Entwicklungs- oder Custom-Domain;
- serverseitige Appwrite-JWT-Prüfung und `admin`-Rollenprüfung;
- zusätzliche kryptografische Admin-Sitzung, an Nutzer und Geräte-Token
  gebunden, maximal zehn Minuten;
- Abruf nur für aktive, fristgerechte und prüfbereite Fälle;
- strikte Origin-Prüfung und keine Browser-Credentials an der Admin-API;
- zufällige UUID-Objektschlüssel ohne Namen, E-Mail oder Dokumentnummer;
- Dateigrößen-, MIME- und Magic-Byte-Prüfung;
- Integritätsprüfung von R2-Größe und ETag vor jedem Abruf;
- Auditierung jedes Nachweisabrufs;
- unmittelbare Löschung nach Entscheidung sowie stündlicher Retry-Pfad;
- Fail-closed-Zugriff: Backend- oder Identitätsfehler gewähren keinen Zugang;
- gerätegebundene Nutzeranmeldung, maximal drei registrierte Geräte und
  optionale MFA.

## 9. Risikobewertung

Bewertung: Eintrittswahrscheinlichkeit und Schadensschwere jeweils niedrig,
mittel oder hoch.

| Risiko | Ausgangsrisiko | Maßnahmen | Restrisiko |
|---|---|---|---|
| Unbefugter Abruf von Ausweis oder Video | hoch | private R2-Ablage, JWT, Adminrolle, gerätegebundene 10-Minuten-Sitzung, aktive-Fall-Prüfung, Audit | niedrig bis mittel |
| Kompromittiertes Adminkonto | hoch | kurzes Admin-Token, Gerätebindung, Sitzungswiderruf, MFA-Empfehlung, Zugriffsaudit | mittel |
| Öffentliche Objekt-URL oder Cachekopie | hoch | keine öffentliche R2-URL, `no-store`, Blob-Widerruf, CSP | niedrig |
| Hochladen alter oder fremder Aufnahmen | hoch | Live-Kamera-UI, neuer Zufallscode, Dokument im Video, Bewegungsabfolge, manuelle Prüfung | mittel |
| Zu viele Dokumentdaten | hoch | Schwärzungshinweis, Zweckbindung, sofortige Nachweislöschung, keine OCR-Datenbank | mittel |
| Fehlgeschlagene Löschung | hoch | Fehlerstatus, stündlicher Retry, Löschbestätigung per E-Mail und im Datenschutzexport, protokollierte Fehler | niedrig bis mittel |
| Fehlentscheidung durch manuelle Prüfung | mittel bis hoch | verbindliche Checkliste, dokumentierte Anleitung, keine automatische Freigabe | mittel |
| Weitergabe eines verifizierten Accounts | hoch | individuelle Anmeldung, Geräteverwaltung, Gerätebegrenzung, optionale MFA | mittel |
| Cloud-/Lieferkettenkompromittierung | hoch | EU-R2-Jurisdiktion, minimale Dienste, Secrets nur als Worker-Secrets, Abhängigkeits- und Buildprüfungen | mittel |

## 10. Betroffenenrechte und Vorfälle

Das Nutzer-Dashboard ermöglicht Auskunft, Berichtigung, Datenschutzanfragen,
Opt-outs und eine zweistufig bestätigte Kontolöschung. Sicherheitsvorfälle mit
möglichem Risiko für Betroffene sind zu dokumentieren, einzudämmen und nach den
Artikeln 33 und 34 DSGVO auf Melde- und Benachrichtigungspflichten zu prüfen.

Bei Auskunfts- oder Löschanfragen dürfen keine neuen ungeschwärzten
Ausweiskopien per E-Mail angefordert oder versendet werden. Eine erneute
Identitätsprüfung muss verhältnismäßig und über den geschützten Prozess erfolgen.

## 11. Ergebnis und laufende Betreiberpflichten

Das Verfahren ist produktiv aktiv. Die Verarbeitung ist technisch nur unter
den in dieser DSFA beschriebenen Kontrollen vertretbar. Das verbleibende Risiko
ist insbesondere wegen des eigenentwickelten Identifizierungsverfahrens,
möglicher Kontoweitergabe und der Sensibilität vollständiger
Dokumentaufnahmen nicht null. Abweichungen von Löschfristen,
Zugriffsbeschränkungen oder Fail-closed-Autorisierung sind als
Sicherheitsvorfall zu behandeln.

Jason Winckler trägt als Verantwortlicher die Verantwortung für die Auswahl,
den produktiven Betrieb, die manuellen Entscheidungen und die regelmäßige
Kontrolle des Verfahrens. Die Architektur setzt die nach dem dokumentierten
Stand angemessenen Maßnahmen zur Datenminimierung, Zugriffsbeschränkung,
Zweckbindung, Löschung und Fehlerwiederholung ein. Ein Restrisiko kann bei der
Verarbeitung sensibler Identitätsnachweise dennoch nicht vollständig
ausgeschlossen werden.

Der Verantwortliche prüft deshalb insbesondere Rechtsgrundlage und
Schwärzungshinweise, Auftragsverarbeitungsverträge und Datenübermittlungen,
privilegierte Zugänge einschließlich Admin-MFA sowie die tatsächliche
Wirksamkeit der Lösch- und Retry-Pfade regelmäßig. Diese DSFA ist mindestens
jährlich und zusätzlich bei neuen Datenarten, Dienstleistern, automatisierter
Biometrie, geänderter Authentifizierung, Sicherheitsvorfällen oder wesentlichen
Rechtsänderungen zu aktualisieren.

## 12. Maßgebliche Quellen

- [DSGVO, insbesondere Artikel 5, 25, 32 und 35](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [BfDI: Datenschutz-Folgenabschätzungen](https://www.bfdi.bund.de/DE/Fachthemen/Inhalte/Technik/Datenschutz-Folgenabschaetzungen.html)
- [BfDI: Personalausweis, Erforderlichkeit und Schwärzung](https://www.bfdi.bund.de/DE/Buerger/Inhalte/Telematik-Statistik-Verkehr-Bildung/Meldewesen-Statistik/Der_Personalausweis.html)
