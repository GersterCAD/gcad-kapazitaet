// Lexware Office über das private Daten-Repo (siehe daten-repo/lexware.mjs und lexware.yml).
// Die App legt nur Aufträge ab und liest Ergebnisse. Den API-Schlüssel kennt nur GitHub (Secret LEXWARE_API_KEY).
// Merkt sich offene Aufträge in meta 'lexware', damit nach einem Neuladen weiter auf die Antwort gewartet wird.

import * as speicher from './speicher.js';
import * as github from './github.js';
import * as zustand from './zustand.js';
import { rechnungStatus, lexwareRechnung, zahlungenUebernehmen } from './kern/rechnung.js';
import { lexwareAngebot } from './kern/angebot.js';

const ORDNER = 'lexware';
const PRUEFEN_MS = 15000;
const DAUERT_MS = 10 * 60000;

let stand = { status: null, kontakte: [], kontakteAbgeholt: null, zahlungen: [], zahlungenAbgeholt: null, auftraege: {}, zuletzt: null, fehler: null };
let uhr = null;
const hoerer = new Set();
const melden = () => hoerer.forEach((f) => f());
const merken = () => speicher.metaSpeichern('lexware', stand);

export const abonnieren = (f) => { hoerer.add(f); return () => hoerer.delete(f); };
export const info = () => stand;
/** Bereit: GitHub verbunden und die Action hat den Schlüssel erfolgreich geprüft */
export const verbunden = () => github.verbunden() && !zustand.istBeispiel() && !!stand.status?.verbunden;
export const kontakte = () => stand.kontakte;
/** Alle Rechnungen in Lexware mit Zahlungsstand (auch die, die nicht aus der App kommen) */
export const zahlungen = () => stand.zahlungen ?? [];
export const zahlungenAbgeholt = () => stand.zahlungenAbgeholt ?? null;
/** Läuft gerade ein Auftrag für diesen Bezug? */
export const laeuft = (typ, id) => Object.values(stand.auftraege).find((a) => a.bezug.typ === typ && a.bezug.id === id) ?? null;
/** Wartet ein Auftrag schon ungewöhnlich lange (Action läuft nicht)? */
export const dauertLange = (a) => a && Date.now() - Date.parse(a.gesendet) > DAUERT_MS;

/** Link in Lexware Office */
export const link = (typ, lexwareId) => `https://app.lexoffice.de/permalink/${typ === 'angebot' ? 'quotations' : 'invoices'}/edit/${lexwareId}`;

export async function starten() {
  stand = { ...stand, ...((await speicher.metaLaden('lexware')) ?? {}) };
  stand.auftraege ??= {};
}

/** Status und Kontakte aus dem Daten-Repo lesen, offene Aufträge prüfen */
export async function abgleichen() {
  if (!github.verbunden() || zustand.istBeispiel()) return;
  try {
    const s = await github.dateiHolen(`${ORDNER}/status.json`);
    stand.status = s ? JSON.parse(s) : null;
    const k = await github.dateiHolen(`${ORDNER}/kontakte.json`);
    if (k) { const j = JSON.parse(k); stand.kontakte = j.kontakte ?? []; stand.kontakteAbgeholt = j.abgeholt ?? null; }
    await zahlungenLesen();
    stand.fehler = null;
  } catch (f) { stand.fehler = f.message; }
  await ergebnissePruefen();
  await merken();
  melden();
}

/** zahlungen.json lesen und den Stand an die Rechnungen der App hängen */
async function zahlungenLesen() {
  const z = await github.dateiHolen(`${ORDNER}/zahlungen.json`);
  if (!z) return;
  const j = JSON.parse(z);
  stand.zahlungen = j.rechnungen ?? [];
  stand.zahlungenAbgeholt = j.abgeholt ?? null;
  const probe = structuredClone(zustand.aktuell());
  if (zahlungenUebernehmen(probe, stand.zahlungen)) await zustand.aendern((x) => { zahlungenUebernehmen(x, stand.zahlungen); });
}

/** Kontakt-ID zum Kundennamen: am Kunden hinterlegt, sonst gleicher Name in Lexware */
function kontaktZu(name, gesetzt) {
  if (gesetzt) return gesetzt;
  const n = (name ?? '').trim().toLowerCase();
  return stand.kontakte.find((k) => k.name.trim().toLowerCase() === n)?.id ?? null;
}

async function auftragAblegen(art, daten, bezug) {
  if (!github.verbunden()) throw new Error('Zuerst in Einstellungen → Daten mit GitHub verbinden.');
  const id = globalThis.crypto.randomUUID();
  const text = `${JSON.stringify({ id, art, daten }, null, 2)}\n`;
  const r = await github.dateiSchreiben(`${ORDNER}/auftraege/${id}.json`, text, null, `Lexware: ${art}`);
  if (r.veraltet) throw new Error('GitHub hat den Auftrag nicht angenommen. Bitte noch einmal.');
  stand.auftraege[id] = { art, bezug, gesendet: new Date().toISOString() };
  await merken();
  beobachten();
  melden();
  return id;
}

/** Rechnung als Entwurf an Lexware Office (Status 'sendet', bis das Ergebnis da ist) */
export async function rechnungSenden(rechnungId) {
  const d = zustand.aktuell();
  const r = d.rechnungen.find((x) => x.id === rechnungId);
  if (!r) throw new Error('Rechnung nicht gefunden.');
  const nutzlast = lexwareRechnung(d, r);
  nutzlast.kontaktId = kontaktZu(nutzlast.name, nutzlast.kontaktId);
  await auftragAblegen('rechnung', nutzlast, { typ: 'rechnung', id: rechnungId });
  await zustand.aendern((x) => { rechnungStatus(x, rechnungId, 'sendet'); });
}

/** Angebot als Entwurf an Lexware Office */
export async function angebotSenden(angebotId) {
  const d = zustand.aktuell();
  const a = d.angebote.find((x) => x.id === angebotId);
  if (!a) throw new Error('Angebot nicht gefunden.');
  const nutzlast = lexwareAngebot(d, a);
  if (!nutzlast.zeilen.length) throw new Error('Das Angebot hat keine Position mit Betrag.');
  nutzlast.kontaktId = kontaktZu(nutzlast.name, nutzlast.kontaktId);
  await auftragAblegen('angebot', nutzlast, { typ: 'angebot', id: angebotId });
  await zustand.aendern((x) => { const y = x.angebote.find((z) => z.id === angebotId); if (y) y.lexwareFehler = null; });
}

/** Verbindung prüfen und Kontakte neu holen (startet die Action) */
export const pruefen = () => auftragAblegen('kontakte', {}, { typ: 'kontakte', id: 'kontakte' });

/** Zahlungsstand jetzt holen (startet die Action) */
export const zahlungenAktualisieren = () => auftragAblegen('zahlungen', {}, { typ: 'zahlungen', id: 'zahlungen' });

/** Ergebnisse der offenen Aufträge abholen und in die Daten übernehmen */
export async function ergebnissePruefen() {
  const offen = Object.entries(stand.auftraege);
  if (!offen.length || !github.verbunden()) return;
  let geaendert = false;
  for (const [id, a] of offen) {
    let text;
    try { text = await github.dateiHolen(`${ORDNER}/ergebnisse/${id}.json`); } catch { return; }
    if (!text) continue;
    const e = JSON.parse(text);
    delete stand.auftraege[id];
    geaendert = true;
    stand.zuletzt = { art: a.art, bezug: a.bezug, ok: e.ok, zeit: e.zeit };
    const heute = zustand.heute();
    if (a.bezug.typ === 'rechnung') {
      await zustand.aendern((x) => {
        rechnungStatus(x, a.bezug.id, e.ok ? 'uebertragen' : 'fehler', { heute, lexwareId: e.lexwareId, fehler: e.fehler });
        const r = x.rechnungen.find((y) => y.id === a.bezug.id);
        if (r) r.fehlerDetails = e.ok ? null : e.details ?? null;
      });
    } else if (a.bezug.typ === 'angebot') {
      await zustand.aendern((x) => {
        const y = x.angebote.find((z) => z.id === a.bezug.id);
        if (!y) return;
        if (e.ok) { y.lexwareId = e.lexwareId; y.lexwareFehler = null; y.lexwareUebertragen = heute; } else { y.lexwareFehler = e.fehler; y.lexwareFehlerDetails = e.details ?? null; }
      });
    } else if (a.bezug.typ === 'kontakte') {
      // Status und Kontakte hat die Action neu geschrieben
      try {
        const s = await github.dateiHolen(`${ORDNER}/status.json`);
        if (s) stand.status = JSON.parse(s);
        const k = await github.dateiHolen(`${ORDNER}/kontakte.json`);
        if (k) { const j = JSON.parse(k); stand.kontakte = j.kontakte ?? []; stand.kontakteAbgeholt = j.abgeholt ?? null; }
        await zahlungenLesen();
      } catch { /* beim nächsten Abgleich */ }
    } else if (a.bezug.typ === 'zahlungen') {
      try { await zahlungenLesen(); } catch { /* beim nächsten Abgleich */ }
    }
  }
  if (geaendert) { await merken(); melden(); }
}

/** Solange Aufträge offen sind, alle 15 Sekunden nach dem Ergebnis schauen */
export function beobachten() {
  if (uhr || !Object.keys(stand.auftraege).length) return;
  uhr = setInterval(async () => {
    await ergebnissePruefen();
    if (!Object.keys(stand.auftraege).length) { clearInterval(uhr); uhr = null; }
  }, PRUEFEN_MS);
}

/** Einen hängenden Auftrag aufgeben (z. B. Action lief nicht). Die Rechnung geht zurück auf „Entwurf in der App“. */
export async function aufgeben(typ, id) {
  for (const [aid, a] of Object.entries(stand.auftraege)) if (a.bezug.typ === typ && a.bezug.id === id) delete stand.auftraege[aid];
  if (typ === 'rechnung') await zustand.aendern((x) => { rechnungStatus(x, id, 'entwurf'); });
  await merken();
  melden();
}
