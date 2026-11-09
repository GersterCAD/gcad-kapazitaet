// Angebote nach Entwurf Index B: Kopf, Positionen mit Grundstunden + Puffer, Abrechnung je Position
// (Stunden oder Pauschal), Summen, Annahme als Auftrag. Ohne Oberfläche, ohne DOM.
//
// Zwei Puffer (Joachims Entscheidung vom 28.10.2026):
//  1. Zulagen am Angebot wie im Kalkulator, einzeln schaltbar: feste Stunden (Auftrag anlegen 1 h, Materialeinstellungen 1 h)
//     und Prozent auf die Grundstunden (Kommunikation 3 %, Rücksprachen 8 %, Risiko 5 %, Rückläufer 20 %).
//     Sie werden nach dem Stundenanteil auf die Positionen verteilt. Grund + Zulagen = geplante Stunden = Soll der Projektposition.
//  2. Planungspuffer 0–20 % beim Einplanen = Puffer des Projekts, kommt auf das Soll obendrauf. 0 % ist erlaubt.
//
// Rechnung des Kalkulators (Anweisung vom 09.11.2026): Stunden einer Position aus Aufgaben-Typen (Menge × Minuten),
// Angebotspreis = Lohnsumme + Gewinn − Rabatt, Preis je Position nach ihrem Anteil an den Grundstunden.
// Gewinn und Rabatt ändern nur den Preis, nie die Stunden. Ohne Aufgaben, Gewinn und Rabatt rechnet alles wie bisher.

import { neueId, STATUS_FEST } from './daten.js';
import { alsText, ausText, plusTage } from './datum.js';
import { kundeVon } from './abrechnung.js';

export const ANGEBOT_STATUS = ['entwurf', 'versendet', 'angenommen', 'abgelehnt'];
export const ANGEBOT_STATUS_NAME = { entwurf: 'Entwurf', versendet: 'versendet', angenommen: 'angenommen', abgelehnt: 'abgelehnt' };
export const PROJEKTARTEN = ['Aufmaß', 'Entwurf', 'Werkplanung', 'Konstruktion'];
export const MWST = 0.19;
export const GUELTIG_TAGE = 30;
export const PREIS_HINWEIS = 'Alle Preise netto zzgl. gesetzlicher Mehrwertsteuer.';
/** Zulagen aus dem Kalkulator. Vorlage für neue Angebote, änderbar in den Einstellungen (einstellungen.angebotZulagen). */
export const STANDARD_ZULAGEN = [
  { name: 'Auftrag anlegen', art: 'fest', wert: 1, an: true },
  { name: 'Materialeinstellungen', art: 'fest', wert: 1, an: true },
  { name: 'Kommunikation / Mails', art: 'prozent', wert: 3, an: true },
  { name: 'Rücksprachen', art: 'prozent', wert: 8, an: true },
  { name: 'Kalk. Risiko', art: 'prozent', wert: 5, an: true },
  { name: 'Rückläufer / Änderungen', art: 'prozent', wert: 20, an: true },
];
export const neueZulagen = (vorlage = STANDARD_ZULAGEN) => vorlage.map((z) => ({ ...z, id: neueId() }));
/** Aufgaben-Typen aus dem Kalkulator. Feste IDs, damit die Umstellung auf allen Geräten dasselbe Ergebnis hat. */
export const STANDARD_AUFGABEN_TYPEN = [
  { id: 'zeichnung', name: 'Zeichnungszeit', minuten: 60 },
  { id: 'symbol', name: 'Symbol / Stk.', minuten: 10 },
  { id: 'layout', name: 'Layoutseite', minuten: 120 },
  { id: 'export', name: 'Exportseite', minuten: 90 },
];
export const STANDARD_GEWINN = 10;
export const neueAufgabenTypen = (vorlage = STANDARD_AUFGABEN_TYPEN) => vorlage.map((t) => ({ ...t }));

const runde2 = (x) => Math.round(x * 100) / 100;
const runde1 = (x) => Math.round(x * 10) / 10;
const kalkulatorRunden = (x) => Number(x.toFixed(2));   // wie toFixed im Kalkulator: 0,975 wird 0,97
/** Angebote ohne Aufgaben, Gewinn und Rabatt rechnen wie bisher (Satz × Stunden je Position), damit alte Angebote gleich bleiben */
const ohneGewinn = (a) => !(a.gewinnProzent > 0) && !(a.rabattH > 0) && !a.positionen.some((p) => p.aufgaben?.length);

/** Nächste Angebotsnummer „AN 26-031“ (Jahr aus heute, laufend je Jahr) */
export function naechsteNummer(daten, heute) {
  const jj = heute.slice(2, 4);
  const max = (daten.angebote ?? []).reduce((m, a) => {
    const t = (a.nummer ?? '').match(/^AN (\d{2})-(\d+)$/);
    return t && t[1] === jj ? Math.max(m, Number(t[2])) : m;
  }, 0);
  return `AN ${jj}-${String(max + 1).padStart(3, '0')}`;
}

export function neuesAngebot(daten, heute) {
  return {
    id: neueId(), nummer: naechsteNummer(daten, heute), datum: heute, gueltigBis: alsText(plusTage(ausText(heute), GUELTIG_TAGE)),
    kunde: '', projektname: '', projektleiter: '', art: '', status: 'entwurf', stundensatz: null, pufferImPreis: true,
    zulagen: neueZulagen(daten.einstellungen?.angebotZulagen ?? STANDARD_ZULAGEN),
    aufgabenTypen: neueAufgabenTypen(daten.einstellungen?.angebotAufgabenTypen ?? STANDARD_AUFGABEN_TYPEN),
    gewinnProzent: daten.einstellungen?.angebotGewinnProzent ?? STANDARD_GEWINN, rabattH: 0,
    kopftext: '', fusstext: '', zahlungsbedingungen: '', positionen: [neuePosition()],
    projektId: null, angenommenAm: null, lexwareId: null,
  };
}

export function neuePosition(werte = {}) {
  return {
    id: neueId(), bezeichnung: '', beschreibung: '', grundH: 0, abrechnung: 'stunden', pauschalpreis: null, ...werte,
  };
}

/** Grundstunden einer Position: aus ihren Aufgaben (Σ Menge × Minuten ÷ 60), ohne Aufgaben wie eingetippt */
export function grundVon(pos, a) {
  if (!pos.aufgaben?.length) return pos.grundH || 0;
  const typen = new Map((a.aufgabenTypen ?? []).map((t) => [t.id, t.minuten || 0]));
  return pos.aufgaben.reduce((s, x) => s + (x.menge || 0) * (typen.get(x.typId) ?? 0), 0) / 60;
}
/** Position auf Aufgaben umstellen: frühere Zeilen wieder, sonst je Typ eine mit Menge 0. Die eingetippten Stunden bleiben gemerkt. */
export function aufgabenAn(pos, a) {
  const ids = new Set((a.aufgabenTypen ?? []).map((t) => t.id));
  const vorher = (pos.aufgabenVorher ?? []).filter((x) => ids.has(x.typId));
  pos.aufgaben = vorher.length ? vorher : [...ids].map((typId) => ({ typId, menge: 0 }));
  pos.grundVorher = pos.grundH || 0;
  delete pos.aufgabenVorher;
}
/** Zurück auf eingetippte Stunden: die Summe der Aufgaben bleibt stehen, ohne Mengen die Stunden von vorher */
export function aufgabenAus(pos, a) {
  const h = grundVon(pos, a);
  pos.grundH = h > 0 ? runde2(h) : pos.grundVorher ?? 0;
  pos.aufgabenVorher = pos.aufgaben;
  delete pos.aufgaben;
  delete pos.grundVorher;
}
/** grundH der Positionen mit Aufgaben aus den Aufgaben nachführen (ändert a) */
export function grundAusAufgaben(a) {
  for (const p of a.positionen) if (p.aufgaben?.length) p.grundH = grundVon(p, a);
}
/** Nach Änderung der Aufgaben-Typen: neue Typen als Zeile mit Menge 0 ergänzen, gelöschte entfernen (ändert a, wie im Kalkulator) */
export function aufgabenTypenAbgleichen(a, alteIds) {
  const ids = new Set((a.aufgabenTypen ?? []).map((t) => t.id));
  const neu = [...ids].filter((id) => !alteIds.includes(id));
  for (const p of a.positionen) {
    if (!p.aufgaben?.length) continue;
    p.aufgaben = [...p.aufgaben.filter((x) => ids.has(x.typId)), ...neu.map((typId) => ({ typId, menge: 0 }))];
  }
}
export const grundGesamt = (a) => a.positionen.reduce((s, p) => s + grundVon(p, a), 0);

/** Zulagen mit ihren Stunden: [{ ...zulage, h }] (ausgeschaltete mit h = 0) */
export function zulagenListe(a) {
  const grund = grundGesamt(a);
  const runde = ohneGewinn(a) ? runde2 : kalkulatorRunden;
  return (a.zulagen ?? []).map((z) => ({ ...z, h: !z.an ? 0 : runde(z.art === 'fest' ? z.wert || 0 : grund * (z.wert || 0) / 100) }));
}
export const zulagenGesamt = (a) => runde2(zulagenListe(a).reduce((s, z) => s + z.h, 0));

/** Zulagen einer Position in Stunden: Anteil nach Grundstunden */
export function pufferH(pos, a) {
  const grund = grundGesamt(a);
  return grund > 0 ? runde2((grundVon(pos, a) / grund) * zulagenGesamt(a)) : 0;
}
/** Geplante Stunden = Grund + Zulagenanteil */
export const geplantH = (pos, a) => runde2(grundVon(pos, a) + pufferH(pos, a));

/** Stundensatz: am Angebot eingetragen, sonst vom Kunden. { satz, quelle: 'angebot' | 'kunde' | null } */
export function angebotSatz(daten, a) {
  if (a.stundensatz > 0) return { satz: a.stundensatz, quelle: 'angebot' };
  const k = kundeVon(daten, { kunde: a.kunde });
  if (k?.stundensatz > 0) return { satz: k.stundensatz, quelle: 'kunde' };
  return { satz: null, quelle: null };
}

/** Preis aller Stunden-Positionen: { basis, h, lohnsumme, gewinn, rabatt, preis }. Pauschal-Positionen sind nicht dabei. */
function stundenPreis(a, satz) {
  const basis = a.positionen.filter((p) => p.abrechnung !== 'pauschal').reduce((s, p) => s + grundVon(p, a), 0);
  const alle = grundGesamt(a);
  const h = a.pufferImPreis !== false && alle > 0 ? basis + zulagenGesamt(a) * (basis / alle) : basis;
  const lohnsumme = h * satz;
  const gewinn = lohnsumme * (a.gewinnProzent || 0) / 100;
  const rabatt = (a.rabattH || 0) * satz;
  return { basis, h, lohnsumme, gewinn, rabatt, preis: Math.max(0, lohnsumme + gewinn - rabatt) };
}

/** Betrag einer Position: Pauschalpreis, sonst ihr Anteil am Angebotspreis (ohne Gewinn und Rabatt: Satz × Stunden) */
export function positionsBetrag(pos, satz, a) {
  if (pos.abrechnung === 'pauschal') return pos.pauschalpreis ?? 0;
  if (!satz) return 0;
  if (ohneGewinn(a)) return runde2((a.pufferImPreis !== false ? geplantH(pos, a) : grundVon(pos, a)) * satz);
  const { basis, preis } = stundenPreis(a, satz);
  if (!(basis > 0)) return 0;
  const anteil = (p) => runde2((grundVon(p, a) / basis) * preis);
  // Die letzte Position gleicht die Rundung aus, damit die Summe der Positionen dem Angebotspreis entspricht (Joachims Entscheidung)
  const stunden = a.positionen.filter((p) => p.abrechnung !== 'pauschal' && grundVon(p, a) > 0);
  if (pos.id !== stunden.at(-1)?.id) return anteil(pos);
  return Math.max(0, runde2(runde2(preis) - stunden.slice(0, -1).reduce((s, p) => s + anteil(p), 0)));
}

/** Summen eines Angebots */
export function summen(daten, a) {
  const { satz, quelle } = angebotSatz(daten, a);
  let grund = 0, puffer = 0, netto = 0, pauschal = 0;
  for (const p of a.positionen) {
    grund += grundVon(p, a);
    netto += positionsBetrag(p, satz, a);
    if (p.abrechnung === 'pauschal') pauschal += p.pauschalpreis ?? 0;
  }
  puffer = zulagenGesamt(a);
  const geplant = grund + puffer;
  const sp = satz ? stundenPreis(a, satz) : { lohnsumme: 0, gewinn: 0, rabatt: 0, preis: 0 };
  const lohnsumme = ohneGewinn(a) ? netto - pauschal : sp.lohnsumme;
  netto = runde2(ohneGewinn(a) ? netto : sp.preis + pauschal);
  const mwst = runde2(netto * MWST);
  return {
    satz, quelle, grundH: runde2(grund), pufferH: runde2(puffer), geplantH: runde2(geplant),
    pufferProzent: grund > 0 ? Math.round((puffer / grund) * 100) : 0,
    pauschal: runde2(pauschal), lohnsumme: runde2(lohnsumme), gewinn: runde2(sp.gewinn), rabatt: runde2(sp.rabatt),
    entsprichtH: satz ? runde2(geplant - (a.rabattH || 0) + sp.gewinn / satz) : null,
    netto, mwst, brutto: runde2(netto + mwst), jeStunde: geplant > 0 ? runde2(netto / geplant) : null,
    ohneSatz: !satz && a.positionen.some((p) => p.abrechnung !== 'pauschal'),
  };
}

/** Kennzahlen für die Liste: offen versendet, angenommen im Jahr, Annahmequote */
export function angebotsKennzahlen(daten, heute) {
  const liste = daten.angebote ?? [];
  const jahr = heute.slice(0, 4);
  const sum = (xs) => xs.reduce((s, a) => { const z = summen(daten, a); s.netto += z.netto; s.h += z.geplantH; return s; }, { netto: 0, h: 0, anzahl: xs.length });
  const versendet = liste.filter((a) => a.status === 'versendet');
  const angenommen = liste.filter((a) => a.status === 'angenommen' && (a.angenommenAm ?? a.datum).startsWith(jahr));
  const entschieden = liste.filter((a) => ['angenommen', 'abgelehnt'].includes(a.status));
  return {
    versendet: sum(versendet), angenommen: sum(angenommen), jahr,
    quote: entschieden.length ? Math.round((liste.filter((a) => a.status === 'angenommen').length / entschieden.length) * 100) : null,
    entschieden: entschieden.length, angenommenAnzahl: liste.filter((a) => a.status === 'angenommen').length,
  };
}

/** Abgelaufen: versendet und „gültig bis“ vorbei */
export const abgelaufen = (a, heute) => a.status === 'versendet' && a.gueltigBis && a.gueltigBis < heute;

/**
 * Angebot annehmen und als Auftrag einplanen (ändert daten). Nie mit Samstagen oder langen Tagen – die kommen
 * wie immer nur als Vorschlag. opts: { positionIds, start, deadline, puffer, heute }. Gibt die Projekt-ID zurück.
 */
export function angebotAnnehmen(daten, angebotId, { positionIds, start = '', deadline = '', puffer = 0, heute }) {
  const a = daten.angebote.find((x) => x.id === angebotId);
  if (!a) throw new Error('Angebot nicht gefunden.');
  if (a.projektId) throw new Error('Das Angebot ist schon eingeplant.');
  const gewaehlt = a.positionen.filter((p) => !positionIds || positionIds.includes(p.id));
  const { satz } = angebotSatz(daten, a);
  const allePauschal = gewaehlt.length > 0 && gewaehlt.every((p) => p.abrechnung === 'pauschal');
  const positionen = gewaehlt.map((p, i) => ({
    nr: String(i + 1), bezeichnung: p.bezeichnung || `Position ${i + 1}`, sollH: runde1(geplantH(p, a)),
    angebotPositionId: p.id, preis: positionsBetrag(p, satz, a),
  }));
  const fest = daten.projekte.filter((x) => STATUS_FEST.includes(x.status)).length;
  const id = neueId();
  daten.projekte.push({
    id, nr: '', name: a.projektname || a.nummer, kunde: a.kunde, art: a.art, status: 'auftrag',
    start, deadline, prioritaet: 2, farbe: ['#445F6E', '#7C93A0', '#B4C3CC'][fest % 3],
    schaetzungH: runde1(positionen.reduce((s, p) => s + p.sollH, 0)), puffer, positionen,
    abrechnungsart: allePauschal ? 'pauschal' : 'stunden',
    stundensatz: allePauschal ? null : a.stundensatz > 0 ? a.stundensatz : null,
    pauschalpreis: allePauschal ? runde2(positionen.reduce((s, p) => s + p.preis, 0)) : null,
    angebotId: a.id,
  });
  if (deadline) {
    daten.meilensteine.push({ id: neueId(), projektId: id, datum: deadline, titel: 'Abgabe', typ: 'deadline', notiz: '', erledigt: false, erinnerungTage: [7, 2] });
  }
  a.statusVorher = a.status;
  a.status = 'angenommen';
  a.angenommenAm = heute;
  a.projektId = id;
  return id;
}

/** Einplanen zurücknehmen, solange noch keine Zeit gebucht ist (ändert daten). Gibt true zurück, wenn es ging. */
export function annahmeZuruecknehmen(daten, angebotId) {
  const a = daten.angebote.find((x) => x.id === angebotId);
  if (!a?.projektId) return false;
  const pid = a.projektId;
  if (daten.zeiteintraege.some((z) => z.projektId === pid) || daten.timer?.projektId === pid) return false;
  daten.projekte = daten.projekte.filter((p) => p.id !== pid);
  daten.meilensteine = daten.meilensteine.filter((m) => m.projektId !== pid);
  daten.einplanungen = daten.einplanungen.filter((x) => x.projektId !== pid);
  a.status = a.statusVorher && a.statusVorher !== 'angenommen' ? a.statusVorher : 'versendet';
  delete a.statusVorher;
  a.angenommenAm = null;
  a.projektId = null;
  return true;
}

/**
 * Auftrag für die GitHub Action: Angebot als Entwurf in Lexware Office (nur die Felder, die die Action annimmt).
 * Wie im Kalkulator (Joachims Entscheidung vom 09.11.2026): jede Position als 1 × Pauschal mit ihrem Preis,
 * Zulagen, Gewinn und Rabatt stecken anteilig darin und werden nicht ausgewiesen. Positionen mit 0 € fallen weg.
 */
export function lexwareAngebot(daten, a) {
  const { satz } = angebotSatz(daten, a);
  const k = kundeVon(daten, { kunde: a.kunde });
  return {
    art: 'angebot', kontaktId: k?.lexwareKontaktId ?? null, name: a.kunde || 'Kunde',
    titel: a.projektname || 'Angebot', einleitung: a.kopftext || '',
    bemerkung: [a.fusstext, a.zahlungsbedingungen, a.fusstext?.includes(PREIS_HINWEIS) ? '' : PREIS_HINWEIS].filter(Boolean).join('\n\n'),
    datum: a.datum, gueltigBis: a.gueltigBis,
    zeilen: a.positionen.filter((p) => positionsBetrag(p, satz, a) > 0).map((p) => (
      { name: p.bezeichnung || 'Position', beschreibung: p.beschreibung || '', menge: 1, einheit: 'Pauschal', preisNetto: positionsBetrag(p, satz, a) })),
  };
}

/**
 * Ältere Angebote (Puffer je Position) auf Zulagen am Angebot umstellen (ändert a). Gleichen alle Positionen
 * denselben Prozentwert, wird daraus eine Prozent-Zulage, sonst eine feste Zulage mit derselben Stundensumme.
 */
export function zulagenUmstellen(a) {
  if (Array.isArray(a.zulagen)) return false;
  const alt = a.positionen.map((p) => (p.pufferEinheit === 'h' ? { h: p.puffer || 0 } : { pr: p.puffer || 0, h: (p.grundH || 0) * (p.puffer || 0) / 100 }));
  const prozente = [...new Set(alt.map((x) => x.pr))];
  const summe = runde2(alt.reduce((s, x) => s + x.h, 0));
  a.zulagen = !summe ? []
    : prozente.length === 1 && prozente[0] != null ? [{ id: neueId(), name: 'Puffer (übernommen)', art: 'prozent', wert: prozente[0], an: true }]
      : [{ id: neueId(), name: 'Puffer (übernommen)', art: 'fest', wert: summe, an: true }];
  for (const p of a.positionen) { delete p.puffer; delete p.pufferEinheit; }
  return true;
}
