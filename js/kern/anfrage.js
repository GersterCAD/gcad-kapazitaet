// Anfrage prüfen: passt das rein, und wann ist es fertig? Ohne Oberfläche, ohne DOM.
// Gleiche Rechnung wie die Planung, aber nur mit den aktuell freien Stunden – bestehende Projekte werden nicht verschoben.
// Fertigtag = Tag, an dem die Summe erreicht ist. Dafür werden die freien Stunden einer Woche
// gleichmäßig auf ihre Arbeitstage verteilt.

import { alsText, ausText, plusTage, montag } from './datum.js';
import { soll } from './daten.js';
import { plane } from './planung.js';
import { freiH, belegtH, EPS } from './kapazitaet.js';

const MAX_WOCHEN = 156;
const runde = (h) => Math.round(h * 10) / 10;

export const VARIANTEN = [
  { art: 'regulaer', name: 'Regulär' },
  { art: 'samstag', name: 'Samstage' },
  { art: 'langerTag', name: 'Längere Tage' },
];

/**
 * anfrage: { schaetzungH, puffer, start, wunschtermin }
 * opts wie plane(): { heute, termine }
 * Ergebnis: { sollH, varianten: [{ art, name, fertig, haeltWunsch, tageZuSpaet, wochen:[{schluessel, montag, stunden}] }], empfohlen }
 */
export function anfragePruefen(daten, anfrage, opts = {}) {
  const plan = plane(daten, opts);
  const e = daten.einstellungen;
  const sollH = soll({ schaetzungH: anfrage.schaetzungH, puffer: anfrage.puffer ?? e.standardPuffer });
  const start = !anfrage.start || anfrage.start < plan.heute ? plan.heute : anfrage.start;

  const varianten = VARIANTEN.map((v) => {
    const wochen = [];
    let rest = sollH, fertig = null;
    let mo = montag(ausText(start));
    for (let w = 0; w < MAX_WOCHEN && rest > EPS; w++, mo = plusTage(mo, 7)) {
      const tage = [];
      let frei = 0;
      for (let i = 0; i < 7; i++) {
        const t = plan.tag(alsText(plusTage(mo, i)));
        if (t.datum < start) continue;
        const h = freieStunden(t, v.art, e);
        if (istArbeitstag(t, v.art)) tage.push(t.datum);
        frei += h;
      }
      if (frei <= EPS || !tage.length) continue;
      const nimmt = Math.min(frei, rest);
      wochen.push({ schluessel: plan.tag(alsText(mo)).woche, montag: alsText(mo), stunden: runde(nimmt) });
      if (frei + EPS >= rest) {
        const jeTag = frei / tage.length;
        fertig = tage[Math.min(tage.length - 1, Math.ceil(rest / jeTag - EPS) - 1)];
      }
      rest -= nimmt;
    }
    const haeltWunsch = !!fertig && (!anfrage.wunschtermin || fertig <= anfrage.wunschtermin);
    const tageZuSpaet = fertig && anfrage.wunschtermin && fertig > anfrage.wunschtermin
      ? Math.round((ausText(fertig) - ausText(anfrage.wunschtermin)) / 86400000) : 0;
    return { ...v, fertig, haeltWunsch, tageZuSpaet, wochen };
  });

  return {
    sollH: runde(sollH),
    start,
    varianten,
    empfohlen: varianten.find((v) => v.haeltWunsch)?.art ?? null,
  };
}

function istArbeitstag(t, art) {
  if (t.regelH > 0 || t.samstag) return true;
  return art === 'samstag' && t.wt === 6 && !t.feiertag && !t.abwesend;
}

/** Freie Stunden eines Tages je Variante */
function freieStunden(t, art, e) {
  let h = freiH(t);
  if (art === 'samstag' && t.wt === 6 && !t.samstag && !t.feiertag && !t.abwesend) {
    h += Math.max(0, e.samstagH - t.terminH);
  }
  if (art === 'langerTag' && t.regelH > 0) {
    const obergrenze = Math.max(t.regelH + t.extraH, belegtH(t) + freiH(t));
    h += Math.max(0, e.maxTagH - obergrenze);
  }
  return h;
}
