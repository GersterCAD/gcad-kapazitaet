// Datenstruktur der Kapazitätsplanung (schemaVersion 1). Ohne Oberfläche, ohne DOM.
// Eine JSON-Datei, Datum als YYYY-MM-DD, Stunden als Zahl, IDs als UUID.
// Berechnet, nicht gespeichert: Soll, Ist, Feiertage, Wochenkapazität, Termine (kommen aus dem Kalender-JSON).

export const SCHEMA_VERSION = 1;

export const STATUS = ['anfrage', 'angebot', 'auftrag', 'laeuft', 'pausiert', 'abgeschlossen', 'abgesagt'];
export const STATUS_NAME = {
  anfrage: 'Anfrage', angebot: 'Angebot', auftrag: 'Auftrag', laeuft: 'läuft',
  pausiert: 'pausiert', abgeschlossen: 'abgeschlossen', abgesagt: 'abgesagt',
};
/** Diese Status zählen zur Auslastung */
export const STATUS_FEST = ['auftrag', 'laeuft'];

export const MEILENSTEIN_TYP = ['meilenstein', 'deadline'];
export const EINPLANUNG_ART = ['regulaer', 'samstag', 'langerTag'];
export const ABWESENHEIT_ART = ['urlaub', 'krank'];
export const BLOCKZEIT_ART = ['buero', 'entwicklung'];
export const KALENDER_REGEL = ['alle', 'ganztaegig', 'ignorieren'];

export function standardEinstellungen() {
  return {
    regeltagH: 8,
    maxTagH: 12,
    warnWochen: 3,
    standardPuffer: 10,
    samstagErlaubt: 'vorschlag',
    samstagH: 8,
    bundesland: 'BW',
    timerRundung: 15,
    abrechnungZusammenfassen: 'tag',
    kalender: [
      { name: 'Gerster CAD', regel: 'alle' },
      { name: 'Privat', regel: 'ganztaegig' },
      { name: 'Familie', regel: 'ignorieren' },
    ],
  };
}

export function leereDaten() {
  return {
    schemaVersion: SCHEMA_VERSION,
    einstellungen: standardEinstellungen(),
    projekte: [],
    meilensteine: [],
    zeiteintraege: [],
    einplanungen: [],
    blockzeiten: [],
    abwesenheiten: [],
    terminRegeln: [],
    vorschlaegeUebernommen: [],
    timer: null,
  };
}

/** Neue UUID (im Browser und in Node vorhanden) */
export function neueId() {
  return globalThis.crypto.randomUUID();
}

// ---------- Berechnete Werte ----------

/** Soll = Schätzung × (1 + Puffer/100), auf 0,1 h gerundet */
export function soll(projekt) {
  return Math.round((projekt.schaetzungH || 0) * (1 + (projekt.puffer ?? 0) / 100) * 10) / 10;
}

/** Ist = Summe der Zeiteinträge des Projekts (optional nur einer Position) */
export function ist(daten, projektId, positionNr) {
  return daten.zeiteintraege
    .filter((z) => z.projektId === projektId && (positionNr == null || z.positionNr === positionNr))
    .reduce((s, z) => s + z.stunden, 0);
}

/** Restsoll, nie negativ */
export function rest(daten, projekt) {
  return Math.max(0, soll(projekt) - ist(daten, projekt.id));
}

// ---------- Prüfen beim Laden und Importieren ----------

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const WOCHE = /^\d{4}-W\d{2}$/;
const ZEIT = /^\d{2}:\d{2}$/;

/**
 * Prüft und vervollständigt Daten (z. B. aus einer Importdatei).
 * Gibt { ok, fehler: [Text], daten } zurück. daten ist eine bereinigte Kopie, das Original bleibt unverändert.
 */
export function pruefeDaten(roh) {
  const fehler = [];
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    return { ok: false, fehler: ['Die Datei enthält keine Kapazitätsdaten.'], daten: null };
  }
  const v = roh.schemaVersion;
  if (typeof v !== 'number') return { ok: false, fehler: ['Die Versionsnummer (schemaVersion) fehlt.'], daten: null };
  if (v > SCHEMA_VERSION) {
    return { ok: false, fehler: [`Die Datei ist aus einer neueren Version (${v}). Bitte die App aktualisieren.`], daten: null };
  }

  const d = migriere(structuredClone(roh));
  const basis = leereDaten();
  for (const k of Object.keys(basis)) {
    if (k === 'schemaVersion' || k === 'einstellungen' || k === 'timer') continue;
    if (d[k] == null) d[k] = [];
    if (!Array.isArray(d[k])) { fehler.push(`„${k}“ ist keine Liste.`); d[k] = []; }
  }
  d.einstellungen = { ...basis.einstellungen, ...(d.einstellungen || {}) };
  d.timer ??= null;

  const e = d.einstellungen;
  zahl(e.regeltagH, 'Regeltag', 0, 24, fehler);
  zahl(e.maxTagH, 'Längster Tag', 0, 24, fehler);
  zahl(e.warnWochen, 'Warngrenze', 1, 52, fehler);
  zahl(e.standardPuffer, 'Standard-Puffer', 0, 20, fehler);
  if (e.maxTagH < e.regeltagH) fehler.push('Der längste Tag ist kürzer als der Regeltag.');

  const projektIds = new Set();
  d.projekte.forEach((p, i) => {
    const wo = `Projekt ${i + 1}${p?.name ? ` (${p.name})` : ''}`;
    if (!p?.id) fehler.push(`${wo}: ID fehlt.`);
    else if (projektIds.has(p.id)) fehler.push(`${wo}: ID doppelt.`);
    projektIds.add(p?.id);
    if (!p?.name) fehler.push(`${wo}: Name fehlt.`);
    if (!STATUS.includes(p?.status)) fehler.push(`${wo}: Status „${p?.status}“ unbekannt.`);
    zahl(p?.schaetzungH, `${wo}: Schätzung`, 0, 100000, fehler);
    if (p?.puffer == null) p.puffer = e.standardPuffer;
    zahl(p?.puffer, `${wo}: Puffer`, 0, 20, fehler);
    datum(p?.start, `${wo}: Start`, fehler, true);
    datum(p?.deadline, `${wo}: Deadline`, fehler, true);
    if (p && ![1, 2, 3].includes(p.prioritaet)) p.prioritaet = 2;
    if (p && !Array.isArray(p.positionen)) p.positionen = [];
  });

  const bezug = (x, wo) => { if (!projektIds.has(x?.projektId)) fehler.push(`${wo}: Projekt nicht gefunden.`); };

  d.meilensteine.forEach((m, i) => {
    const wo = `Meilenstein ${i + 1}`;
    bezug(m, wo);
    datum(m?.datum, `${wo}: Datum`, fehler);
    if (!MEILENSTEIN_TYP.includes(m?.typ)) fehler.push(`${wo}: Typ „${m?.typ}“ unbekannt.`);
    if (m && !Array.isArray(m.erinnerungTage)) m.erinnerungTage = [];
    if (m) m.erledigt = !!m.erledigt;
  });
  d.zeiteintraege.forEach((z, i) => {
    const wo = `Zeiteintrag ${i + 1}`;
    bezug(z, wo);
    datum(z?.datum, `${wo}: Datum`, fehler);
    zahl(z?.stunden, `${wo}: Stunden`, 0, 24, fehler);
    if ((z?.von && !ZEIT.test(z.von)) || (z?.bis && !ZEIT.test(z.bis))) fehler.push(`${wo}: Uhrzeit ungültig (Form 08:00).`);
  });
  // Laufender Timer: ohne gültiges Projekt oder Startzeit wird er verworfen (kein Fehler)
  if (d.timer && (!projektIds.has(d.timer.projektId) || Number.isNaN(Date.parse(d.timer.start)))) d.timer = null;
  d.einplanungen.forEach((x, i) => {
    const wo = `Einplanung ${i + 1}`;
    bezug(x, wo);
    if (!WOCHE.test(x?.woche ?? '')) fehler.push(`${wo}: Woche „${x?.woche}“ ungültig (Form 2026-W46).`);
    zahl(x?.stunden, `${wo}: Stunden`, 0, 168, fehler);
    if (!EINPLANUNG_ART.includes(x?.art)) fehler.push(`${wo}: Art „${x?.art}“ unbekannt.`);
  });
  d.blockzeiten.forEach((b, i) => {
    const wo = `Blockzeit ${i + 1}${b?.titel ? ` (${b.titel})` : ''}`;
    zahl(b?.stundenProWoche, `${wo}: Stunden`, 0, 168, fehler);
    const tage = [].concat(b?.wochentag ?? []);
    if (!tage.length || tage.some((t) => !Number.isInteger(t) || t < 1 || t > 6)) fehler.push(`${wo}: Wochentag ungültig (1 = Mo … 6 = Sa).`);
    if ((b?.von && !ZEIT.test(b.von)) || (b?.bis && !ZEIT.test(b.bis))) fehler.push(`${wo}: Uhrzeit ungültig (Form 08:00).`);
  });
  d.abwesenheiten.forEach((a, i) => {
    const wo = `Abwesenheit ${i + 1}`;
    datum(a?.von, `${wo}: von`, fehler);
    datum(a?.bis, `${wo}: bis`, fehler);
    if (a?.von && a?.bis && a.bis < a.von) fehler.push(`${wo}: „bis“ liegt vor „von“.`);
    if (!ABWESENHEIT_ART.includes(a?.art)) fehler.push(`${wo}: Art „${a?.art}“ unbekannt.`);
  });

  return { ok: fehler.length === 0, fehler, daten: d };
}

/** Ältere Versionen auf die aktuelle heben. Bei schemaVersion 1 noch nichts zu tun. */
function migriere(d) {
  // if (d.schemaVersion === 1) { …; d.schemaVersion = 2; }
  d.schemaVersion = SCHEMA_VERSION;
  return d;
}

function zahl(x, name, min, max, fehler) {
  if (typeof x !== 'number' || !Number.isFinite(x)) fehler.push(`${name}: keine Zahl.`);
  else if (x < min || x > max) fehler.push(`${name}: ${x} liegt nicht zwischen ${min} und ${max}.`);
}

function datum(x, name, fehler, leerErlaubt = false) {
  if (x == null || x === '') { if (!leerErlaubt) fehler.push(`${name}: fehlt.`); return; }
  if (!DATUM.test(x) || Number.isNaN(Date.parse(x))) fehler.push(`${name}: „${x}“ ist kein Datum (Form 2026-11-20).`);
}

/** Kurzbeschreibung für Hinweise: „4 Projekte · 23 Zeiteinträge“ */
export function zusammenfassung(d) {
  const n = (k, ein, mehr) => `${d[k].length} ${d[k].length === 1 ? ein : mehr}`;
  return [n('projekte', 'Projekt', 'Projekte'), n('meilensteine', 'Meilenstein', 'Meilensteine'), n('zeiteintraege', 'Zeiteintrag', 'Zeiteinträge')].join(' · ');
}
