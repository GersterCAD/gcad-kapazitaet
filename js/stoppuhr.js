// Bedienung des Zeitstoppers: starten, stoppen, rückgängig, Sekundenanzeige.
// Die Logik steckt in js/kern/timer.js, der Timer selbst in den Daten (daten.timer).

import * as zustand from './zustand.js';
import { timerStarten, timerStoppen, laufzeit, dauerText } from './kern/timer.js';

let letzte = null; // { eintraege, timer } – für „Rückgängig“ nach dem Stoppen

export const laeuft = () => zustand.aktuell().timer ?? null;
export const letzteBuchung = () => letzte;
export const vergessen = () => { letzte = null; };

export async function starten(projektId, positionNr, notiz = '') {
  // letzte wird im Änderungsschritt gesetzt, damit die neu gezeichnete Seite die Meldung schon zeigt
  await zustand.aendern((d) => {
    const vorher = d.timer;
    const gestoppt = timerStarten(d, { projektId, positionNr, notiz });
    letzte = gestoppt.length ? { eintraege: gestoppt, timer: vorher } : null;
  });
}

export async function stoppen(ende) {
  let neu = [];
  await zustand.aendern((d) => {
    const vorher = d.timer;
    neu = timerStoppen(d, new Date(), { ende });
    letzte = { eintraege: neu, timer: vorher };
  });
  return neu;
}

/** Stoppen zurücknehmen: Buchungen löschen, Timer läuft weiter, als wäre nichts gewesen */
export async function rueckgaengig() {
  const l = letzte;
  if (!l) return;
  letzte = null;
  const ids = new Set(l.eintraege.map((z) => z.id));
  await zustand.aendern((d) => {
    d.zeiteintraege = d.zeiteintraege.filter((z) => !ids.has(z.id));
    if (l.timer && !d.timer) d.timer = l.timer;
  });
}

export async function notizSetzen(notiz) {
  await zustand.aendern((d) => { if (d.timer) d.timer.notiz = notiz; });
}

/** Alle Elemente mit data-timer-lauf jede Sekunde aktualisieren, ohne die Seite neu zu zeichnen */
export function ticken() {
  setInterval(() => {
    const t = laeuft();
    if (!t) return;
    const text = dauerText(laufzeit(t));
    document.querySelectorAll('[data-timer-lauf]').forEach((e) => { e.textContent = text; });
  }, 1000);
}
