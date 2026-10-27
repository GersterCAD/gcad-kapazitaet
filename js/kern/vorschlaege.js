// Vorschläge bei Engpass. Ohne Oberfläche, ohne DOM.
// Hält eine Deadline nicht (Projekt „knapp“ oder „zu spät“), schlägt das Tool in dieser Reihenfolge vor:
//   1. andere Projekte ohne Deadline-Risiko verschieben (fixierte Einplanungen)
//   2. Entwicklung kürzen (wenn kürzbar)
//   3. Samstag zuschalten (wenn erlaubt)
//   4. längere Tage bis zum Höchstwert
// Immer nur als Vorschlag. Erst uebernehmen() ändert die Daten, rueckgaengig() nimmt es zurück.

import { alsText, ausText, plusTage, tagKurz } from './datum.js';
import { neueId } from './daten.js';
import { plane, wochen, warnung, montagVonWoche } from './planung.js';
import { EPS } from './kapazitaet.js';

const runde = (h) => Math.round(h * 10) / 10;
const halbAuf = (h) => Math.ceil(h * 2 - EPS) / 2;
const zahl = (h) => String(runde(h)).replace('.', ',');
const kw = (schluessel) => Number(schluessel.split('-W')[1]);
const kwSpanne = (liste) => {
  const k = [...new Set(liste)].sort().map(kw);
  return k.length === 1 ? `KW ${k[0]}` : `KW ${k[0]}–${k[k.length - 1]}`;
};
const kurz = (d) => d.slice(8, 10) + '.' + d.slice(5, 7) + '.';

/**
 * Vorschläge für alle Projekte mit Engpass.
 * opts wie plane(): { heute, termine }. Gibt [{ projektId, problem, vorschlaege: [...] }] zurück.
 * Ein Vorschlag: { schluessel, typ, titel, text, aktion, loest, aenderung, warnungDanach }
 */
export function vorschlaege(daten, opts = {}) {
  const plan = plane(daten, opts);
  const ergebnis = [];
  for (const id of plan.reihenfolge) {
    const info = plan.projekte[id];
    if (info.status === 'imPlan' || !info.deadline) continue;
    const projekt = daten.projekte.find((p) => p.id === id);
    const fehlt = fehlendeStunden(plan, info);
    const kandidaten = [
      ...verschieben(daten, plan, projekt, info),
      kuerzen(daten, plan, projekt, info, fehlt),
      samstage(daten, plan, projekt, info, fehlt),
      laengereTage(daten, plan, projekt, info, fehlt),
    ].filter(Boolean);

    for (const v of kandidaten) {
      const probe = [...daten.vorschlaegeUebernommen, v.aenderung];
      const neu = plane(daten, { ...opts, uebernommen: probe });
      v.loest = neu.projekte[id]?.status === 'imPlan';
      v.warnungDanach = warnung(daten, wochen(neu, neu.heute, 26)).aktiv;
      v.text = v.loest ? v.textLoest : v.textTeil;
      delete v.textLoest; delete v.textTeil;
    }
    ergebnis.push({ projektId: id, problem: info, fehltH: runde(fehlt), vorschlaege: kandidaten });
  }
  return ergebnis;
}

/** Vorschlag übernehmen: legt ihn in daten.vorschlaegeUebernommen ab (ändert daten). Gibt die ID zurück. */
export function uebernehmen(daten, vorschlag) {
  const id = neueId();
  daten.vorschlaegeUebernommen.push({ ...vorschlag.aenderung, id, titel: vorschlag.titel, zeit: new Date().toISOString() });
  return id;
}

/** Übernommenen Vorschlag zurücknehmen (ändert daten) */
export function rueckgaengig(daten, id) {
  daten.vorschlaegeUebernommen = daten.vorschlaegeUebernommen.filter((v) => v.id !== id);
}

/** Stunden, die bis zur Deadline nur mit Überlast oder gar nicht passen */
function fehlendeStunden(plan, info) {
  if (info.status === 'knapp') return info.ueberlastH;
  let h = info.offenH || 0;
  for (let d = plusTage(ausText(info.deadline), 1); alsText(d) <= info.fertig; d = plusTage(d, 1)) {
    h += plan.tag(alsText(d)).projekte[info.id] || 0;
  }
  return h;
}

/** Tage von Start (ab heute) bis Deadline */
function fenster(plan, info) {
  const tage = [];
  for (let d = ausText(info.start); alsText(d) <= info.deadline; d = plusTage(d, 1)) tage.push(plan.tag(alsText(d)));
  return tage;
}

const name = (p) => p.name;

// 1. Fixierte Einplanungen anderer Projekte aus dem Fenster nach hinten schieben, wenn deren Deadline hält
function verschieben(daten, plan, projekt, info) {
  const fensterWochen = new Set(fenster(plan, info).map((t) => t.woche));
  const nachDeadline = plan.tag(alsText(plusTage(ausText(info.deadline), 7 - ((ausText(info.deadline).getDay() + 6) % 7)))).woche;
  const liste = [];
  for (const x of daten.einplanungen) {
    if (!x.fixiert || x.projektId === projekt.id || !fensterWochen.has(x.woche)) continue;
    if (daten.vorschlaegeUebernommen.some((v) => v.typ === 'verschieben' && v.einplanungId === x.id)) continue;
    const anderes = daten.projekte.find((p) => p.id === x.projektId);
    if (!anderes || !['auftrag', 'laeuft'].includes(anderes.status)) continue;
    if (anderes.deadline && montagVonWoche(nachDeadline) > anderes.deadline) continue;
    const aenderung = { typ: 'verschieben', projektId: projekt.id, einplanungId: x.id, vonWoche: x.woche, nachWoche: nachDeadline };
    const probe = plane(daten, { heute: plan.heute, uebernommen: [...daten.vorschlaegeUebernommen, aenderung] });
    if (probe.projekte[anderes.id]?.status !== 'imPlan' && plan.projekte[anderes.id]?.status === 'imPlan') continue; // anderes Projekt käme in Not
    const satz = `${name(anderes)}: ${zahl(x.stunden)} h aus KW ${kw(x.woche)} in KW ${kw(nachDeadline)} schieben`;
    liste.push({
      schluessel: `verschieben|${x.id}`, typ: 'verschieben', aktion: 'Verschieben', titel: satz, aenderung,
      textLoest: `${anderes.deadline ? `Die Deadline am ${tagKurz(ausText(anderes.deadline))} hält weiterhin. ` : ''}${name(projekt)} schafft dann die Deadline am ${tagKurz(ausText(info.deadline))}.`,
      textTeil: `Schafft ${zahl(x.stunden)} h Platz. Allein reicht das für ${name(projekt)} nicht.`,
    });
  }
  return liste;
}

// 2. Entwicklung (kürzbare Blockzeiten) im Fenster kürzen
function kuerzen(daten, plan, projekt, info, fehlt) {
  const kuerzbar = daten.blockzeiten.filter((b) => b.kuerzbar);
  if (!kuerzbar.length) return null;
  let rest = fehlt;
  const tageJeBlock = {};
  for (const t of fenster(plan, info)) {
    for (const b of t.bloecke) {
      if (rest <= EPS || !kuerzbar.some((k) => k.id === b.id)) continue;
      const h = Math.min(b.h, rest);
      tageJeBlock[b.id] ??= {};
      tageJeBlock[b.id][t.datum] = h;
      rest -= h;
    }
  }
  const [blockzeitId, tage] = Object.entries(tageJeBlock)[0] ?? [];
  if (!blockzeitId) return null;
  const block = daten.blockzeiten.find((b) => b.id === blockzeitId);
  const summe = Object.values(tage).reduce((s, h) => s + h, 0);
  const wochenListe = Object.keys(tage).map((d) => plan.tag(d).woche);
  return {
    schluessel: `kuerzen|${blockzeitId}|${Object.keys(tage).join(',')}`, typ: 'kuerzen', aktion: 'Kürzen',
    titel: `${block.titel}: in ${kwSpanne(wochenListe)} um ${zahl(summe)} h kürzen`,
    aenderung: { typ: 'kuerzen', projektId: projekt.id, blockzeitId, tage },
    textLoest: `Damit hält ${name(projekt)} die Deadline am ${tagKurz(ausText(info.deadline))} ohne Mehrarbeit.`,
    textTeil: `Bringt ${zahl(summe)} h. Allein reicht das für ${name(projekt)} nicht.`,
  };
}

// 3. Samstage im Fenster zuschalten
function samstage(daten, plan, projekt, info, fehlt) {
  const e = daten.einstellungen;
  if (e.samstagErlaubt === 'nie' || !(e.samstagH > 0)) return null;
  const frei = fenster(plan, info).filter((t) => t.wt === 6 && !t.feiertag && !t.abwesend && !t.samstag);
  if (!frei.length) return null;
  const tage = [];
  let rest = fehlt;
  for (const t of frei) {
    if (rest <= EPS) break;
    tage.push(t.datum);
    rest -= Math.max(0, e.samstagH - t.terminH);
  }
  const liste = tage.map(kurz);
  const text = liste.length > 1 ? `${liste.slice(0, -1).join(', ')} und ${liste[liste.length - 1]}` : liste[0];
  return {
    schluessel: `samstag|${tage.join(',')}`, typ: 'samstag', aktion: tage.length > 1 ? 'Samstage zuschalten' : 'Samstag zuschalten',
    titel: `${name(projekt)}: ${tage.length > 1 ? 'Samstage' : 'Samstag'} ${text} zuschalten`,
    aenderung: { typ: 'samstag', projektId: projekt.id, tage },
    textLoest: `Je ${zahl(e.samstagH)} h. Die Deadline am ${tagKurz(ausText(info.deadline))} hält ohne lange Tage.`,
    textTeil: `Je ${zahl(e.samstagH)} h. Allein reicht das für die Deadline am ${tagKurz(ausText(info.deadline))} nicht.`,
  };
}

// 4. Längere Tage im Fenster, gleichmäßig, höchstens bis zum längsten Tag
function laengereTage(daten, plan, projekt, info, fehlt) {
  const e = daten.einstellungen;
  const spielraum = e.maxTagH - e.regeltagH;
  if (spielraum <= 0) return null;
  const tage = fenster(plan, info).filter((t) => t.regelH > 0 && t.extraH < spielraum - EPS);
  if (!tage.length) return null;
  const jeTag = Math.min(spielraum, halbAuf(fehlt / tage.length));
  const map = {};
  let rest = fehlt;
  for (const t of tage) {
    if (rest <= EPS) break;
    const h = Math.min(jeTag, spielraum - t.extraH, halbAuf(rest));
    map[t.datum] = h;
    rest -= h;
  }
  const wochenListe = [...new Set(Object.keys(map).map((d) => plan.tag(d).woche))];
  return {
    schluessel: `langerTag|${Object.keys(map).join(',')}`, typ: 'langerTag', aktion: 'Längere Tage',
    titel: `${name(projekt)}: längere Tage in ${kwSpanne(wochenListe)}`,
    aenderung: { typ: 'langerTag', projektId: projekt.id, tage: map },
    textLoest: `${zahl(jeTag)} h mehr pro Tag, höchstens ${zahl(e.maxTagH)} h. Die Deadline am ${tagKurz(ausText(info.deadline))} hält.`,
    textTeil: `Bis ${zahl(e.maxTagH)} h pro Tag. Allein reicht das für die Deadline am ${tagKurz(ausText(info.deadline))} nicht.`,
  };
}
