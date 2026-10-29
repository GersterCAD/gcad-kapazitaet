// Nachträge direkt beim Zeitstopper: Kunde ändert etwas → Zeit auf eine Nachtrag-Position („N1“, „N2“ …).
// Ohne Oberfläche, ohne DOM. Nachtrag und Regie ohne eigenen Preis werden nach Stunden abgerechnet,
// auch in Pauschalprojekten – so geht keine Mehrleistung verloren.

import { offen } from './abrechnung.js';

const runde2 = (x) => Math.round(x * 100) / 100;

/** Wird diese Position nach Stunden abgerechnet, obwohl das Projekt pauschal oder mit Positionspreisen läuft? */
export const nachStundenPosition = (x) => ['nachtrag', 'regie'].includes(x?.typ) && (x.status ?? 'verguetet') === 'verguetet' && !(x.preis > 0);

/** Nachtrag-Positionen eines Projekts (ohne abgelehnte) */
export const nachtraege = (p) => (p?.positionen ?? []).filter((x) => x.typ === 'nachtrag' && x.status !== 'abgelehnt');

/** Nächste Nummer „N1“, „N2“ … */
export function naechsteNachtragNr(p) {
  const n = (p.positionen ?? []).map((x) => /^N(\d+)$/.exec(x.nr ?? '')).filter(Boolean).map((m) => Number(m[1]));
  return `N${(n.length ? Math.max(...n) : 0) + 1}`;
}

/** Neue Nachtrag-Position anlegen (ändert daten). Gibt die Nummer zurück. Soll 0 h, wird nach Stunden berechnet. */
export function nachtragAnlegen(daten, projektId, { bezeichnung = '' } = {}) {
  const p = daten.projekte.find((x) => x.id === projektId);
  if (!p) throw new Error('Projekt nicht gefunden.');
  const nr = naechsteNachtragNr(p);
  p.positionen.push({ nr, bezeichnung: bezeichnung.trim() || `Nachtrag ${nr.slice(1)}`, sollH: 0, typ: 'nachtrag', status: 'verguetet' });
  return nr;
}

/** Zeiteinträge auf eine andere Position umbuchen (ändert daten), nur noch nicht abgerechnete */
export function umbuchen(daten, ids, positionNr) {
  const s = new Set(ids);
  let n = 0;
  for (const z of daten.zeiteintraege) if (s.has(z.id) && offen(z)) { z.positionNr = positionNr; n++; }
  return n;
}

/** Offene Stunden auf Positionen, die nach Stunden laufen: [{ nr, bezeichnung, stunden, eintraege }] */
export function nachStundenOffen(daten, projektId) {
  const p = daten.projekte.find((x) => x.id === projektId);
  const pos = (p?.positionen ?? []).filter(nachStundenPosition);
  return pos.map((x) => {
    const e = daten.zeiteintraege.filter((z) => z.projektId === projektId && z.positionNr === x.nr && offen(z));
    return { nr: x.nr, bezeichnung: x.bezeichnung, typ: x.typ, stunden: runde2(e.reduce((s, z) => s + z.stunden, 0)), eintraege: e.map((z) => z.id) };
  }).filter((x) => x.stunden > 0);
}
