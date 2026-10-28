# Kapazität von Gerster CAD

Web-App, mit der Joachim (Einzelunternehmer, CAD- und Innenausbauplanung) seine Aufträge nach Stunden plant: Auslastung der nächsten Wochen, passt eine Anfrage rein, wann ist sie realistisch fertig, Warnung bei zu vielen langen Wochen, Vorschläge zur Lösung.

Design-Vorlage: Claude Design Index A vom 27.10.2026, Folge-Entwurf Index B vom 28.10.2026 (`…/03_Design/26-10-28_Claude-Design_Index-B/Quelle_Design-Canvas/b/`, 18 Boards: Navigation, Timer, Projektseite, iPhone, Angebote, Angebot, Auftrag, Rechnung, Abrechnung, Nachkalkulation, Kunden, Projektliste, ProjektForm, Kalender, Einstellungen, Zustände, Datenmodell). Index B wird schrittweise umgesetzt, nach jedem Teil Joachims Freigabe.

## Quellen

- Anweisung: `GersterCAD-Firma/01_Unternehmen/03_Unternehmensentwicklung/Kapazitaetsplanung/02_Chat-Anweisungen/26-10-27_Anweisung_Claude-Code_Kapazitaetsplanung_Index-A.pdf`
- Entwurf (verbindlich): `…/Kapazitaetsplanung/03_Design/26-10-27_Claude-Design_Index-A/Quelle_Design-Canvas/` – `Main` = Übersicht, `Anfrage`, `Projekt`, `Einstellungen`, `Datenmodell`. Aufbau, Abstände, Farben und Texte genau so umsetzen. Die Rechenlogik in den `.dc.html` ist nur Beispiel.
- CI-Handbuch 1.6: `GersterCAD-Firma/04_Marketing-Vertrieb/01_Marke-CI/01_CI-Handbuch/GCAD_CI-Handbuch_v1.6_2026-10-27.pdf`
- Kopfzeile, Pillen, Labels und Statuschips sollen aussehen wie in Werk.ai (`~/werkai/renderer/styles.css`).
- `GersterCAD-Firma` liegt unter `~/Vectorworks Cloud Services/`.

## Arbeitsregeln

- Joachim ist kein Programmierer: Rückmeldungen auf Deutsch, verständlich, kurz.
- Oberfläche und alle Texte Deutsch, per Du, kurze Sätze.
- Umsetzung in 8 Schritten (siehe Anweisung). Nach jedem Schritt kurz zusammenfassen und auf Joachims Freigabe warten.
- Keine eigene Gestaltung, die vom Entwurf abweicht. Verbesserungen kommen später aus der Nutzung.
- **Keine Daten in diesem Repo.** Es ist öffentlich (GitHub Pages). Kundennamen und Stunden nie committen, auch nicht in Beispieldaten mit echten Namen. Echte Daten nur im Browser (IndexedDB), in `kapazitaet-daten.json` (Export, per `.gitignore` ausgeschlossen) und im privaten Repo `gcad-kapazitaet-daten`.
- Nie automatisch Samstage oder lange Tage einplanen – immer nur als Vorschlag.
- Kein Werk.ai-Code. Keine fremden Schriften oder CDN-Bibliotheken, wenn es ohne geht.

## Aufbau

- Reines HTML, CSS und JavaScript (ES-Module), kein Build-Schritt. Veröffentlicht über GitHub Pages, Repo `gcad-kapazitaet`.
- `index.html` lädt `styles/ci.css` (CI-Farben, Schrift, Pillen, Chips, Karten), `styles/app.css` (Kopfzeile, Bereiche, Inhalt) und `js/app.js`.
- `js/app.js`: Kopfzeile, Navigation, Bereiche über die Adresse (`#/uebersicht`, `#/projekte`, `#/anfragen`, `#/kalender`, `#/einstellungen`).
  - Navigation nach Index B (`Navigation.dc.html`): Übersicht · Projekte · Angebote · (Abrechnung, sobald gebaut) · Kalender. Angebote hat den Umschalter „Anfragen · Angebote“ (Anfragen = Anfrage prüfen). Einstellungen als Zahnrad in der Kopfzeile.
  - Kopfzeile: Timer-Pille (läuft = dunkel mit Stopp, über 10 h = gelb „Timer prüfen“, sonst „… weiter“ mit dem zuletzt benutzten Projekt), ein Statuspunkt für die Verbindungen („Kalender“, später „· Lexware“), Zahnrad.
  - Bis 640 px (iPhone.dc.html): Seitentitel mit „‹“ statt Marke, Bereiche als Tab-Leiste unten mit Bildzeichen, laufender Timer als dunkle Leiste darüber (nicht auf der Projektseite des laufenden Projekts).
- `js/kern/`: Rechenkern **ohne Oberfläche** (kein DOM, kein `window`), damit er später in Werk.ai eingebunden werden kann. Tests in `tests/`.
- `js/ansichten/`: je Bereich ein Modul. `js/ui.js`: kleine DOM-Hilfen (`el()`).
- Daten: `js/kern/daten.js` (Struktur `schemaVersion: 1`, `leereDaten()`, `pruefeDaten()` für Laden/Import, berechnet `soll()`, `ist()`, `rest()`). Neue Version → `SCHEMA_VERSION` hochzählen und in `migriere()` umrechnen.
  - Ergänzungen zur Anweisung: Blockzeit hat `art` (`buero` | `entwicklung`, für die Farbe im Diagramm), `wochentag` ist eine Liste (1 = Mo … 6 = Sa), z. B. Entwicklung Mo und Mi = `[1, 3]`.
- `js/zustand.js`: aktiver Datensatz im Speicher, Änderungen nur über `aendern(fn)` (speichert sofort, meldet an die Ansichten). `js/speicher.js`: IndexedDB `gcad-kapazitaet` mit den Datensätzen `echt` und `beispiel` (mischen sich nie), `meta`, `sicherungen` (letzte 20).
- `js/austausch.js`: Export `kapazitaet-daten.json` (legt vorher automatisch eine Sicherung im Browser an), Import nur nach erfolgreicher Prüfung, alter Stand wird vorher gesichert.
- Beispieldaten: `js/kern/beispiel.js`, nur erfundene Namen. Beim allerersten Start aktiv, in Einstellungen → Daten abschaltbar. Kopfzeile zeigt dann den Chip „Beispieldaten“.
- Tests: `npm test` (Node, keine Abhängigkeiten).

## Rechenkern (`js/kern/`, Einstieg `index.js`)

- `feiertage.js`: Feiertage BW je Jahr, Ostersonntag nach Gauß.
- `kapazitaet.js`: `tagesRechner()` – Tageskapazität = Regeltag (0 an Wochenende, Feiertag, Urlaub) − Blockzeiten − Termine nach Kalenderregel (`alle` | `ganztaegig` | `ignorieren`, `terminRegeln[uid].zaehltH` ersetzt Stunden). Ganztägige Termine belegen den ganzen Tag. Übernommene Vorschläge (Samstag, langer Tag, Kürzung) wirken hier.
- `planung.js`: `plane(daten, { heute, termine })` plant feste Projekte (Auftrag, läuft): fixierte Einplanungen zuerst, dann früheste Deadline → Priorität → Start, so früh wie möglich in die freie Zeit. Reicht es bis zur Deadline nicht: Rest als **Überlast** gleichmäßig vor der Deadline bis zum längsten Tag (Status `knapp`) – kein geplanter langer Tag, sondern ein Engpass, der Vorschläge auslöst. Reicht auch das nicht: regulär über die Deadline hinaus (`zuSpaet`). Vergangene Tage zeigen die gebuchte Zeit. `wochen()` fasst für Diagramm und Warnung zusammen, `warnung()`, `kennzahlen()`.
- `vorschlaege.js`: je Projekt mit Engpass in dieser Reihenfolge: verschieben (fixierte Einplanungen anderer Projekte, deren Deadline hält) → Entwicklung kürzen → Samstage → längere Tage. Jeder Vorschlag wird durchgerechnet (`loest`, `warnungDanach`). `uebernehmen()` legt ihn in `vorschlaegeUebernommen` ab, `rueckgaengig()` nimmt ihn heraus. Nie automatisch.
- `anfrage.js`: `anfragePruefen()` – drei Varianten (Regulär, Samstage, Längere Tage) mit den heute freien Stunden, ohne bestehende Projekte zu verschieben. Fertigtag: freie Stunden einer Woche gleichmäßig auf ihre Arbeitstage. Empfohlen = erste Variante, die den Wunschtermin hält.
- `lernwert.js`: Mittel aus (Ist − Schätzung) / Schätzung je Projektart, ab 3 abgeschlossenen Projekten.
- Beispieltermine (`beispielTermine()` in `beispiel.js`) ersetzen bei den Beispieldaten das Kalender-JSON. Die Beispieldaten sind so gewählt, dass die Anfrage aus dem Entwurf (56 h + 10 % ab KW 49) am Do 17.12.2026 fertig ist – bei Änderungen an `beispiel.js` den Test laufen lassen.
- Ergänzung zur Datenstruktur: Einplanungen haben eine `id` (für „verschieben“).
## Ansichten (`js/ansichten/`)

- `einstellungen.js`: Arbeitszeit (Stepper, Arbeitstage, Puffer-Regler), geblockte Zeiten, Urlaub und Feiertage, Kalender, Daten. Blockzeit und Urlaub: Kachel antippen = bearbeiten.
- `projekte.js`: Projektliste mit Filter (Aktiv, Anfragen, Abgeschlossen, Alle). `projekt.js`: Projektseite nach `Projekt.dc.html`. `projektformular.js`: anlegen/bearbeiten (`#/projekte/neu`, `#/projekte/<id>/bearbeiten`).
- `uebersicht.js`: Übersicht nach `Main.dc.html` – Kennzahlen, Warnband, Stunden je Woche (4 px je Stunde, schrumpft ab 60 h), Vorschläge (je Projekt höchstens einer pro Art; beim Verschieben der kleinste, der reicht; übernommene mit Rückgängig), diese Woche aus dem Kalender (Termine und Blockzeiten), Projektplan. Anfragen erscheinen gestrichelt mit der regulären Variante aus `anfragePruefen()` – jede Anfrage für sich, sie belegen sich gegenseitig nicht.
- `anfrage.js`: Anfrage prüfen nach `Anfrage.dc.html` (`#/anfragen` neu, `#/anfragen/<id>` gemerkte Anfrage). Empfohlen = erste Variante, die den Wunschtermin hält, sonst Regulär; Samstage zählen nicht, wenn sie in den Einstellungen aus sind. „Als Anfrage merken“ speichert ein Projekt mit Status Anfrage, „Als Auftrag einplanen“ mit Status Auftrag (Deadline = Wunschtermin, ohne Wunschtermin das reguläre Fertigdatum) und öffnet die Projektseite. Samstage oder lange Tage werden dabei nicht eingeplant – dafür gibt es danach die Vorschläge.
- Beispieldaten: Getränkebar hat fixierte Einplanungen in KW 45–48, damit Frankfurt knapp wird und Warnung und Vorschläge sichtbar sind.
- `kalender.js` (Ansicht): Woche und Monat mit Terminen, Blockzeiten und Meilensteinen. Termin antippen → `terminRegeln[uid].zaehltH` (eigene Stunden) und `projektId`. Mit Projekt wird ein Zeiteintrag mit `terminUid` angelegt (zählt als Ist) und beim Ändern ersetzt. Export der Meilensteine als `.ics`, danach `kalenderId` am Meilenstein („· Kalender“ in der Erinnerung).
- Für Liste, Formulare und den Bereich „Daten“ gibt es keinen Entwurf: nur Bausteine aus dem Entwurf verwenden (Karten, Zeilen, Pillen, Chips, Stepper, Schalter).
- Jede Änderung zeichnet die ganze Ansicht neu. Was nur die Oberfläche betrifft (offenes Formular, gewählte Position), liegt in Modulvariablen; `zustand.neuZeichnen()` zeichnet ohne Datenänderung. Knöpfe mit `data-fokus` bekommen nach dem Neuzeichnen den Fokus zurück.
- Löschen immer mit Rückfrage (`loeschKnopf`). Vor dem Löschen eines Projekts wird eine Sicherung angelegt.
- Regeln aus Schritt 4:
  - Samstag-Pille: an = Samstage dürfen vorgeschlagen werden (`samstagErlaubt: 'vorschlag'`), aus = nie. Nie automatisch.
  - Hat ein Projekt Positionen, ist die Schätzung die Summe ihrer Soll-Stunden. Soll je Position wird mit dem Projekt-Puffer angezeigt.
  - Neues Projekt mit Deadline bekommt den Meilenstein „Abgabe“ (Typ Deadline). Ändert sich die Deadline, wandert dieser Meilenstein mit.
  - Ergänzungen zur Datenstruktur: Meilenstein `notiz` (optional), Kalender `regelAn` (merkt die Regel, solange der Kalender ausgeschaltet ist).
  - Lernwert-Empfehlung: Abweichung in %, auf 0,5 gerundet, höchstens 20 %.
  - `verschiebbar` (Bürozeit) wird gespeichert, der Rechenkern nutzt es noch nicht.

## Kalender (Schritt 7)

- Lesen: Der Browser darf iCloud nicht direkt abfragen (CORS). Eine GitHub Action im privaten Repo `gcad-kapazitaet-daten` holt die ICS-Adressen (Secret `KALENDER_QUELLEN`) und schreibt `kalender.json`. Vorlage und Anleitung in `daten-repo/` – dort liegen keine Daten. Die Action checkt dieses öffentliche Repo aus und startet `daten-repo/kalender-holen.mjs`.
- `js/kern/ics.js`: ICS lesen (Zeitzonen über `Intl`, Serien DAILY/WEEKLY/MONTHLY/YEARLY mit INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, EXDATE, geänderte Einzeltermine; „frei“ und abgesagte Termine fallen weg) und Meilensteine schreiben (ganztägig, VALARM um 9 Uhr, UID `<id>@kapazitaet.gerster-cad.de`, steigende SEQUENCE).
- Termine in `kalender.json`: `{ uid, kalender, titel, ganztaegig, start, ende }`, zeitgebundene in UTC (ISO), ganztägige als Datum mit exklusivem Ende. Serientermine: `uid|YYYYMMDDTHHMM`.
- `js/github.js`: Zugang (Repo + Fine-grained-Token) nur lokal in `meta.github`, lehnt öffentliche Repos ab. `js/kalender.js`: holt `kalender.json` beim Start, alle 15 Minuten und beim Zurückkehren, speichert sie lokal (`meta.kalender`), nicht in den Kapazitätsdaten. Zum Ausprobieren auch als Datei ladbar.
- Kostenloser GitHub-Plan: 2.000 Action-Minuten im Monat für private Repos – deshalb läuft die Action nur Mo–Sa 6–21 Uhr.

## Abgleich zwischen Geräten (Schritt 8)

- Datei `kapazitaet-daten.json` im privaten Repo, nur der echte Datensatz (nie Beispieldaten). `js/abgleich.js` gleicht ab: beim Start, 2 s nach jeder Änderung, alle 5 Minuten, beim Zurückkehren in die App und wenn das Netz wieder da ist.
- `js/kern/abgleich.js`: Drei-Wege-Zusammenführung mit dem Stand des letzten Abgleichs (`meta.abgleich`: Daten + sha). Einträge je ID, Einstellungen je Feld. Nur auf einer Seite geändert → übernehmen. Auf beiden verschieden geändert (oder hier gelöscht, dort geändert) → **Konflikt**: der Abgleich hält an (`meta.abgleichKonflikt`), die App zeigt ein Hinweisband und in Einstellungen → Daten je Eintrag „Dieses Gerät“ / „Anderes Gerät“. Vor jedem Übernehmen wird gesichert.
- Schreiben über die GitHub-API mit sha: Hat ein anderes Gerät inzwischen geschrieben (409), wird neu geholt und zusammengeführt.
- Repos: `GersterCAD/gcad-kapazitaet` (öffentlich, GitHub Pages https://gerstercad.github.io/gcad-kapazitaet/) und `GersterCAD/gcad-kapazitaet-daten` (privat, Daten + Kalender-Action). Commits mit der Noreply-Adresse `345525017+GersterCAD@users.noreply.github.com`.

## Angebote (Index B: Angebote, Angebot, Auftrag)

- `js/kern/angebot.js`: `daten.angebote = [{ id, nummer ('AN 26-031', laufend je Jahr), datum, gueltigBis (+30 Tage), kunde, projektname, art, status (entwurf | versendet | angenommen | abgelehnt), stundensatz (überschreibt den Kunden), pufferImPreis, kopftext, fusstext, zahlungsbedingungen, positionen, projektId, angenommenAm, lexwareId }]`.
  - Position: `{ id, bezeichnung, beschreibung, grundH, abrechnung ('stunden' | 'pauschal'), pauschalpreis }`.
  - **Zulagen am Angebot wie im Kalkulator** (Joachim wollte sie einzeln sehen und schalten): `a.zulagen = [{ id, name, art ('fest' | 'prozent'), wert, an }]`. Fest = Stunden je Auftrag, Prozent = auf die Summe der Grundstunden. Verteilt nach Stundenanteil auf die Positionen (`pufferH(pos, a)`), geplant = Grund + Anteil. Vorlage `einstellungen.angebotZulagen` (Standard `STANDARD_ZULAGEN`: Auftrag anlegen 1 h, Materialeinstellungen 1 h, Kommunikation 3 %, Rücksprachen 8 %, Risiko 5 %, Rückläufer 20 %), im Angebot „Als Vorlage speichern“ / „Vorlage übernehmen“. Ältere Angebote mit Puffer je Position stellt `zulagenUmstellen()` beim Laden um.
  - Betrag = Satz × geplant (bzw. × Grund, wenn „Zulagen im Preis“ aus) oder Pauschalpreis. MwSt 19 %.
  - **Zwei Puffer (Joachims Entscheidung):** die Zulagen bilden das Soll. Beim Einplanen kommt der Planungspuffer 0–20 % als Projekt-Puffer obendrauf. 0 % ist erlaubt.
  - Karte „Zulagen“ hat keinen Entwurf (Bausteine: Schalter, Felder, Einheitknopf); sie steht am Rand bzw. über die volle Breite über Summen/Kapazität, schmal zweizeilig (Container-Query).
  - `angebotAnnehmen()`: legt ein Projekt (Status Auftrag) mit den gewählten Positionen an, `sollH` = geplante Stunden, `angebotPositionId` und `preis` an der Projektposition, `angebotId` am Projekt, Meilenstein „Abgabe“ bei Deadline. Nur Pauschal-Positionen → Pauschalprojekt. Nie Samstage oder lange Tage. `annahmeZuruecknehmen()` nur, solange keine Zeit gebucht ist.
- `js/ansichten/angebote.js`: `#/angebote` (Liste mit Kennzahlen und Filter), `#/angebote/<id>` (bearbeiten, speichert sofort – deshalb kein „Speichern“-Knopf), `#/angebote/<id>/auftrag` (Auftrag einplanen, grauer Hintergrund wie im Entwurf). Positionen bis 1180 px als Karten, am iPhone Summe und Aktion unten fest.
- „An Lexware Office übertragen“ legt einen Angebotsentwurf an (`lexwareAngebot()`: Stunden-Positionen als Menge × Satz, Pauschal als 1 × Preis). Noch offen: „PDF ansehen“ (macht Lexware), Kopf-/Fußtext-Vorlagen.
- Beispieldaten: drei erfundene Angebote (Entwurf, versendet, abgelehnt).

## Rechnungen und Lexware Office (Index B: Abrechnung, Rechnung, Zustände)

- `js/kern/rechnung.js`: `daten.rechnungen = [{ id, projektId, art (stunden | pauschal | abschlag | teil), titel, erstellt, leistungVon, leistungBis, zeilen: [{ titel, beschreibung, menge, einheit, preis, betrag }], eintraege, netto, status, lexwareId, uebertragen, fehler }]`.
  - Status: `entwurf` (in der App) → `sendet` → `uebertragen` (Entwurf in Lexware) oder `fehler`; ohne Lexware `erledigt` („von Hand abgerechnet“). Beim Anlegen bekommen die Zeiteinträge `rechnungId` (nicht mehr offen), bei `uebertragen`/`erledigt` zusätzlich `abgerechnet`. Löschen gibt sie wieder frei.
  - Stunden: Zeilen aus `rechnungsZeilen()` („Planungsleistung Fr 23.10.“, darunter Positionen und Notizen), Satz × Stunden. Pauschal = Schlussrechnung (Positionspreise aus dem Angebot oder Pauschalpreis, abzüglich Abschläge und Teilrechnungen, schließt die offenen Stunden mit ab). Abschlag in % vom Pauschalpreis. Teilrechnung = gewählte Positionen mit Preis.
  - `offenUebersicht()`: je Projekt offene Stunden/Beträge, „länger als 30 Tage“.
- Ansichten (`js/ansichten/abrechnung.js`): Bereich **Abrechnung** (5. Tab) mit Umschalter Offen · Rechnungen (Nachkalkulation folgt), `#/projekte/<id>/rechnung` = Rechnung erstellen. Projektseite: „Rechnung erstellen“ in „Offen zur Abrechnung“.
- **Lexware Office über GitHub** (Joachims Entscheidung, sicherer als ein eigener Dienst): die App legt `lexware/auftraege/<id>.json` im privaten Repo ab, die Action `daten-repo/lexware.yml` (dort `.github/workflows/lexware.yml`, Secret `LEXWARE_API_KEY`) startet bei diesem Push, ruft `api.lexware.io` auf (`daten-repo/lexware.mjs`) und schreibt `lexware/ergebnisse/<id>.json`, `status.json`, `kontakte.json`.
  - Nur drei Arten: `rechnung` (POST /v1/invoices), `angebot` (POST /v1/quotations), `kontakte`. Immer ohne `finalize` → nur Entwürfe. Die Nutzlast wird in der Action aus erlaubten Feldern neu gebaut (`rechnungNutzlast`, `angebotNutzlast`), Datum in deutscher Zeit, Leistungszeitraum als `serviceperiod`. Fehler werden übersetzt, der Originaltext steht unter „Details“.
  - `js/lexware.js`: Aufträge ablegen, alle 15 s nach dem Ergebnis schauen (offene Aufträge in `meta.lexware`, überleben Neuladen), Kontakt-ID über den Kundennamen (`lexwareKontaktId` am Kunden geht vor). Mit Beispieldaten aus. Der API-Schlüssel kommt nie in die App (Abweichung vom Entwurf, dort Eingabefeld).
  - Kopfzeile: „Kalender · Lexware“ mit einem Punkt, rot bei Lexware-Fehler. Einstellungen: Karte „Lexware Office verbinden“ mit „Verbindung prüfen“ (= Auftrag `kontakte`).
  - Anleitung für Joachim: `Kapazitaetsplanung/04_Anleitungen/26-10-28_Anleitung_Lexware-Office-verbinden.pdf`. Tests: `tests/lexware.test.js` (mit nachgebautem fetch).
- Deeplink nach Lexware: `https://app.lexoffice.de/permalink/<invoices|quotations>/edit/<id>` (in `lexware.link()`).

## Nachkalkulation (Index B: Nachkalkulation, NachkalkUebersicht)

- Rechnet wie Joachims Werkzeug „Nachkalk“ (Kalkulator-Modul, Analyse: `Kapazitaetsplanung/05_Analyse/26-10-28_Analyse_Nachkalkulation.md`). `js/kern/nachkalkulation.js`:
  - Ist je Position aus den Zeiteinträgen. Zeit ohne Position wird nach Preisanteil verteilt, auf Positionen ohne eigene Buchung, sonst auf alle (Mischbetrieb). Zeit auf abgelehnten Positionen zählt nicht.
  - Erlös je Position: Preis aus dem Angebot, sonst Pauschalpreis nach Soll-Anteil, sonst Ist × Satz (Satz von Auftrag/Kunde, sonst Ziel-Satz als Annahme). Status `unverguetet` = Erlös 0, `abgelehnt` = fällt raus.
  - Kosten `daten.kosten = [{ id, projektId, art (material | fremd | reise | sonstiges), bez, datum, betrag, km?, positionNr, weiter }]`. Fahrt: Betrag = km × km-Satz beim Eintragen. Ohne Position nach Erlösanteil umgelegt.
  - Kennzahlen: DB, Marge, **Ist-Satz = DB ÷ Ist**, Soll-Satz, Gewinn (DB − Ist × Selbstkosten), nicht erlöste Mehrleistung, Break-even, Kapazitätsbindung.
  - **Ampel nach Joachims Regel** (nicht die 10-%-Regel aus dem Entwurf): grün ≥ Ziel-Satz, gelb deckt die Selbstkosten, rot darunter.
  - Einstellungen `einstellungen.nachkalk = { zielSatz, selbstkosten, jahresstunden, kmSatz }` (Standard ohne Joachims Werte, die trägt er selbst ein). Rechenhilfe Fixkosten ÷ Jahresstunden.
- Projektpositionen: `typ` (auftrag | nachtrag | regie), `status` (verguetet | unverguetet | abgelehnt), im Projektformular als „Art“. Das Formular behält beim Speichern alle Felder der Position (`preis`, `angebotPositionId` …).
- Ansichten (`js/ansichten/nachkalkulation.js`): `#/projekte/<id>/nachkalkulation` (Knopf „Nachkalkulation“ auf der Projektseite) und `#/abrechnung/nachkalkulation` (dritter Reiter unter Abrechnung). Laufende Projekte: „vorläufig“, Abweichung erst nach Abschluss. Ergebnisrechnung und Kostenformular ohne eigenen Entwurf.
- Später: Export Excel/PDF. Alte Aufträge aus dem Werkzeug werden nicht übernommen.

## Zeitstopper (ersetzt Tyme)

- `daten.timer = { projektId, positionNr, notiz, start }` – höchstens einer, liegt in den Daten und kommt per Abgleich auf alle Geräte (zwei verschiedene Timer = Konflikt).
- `js/kern/timer.js`: Start (stoppt einen laufenden vorher), Stopp → Zeiteinträge mit `von`/`bis` und `quelle: 'timer'`, über Mitternacht je Tag getrennt, gerundet nach `einstellungen.timerRundung` (6, 15 oder 30 Min., Standard 15, mindestens eine Stufe, unter 1 Min. nichts). Anderes Ende für vergessene Timer (ab 10 h fragt die Projektseite).
- Oberfläche nach Index B (`js/ansichten/zeitstopper.js`): Karte „Zeitstopper“ oben auf der Projektseite mit vier Zuständen (bereit mit Positions-Pillen, läuft dunkel mit „Position wechseln“, gestoppt mit „Gebucht: … (von–bis)“ + Rückgängig/Neu starten, vergessen über 10 h mit Uhrzeit-Pillen, Vorschlag und „Verwerfen“). Buchen von Hand steht daneben unter „Von Hand buchen“.
  - `endeVorschlag()`: Ende des letzten Termins am Starttag, sonst Start + Regeltag, auf die volle Stunde aufgerundet. `stundenBis()` zeigt vorher, was gebucht würde.
  - Schnellstart: runder Startknopf in Projektliste und Projektplan (aktive Aufträge), am iPhone „Weiterarbeiten“ auf der Übersicht. Startet mit der zuletzt benutzten Position (`zuletztBenutzt()`), der zuletzt benutzte Knopf ist gefüllt.
- `js/stoppuhr.js`: Bedienung, „Rückgängig“ nach dem Stoppen (Buchung weg, Timer läuft weiter), Sekundenanzeige über `data-timer-lauf` ohne Neuzeichnen. Kopfzeile zeigt den laufenden Timer mit „Stoppen“ in jeder Ansicht.
- Später Lexware Office (Public API, Tarif XL vorhanden): Rechnungsentwürfe aus Zeiteinträgen. `von`/`bis`/`notiz` sind dafür schon da.
- `js/kern/abrechnung.js`: `rechnungsZeilen()` fasst offene Zeiteinträge (ohne `abgerechnet`) zusammen, nach `einstellungen.abrechnungZusammenfassen`: `tag` (Standard, Joachims Wunsch: je Tag und Projekt eine Zeile, damit viele kleine Einträge nicht kleinlich wirken), `tagPosition`, `einzeln`. Text: Datum · Positionen · Notizen. Einsteller in Einstellungen → Abrechnung, Vorschau „Offen zur Abrechnung“ auf der Projektseite. Nach der Übergabe bekommen die Einträge `abgerechnet` (Datum).
- Stundensätze und Pauschalpreise: `daten.kunden = [{ id, name, stundensatz }]` (Zuordnung über den Kundennamen im Projekt, später auch die Lexware-Kontakt-ID). Projekt: `abrechnungsart` (`stunden` | `pauschal`), `stundensatz` (überschreibt den Satz des Kunden), `pauschalpreis`. `stundensatz()`: Auftrag vor Kunde. Bei Pauschal zeigt die Projektseite den effektiven Stundensatz (Pauschalpreis / Ist). Joachim will künftig mehr pauschal abrechnen.

- PWA: `manifest.json`, `sw.js` (Netz zuerst, ohne Netz aus dem Cache). **Bei jeder neuen oder geänderten Datei `VERSION` in `sw.js` hochzählen und die Datei in `HUELLE` eintragen.**
- Schrift: Inter als woff2 in `schrift/` (OFL), nicht von Google laden. Bildzeichen in `bilder/`.
- Lokal starten: `python3 -m http.server 8130` im Repo, dann http://localhost:8130.

## CI-Regeln (CI 1.6)

| Rolle | Wert | Einsatz |
|---|---|---|
| Graphit | `#1D1D1F` | Text, Kapazitätslinie, gewählte Pillen |
| Hellgrau | `#F5F5F7` | Kacheln, Seitenspalten, Eingabebereich |
| Grau · Linie | `#6E6E73` · `#D2D2D7` | Nebentext und Labels · Trennlinien, Rahmen |
| Greige | `#D6D1CA` / `#ECE9E4` | Blockzeiten Büro / Entwicklung |
| Stahlblau | `#445F6E`, hell `#7C93A0`, `#B4C3CC` | einzige Akzentfarbe: Haupt-Button, Links, Projektbalken. Anfragen: gestrichelter Rand |
| Prüffarben | Grün `#1E7D3C`/`#EAF4EC` · Gelb `#6B4500`/`#FFEFC2` · Rot `#A1261B`/`#FBE9E7` | im Plan · knapp, Warnung · zu spät |

- Inter 400, 500, 600, keine Kursiven. Display 64/40 px, Überschrift 32/22 px, Einleitung 21/19 px, Fließtext 17 px (in der App 13–14 px), Label 11–12 px Versalien gesperrt.
- Abstände in 8er-Schritten. Karten Radius 12 px, Eingabefelder 8 px, Buttons vollständig gerundet, Linien 1 px.
- Keine Schatten außer bei schwebenden Elementen. Keine Verläufe, keine Emojis, keine Deko-Icons.
- Zahlen mit `tabular-nums` (Klasse `.zahl`), deutsches Zahlenformat (Komma).
- Klickflächen mindestens 44 px (Pillen sind 32 px hoch, die Klickfläche wird per `::after` erweitert).
- Bei Handybreite stapeln sich die Spalten, Diagramm und Zeitplan scrollen waagerecht in ihrem Kasten.
- Prüfen bei 390 px (iPhone), 1024 px (iPad) und 1440 px, mit Bildschirmfotos.
