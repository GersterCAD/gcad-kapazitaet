// Nachkalkulation wie in Joachims Werkzeug (Kalkulator-Modul „Nachkalk“, Stand 04.09.2026), Seiten nach Index B
// (Nachkalkulation.dc.html, NachkalkUebersicht.dc.html). Ohne Oberfläche, ohne DOM.
//
// Ist-Stundensatz = Deckungsbeitrag ÷ Ist-Stunden, DB = Erlös − direkte Kosten.
// Ampel (Joachims Regel): grün ≥ Ziel-Satz · gelb deckt die Selbstkosten · rot darunter.
// Zeit ohne Position wird nach Preisanteil verteilt – auf Positionen ohne eigene Buchung, sonst auf alle (Mischbetrieb).
// Kosten ohne Position sind Auftragsgemeinkosten und werden nach Preisanteil umgelegt.

import { soll } from './daten.js';
import { stundensatz } from './abrechnung.js';
import { rechnungenVon } from './rechnung.js';

export const KOSTEN_ART = [
  { id: 'material', name: 'Material' },
  { id: 'fremd', name: 'Fremdleistung' },
  { id: 'reise', name: 'Fahrt' },
  { id: 'sonstiges', name: 'Sonstiges' },
];
export const POSITION_TYP = [
  { id: 'auftrag', name: 'Auftrag' },
  { id: 'nachtrag', name: 'Nachtrag' },
  { id: 'regie', name: 'Regie' },
];
export const POSITION_STATUS = [
  { id: 'verguetet', name: 'vergütet' },
  { id: 'unverguetet', name: 'nicht vergütet' },   // Stunden zählen, Erlös 0
  { id: 'abgelehnt', name: 'abgelehnt' },          // fällt aus allen Summen
];
export const STANDARD_NACHKALK = { zielSatz: null, selbstkosten: null, jahresstunden: null, kmSatz: 0.3 };
export const ERGEBNIS = {
  gruen: 'hat sich gelohnt', gelb: 'knapp', rot: 'Verlust',
};

const runde2 = (x) => Math.round(x * 100) / 100;
const ok = (x) => typeof x === 'number' && Number.isFinite(x);

export const nachkalkEinstellungen = (daten) => ({ ...STANDARD_NACHKALK, ...(daten.einstellungen.nachkalk ?? {}) });

/** Ziel-Satz eines Projekts: Satz des Auftrags oder Kunden, sonst der allgemeine Ziel-Satz */
export function zielSatz(daten, p) {
  return stundensatz(daten, p).satz ?? nachkalkEinstellungen(daten).zielSatz ?? null;
}

/** Ampel aus Ist-Satz, Ziel und Selbstkosten: 'gruen' | 'gelb' | 'rot' | '' */
export function ampel(satz, ziel, selbstkosten) {
  if (!ok(satz)) return '';
  if (ziel && satz >= ziel) return 'gruen';
  if (selbstkosten) return satz >= selbstkosten ? 'gelb' : 'rot';
  return ziel ? 'gelb' : '';
}

/** Betrag eines Kosteneintrags (Fahrt: km × km-Satz, sonst Betrag) */
export const kostenBetrag = (k) => runde2(k.betrag ?? 0);

/**
 * Nachkalkulation eines Projekts.
 * Ergebnis: { positionen: [...], T: { erloes, erloesQuelle, kosten, kostGes, weiter, db, marge, sollH, istH, abwH, abwPct,
 *   satz, satzBrutto, sollSatz, selbst, gewinn, gewinnPct, mehrH, mehrEUR, breakH, kapaPct, ziel, selbstkosten, ampel } }
 */
export function nachkalkulation(daten, projektId) {
  const p = daten.projekte.find((x) => x.id === projektId);
  const e = nachkalkEinstellungen(daten);
  const ziel = zielSatz(daten, p);
  const satzStd = stundensatz(daten, p).satz ?? e.zielSatz ?? null; // ohne Satz: Ziel-Satz als Annahme
  const faktor = 1 + (p.puffer ?? 0) / 100;
  const eintraege = daten.zeiteintraege.filter((z) => z.projektId === projektId);
  const kosten = (daten.kosten ?? []).filter((k) => k.projektId === projektId);

  // Positionen (ohne Positionen: das ganze Projekt als eine Zeile)
  let pos = p.positionen.length
    ? p.positionen.map((x) => ({ nr: x.nr, name: x.bezeichnung, typ: x.typ ?? 'auftrag', status: x.status ?? 'verguetet', sollH: (x.sollH || 0) * faktor, preis: x.preis ?? null }))
    : [{ nr: null, name: p.name, typ: 'auftrag', status: 'verguetet', sollH: soll(p), preis: null }];
  pos = pos.filter((x) => x.status !== 'abgelehnt');

  // Ist-Stunden: gebucht je Position, der Rest (ohne oder mit unbekannter Position) wird verteilt
  let rest = 0;
  for (const x of pos) x.fix = 0;
  for (const z of eintraege) {
    const x = p.positionen.length ? pos.find((y) => y.nr === z.positionNr) : pos[0];
    const abgelehnt = p.positionen.some((y) => y.nr === z.positionNr && y.status === 'abgelehnt');
    if (x) x.fix += z.stunden;
    else if (!abgelehnt) rest += z.stunden;   // wie im Werkzeug: Zeit auf abgelehnten Positionen zählt nicht
  }

  // Erlös je Position: Preis aus dem Angebot, sonst Pauschalpreis nach Soll-Anteil, sonst Stunden × Satz
  const sollSumme = pos.reduce((s, x) => s + x.sollH, 0);
  const pauschal = p.abrechnungsart === 'pauschal';
  const mitPreis = pos.some((x) => x.preis > 0);
  const nachStunden = !pauschal && !mitPreis;
  const vorlaeufig = p.status !== 'abgeschlossen';
  const erloesVor = (x, istH) => {
    if (x.status === 'unverguetet') return 0;
    if (mitPreis) return x.preis ?? 0;
    if (pauschal) return sollSumme > 0 ? (p.pauschalpreis ?? 0) * x.sollH / sollSumme : (p.pauschalpreis ?? 0) / pos.length;
    return istH * (satzStd ?? 0);
  };
  // Verteilung nach Preisanteil (wie im Werkzeug, Schlüssel „GP“); bei Stunden-Projekten nach Soll
  const offen = pos.filter((x) => x.fix === 0);
  const ziele = offen.length ? offen : pos;
  const gewicht = (x) => (mitPreis || pauschal ? erloesVor(x, 0) : x.sollH);
  const gsum = ziele.reduce((s, x) => s + gewicht(x), 0);
  for (const x of pos) {
    const add = rest > 0 && ziele.includes(x) ? (gsum > 0 ? rest * gewicht(x) / gsum : rest / ziele.length) : 0;
    x.verteiltH = add;
    x.istH = x.fix + add;
    x.erloes = erloesVor(x, x.istH);
  }

  // Kosten: je Position oder nach Erlösanteil umgelegt
  const erloesSumme = pos.reduce((s, x) => s + x.erloes, 0);
  const kostGes = { material: 0, fremd: 0, reise: 0, sonstiges: 0 };
  let weiter = 0;
  for (const x of pos) x.kosten = 0;
  for (const k of kosten) {
    const b = kostenBetrag(k);
    const art = kostGes[k.art] != null ? k.art : 'sonstiges';
    kostGes[art] += b;
    if (k.weiter) weiter += b;
    const x = k.positionNr != null ? pos.find((y) => y.nr === k.positionNr) : null;
    if (x) x.kosten += b;
    else for (const y of pos) y.kosten += erloesSumme > 0 ? b * y.erloes / erloesSumme : b / pos.length;
  }

  for (const x of pos) {
    x.db = x.erloes - x.kosten;
    x.marge = x.erloes > 0 ? (x.db / x.erloes) * 100 : NaN;
    x.satz = x.istH > 0 ? x.db / x.istH : NaN;
    x.sollSatz = x.sollH > 0 && x.preis ? x.preis / x.sollH : NaN;
    x.abwH = x.istH - x.sollH;
    x.abwPct = x.sollH > 0 ? (x.abwH / x.sollH) * 100 : NaN;
    x.ampel = ampel(x.satz, ziel, e.selbstkosten);
  }

  const T = { ziel, selbstkosten: e.selbstkosten, vorlaeufig };
  T.erloes = runde2(pos.reduce((s, x) => s + x.erloes, 0));
  T.unverguetet = runde2(pos.filter((x) => x.status === 'unverguetet').reduce((s, x) => s + (x.preis ?? 0), 0));
  T.rechnungen = rechnungenVon(daten, projektId).length;
  T.kostGes = Object.fromEntries(Object.entries(kostGes).map(([k, v]) => [k, runde2(v)]));
  T.kosten = runde2(Object.values(kostGes).reduce((s, v) => s + v, 0));
  T.weiter = runde2(weiter);
  T.db = runde2(T.erloes - T.kosten);
  T.marge = T.erloes > 0 ? (T.db / T.erloes) * 100 : NaN;
  T.sollH = runde2(pos.reduce((s, x) => s + x.sollH, 0));
  T.schaetzungH = p.schaetzungH ?? 0;
  T.istH = runde2(pos.reduce((s, x) => s + x.istH, 0));
  T.abwH = runde2(T.istH - T.sollH);
  T.abwPct = T.sollH > 0 ? (T.abwH / T.sollH) * 100 : NaN;
  T.satz = T.istH > 0 ? runde2(T.db / T.istH) : NaN;
  T.satzBrutto = T.istH > 0 ? runde2(T.erloes / T.istH) : NaN;
  T.sollSatz = T.sollH > 0 && !nachStunden ? runde2(T.erloes / T.sollH) : NaN;
  T.nachStunden = nachStunden;
  T.satzStd = satzStd;
  T.satzAnnahme = nachStunden && !stundensatz(daten, p).satz;
  T.selbst = e.selbstkosten ? runde2(T.istH * e.selbstkosten) : null;
  T.gewinn = T.selbst != null ? runde2(T.db - T.selbst) : null;
  T.gewinnPct = T.gewinn != null && T.erloes > 0 ? (T.gewinn / T.erloes) * 100 : NaN;
  T.mehrH = runde2(Math.max(0, T.abwH));
  T.mehrEUR = ziel ? runde2(T.mehrH * ziel) : null;
  T.breakH = e.selbstkosten ? runde2(T.db / e.selbstkosten) : null;
  T.kapaPct = e.jahresstunden ? (T.istH / e.jahresstunden) * 100 : NaN;
  T.ampel = ampel(T.satz, ziel, e.selbstkosten);
  return { positionen: pos.map(({ fix, ...x }) => ({ ...x, istH: runde2(x.istH), verteiltH: runde2(x.verteiltH), sollH: runde2(x.sollH) })), T };
}

/** Puffer, der gereicht hätte: Abweichung auf 5 % aufgerundet, höchstens 20 %, und was das Pauschal bei Ziel-Satz gewesen wäre */
export function pufferHinweis(daten, projektId, n) {
  const p = daten.projekte.find((x) => x.id === projektId);
  const basis = p.schaetzungH || n.T.sollH;
  if (!(basis > 0) || !(n.T.istH > basis)) return null;
  const noetig = Math.min(20, Math.ceil(((n.T.istH - basis) / basis) * 100 / 5) * 5);
  const h = runde2(basis * (1 + noetig / 100));
  return { puffer: noetig, stunden: h, preis: n.T.ziel ? runde2(h * n.T.ziel) : null, ueber: n.positionen.filter((x) => x.abwPct > 10) };
}

/** Jahr eines Projekts für die Übersicht: letzter Zeiteintrag, sonst Deadline */
const jahrVon = (daten, p) => (daten.zeiteintraege.filter((z) => z.projektId === p.id).map((z) => z.datum).sort().pop() ?? p.deadline ?? '').slice(0, 4);

/**
 * Übersicht über abgeschlossene Projekte (NachkalkUebersicht.dc.html).
 * { zeilen: [{ projekt, n }], jahr, schnitt, pauschal, stunden, abwSchnitt, ausreisser, gruppen(art | kunde) }
 */
export function nachkalkUebersicht(daten, { jahr } = {}) {
  const zeilen = daten.projekte.filter((p) => p.status === 'abgeschlossen').map((p) => ({ projekt: p, n: nachkalkulation(daten, p.id), jahr: jahrVon(daten, p) }))
    .filter((z) => z.n.T.istH > 0)
    .sort((a, b) => b.jahr.localeCompare(a.jahr) || a.projekt.name.localeCompare(b.projekt.name, 'de'));
  const schnitt = (liste) => {
    const db = liste.reduce((s, z) => s + z.n.T.db, 0), h = liste.reduce((s, z) => s + z.n.T.istH, 0);
    return { satz: h > 0 ? runde2(db / h) : NaN, anzahl: liste.length };
  };
  const imJahr = jahr ? zeilen.filter((z) => z.jahr === jahr) : zeilen;
  const abw = (liste) => { const xs = liste.map((z) => z.n.T.abwPct).filter(ok); return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN; };
  const gruppe = (schluessel) => {
    const m = new Map();
    for (const z of zeilen) { const k = schluessel(z.projekt) || 'ohne Angabe'; if (!m.has(k)) m.set(k, []); m.get(k).push(z); }
    const e = nachkalkEinstellungen(daten);
    return [...m.entries()].map(([name, liste]) => {
      const s = schnitt(liste);
      const zielGruppe = liste.reduce((a, z) => a + (z.n.T.ziel ?? 0), 0) / liste.length || null;
      return { name, satz: s.satz, anzahl: s.anzahl, abw: abw(liste), ampel: ampel(s.satz, zielGruppe, e.selbstkosten) };
    }).sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, 'de'));
  };
  const nachArt = gruppe((p) => p.art);
  const ausreisser = nachArt.filter((g) => ok(g.abw)).sort((a, b) => Math.abs(b.abw) - Math.abs(a.abw))[0] ?? null;
  return {
    zeilen, jahr, schnitt: schnitt(imJahr),
    pauschal: schnitt(zeilen.filter((z) => z.projekt.abrechnungsart === 'pauschal')),
    stunden: schnitt(zeilen.filter((z) => z.projekt.abrechnungsart !== 'pauschal')),
    abwSchnitt: abw(zeilen), ausreisser,
    nachArt, nachKunde: gruppe((p) => p.kunde),
  };
}
