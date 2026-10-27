// Tageskapazität: Regeltag (0 an Wochenende, Feiertag, Urlaub) − Blockzeiten − Termine, die zählen.
// Dazu, was per Vorschlag übernommen wurde: zugeschaltete Samstage, längere Tage, gekürzte Entwicklung.
// Ohne Oberfläche, ohne DOM.

import { alsText, ausText, plusTage, wochenSchluessel } from './datum.js';
import { feiertag } from './feiertage.js';

const EPS = 1e-6;

/** Wochenkapazität laut Regel: Regeltag × Arbeitstage Mo–Fr, ohne Feiertage und Urlaub */
export function regelKapazitaetWoche(daten, montagText) {
  let h = 0;
  for (let i = 0; i < 5; i++) {
    const d = alsText(plusTage(ausText(montagText), i));
    if (!feiertag(d) && !abwesenheit(daten, d)) h += daten.einstellungen.regeltagH;
  }
  return h;
}

export function abwesenheit(daten, d) {
  return daten.abwesenheiten.find((a) => a.von <= d && d <= a.bis)?.art ?? null;
}

/** Regel für einen Kalender: 'alle' | 'ganztaegig' | 'ignorieren'. Unbekannte Kalender zählen ganz. */
function kalenderRegel(daten, name) {
  return daten.einstellungen.kalender.find((k) => k.name === name)?.regel ?? 'alle';
}

/**
 * Termine aus dem Kalender auf Tage verteilen: Map datum → [{ termin, h }].
 * termin: { uid, kalender, titel, start, ende, ganztaegig }. Ganztägig: start/ende als Datum, ende exklusiv (wie ICS).
 * Eine Terminregel (terminRegeln[uid].zaehltH) ersetzt die Stunden.
 */
export function termineNachTag(daten, termine = []) {
  const map = new Map();
  const dazu = (d, termin, h) => { if (!map.has(d)) map.set(d, []); map.get(d).push({ termin, h }); };
  const regeltag = daten.einstellungen.regeltagH;

  for (const t of termine) {
    const regel = kalenderRegel(daten, t.kalender);
    if (regel === 'ignorieren') continue;
    if (!t.ganztaegig && regel === 'ganztaegig') continue;
    const eigene = daten.terminRegeln.find((r) => r.uid === t.uid);

    const tage = [];
    if (t.ganztaegig) {
      const bis = t.ende ? t.ende.slice(0, 10) : t.start.slice(0, 10);
      let d = ausText(t.start.slice(0, 10));
      do { tage.push({ d: alsText(d), h: regeltag }); d = plusTage(d, 1); } while (alsText(d) < bis);
    } else {
      const start = new Date(t.start), ende = new Date(t.ende ?? t.start);
      for (let tag = new Date(start.getFullYear(), start.getMonth(), start.getDate()); tag < ende; tag = plusTage(tag, 1)) {
        const von = Math.max(start, tag), bis = Math.min(ende, plusTage(tag, 1));
        if (bis > von) tage.push({ d: alsText(tag), h: (bis - von) / 3600000 });
      }
    }
    if (eigene?.zaehltH != null) {
      // Eigene Stunden: auf die Tage des Termins verteilen
      const summe = tage.reduce((s, x) => s + x.h, 0) || 1;
      tage.forEach((x) => { x.h = (eigene.zaehltH * x.h) / summe; });
    }
    tage.forEach((x) => dazu(x.d, t, x.h));
  }
  return map;
}

/**
 * Erzeugt einen Tagesrechner mit Zwischenspeicher. tag(d) liefert die Grundlage eines Tages:
 * { datum, wt, woche, feiertag, abwesend, regelH, bloecke:[{id,art,h}], blockH, terminH, termine,
 *   samstag (zugeschaltet), extraH (längerer Tag), kapH (für Projekte), projekte:{}, ueberlast:{} }
 */
export function tagesRechner(daten, { termine = [], uebernommen = daten.vorschlaegeUebernommen } = {}) {
  const e = daten.einstellungen;
  const proTag = termineNachTag(daten, termine);
  const cache = new Map();

  const samstage = new Set();
  const extra = new Map();
  const kuerzung = new Map(); // `${blockId}|${datum}` → h
  for (const v of uebernommen) {
    if (v.typ === 'samstag') v.tage.forEach((d) => samstage.add(d));
    if (v.typ === 'langerTag') Object.entries(v.tage).forEach(([d, h]) => extra.set(d, (extra.get(d) || 0) + h));
    if (v.typ === 'kuerzen') Object.entries(v.tage).forEach(([d, h]) => {
      const k = `${v.blockzeitId}|${d}`; kuerzung.set(k, (kuerzung.get(k) || 0) + h);
    });
  }

  function tag(d) {
    if (cache.has(d)) return cache.get(d);
    const datum = ausText(d);
    const wt = datum.getDay(); // 0 = So … 6 = Sa
    const woche = wochenSchluessel(datum);
    const ft = feiertag(d);
    const ab = abwesenheit(daten, d);
    const frei = !!ft || !!ab;
    const werktag = wt >= 1 && wt <= 5;
    const regelH = werktag && !frei ? e.regeltagH : 0;

    const bloecke = [];
    if (regelH > 0) {
      for (const b of daten.blockzeiten) {
        const tage = [].concat(b.wochentag);
        if (!tage.includes(wt)) continue;
        let h = b.stundenProWoche / tage.length;
        const gekuerzt = kuerzung.get(`${b.id}|${d}`);
        if (gekuerzt) h = Math.max(0, h - gekuerzt);
        if (h > EPS) bloecke.push({ id: b.id, art: b.art, h });
      }
    }
    const blockH = bloecke.reduce((s, b) => s + b.h, 0);
    const termineHeute = proTag.get(d) || [];
    const terminH = termineHeute.reduce((s, x) => s + x.h, 0);

    const samstag = wt === 6 && !frei && samstage.has(d);
    const extraH = regelH > 0 ? Math.min(extra.get(d) || 0, Math.max(0, e.maxTagH - e.regeltagH)) : 0;
    let kapH = Math.max(0, regelH - blockH - terminH) + extraH;
    if (samstag) kapH += Math.max(0, e.samstagH - terminH);

    const t = {
      datum: d, wt, woche, feiertag: ft, abwesend: ab, werktag, regelH,
      bloecke, blockH, termine: termineHeute, terminH, samstag, extraH, kapH,
      projekte: {}, ueberlast: {},
    };
    cache.set(d, t);
    return t;
  }

  return { tag, cache };
}

// ---------- Hilfen für die Planung ----------

export const summe = (obj) => Object.values(obj).reduce((s, h) => s + h, 0);

/** Projektstunden, die im Rahmen der Kapazität geplant sind */
export const geplantH = (t) => summe(t.projekte);

/** Noch frei für Projekte */
export const freiH = (t) => Math.max(0, t.kapH - geplantH(t));

/** Belegt an diesem Tag: Termine + Blockzeiten + Projekte + Überlast */
export const belegtH = (t) => t.terminH + t.blockH + geplantH(t) + summe(t.ueberlast);

export { EPS };
