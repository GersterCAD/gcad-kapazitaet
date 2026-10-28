// Aktueller Stand der App: welcher Datensatz aktiv ist und dessen Daten.
// Jede Änderung läuft über aendern(), wird sofort gespeichert und an die Ansichten gemeldet.

import * as speicher from './speicher.js';
import { leereDaten, pruefeDaten } from './kern/daten.js';
import { beispielDaten, beispielTermine } from './kern/beispiel.js';
import { alsText } from './kern/datum.js';

let satz = 'echt';
let daten = leereDaten();
const hoerer = new Set();

export const aktiverSatz = () => satz;
export const istBeispiel = () => satz === 'beispiel';
export const aktuell = () => daten;

/** Heute als Text (YYYY-MM-DD) */
export const heute = () => alsText(new Date());

/** Optionen für plane(): heute und Termine. Bis der Kalender angebunden ist (Schritt 7), nur bei den Beispieldaten Termine. */
export const planOptionen = () => ({ heute: heute(), termine: istBeispiel() ? beispielTermine() : [] });

/** Jetzigen Stand sichern, z. B. vor dem Löschen eines Projekts */
export const sichern = (anlass) => speicher.sicherungAnlegen(satz, daten, anlass);

export function abonnieren(f) { hoerer.add(f); return () => hoerer.delete(f); }
const melden = () => hoerer.forEach((f) => f(daten));

/** Ansicht neu zeichnen, ohne Daten zu ändern (z. B. Formular auf- oder zuklappen) */
export const neuZeichnen = () => melden();

/** Beim Start: zuletzt aktiven Datensatz laden. Beim allerersten Start die Beispieldaten zeigen. */
export async function starten() {
  const gemerkt = await speicher.metaLaden('aktiverSatz');
  const echt = await speicher.satzLaden('echt');
  satz = gemerkt ?? (echt ? 'echt' : 'beispiel');
  await laden(satz);
  speicher.dauerhaftAnfragen().catch(() => {});
}

async function laden(name) {
  let d = await speicher.satzLaden(name);
  if (!d) {
    d = name === 'beispiel' ? beispielDaten() : leereDaten();
    await speicher.satzSpeichern(name, d);
  }
  const p = pruefeDaten(d);
  if (!p.ok) console.warn('Gespeicherte Daten mit Hinweisen:', p.fehler);
  daten = p.daten ?? leereDaten();
}

/** Beispieldaten an/aus. Deine echten Daten bleiben dabei unberührt. */
export async function beispielSchalten(an) {
  satz = an ? 'beispiel' : 'echt';
  await speicher.metaSpeichern('aktiverSatz', satz);
  await laden(satz);
  melden();
}

/** Beispieldaten auf den Anfangsstand zurücksetzen */
export async function beispielZuruecksetzen() {
  await speicher.satzLoeschen('beispiel');
  if (satz === 'beispiel') { await laden('beispiel'); melden(); }
}

/** Daten ändern: fn bekommt eine Kopie und ändert sie. */
export async function aendern(fn) {
  const neu = structuredClone(daten);
  fn(neu);
  daten = neu;
  await speicher.satzSpeichern(satz, daten);
  melden();
}

/** Daten komplett ersetzen (Import, Wiederherstellen). Vorher wird der alte Stand gesichert. */
export async function ersetzen(neu, anlass) {
  await speicher.sicherungAnlegen(satz, daten, anlass);
  daten = neu;
  await speicher.satzSpeichern(satz, daten);
  melden();
}
