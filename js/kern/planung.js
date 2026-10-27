// Planung je Woche. Ohne Oberfläche, ohne DOM.
//
// Das Restsoll (Soll − Ist) aller festen Projekte (Auftrag, läuft) wird ab Start auf die freien Stunden verteilt,
// früheste Deadline zuerst, dann Priorität. Fixierte Einplanungen bleiben stehen.
// Reicht die freie Zeit bis zur Deadline nicht, wird der Rest bis zur Deadline als „Überlast“ gezeigt
// (gleichmäßig verteilt, höchstens bis zum längsten Tag) – das ist kein geplanter langer Tag, sondern ein Engpass,
// für den das Tool Vorschläge macht. Reicht auch das nicht, läuft das Projekt regulär über die Deadline hinaus („zu spät“).
// Anfragen und Angebote zählen nicht zur Auslastung.

import { alsText, ausText, plusTage, montag, isoWoche } from './datum.js';
import { STATUS_FEST, soll, ist } from './daten.js';
import { tagesRechner, regelKapazitaetWoche, freiH, belegtH, summe, EPS } from './kapazitaet.js';

const MAX_TAGE = 3 * 366; // so weit wird höchstens geplant

const runde = (h) => Math.round(h * 100) / 100;

/** Montag einer ISO-Woche „2026-W46“ als Text */
export function montagVonWoche(schluessel) {
  const [jahr, w] = schluessel.split('-W').map(Number);
  const vierterJan = new Date(jahr, 0, 4);
  return alsText(plusTage(montag(vierterJan), (w - 1) * 7));
}

/**
 * Plant alle festen Projekte.
 * opts: { heute: 'YYYY-MM-DD', termine: [...], uebernommen?: [...] }
 * Ergebnis: { heute, tag(d), projekte: { [id]: {...} }, reihenfolge: [id] }
 */
export function plane(daten, { heute, termine = [], uebernommen } = {}) {
  heute ??= alsText(new Date());
  const rechner = tagesRechner(daten, { termine, uebernommen: uebernommen ?? daten.vorschlaegeUebernommen });
  const { tag } = rechner;
  const e = daten.einstellungen;

  // Vergangene Tage: gebuchte Zeit (Ist) zeigen, damit die laufende Woche stimmt
  for (const z of daten.zeiteintraege) {
    if (z.datum >= heute) continue;
    const t = tag(z.datum);
    t.projekte[z.projektId] = (t.projekte[z.projektId] || 0) + z.stunden;
  }

  const fest = daten.projekte.filter((p) => STATUS_FEST.includes(p.status));
  const fixiert = fixierteEinplanungen(daten, uebernommen ?? daten.vorschlaegeUebernommen);
  const ergebnis = {};

  // 1. Fixierte Einplanungen zuerst setzen
  const fixiertJeProjekt = {};
  for (const x of fixiert) {
    if (!fest.some((p) => p.id === x.projektId)) continue;
    const gesetzt = setzeFixiert(tag, x, heute);
    fixiertJeProjekt[x.projektId] = (fixiertJeProjekt[x.projektId] || 0) + gesetzt.h;
    if (gesetzt.letzter) ergebnis[x.projektId] = { ...ergebnis[x.projektId], letzterFix: maxText(ergebnis[x.projektId]?.letzterFix, gesetzt.letzter) };
  }

  // 2. Reihenfolge: früheste Deadline, dann Priorität, dann Start
  const reihenfolge = [...fest].sort((a, b) =>
    (a.deadline || '9999-12-31').localeCompare(b.deadline || '9999-12-31')
    || (a.prioritaet ?? 2) - (b.prioritaet ?? 2)
    || (a.start || '').localeCompare(b.start || '')
    || a.name.localeCompare(b.name));

  for (const p of reihenfolge) {
    const sollH = soll(p);
    const istH = ist(daten, p.id);
    let r = Math.max(0, sollH - istH - (fixiertJeProjekt[p.id] || 0));
    const start = maxText(p.start, heute);
    const info = {
      id: p.id, sollH, istH, restH: runde(Math.max(0, sollH - istH)),
      start, deadline: p.deadline || null, fertig: ergebnis[p.id]?.letzterFix ?? null,
      status: 'imPlan', ueberlastH: 0, tageZuSpaet: 0,
    };

    // regulär bis zur Deadline (oder ohne Deadline bis fertig)
    const grenze = p.deadline || null;
    let d = ausText(start);
    for (let i = 0; r > EPS && i < MAX_TAGE; i++, d = plusTage(d, 1)) {
      const dt = alsText(d);
      if (grenze && dt > grenze) break;
      const t = tag(dt);
      const h = Math.min(freiH(t), r);
      if (h > EPS) { t.projekte[p.id] = (t.projekte[p.id] || 0) + h; r -= h; info.fertig = maxText(info.fertig, dt); }
    }

    if (r > EPS && grenze) {
      const tage = ueberlastTage(tag, start, grenze, e.maxTagH);
      const platz = tage.reduce((s, x) => s + x.raum, 0);
      if (platz + EPS >= r && grenze >= start) {
        // knapp: Rest als Überlast vor der Deadline
        fuelleGleichmaessig(tage, r).forEach(({ t, h }) => { t.ueberlast[p.id] = (t.ueberlast[p.id] || 0) + h; info.fertig = maxText(info.fertig, t.datum); });
        info.status = 'knapp';
        info.ueberlastH = runde(r);
        r = 0;
      } else {
        // zu spät: regulär weiter nach der Deadline
        for (let i = 0; r > EPS && i < MAX_TAGE; i++, d = plusTage(d, 1)) {
          const t = tag(alsText(d));
          const h = Math.min(freiH(t), r);
          if (h > EPS) { t.projekte[p.id] = (t.projekte[p.id] || 0) + h; r -= h; info.fertig = maxText(info.fertig, t.datum); }
        }
        info.status = 'zuSpaet';
        info.tageZuSpaet = info.fertig ? Math.round((ausText(info.fertig) - ausText(grenze)) / 86400000) : null;
      }
    }
    if (r > EPS) { info.status = 'zuSpaet'; info.offenH = runde(r); }
    info.fertig ??= start;
    ergebnis[p.id] = info;
  }

  return { heute, tag, projekte: ergebnis, reihenfolge: reihenfolge.map((p) => p.id), daten };
}

/** Fixierte Einplanungen, mit übernommenen „verschieben“-Vorschlägen */
function fixierteEinplanungen(daten, uebernommen) {
  const liste = daten.einplanungen.filter((x) => x.fixiert).map((x) => ({ ...x }));
  for (const v of uebernommen) {
    if (v.typ !== 'verschieben') continue;
    const x = liste.find((y) => y.id === v.einplanungId);
    if (x) x.woche = v.nachWoche;
  }
  return liste;
}

/** Fixierte Einplanung in ihrer Woche setzen (ab heute). Regulär/langer Tag: Mo–Fr, Samstag: Sa. */
function setzeFixiert(tag, x, heute) {
  const mo = ausText(montagVonWoche(x.woche));
  const tage = [];
  for (let i = 0; i < 7; i++) {
    const t = tag(alsText(plusTage(mo, i)));
    if (t.datum < heute) continue;
    if (x.art === 'samstag' ? t.wt === 6 : t.regelH > 0) tage.push(t);
  }
  if (!tage.length) return { h: 0, letzter: null };
  let r = x.stunden;
  // erst in die freie Zeit, der Rest gleichmäßig obendrauf
  for (const t of tage) {
    const h = Math.min(freiH(t), r);
    if (h > EPS) { t.projekte[x.projektId] = (t.projekte[x.projektId] || 0) + h; r -= h; }
  }
  if (r > EPS) {
    const ziel = x.art === 'regulaer' ? 'ueberlast' : 'projekte';
    tage.forEach((t) => { t[ziel][x.projektId] = (t[ziel][x.projektId] || 0) + r / tage.length; });
  }
  return { h: x.stunden, letzter: tage[tage.length - 1].datum };
}

/** Werktage zwischen start und grenze mit Platz bis zum längsten Tag */
function ueberlastTage(tag, start, grenze, maxTagH) {
  const tage = [];
  for (let d = ausText(start); alsText(d) <= grenze; d = plusTage(d, 1)) {
    const t = tag(alsText(d));
    if (t.regelH <= 0) continue;
    const raum = Math.max(0, maxTagH - belegtH(t));
    if (raum > EPS) tage.push({ t, raum });
  }
  return tage;
}

/** r Stunden so verteilen, dass alle Tage möglichst gleich viel bekommen (höchstens ihren Raum) */
function fuelleGleichmaessig(tage, r) {
  const sortiert = [...tage].sort((a, b) => a.raum - b.raum);
  const zuteilung = new Map();
  let rest = r;
  sortiert.forEach((x, i) => {
    const anteil = Math.min(x.raum, rest / (sortiert.length - i));
    zuteilung.set(x, anteil);
    rest -= anteil;
  });
  return tage.map((x) => ({ t: x.t, h: zuteilung.get(x) })).filter((x) => x.h > EPS);
}

function maxText(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

// ---------- Wochen für Diagramm, Warnung und Kennzahlen ----------

/**
 * Wochenübersicht ab der Woche von `von` (Text), `anzahl` Wochen.
 * Je Woche: { schluessel, kw, jahr, montag, regelKap, termineH, bueroH, entwicklungH, projekte:{id:h},
 *   ueberlast:{id:h}, samstagH, summeH, summeMoFr, ueberH, ueber, freiH, feiertage:[{datum,name}], abwesendTage }
 */
export function wochen(plan, von, anzahl) {
  const liste = [];
  let mo = montag(ausText(von ?? plan.heute));
  for (let w = 0; w < anzahl; w++, mo = plusTage(mo, 7)) {
    const { jahr, woche: kw } = isoWoche(mo);
    const x = {
      schluessel: `${jahr}-W${String(kw).padStart(2, '0')}`, kw, jahr, montag: alsText(mo),
      regelKap: regelKapazitaetWoche(plan.daten, alsText(mo)),
      termineH: 0, bueroH: 0, entwicklungH: 0, projekte: {}, ueberlast: {},
      samstagH: 0, summeH: 0, summeMoFr: 0, freiH: 0, feiertage: [], abwesendTage: 0, samstagZugeschaltet: false,
    };
    for (let i = 0; i < 7; i++) {
      const t = plan.tag(alsText(plusTage(mo, i)));
      if (t.feiertag) x.feiertage.push({ datum: t.datum, name: t.feiertag });
      if (t.abwesend && t.werktag) x.abwesendTage++;
      const zaehlt = t.werktag || t.samstag || summe(t.projekte) > 0;
      if (!zaehlt) continue;
      const termin = t.werktag || t.samstag ? t.terminH : 0;
      const buero = t.bloecke.filter((b) => b.art === 'buero').reduce((s, b) => s + b.h, 0);
      const entw = t.bloecke.filter((b) => b.art !== 'buero').reduce((s, b) => s + b.h, 0);
      const proj = summe(t.projekte), ueber = summe(t.ueberlast);
      x.termineH += termin; x.bueroH += buero; x.entwicklungH += entw;
      for (const [id, h] of Object.entries(t.projekte)) x.projekte[id] = (x.projekte[id] || 0) + h;
      for (const [id, h] of Object.entries(t.ueberlast)) x.ueberlast[id] = (x.ueberlast[id] || 0) + h;
      const tagSumme = termin + buero + entw + proj + ueber;
      x.summeH += tagSumme;
      if (t.werktag) x.summeMoFr += tagSumme;
      else x.samstagH += tagSumme;
      if (t.samstag) x.samstagZugeschaltet = true;
      if (t.datum >= plan.heute) x.freiH += freiH(t);
    }
    for (const k of ['termineH', 'bueroH', 'entwicklungH', 'samstagH', 'summeH', 'summeMoFr', 'freiH']) x[k] = runde(x[k]);
    for (const k of ['projekte', 'ueberlast']) for (const id of Object.keys(x[k])) x[k][id] = runde(x[k][id]);
    x.ueberH = runde(Math.max(0, x.summeMoFr - x.regelKap));
    x.ueber = x.ueberH > 0.05;
    liste.push(x);
  }
  return liste;
}

/** Warnung: so viele Wochen in Folge über Regelkapazität (Mo–Fr), wie eingestellt. Längste Serie im Zeitraum. */
export function warnung(daten, wochenListe) {
  let beste = { anzahl: 0, von: null, bis: null }, lauf = 0, ab = null;
  wochenListe.forEach((w, i) => {
    if (w.ueber) {
      if (!lauf) ab = i;
      lauf++;
      if (lauf > beste.anzahl) beste = { anzahl: lauf, von: wochenListe[ab], bis: w };
    } else lauf = 0;
  });
  const grenze = daten.einstellungen.warnWochen;
  const inSerie = beste.anzahl ? wochenListe.slice(wochenListe.indexOf(beste.von), wochenListe.indexOf(beste.bis) + 1) : [];
  const tagMax = inSerie.length
    ? Math.max(...inSerie.map((w) => (w.regelKap > 0 ? w.summeMoFr / (w.regelKap / daten.einstellungen.regeltagH) : 0)))
    : 0;
  return {
    aktiv: beste.anzahl >= grenze,
    grenze,
    anzahl: beste.anzahl,
    von: beste.von?.schluessel ?? null,
    bis: beste.bis?.schluessel ?? null,
    kwVon: beste.von?.kw ?? null,
    kwBis: beste.bis?.kw ?? null,
    tagDurchschnittMax: runde(tagMax),
  };
}

/** Kennzahlen für die Übersicht */
export function kennzahlen(plan, { wochenListe } = {}) {
  const { daten, heute } = plan;
  wochenListe ??= wochen(plan, heute, 26);
  const vier = wochenListe.slice(0, 4);
  const kap = vier.reduce((s, w) => s + w.regelKap, 0);
  const last = vier.reduce((s, w) => s + w.summeH, 0);

  // freie Projektstunden bis 31.12. dieses Jahres
  let frei = 0;
  const ende = `${heute.slice(0, 4)}-12-31`;
  for (let d = ausText(heute); alsText(d) <= ende; d = plusTage(d, 1)) frei += freiH(plan.tag(alsText(d)));

  const offen = daten.projekte.filter((p) => !['abgeschlossen', 'abgesagt'].includes(p.status)).map((p) => p.id);
  const deadlines = [
    ...daten.meilensteine.filter((m) => m.typ === 'deadline' && !m.erledigt && offen.includes(m.projektId))
      .map((m) => ({ datum: m.datum, projektId: m.projektId, titel: m.titel })),
    ...daten.projekte.filter((p) => p.deadline && offen.includes(p.id) && ['auftrag', 'laeuft'].includes(p.status))
      .map((p) => ({ datum: p.deadline, projektId: p.id, titel: 'Deadline' })),
  ].filter((x) => x.datum >= heute).sort((a, b) => a.datum.localeCompare(b.datum));

  return {
    auslastung4W: kap > 0 ? Math.round((last / kap) * 100) : 0,
    freiBisJahresende: runde(frei),
    naechsteDeadline: deadlines[0] ?? null,
    warnung: warnung(daten, wochenListe),
  };
}
