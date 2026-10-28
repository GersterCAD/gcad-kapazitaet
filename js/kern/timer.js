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
