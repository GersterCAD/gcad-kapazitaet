// Abgleich zwischen Geräten: Drei-Wege-Zusammenführung. Ohne Oberfläche, ohne DOM.
// basis = Stand beim letzten Abgleich, lokal = dieses Gerät, entfernt = Stand im privaten Repo.
// Änderungen auf nur einer Seite werden übernommen. Wurde derselbe Eintrag auf beiden Seiten verschieden
// geändert, ist das ein Konflikt – dann gewinnt nicht einfach der letzte Stand, sondern Joachim entscheidet.

import { leereDaten, STATUS_NAME } from './daten.js';

/** Listen und ihr Schlüsselfeld */
export const BEREICHE = [
  { liste: 'projekte', name: 'Projekt' },
  { liste: 'meilensteine', name: 'Meilenstein' },
  { liste: 'zeiteintraege', name: 'Zeiteintrag' },
  { liste: 'einplanungen', name: 'Einplanung' },
  { liste: 'blockzeiten', name: 'Blockzeit' },
  { liste: 'abwesenheiten', name: 'Abwesenheit' },
  { liste: 'terminRegeln', name: 'Terminregel', schluessel: 'uid' },
  { liste: 'vorschlaegeUebernommen', name: 'Vorschlag' },
];

const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nachId = (liste = [], k) => new Map(liste.map((x) => [x[k], x]));

/** Sind zwei Datenstände inhaltlich gleich? */
export const datenGleich = (a, b) => gleich(a, b);

/**
 * Drei-Wege-Zusammenführung.
 * Ergebnis: { daten, konflikte: [{ schluessel, bereich, name, titel, lokal, entfernt }] }
 * daten enthält bei Konflikten vorerst den lokalen Stand; mit konflikteLoesen() wird entschieden.
 */
export function zusammenfuehren(basis, lokal, entfernt) {
  basis ??= leereDaten();
  const daten = structuredClone(lokal);
  const konflikte = [];

  // Einstellungen: je Feld
  const e = {};
  const felder = new Set([...Object.keys(basis.einstellungen ?? {}), ...Object.keys(lokal.einstellungen), ...Object.keys(entfernt.einstellungen)]);
  for (const f of felder) {
    const b = basis.einstellungen?.[f], l = lokal.einstellungen[f], r = entfernt.einstellungen[f];
    if (gleich(l, r) || gleich(b, r)) e[f] = l;
    else if (gleich(b, l)) e[f] = r;
    else { e[f] = l; konflikte.push({ schluessel: `einstellungen|${f}`, bereich: 'einstellungen', name: 'Einstellung', titel: f, lokal: l, entfernt: r }); }
  }
  daten.einstellungen = e;

  // Laufender Timer: ein Wert für alles
  {
    const b = basis.timer ?? null, l = lokal.timer ?? null, r = entfernt.timer ?? null;
    if (gleich(l, r) || gleich(b, r)) daten.timer = l;
    else if (gleich(b, l)) daten.timer = r;
    else { daten.timer = l; konflikte.push({ schluessel: 'timer', bereich: 'timer', name: 'Timer', titel: 'läuft auf zwei Geräten', lokal: l, entfernt: r }); }
  }

  for (const { liste, name, schluessel = 'id' } of BEREICHE) {
    const B = nachId(basis[liste], schluessel), L = nachId(lokal[liste], schluessel), R = nachId(entfernt[liste], schluessel);
    const ergebnis = [];
    const reihenfolge = [...new Set([...L.keys(), ...R.keys()])];
    for (const id of reihenfolge) {
      const b = B.get(id), l = L.get(id), r = R.get(id);
      let wert;
      if (gleich(l, r)) wert = l;                        // gleich oder auf beiden Seiten gleich geändert/gelöscht
      else if (gleich(b, r)) wert = l;                   // nur hier geändert (oder hier neu / hier gelöscht)
      else if (gleich(b, l)) wert = r;                   // nur dort geändert (oder dort neu / dort gelöscht)
      else {
        wert = l;
        konflikte.push({ schluessel: `${liste}|${id}`, bereich: liste, name, titel: titel(liste, l ?? r, lokal, entfernt), lokal: l ?? null, entfernt: r ?? null });
      }
      if (wert !== undefined && wert !== null) ergebnis.push(wert);
    }
    daten[liste] = ergebnis;
  }
  daten.schemaVersion = Math.max(lokal.schemaVersion ?? 1, entfernt.schemaVersion ?? 1);
  return { daten, konflikte };
}

/** Entscheidungen anwenden: wahl = { [schluessel]: 'lokal' | 'entfernt' } (fehlt = lokal) */
export function konflikteLoesen(ergebnis, wahl = {}) {
  const daten = structuredClone(ergebnis.daten);
  for (const k of ergebnis.konflikte) {
    const wert = wahl[k.schluessel] === 'entfernt' ? k.entfernt : k.lokal;
    if (k.bereich === 'einstellungen') { daten.einstellungen[k.titel] = wert; continue; }
    if (k.bereich === 'timer') { daten.timer = wert; continue; }
    const s = BEREICHE.find((x) => x.liste === k.bereich).schluessel ?? 'id';
    const id = k.schluessel.slice(k.bereich.length + 1);
    const i = daten[k.bereich].findIndex((x) => String(x[s]) === id);
    if (wert == null) { if (i >= 0) daten[k.bereich].splice(i, 1); }
    else if (i >= 0) daten[k.bereich][i] = wert;
    else daten[k.bereich].push(wert);
  }
  return daten;
}

/** Lesbarer Titel eines Eintrags für den Konflikt-Hinweis */
function titel(liste, x, lokal, entfernt) {
  if (!x) return '';
  const projekt = (id) => (lokal.projekte.find((p) => p.id === id) ?? entfernt.projekte.find((p) => p.id === id))?.name ?? 'Projekt';
  switch (liste) {
    case 'projekte': return x.name;
    case 'meilensteine': return `${x.titel} · ${projekt(x.projektId)}`;
    case 'zeiteintraege': return `${x.datum} · ${projekt(x.projektId)}`;
    case 'einplanungen': return `${x.woche} · ${projekt(x.projektId)}`;
    case 'blockzeiten': return x.titel;
    case 'abwesenheiten': return `${x.art === 'krank' ? 'Krank' : 'Urlaub'} ${x.von} – ${x.bis}`;
    case 'vorschlaegeUebernommen': return x.titel ?? 'Vorschlag';
    default: return x.uid ?? x.id ?? '';
  }
}

const FELD_NAME = {
  name: 'Name', nr: 'Nummer', kunde: 'Kunde', art: 'Art', status: 'Status', schaetzungH: 'Schätzung', puffer: 'Puffer',
  start: 'Start', deadline: 'Deadline', prioritaet: 'Priorität', positionen: 'Positionen', datum: 'Datum', titel: 'Titel',
  typ: 'Typ', erledigt: 'erledigt', erinnerungTage: 'Erinnerung', stunden: 'Stunden', positionNr: 'Position', notiz: 'Notiz',
  von: 'von', bis: 'bis', stundenProWoche: 'Stunden pro Woche', wochentag: 'Tage', kuerzbar: 'kürzbar', zaehltH: 'zählt', projektId: 'Projekt',
  regeltagH: 'Regeltag', timerRundung: 'Timer-Rundung', maxTagH: 'Längster Tag', warnWochen: 'Warngrenze', standardPuffer: 'Standard-Puffer', samstagErlaubt: 'Samstag', kalender: 'Kalender',
};

function wertText(v, feld) {
  if (v == null || v === '') return '–';
  if (feld === 'status') return STATUS_NAME[v] ?? v;
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (typeof v === 'number') return String(v).replace('.', ',');
  if (Array.isArray(v)) return feld === 'positionen' ? `${v.length} Positionen` : v.join(', ');
  if (typeof v === 'object') return '…';
  return String(v);
}

/** Unterschiede eines Konflikts in Worten: [{ feld, lokal, entfernt }]; gelöscht auf einer Seite = ein Eintrag „gelöscht“ */
export function unterschiede(k) {
  if (k.bereich === 'timer') {
    const t = (x) => (x ? `seit ${new Date(x.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'gestoppt');
    return [{ feld: 'Timer', lokal: t(k.lokal), entfernt: t(k.entfernt) }];
  }
  if (k.bereich === 'einstellungen') return [{ feld: FELD_NAME[k.titel] ?? k.titel, lokal: wertText(k.lokal, k.titel), entfernt: wertText(k.entfernt, k.titel) }];
  if (!k.lokal || !k.entfernt) return [{ feld: 'Eintrag', lokal: k.lokal ? 'geändert' : 'gelöscht', entfernt: k.entfernt ? 'geändert' : 'gelöscht' }];
  const felder = [...new Set([...Object.keys(k.lokal), ...Object.keys(k.entfernt)])].filter((f) => f !== 'id' && !gleich(k.lokal[f], k.entfernt[f]));
  return felder.map((f) => ({ feld: FELD_NAME[f] ?? f, lokal: wertText(k.lokal[f], f), entfernt: wertText(k.entfernt[f], f) }));
}
