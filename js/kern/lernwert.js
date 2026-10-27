// Lernwert: Wie weit lagen abgeschlossene Projekte gleicher Art über oder unter der Schätzung?
// Mittelwert von (Ist − Schätzung) / Schätzung. Angezeigt ab 3 Projekten derselben Art. Ohne Oberfläche, ohne DOM.

import { ist } from './daten.js';

export const LERNWERT_AB = 3;

/** { [art]: { art, anzahl, abweichung (z. B. 0.2 = 20 % mehr), anzeigen } } */
export function lernwerte(daten) {
  const jeArt = {};
  for (const p of daten.projekte) {
    if (p.status !== 'abgeschlossen' || !p.art || !(p.schaetzungH > 0)) continue;
    (jeArt[p.art] ??= []).push((ist(daten, p.id) - p.schaetzungH) / p.schaetzungH);
  }
  const ergebnis = {};
  for (const [art, werte] of Object.entries(jeArt)) {
    const abweichung = werte.reduce((s, x) => s + x, 0) / werte.length;
    ergebnis[art] = { art, anzahl: werte.length, abweichung: Math.round(abweichung * 1000) / 1000, anzeigen: werte.length >= LERNWERT_AB };
  }
  return ergebnis;
}

/** Lernwert für eine Art oder null, wenn es noch zu wenige Projekte gibt */
export function lernwert(daten, art) {
  const w = lernwerte(daten)[art];
  return w?.anzeigen ? w : null;
}
