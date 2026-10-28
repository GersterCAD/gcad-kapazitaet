// Gelesene Kalendertermine (aus kalender.json im privaten Daten-Repo, geschrieben von der GitHub Action).
// Die Termine liegen nur im Browser (IndexedDB, meta 'kalender'), nicht in den Kapazitätsdaten.

import * as speicher from './speicher.js';
import * as github from './github.js';

let stand = { termine: [], kalender: [], stand: null, abgeglichen: null, quelle: null, fehler: null };
const hoerer = new Set();
const melden = () => hoerer.forEach((f) => f());

export const abonnieren = (f) => { hoerer.add(f); return () => hoerer.delete(f); };
export const termine = () => stand.termine;
export const info = () => stand;

export async function starten() {
  stand = { ...stand, ...((await speicher.metaLaden('kalender')) ?? {}) };
}

function uebernehmen(json, quelle) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  if (!d || !Array.isArray(d.termine)) throw new Error('Das ist keine Kalenderdatei (kalender.json).');
  const termine = d.termine.filter((t) => t && t.uid && t.start && typeof t.kalender === 'string');
  stand = { termine, kalender: d.kalender ?? [], stand: d.stand ?? null, abgeglichen: new Date().toISOString(), quelle, fehler: null };
}

/** Von GitHub holen (wenn verbunden). Fehler werden gemerkt und angezeigt, die alten Termine bleiben. */
export async function abgleichen() {
  if (!github.verbunden()) return false;
  try {
    const text = await github.dateiHolen('kalender.json');
    if (text == null) throw new Error('Im Daten-Repo gibt es noch keine kalender.json. Läuft die GitHub Action schon?');
    uebernehmen(text, 'github');
  } catch (f) {
    stand = { ...stand, fehler: f.message };
  }
  await speicher.metaSpeichern('kalender', stand);
  melden();
  return !stand.fehler;
}

/** kalender.json von Hand laden (z. B. zum Ausprobieren) */
export async function dateiLaden(datei) {
  uebernehmen(await datei.text(), 'datei');
  await speicher.metaSpeichern('kalender', stand);
  melden();
}

/** Alle 15 Minuten und beim Zurückkehren in die App abgleichen */
export function automatisch() {
  const los = () => { if (github.verbunden()) abgleichen(); };
  los();
  setInterval(los, 15 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !github.verbunden()) return;
    const alt = stand.abgeglichen ? Date.now() - new Date(stand.abgeglichen) : Infinity;
    if (alt > 5 * 60 * 1000) abgleichen();
  });
}

/** „vor 5 Min.“, „vor 3 Std.“, „am 27.10.“ */
export function vorText(iso) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  if (min < 24 * 60) return `vor ${Math.round(min / 60)} Std.`;
  const d = new Date(iso);
  return `am ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

/** Uhrzeit eines Termins in Ortszeit: „09:00“ */
export function uhrzeit(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
