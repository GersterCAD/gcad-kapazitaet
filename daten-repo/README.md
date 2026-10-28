# Vorlage für das private Daten-Repo `gcad-kapazitaet-daten`

Hier liegen **keine Daten**, nur die Vorlage für das private Repo. Die echten Daten und Termine gehören nur dorthin.

## Einrichten (einmal)

1. Auf GitHub ein **privates** Repo `GersterCAD/gcad-kapazitaet-daten` anlegen.
2. `kalender.yml` dort als `.github/workflows/kalender.yml` ablegen.
3. Kalenderadressen holen (iCloud: Kalender-App → Kalender teilen → „Öffentlicher Kalender“ → Link kopieren, beginnt mit `webcal://`).
   Achtung: Wer diesen Link kennt, kann den Kalender lesen. Deshalb liegt er nur als Secret im privaten Repo.
4. Im privaten Repo unter *Settings → Secrets and variables → Actions* das Secret `KALENDER_QUELLEN` anlegen:

   ```json
   [
     { "name": "Gerster CAD", "url": "webcal://…" },
     { "name": "Privat", "url": "webcal://…", "titel": false },
     { "name": "Familie", "url": "webcal://…", "titel": false }
   ]
   ```

   Die Namen müssen zu den Kalendern in den Einstellungen der App passen. `"titel": false` speichert nur „belegt“ statt des Termintitels.
5. Unter *Actions* den Ablauf „Kalender holen“ einmal von Hand starten. Danach läuft er Mo–Sa von 6 bis 21 Uhr alle 15 Minuten.
6. Einen **Fine-grained-Token** anlegen (GitHub → Settings → Developer settings → Personal access tokens → Fine-grained):
   nur Repo `gcad-kapazitaet-daten`, Berechtigung *Contents: Read and write*. Den Token in der App unter Einstellungen → Daten → „Abgleich über GitHub“ eintragen – auf jedem Gerät einmal. Er bleibt nur auf dem Gerät.

## Was die Action macht

`app/daten-repo/kalender-holen.mjs` holt die Kalender, löst Serientermine für 60 Tage zurück bis 400 Tage voraus auf und schreibt `kalender.json`. Sie speichert nur, wenn sich etwas geändert hat. Fällt ein Kalender aus, bleibt sein letzter Stand erhalten.

## Lexware Office (Rechnungs- und Angebotsentwürfe)

Der Browser darf Lexware Office nicht direkt aufrufen, und der API-Schlüssel soll nie auf einem Gerät liegen. Deshalb legt die App Aufträge im privaten Repo ab (`lexware/auftraege/`). Die Action `lexware.yml` schickt sie an Lexware Office (`api.lexware.io`) und legt die Antwort zurück (`lexware/ergebnisse/`). Das dauert etwa eine Minute.

1. In Lexware Office unter *Erweiterungen → Public API* einen API-Schlüssel erzeugen (Tarif XL).
2. Im privaten Repo unter *Settings → Secrets and variables → Actions* das Secret `LEXWARE_API_KEY` anlegen und den Schlüssel einfügen.
3. `lexware.yml` dort als `.github/workflows/lexware.yml` ablegen.
4. In der App unter Einstellungen → „Lexware Office verbinden“ auf „Verbindung prüfen“ tippen. Nach etwa einer Minute steht dort „verbunden“ und wie viele Kontakte gelesen wurden.
5. Den Token in der App **nicht** um das Recht *Workflows* erweitern. Dann kann niemand mit dem Token die Action ändern und an den Schlüssel kommen.

Was die Action darf: nur **Entwürfe** anlegen (Rechnungen und Angebote, nie festschreiben, nie versenden) und Kontakte lesen. Die Nutzlast für Lexware baut sie aus erlaubten Feldern neu. Trennen: das Secret `LEXWARE_API_KEY` löschen.

Ablage im privaten Repo: `lexware/status.json` (verbunden, Konto), `lexware/kontakte.json` (Kundenname und Kontakt-ID, für die Zuordnung), Ergebnisse werden nach 30 Tagen gelöscht.
