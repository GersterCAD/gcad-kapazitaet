// Kunden (Index B: Kunden.dc.html). Lexware Office ist der Kundenstamm: Name, Kundennummer und Lexware-ID kommen
// von dort, in der App wird nur der Stundensatz gepflegt. Anschrift, E-Mail und Zahlungsziel bleiben in Lexware
// (Joachims Entscheidung vom 22.11.2026: jedes Feld hat genau einen Platz).
//
// Die Zuordnung über den Namen ist die gefährliche Stelle. finde() ist eine genaue Übertragung von finde() aus
// 20_GersterCAD/90_CAM-Scripts/gcad_kunden.py (Stand 22.11.2026): fünf Stufen, Abbruch bei der ersten, die etwas
// findet, die letzte Stufe gibt nie einen Treffer. Verknüpft wird nur bei „treffer“, alles andere legt die App
// Joachim mit dem Vorschlag daneben zur Bestätigung vor.

import { offenUebersicht } from './rechnung.js';
import { nachkalkulation } from './nachkalkulation.js';
import { MWST, summen } from './angebot.js';

// Rechtsformen und Beiwerk, die einen Namen nicht ausmachen. Nur für den VERGLEICH – gespeichert wird immer der
// volle Name aus Lexware. Gleicher Ausdruck wie RECHTSFORM in gcad_kunden.py.
const RECHTSFORM = /\b(gmbh\s*&\s*co\.?\s*kg|gmbh|mbh|ug|ag|kg|ohg|gbr|e\.?\s?k\.?|e\.?\s?v\.?|co\.?\s?kg|inh\.?|gesellschaft|und\s+partner)\b/g;
const UMLAUTE = [['ä', 'ae'], ['ö', 'oe'], ['ü', 'ue'], ['ß', 'ss']];

/** Ein Name, auf das reduziert, was ihn ausmacht: klein, ohne Umlaute, ohne Rechtsform, ohne Satzzeichen */
export function schluesselform(text) {
  let t = (text ?? '').toLowerCase();
  for (const [alt, neu] of UMLAUTE) t = t.split(alt).join(neu);
  t = t.normalize('NFKD').replace(/[^\x00-\x7f]/g, '');
  t = t.replace(RECHTSFORM, ' ');
  t = t.replace(/[^a-z0-9]+/g, ' ');
  return t.split(' ').filter(Boolean).join(' ');
}

const gleich = (a, b) => String(a ?? '') === String(b ?? '');

/**
 * Den Lexware-Kontakt zu einem Kunden der App suchen. kunde = { name, nummer, lexwareKontaktId }.
 * Rückgabe { zustand, treffer, text }:
 *   'treffer'     genau einer, treffer ist der Kontakt
 *   'mehrdeutig'  mehrere möglich oder zu unsicher, treffer ist die Liste (Vorschläge)
 *   'nichts'      keiner, treffer ist null
 * Eine sichere Stufe darf nie von einer unsicheren überstimmt werden.
 */
export function finde(kontakte, kunde) {
  const k = kunde ?? {};

  // 1. Die ID steht schon da – dann ist nichts zu suchen.
  if (k.lexwareKontaktId) {
    const c = kontakte.find((x) => gleich(x.id, k.lexwareKontaktId));
    if (c) return { zustand: 'treffer', treffer: c, text: 'über die bereits eingetragene Lexware-ID' };
    return { zustand: 'nichts', treffer: null, text: 'Die eingetragene Lexware-ID steht in keinem Kontakt mehr.' };
  }

  // 2. Die Kundennummer ist eindeutig und wird von Hand gepflegt.
  if (k.nummer) {
    const tr = kontakte.filter((x) => gleich(x.nummer, k.nummer));
    if (tr.length === 1) return { zustand: 'treffer', treffer: tr[0], text: `über die Kundennummer ${k.nummer}` };
    if (tr.length) return { zustand: 'mehrdeutig', treffer: tr, text: `${tr.length} Kontakte mit der Kundennummer ${k.nummer}` };
  }

  const name = k.name ?? '';
  if (!name) return { zustand: 'nichts', treffer: null, text: 'kein Kundenname' };

  // 3. Name buchstabengenau.
  let tr = kontakte.filter((x) => (x.name ?? '') === name);
  if (tr.length === 1) return { zustand: 'treffer', treffer: tr[0], text: 'über den Namen, buchstabengenau' };
  if (tr.length) return { zustand: 'mehrdeutig', treffer: tr, text: `${tr.length} Kontakte mit genau diesem Namen` };

  // 4. Name auf die Schlüsselform reduziert.
  const s = schluesselform(name);
  if (s) {
    tr = kontakte.filter((x) => schluesselform(x.name) === s);
    if (tr.length === 1) return { zustand: 'treffer', treffer: tr[0], text: 'über den Namen ohne Rechtsform und Schreibweise' };
    if (tr.length) return { zustand: 'mehrdeutig', treffer: tr, text: `${tr.length} Kontakte sehen gleich aus, wenn man Rechtsform und Schreibweise weglässt` };
  }

  // 5. Das erste Wort – die unsicherste Stufe. Nur wenn es GENAU einen gibt, und auch dann nur als Vorschlag, nie als Treffer.
  const erstes = s ? s.split(' ')[0] : '';
  if (erstes.length >= 4) {
    tr = kontakte.filter((x) => schluesselform(x.name).split(' ')[0] === erstes);
    if (tr.length === 1) return { zustand: 'mehrdeutig', treffer: tr, text: `Nur das erste Wort „${erstes}“ stimmt überein – zu unsicher zum Verknüpfen, bitte bestätigen.` };
    if (tr.length) return { zustand: 'mehrdeutig', treffer: tr, text: `${tr.length} Kontakte fangen mit „${erstes}“ an` };
  }

  return { zustand: 'nichts', treffer: null, text: `Kein Lexware-Kontakt passt zu „${name}“.` };
}

/** Alle Kundennamen der App: Kunden mit Stundensatz, Projekte und Angebote */
export function kundenNamen(daten) {
  const namen = [
    ...(daten.kunden ?? []).map((k) => k.name),
    ...daten.projekte.map((p) => p.kunde),
    ...(daten.angebote ?? []).map((a) => a.kunde),
  ].map((n) => (n ?? '').trim()).filter(Boolean);
  return [...new Set(namen)].sort((a, b) => a.localeCompare(b, 'de'));
}

export const kundeZuName = (daten, name) => (daten.kunden ?? []).find((k) => k.name === name) ?? null;

/**
 * Einen Kunden der App mit einem Lexware-Kontakt verknüpfen (ändert daten). Wie setze_kunde() im Projektstamm:
 * beide Kennungen und der Name, oder gar nichts. Der Name kommt aus Lexware und wird in Projekten und Angeboten
 * mitgeführt. Ist der Kontakt schon mit einem anderen Kunden verknüpft, werden die beiden zusammengelegt.
 * Gibt den alten Eintrag zurück (oder null).
 */
export function verknuepfen(daten, name, kontakt) {
  for (const f of ['id', 'name', 'nummer']) {
    if (!kontakt?.[f]) throw new Error(`Der Lexware-Kontakt hat keine ${f === 'id' ? 'ID' : f === 'name' ? 'Namen' : 'Kundennummer'}.`);
  }
  daten.kunden ??= [];
  const alt = kundeZuName(daten, name);
  const vorher = alt ? { ...alt } : null;
  const schon = daten.kunden.find((k) => gleich(k.lexwareKontaktId, kontakt.id));
  const umbenennen = new Set([name]);
  if (schon) umbenennen.add(schon.name);
  let e = schon ?? alt;
  if (schon && alt && schon !== alt) {
    if (!(schon.stundensatz > 0) && alt.stundensatz > 0) schon.stundensatz = alt.stundensatz;
    daten.kunden = daten.kunden.filter((k) => k !== alt);
  }
  if (!e) { e = { id: `k-${kontakt.id}`, name, stundensatz: null }; daten.kunden.push(e); } // gleiche ID auf jedem Gerät
  e.name = kontakt.name;
  e.nummer = kontakt.nummer;
  e.lexwareKontaktId = kontakt.id;
  for (const x of [...daten.projekte, ...(daten.angebote ?? [])]) {
    if (umbenennen.has((x.kunde ?? '').trim())) x.kunde = kontakt.name;
  }
  return vorher;
}

/**
 * Alle Kunden durchgehen (ändert daten). Verknüpft wird nur bei „treffer“. Rückgabe je Name:
 * { name, zustand: 'steht' | 'gesetzt' | 'unklar' | 'nichts', vorschlaege, text }
 */
export function zuordnen(daten, kontakte) {
  const raus = [];
  for (const name of kundenNamen(daten)) {
    const k = kundeZuName(daten, name) ?? { name };
    const { zustand, treffer, text } = finde(kontakte, k);
    if (zustand === 'treffer') {
      const steht = gleich(k.lexwareKontaktId, treffer.id) && gleich(k.nummer, treffer.nummer) && k.name === treffer.name;
      if (steht) { raus.push({ name, zustand: 'steht', vorschlaege: [], text: 'mit Lexware verknüpft' }); continue; }
      verknuepfen(daten, name, treffer);
      raus.push({ name: treffer.name, zustand: 'gesetzt', vorschlaege: [], text: `Kd.-Nr. ${treffer.nummer}, ${text}` });
    } else {
      raus.push({ name, zustand: zustand === 'mehrdeutig' ? 'unklar' : 'nichts', vorschlaege: treffer ?? [], text });
    }
  }
  return raus;
}

/** Probelauf: was zuordnen() tun würde, ohne daten zu ändern */
export const zuordnungPruefen = (daten, kontakte) => zuordnen(structuredClone(daten), kontakte);

/**
 * Einen Vorschlag von Hand bestätigen (ändert daten): Kundenname + Kundennummer. Der Weg für alles, was unklar
 * blieb. Die Entscheidung trifft Joachim, hier wird sie nur eingetragen. Gibt den Kontakt zurück.
 */
export function bestaetigen(daten, name, nummer, kontakte) {
  const tr = kontakte.filter((c) => gleich(c.nummer, nummer));
  if (!tr.length) throw new Error(`Keine Kundennummer ${nummer} in den Lexware-Kontakten.`);
  if (tr.length > 1) throw new Error(`Die Kundennummer ${nummer} kommt ${tr.length}-mal vor.`);
  verknuepfen(daten, name, tr[0]);
  return tr[0];
}

/** Lexware-Kontakt-ID für einen Kundennamen: am Kunden eingetragen, sonst nur bei eindeutigem Treffer */
export function kontaktIdFuer(daten, name, kontakte) {
  const k = kundeZuName(daten, (name ?? '').trim()) ?? { name: (name ?? '').trim() };
  if (k.lexwareKontaktId) return k.lexwareKontaktId;
  const f = finde(kontakte, k);
  return f.zustand === 'treffer' ? f.treffer.id : null;
}

// ---------- Kennzahlen und Belege je Kunde ----------

const runde2 = (x) => Math.round(x * 100) / 100;
const OHNE_AUFTRAG = ['anfrage', 'angebot', 'abgesagt'];

/**
 * Eine Zeile je Kunde: Aufträge, offen, Umsatz im Jahr (netto), Ø Abweichung und effektiv je Stunde
 * (abgeschlossene Projekte, wie die Nachkalkulation: Deckungsbeitrag ÷ Ist).
 * lexwareListe = Belegliste aus Lexware (Name des Kontakts in „kunde“); zählt nur bei verknüpften Kunden.
 */
export function kundenListe(daten, heute, lexwareListe = []) {
  const jahr = heute.slice(0, 4);
  const offen = offenUebersicht(daten, heute);
  const inLexware = new Set(lexwareListe.map((x) => x.id));
  return kundenNamen(daten).map((name) => {
    const k = kundeZuName(daten, name);
    const projekte = daten.projekte.filter((p) => (p.kunde ?? '').trim() === name);
    const ids = new Set(projekte.map((p) => p.id));
    const offenBetrag = offen.filter((z) => ids.has(z.projekt.id)).reduce((s, z) => s + (z.offenBetrag ?? 0), 0);

    let umsatz = 0;
    if (k?.lexwareKontaktId) {
      for (const x of lexwareListe) {
        if (x.kunde === name && x.status !== 'voided' && (x.datum ?? '').startsWith(jahr)) umsatz += (x.gesamt ?? 0) / (1 + MWST);
      }
    }
    for (const r of daten.rechnungen ?? []) {
      if (!ids.has(r.projektId) || !(r.erstellt ?? '').startsWith(jahr)) continue;
      if (r.lexwareId && inLexware.has(r.lexwareId) && k?.lexwareKontaktId) continue; // steht schon in der Lexware-Liste
      if (['erledigt', 'uebertragen'].includes(r.status)) umsatz += r.netto ?? 0;
    }

    const fertig = projekte.filter((p) => p.status === 'abgeschlossen').map((p) => nachkalkulation(daten, p.id).T).filter((t) => t.istH > 0);
    const abw = fertig.map((t) => t.abwPct).filter(Number.isFinite);
    const h = fertig.reduce((s, t) => s + t.istH, 0);
    return {
      name, kunde: k, verknuepft: !!k?.lexwareKontaktId, nummer: k?.nummer ?? null, stundensatz: k?.stundensatz ?? null,
      auftraege: projekte.filter((p) => !OHNE_AUFTRAG.includes(p.status)).length,
      offen: runde2(offenBetrag),
      umsatz: runde2(umsatz),
      abweichung: abw.length ? abw.reduce((s, x) => s + x, 0) / abw.length : null,
      effektiv: h > 0 ? runde2(fertig.reduce((s, t) => s + t.db, 0) / h) : null,
    };
  });
}

/** Belege eines Kunden für die Reiter Angebote · Aufträge · Rechnungen, neueste zuerst */
export function belegeVon(daten, name) {
  const projekte = daten.projekte.filter((p) => (p.kunde ?? '').trim() === name);
  const ids = new Set(projekte.map((p) => p.id));
  const angebote = (daten.angebote ?? []).filter((a) => (a.kunde ?? '').trim() === name)
    .map((a) => ({ angebot: a, netto: summen(daten, a).netto }))
    .sort((a, b) => (b.angebot.datum ?? '').localeCompare(a.angebot.datum ?? ''));
  const auftraege = projekte.filter((p) => !OHNE_AUFTRAG.includes(p.status))
    .sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
  const rechnungen = (daten.rechnungen ?? []).filter((r) => ids.has(r.projektId))
    .sort((a, b) => (b.erstellt ?? '').localeCompare(a.erstellt ?? ''));
  return { angebote, auftraege, rechnungen };
}
