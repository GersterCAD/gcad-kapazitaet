// Was wäre, wenn …: Urlaub nehmen oder eine Anfrage zusagen, ohne etwas zu speichern. Ohne Oberfläche, ohne DOM.
// Gerechnet wird auf einer Kopie der Daten mit plane(); verglichen wird je Projekt Status und Fertigtag.

import { alsText, ausText, plusTage, montag, isoWoche } from './datum.js';
import { plane, wochen, warnung } from './planung.js';
import { feiertag } from './feiertage.js';

const RANG = { imPlan: 0, knapp: 1, zuSpaet: 2 };
const kopie = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

/** Änderung auf eine Kopie anwenden. aenderung: { art: 'urlaub', von, bis } | { art: 'zusagen', projektId, deadline? } */
export function anwenden(daten, aenderung) {
  const d = kopie(daten);
  if (aenderung.art === 'urlaub') d.abwesenheiten.push({ id: 'planspiel', von: aenderung.von, bis: aenderung.bis, art: 'urlaub' });
  if (aenderung.art === 'zusagen') {
    const p = d.projekte.find((x) => x.id === aenderung.projektId);
    if (p) { p.status = 'auftrag'; if (aenderung.deadline !== undefined) p.deadline = aenderung.deadline || null; }
  }
  return d;
}

/** Arbeitstage (Mo–Fr ohne Feiertage) zwischen von und bis */
export function arbeitstage(von, bis) {
  let n = 0;
  for (let d = ausText(von); alsText(d) <= bis; d = plusTage(d, 1)) if (d.getDay() >= 1 && d.getDay() <= 5 && !feiertag(alsText(d))) n++;
  return n;
}

/**
 * Vergleich vorher/nachher: { zeilen: [{ projekt, vorher: { status, fertig }, nachher: { status, fertig }, schlechter, tageSpaeter }],
 *   schlechter: Anzahl, warnungVorher, warnungNachher }
 */
export function vergleichen(daten, aenderung, { heute, termine = [] } = {}) {
  const vor = plane(daten, { heute, termine });
  const d2 = anwenden(daten, aenderung);
  const nach = plane(d2, { heute, termine });
  const ids = new Set([...Object.keys(vor.projekte), ...Object.keys(nach.projekte)]);
  const zeilen = [];
  for (const id of ids) {
    const projekt = d2.projekte.find((p) => p.id === id);
    const a = vor.projekte[id], b = nach.projekte[id];
    const vorher = a ? { status: a.status, fertig: a.fertig, ueberlastH: a.ueberlastH ?? 0 } : null;
    const nachher = b ? { status: b.status, fertig: b.fertig, ueberlastH: b.ueberlastH ?? 0 } : null;
    const tageSpaeter = vorher?.fertig && nachher?.fertig ? Math.round((ausText(nachher.fertig) - ausText(vorher.fertig)) / 86400000) : 0;
    const mehrUeberlastH = vorher && nachher ? Math.round((nachher.ueberlastH - vorher.ueberlastH) * 10) / 10 : 0;
    // schlechter: Status rutscht ab, oder ein knappes Projekt braucht mehr Überstunden, oder ein zu spätes wird noch später
    const schlechter = !!vorher && !!nachher && (RANG[nachher.status] > RANG[vorher.status]
      || (nachher.status !== 'imPlan' && (mehrUeberlastH >= 0.5 || (nachher.status === 'zuSpaet' && tageSpaeter > 0))));
    zeilen.push({ projekt, neu: !vorher, vorher, nachher, schlechter, tageSpaeter, mehrUeberlastH });
  }
  zeilen.sort((x, y) => Number(y.schlechter) - Number(x.schlechter) || y.tageSpaeter - x.tageSpaeter || (x.projekt?.name ?? '').localeCompare(y.projekt?.name ?? ''));
  const w = (p) => warnung(p.daten, wochen(p, heute, 26));
  return { zeilen, schlechter: zeilen.filter((z) => z.schlechter).length, warnungVorher: w(vor), warnungNachher: w(nach) };
}

/**
 * Urlaub finden: Zeiträume ab Montag mit der gewünschten Zahl an Wochen in den nächsten `suchWochen`,
 * je mit dem Ergebnis des Vergleichs. Ergebnis: [{ von, bis, kw, schlechter, spaeterTage, frei, betroffen: [Namen] }]
 */
export function urlaubFinden(daten, { wochenAnzahl = 1, suchWochen = 26, heute, termine = [] } = {}) {
  const ergebnis = [];
  let mo = montag(plusTage(ausText(heute), 7)); // frühestens nächste Woche
  for (let i = 0; i < suchWochen; i++, mo = plusTage(mo, 7)) {
    const von = alsText(mo);
    const bis = alsText(plusTage(mo, 7 * wochenAnzahl - 3)); // bis Freitag
    if (daten.abwesenheiten.some((a) => a.von <= bis && a.bis >= von)) continue; // da ist schon Urlaub
    const v = vergleichen(daten, { art: 'urlaub', von, bis }, { heute, termine });
    const betroffen = v.zeilen.filter((z) => z.schlechter).map((z) => z.projekt?.name).filter(Boolean);
    ergebnis.push({
      von, bis, kw: isoWoche(mo).woche, arbeitstage: arbeitstage(von, bis),
      schlechter: v.schlechter, frei: v.schlechter === 0 && betroffen.length === 0, betroffen,
    });
  }
  return ergebnis;
}
