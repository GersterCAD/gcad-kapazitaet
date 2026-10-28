// Rechnungszeilen aus Zeiteinträgen – Vorbereitung für Lexware Office. Ohne Oberfläche, ohne DOM.
// Standard: je Tag und Projekt eine Zeile, damit viele kleine Einträge (0,5 h + 0,75 h + 2 h) nicht kleinlich wirken.

import { ausText, tagLang } from './datum.js';

export const ZUSAMMENFASSEN = [
  { id: 'tag', name: 'je Tag', text: 'Eine Zeile je Tag und Projekt' },
  { id: 'tagPosition', name: 'je Tag und Position', text: 'Eine Zeile je Tag und Position' },
  { id: 'einzeln', name: 'jeder Eintrag', text: 'Jeder Zeiteintrag als eigene Zeile' },
];
export const STANDARD_ZUSAMMENFASSEN = 'tag';

const runde = (h) => Math.round(h * 100) / 100;

/**
 * Rechnungszeilen eines Projekts: noch nicht abgerechnete Zeiteinträge, optional im Zeitraum [von, bis].
 * Ergebnis: [{ datum, stunden, text, positionen: [nr], eintraege: [id] }], nach Datum sortiert.
 */
export function rechnungsZeilen(daten, projektId, { von, bis, art } = {}) {
  art ??= daten.einstellungen.abrechnungZusammenfassen ?? STANDARD_ZUSAMMENFASSEN;
  const p = daten.projekte.find((x) => x.id === projektId);
  const posName = (nr) => {
    const pos = p?.positionen.find((x) => x.nr === nr);
    return pos ? `Pos. ${pos.nr} ${pos.bezeichnung}`.trim() : nr ? `Pos. ${nr}` : '';
  };
  const eintraege = daten.zeiteintraege
    .filter((z) => z.projektId === projektId && !z.abgerechnet && z.stunden > 0 && (!von || z.datum >= von) && (!bis || z.datum <= bis))
    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.von ?? '').localeCompare(b.von ?? ''));

  const gruppen = new Map();
  for (const z of eintraege) {
    const schluessel = art === 'einzeln' ? z.id : art === 'tagPosition' ? `${z.datum}|${z.positionNr ?? ''}` : z.datum;
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, { datum: z.datum, stunden: 0, positionen: [], notizen: [], eintraege: [], zeiten: [] });
    const g = gruppen.get(schluessel);
    g.stunden += z.stunden;
    if (z.positionNr != null && !g.positionen.includes(z.positionNr)) g.positionen.push(z.positionNr);
    if (z.notiz && !z.notiz.startsWith('Termin: ') && !g.notizen.includes(z.notiz)) g.notizen.push(z.notiz);
    if (z.notiz?.startsWith('Termin: ')) g.notizen.push(z.notiz.slice(8));
    if (z.von && z.bis) g.zeiten.push(`${z.von}–${z.bis}`);
    g.eintraege.push(z.id);
  }

  return [...gruppen.values()].map((g) => {
    const teile = [tagLang(ausText(g.datum))];
    const pos = g.positionen.map(posName).filter(Boolean);
    if (pos.length) teile.push(pos.join(', '));
    if (art === 'einzeln' && g.zeiten.length) teile.push(g.zeiten.join(', '));
    if (g.notizen.length) teile.push(g.notizen.join('; '));
    return { datum: g.datum, stunden: runde(g.stunden), text: teile.join(' · '), positionen: g.positionen, eintraege: g.eintraege };
  });
}

/** Summe der offenen (nicht abgerechneten) Stunden eines Projekts */
export const offeneStunden = (daten, projektId) => runde(
  daten.zeiteintraege.filter((z) => z.projektId === projektId && !z.abgerechnet).reduce((s, z) => s + z.stunden, 0));
