// Gesetzliche Feiertage Baden-Württemberg, je Jahr berechnet. Ostersonntag nach Gauß (Form nach Lichtenberg).

import { alsText, plusTage } from './datum.js';

/** Ostersonntag als Date */
export function ostersonntag(jahr) {
  const k = Math.floor(jahr / 100);
  const m = 15 + Math.floor((3 * k + 3) / 4) - Math.floor((8 * k + 13) / 25);
  const s = 2 - Math.floor((3 * k + 3) / 4);
  const a = jahr % 19;
  const d = (19 * a + m) % 30;
  const r = Math.floor((d + Math.floor(a / 11)) / 29);
  const og = 21 + d - r;
  const sz = 7 - ((jahr + Math.floor(jahr / 4) + s) % 7);
  const oe = 7 - ((og - sz) % 7);
  return new Date(jahr, 2, og + oe); // Tag im März, läuft bei Bedarf in den April über
}

const cache = new Map();

/** [{ datum: 'YYYY-MM-DD', name }] nach Datum sortiert */
export function feiertageBW(jahr) {
  if (cache.has(jahr)) return cache.get(jahr);
  const ostern = ostersonntag(jahr);
  const fest = (m, t, name) => ({ datum: alsText(new Date(jahr, m - 1, t)), name });
  const beweglich = (tage, name) => ({ datum: alsText(plusTage(ostern, tage)), name });
  const liste = [
    fest(1, 1, 'Neujahr'),
    fest(1, 6, 'Heilige Drei Könige'),
    beweglich(-2, 'Karfreitag'),
    beweglich(1, 'Ostermontag'),
    fest(5, 1, 'Tag der Arbeit'),
    beweglich(39, 'Christi Himmelfahrt'),
    beweglich(50, 'Pfingstmontag'),
    beweglich(60, 'Fronleichnam'),
    fest(10, 3, 'Tag der Deutschen Einheit'),
    fest(11, 1, 'Allerheiligen'),
    fest(12, 25, '1. Weihnachtstag'),
    fest(12, 26, '2. Weihnachtstag'),
  ].sort((x, y) => x.datum.localeCompare(y.datum));
  cache.set(jahr, liste);
  return liste;
}

/** Name des Feiertags oder null */
export function feiertag(datumText) {
  const jahr = Number(datumText.slice(0, 4));
  return feiertageBW(jahr).find((f) => f.datum === datumText)?.name ?? null;
}
