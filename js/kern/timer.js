// Zeitstopper: ein laufender Timer je Datensatz (daten.timer), beim Stoppen werden Zeiteinträge daraus.
// Ohne Oberfläche, ohne DOM. Der Timer liegt in den Daten, damit er auf allen Geräten sichtbar ist (Abgleich).
// Zeiteinträge aus dem Timer haben zusätzlich von/bis (HH:MM) – für die spätere Abrechnung in Lexware Office.

import { alsText, ausText, plusTage } from './datum.js';
import { neueId } from './daten.js';

export const RUNDUNG_MIN = [6, 15, 30];   // Auswahl in den Einstellungen
export const STANDARD_RUNDUNG = 15;
const MIN_MINUTEN = 1;                     // kürzer = versehentlich gestartet, nichts buchen

const zwei = (n) => String(n).padStart(2, '0');
const uhr = (d) => `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;

/** Timer starten (ändert daten). Läuft schon einer, wird er vorher gestoppt; die Buchungen kommen zurück. */
export function timerStarten(daten, { projektId, positionNr = null, notiz = '' }, jetzt = new Date()) {
  const gestoppt = daten.timer ? timerStoppen(daten, jetzt) : [];
  daten.timer = { projektId, positionNr, notiz, start: jetzt.toISOString() };
  return gestoppt;
}

/** Laufzeit in Millisekunden */
export const laufzeit = (timer, jetzt = new Date()) => Math.max(0, jetzt - new Date(timer.start));

/** „1:23:45“ */
export function dauerText(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${zwei(Math.floor((s % 3600) / 60))}:${zwei(s % 60)}`;
}

/** Stunden runden: auf die nächste Rundungsstufe, mindestens eine Stufe */
export function runden(minuten, stufe = STANDARD_RUNDUNG) {
  if (minuten < MIN_MINUTEN) return 0;
  const n = Math.max(1, Math.round(minuten / stufe));
  return Math.round((n * stufe / 60) * 100) / 100;
}

/**
 * Timer stoppen (ändert daten): Zeiteinträge anlegen, über Mitternacht je Tag getrennt.
 * ende: anderes Ende (z. B. vergessener Timer). Gibt die neuen Zeiteinträge zurück (leer bei unter einer Minute).
 */
export function timerStoppen(daten, jetzt = new Date(), { ende } = {}) {
  const t = daten.timer;
  if (!t) return [];
  daten.timer = null;
  const start = new Date(t.start);
  const bis = ende && ende > start ? ende : jetzt;
  if (bis <= start) return [];
  const stufe = daten.einstellungen.timerRundung ?? STANDARD_RUNDUNG;

  const neu = [];
  for (let tag = ausText(alsText(start)); tag < bis; tag = plusTage(tag, 1)) {
    const von = new Date(Math.max(start, tag));
    const naechster = plusTage(tag, 1);
    const b = new Date(Math.min(bis, naechster));
    const stunden = runden((b - von) / 60000, stufe);
    if (stunden <= 0) continue;
    neu.push({
      id: neueId(), datum: alsText(tag), projektId: t.projektId, positionNr: t.positionNr ?? null,
      stunden: Math.min(24, stunden), notiz: t.notiz || '', von: uhr(von), bis: b >= naechster ? '24:00' : uhr(b), quelle: 'timer',
    });
  }
  daten.zeiteintraege.push(...neu);
  return neu;
}

/** Kurz für die Kopfzeile: „01:24“ (Stunden:Minuten), lang auf der Projektseite: „01:24:10“ */
export function dauerKurz(ms) {
  const m = Math.floor(ms / 60000);
  return `${zwei(Math.floor(m / 60))}:${zwei(m % 60)}`;
}
export const dauerLang = (ms) => `${zwei(Math.floor(ms / 3600000))}:${dauerText(ms).slice(-5)}`;

/** Ab wann ein Timer als vergessen gilt */
export const VERGESSEN_AB_MS = 10 * 3600 * 1000;
export const vergessen = (timer, jetzt = new Date()) => laufzeit(timer, jetzt) > VERGESSEN_AB_MS;

/** Timer verwerfen, ohne zu buchen (ändert daten) */
export function timerVerwerfen(daten) {
  const t = daten.timer;
  daten.timer = null;
  return t;
}

/**
 * Vorschlag für das Ende eines vergessenen Timers: Ende des letzten Termins am Starttag, sonst Start + Regeltag.
 * Aufgerundet auf die volle Stunde, nie nach jetzt. termine: [{ start, ende, ganztaegig }] (ISO).
 * Ergebnis: { ende: Date, grund: 'termin' | 'regeltag', terminEnde: Date | null }
 */
export function endeVorschlag(daten, termine = [], jetzt = new Date()) {
  const start = new Date(daten.timer.start);
  const tagEnde = plusTage(ausText(alsText(start)), 1);
  const letzter = termine
    .filter((t) => !t.ganztaegig)
    .map((t) => new Date(t.ende))
    .filter((e) => e > start && e <= tagEnde)
    .sort((a, b) => b - a)[0] ?? null;
  const roh = letzter ?? new Date(start.getTime() + (daten.einstellungen.regeltagH ?? 8) * 3600000);
  const ende = new Date(roh);
  if (ende.getMinutes() || ende.getSeconds()) ende.setHours(ende.getHours() + 1, 0, 0, 0);
  const grenze = new Date(Math.min(jetzt, tagEnde));
  return { ende: ende > grenze ? grenze : ende, grund: letzter ? 'termin' : 'regeltag', terminEnde: letzter };
}

/** Gebuchte Stunden für ein Ende (gerundet wie beim Stoppen), ohne daten zu ändern */
export function stundenBis(daten, ende) {
  const probe = { timer: { ...daten.timer }, einstellungen: daten.einstellungen, zeiteintraege: [] };
  return timerStoppen(probe, ende, { ende }).reduce((a, z) => a + z.stunden, 0);
}

/**
 * Zuletzt benutzte Projekte für den Schnellstart, neueste zuerst: [{ projektId, positionNr, datum, stundenHeute }].
 * Nur Projekte mit Status aus statusErlaubt. heute: 'YYYY-MM-DD'.
 */
export function zuletztBenutzt(daten, { heute, statusErlaubt = ['auftrag', 'laeuft'] } = {}) {
  const erlaubt = new Set(daten.projekte.filter((p) => statusErlaubt.includes(p.status)).map((p) => p.id));
  const sortiert = daten.zeiteintraege
    .filter((z) => erlaubt.has(z.projektId))
    .sort((a, b) => b.datum.localeCompare(a.datum) || (b.bis ?? '').localeCompare(a.bis ?? ''));
  const ergebnis = new Map();
  for (const z of sortiert) {
    if (!ergebnis.has(z.projektId)) ergebnis.set(z.projektId, { projektId: z.projektId, positionNr: z.positionNr ?? null, datum: z.datum, stundenHeute: 0 });
  }
  for (const z of sortiert) if (z.datum === heute && ergebnis.has(z.projektId)) ergebnis.get(z.projektId).stundenHeute += z.stunden;
  return [...ergebnis.values()];
}
