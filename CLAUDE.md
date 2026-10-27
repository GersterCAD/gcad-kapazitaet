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
