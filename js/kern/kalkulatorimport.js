// Import alter Kalkulator-Dateien (.html): die Datei wird nur als Text gelesen, der gespeicherte Zustand mit JSON.parse
// geholt und Feld für Feld geprüft. Aus der Datei wird nie etwas ausgeführt. Ohne Oberfläche, ohne DOM.

import { neuesAngebot, neuePosition, grundAusAufgaben, GUELTIG_TAGE } from './angebot.js';
import { alsText, ausText, plusTage } from './datum.js';

const MARKE = 'var _s = ';
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const UNBEKANNT = 'unbekannt';
export const IMPORT_MAX_BYTES = 20 * 1024 * 1024;

/** Das JSON-Objekt ab Position start herausschneiden (Klammern zählen, Text in Anführungszeichen überspringen) */
function objektAb(text, start) {
  let tiefe = 0, inText = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inText) {
      if (c === '\\') i++;
      else if (c === '"') inText = false;
    } else if (c === '"') inText = true;
    else if (c === '{') tiefe++;
    else if (c === '}' && --tiefe === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * Gespeicherten Zustand aus dem Dateitext holen. Wurde eine Datei mehrfach gespeichert, stehen mehrere Stände
 * hintereinander in der Datei: der letzte ist der neueste. Wirft einen Fehler mit verständlichem Text.
 */
export function kalkulatorLesen(text) {
  if (typeof text !== 'string') throw new Error('Die Datei konnte nicht gelesen werden.');
  let zustand = null;
  for (let i = text.indexOf(MARKE); i !== -1; i = text.indexOf(MARKE, i + 1)) {
    const start = i + MARKE.length;
    if (text[start] !== '{') continue;                 // im Programmcode der Datei steht hier eine Vorlage, kein Stand
    const roh = objektAb(text, start);
    if (!roh) continue;
    try {
      const s = JSON.parse(roh);
      if (Array.isArray(s?.positions)) zustand = s;
    } catch { /* kein gültiger Stand, weitersuchen */ }
  }
  if (!zustand) throw new Error('In der Datei steht keine Kalkulation. Wähle eine Datei, die im Kalkulator gespeichert wurde.');
  return zustand;
}

const text = (x, max = 500) => (typeof x === 'string' ? x.trim().slice(0, max) : typeof x === 'number' ? String(x) : '');

function zahl(x, name, max) {
  const n = typeof x === 'number' || typeof x === 'string' ? Number(String(x).replace(',', '.')) : 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > max) throw new Error(`Die Kalkulation sieht nicht plausibel aus: ${name} ist ${n}.`);
  return n;
}

/**
 * Neues Angebot (Entwurf, neue Nummer) aus dem Zustand einer Kalkulation. Hängt es nicht an daten an.
 * Ergebnis: { angebot, hinweise: [Text] }
 */
export function angebotAusKalkulator(daten, s, heute) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.positions)) throw new Error('In der Datei steht keine Kalkulation.');
  if (!s.positions.length) throw new Error('Die Kalkulation hat keine Positionen.');
  const hinweise = [];
  const a = neuesAngebot(daten, heute);

  a.projektname = text(s.projName);
  a.kunde = text(s.projClient);
  a.projektleiter = text(s.projLeader);
  a.kopftext = text(s.projDesc, 5000);
  const datum = text(s.projDate);
  if (DATUM.test(datum) && !Number.isNaN(Date.parse(datum))) {
    a.datum = datum;
    a.gueltigBis = alsText(plusTage(ausText(datum), GUELTIG_TAGE));
  } else hinweise.push('In der Datei steht kein Datum, das Angebot hat das heutige.');
  const satz = zahl(s.wage, 'der Stundensatz', 10000);
  a.stundensatz = satz || null;
  if (!satz) hinweise.push('In der Datei steht kein Stundensatz.');
  a.gewinnProzent = zahl(s.profitPct, 'der Gewinnzuschlag', 1000);
  a.rabattH = zahl(s.discountH, 'der Rabatt', 100000);

  a.aufgabenTypen = (Array.isArray(s.taskTypes) ? s.taskTypes : []).filter((t) => t && typeof t === 'object').map((t, i) => ({
    id: String(t.id ?? `typ-${i}`), name: text(t.name) || `Aufgabe ${i + 1}`, minuten: zahl(t.min, 'die Minutenzahl einer Aufgabe', 100000),
  }));
  const ids = new Set(a.aufgabenTypen.map((t) => t.id));

  let unbekannt = false;
  a.positionen = s.positions.filter((p) => p && typeof p === 'object').map((p, i) => neuePosition({
    bezeichnung: text(p.name) || `Position ${i + 1}`,
    aufgaben: (Array.isArray(p.rows) ? p.rows : []).filter((r) => r && typeof r === 'object').map((r) => {
      let typId = String(r.typeId);
      if (!ids.has(typId)) { typId = UNBEKANNT; unbekannt = true; }
      return { typId, menge: zahl(r.qty, 'eine Menge', 100000) };
    }),
  }));
  if (unbekannt) {
    // Der Kalkulator rechnet Zeilen ohne bekannten Typ mit 60 Minuten
    a.aufgabenTypen.push({ id: UNBEKANNT, name: 'Unbekannter Typ', minuten: 60 });
    hinweise.push('Einige Zeilen hatten keinen bekannten Aufgaben-Typ. Sie zählen wie im Kalkulator mit 60 Minuten.');
  }

  a.zulagen = (Array.isArray(s.zulagen) ? s.zulagen : []).filter((z) => z && typeof z === 'object').map((z) => ({
    id: globalThis.crypto.randomUUID(), name: text(z.name) || 'Zulage', art: z.isFixed ? 'fest' : 'prozent',
    wert: zahl(z.isFixed ? z.fixed : z.pct, 'eine Zulage', 100000), an: !!z.on,
  }));
  grundAusAufgaben(a);
  return { angebot: a, hinweise };
}
