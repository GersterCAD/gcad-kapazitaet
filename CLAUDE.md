# Kapazität von Gerster CAD

Web-App, mit der Joachim (Einzelunternehmer, CAD- und Innenausbauplanung) seine Aufträge nach Stunden plant: Auslastung der nächsten Wochen, passt eine Anfrage rein, wann ist sie realistisch fertig, Warnung bei zu vielen langen Wochen, Vorschläge zur Lösung.

Design-Vorlage: Claude Design Index A vom 27.10.2026.

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
