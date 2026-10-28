// Läuft in der GitHub Action des privaten Repos gcad-kapazitaet-daten (siehe kalender.yml).
// Holt die freigegebenen Kalender (ICS-Adressen aus dem Secret KALENDER_QUELLEN), löst Serien auf
// und schreibt kalender.json. Die Datei wird nur neu geschrieben, wenn sich Termine geändert haben.
//
// KALENDER_QUELLEN (Secret, JSON):
//   [{ "name": "Gerster CAD", "url": "webcal://…" },
//    { "name": "Privat", "url": "webcal://…", "titel": false }]   ← titel: false speichert nur „belegt“

import { readFile, writeFile } from 'node:fs/promises';
import { termineAusIcs, KALENDER_NAME } from '../js/kern/ics.js';

const ZIEL = process.argv[2] || 'kalender.json';
const tag = (d) => d.toISOString().slice(0, 10);
const heute = new Date();
const fenster = { von: tag(new Date(heute.getTime() - 60 * 86400000)), bis: tag(new Date(heute.getTime() + 400 * 86400000)) };

let quellen;
try { quellen = JSON.parse(process.env.KALENDER_QUELLEN || '[]'); } catch { console.error('KALENDER_QUELLEN ist kein gültiges JSON.'); process.exit(1); }
if (!quellen.length) { console.log('Noch keine Kalender eingetragen (Secret KALENDER_QUELLEN fehlt).'); process.exit(0); }

let alt = null;
try { alt = JSON.parse(await readFile(ZIEL, 'utf8')); } catch { /* erste Ausführung */ }

const kalender = [];
const termine = [];
for (const q of quellen) {
  if (q.name === KALENDER_NAME) continue; // den eigenen Meilenstein-Kalender nicht zurücklesen
  try {
    const url = q.url.replace(/^webcal:/i, 'https:');
    const antwort = await fetch(url, { headers: { 'User-Agent': 'gcad-kapazitaet' } });
    if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
    const liste = termineAusIcs(await antwort.text(), q.name, { ...fenster, titel: q.titel !== false });
    termine.push(...liste);
    kalender.push({ name: q.name, anzahl: liste.length, ok: true });
  } catch (f) {
    // Bei einem Fehler den letzten Stand dieses Kalenders behalten, damit nichts verschwindet
    const behalten = (alt?.termine ?? []).filter((t) => t.kalender === q.name);
    termine.push(...behalten);
    kalender.push({ name: q.name, anzahl: behalten.length, ok: false, fehler: String(f.message || f) });
    console.error(`${q.name}: ${f.message || f}`);
  }
}
termine.sort((a, b) => a.start.localeCompare(b.start) || a.uid.localeCompare(b.uid));

const inhalt = JSON.stringify({ termine, kalender: kalender.map(({ name, anzahl, ok }) => ({ name, anzahl, ok })) });
const vorher = alt ? JSON.stringify({ termine: alt.termine, kalender: (alt.kalender ?? []).map(({ name, anzahl, ok }) => ({ name, anzahl, ok })) }) : null;
if (inhalt === vorher) { console.log('Keine Änderung.'); process.exit(0); }

await writeFile(ZIEL, JSON.stringify({ schemaVersion: 1, stand: heute.toISOString(), fenster, kalender, termine }, null, 1) + '\n');
console.log(`kalender.json: ${termine.length} Termine aus ${kalender.length} Kalendern.`);
