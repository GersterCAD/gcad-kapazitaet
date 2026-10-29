// Bedienung des Zeitstoppers: starten, stoppen, rückgängig, Sekundenanzeige.
// Die Logik steckt in js/kern/timer.js, der Timer selbst in den Daten (daten.timer).

import * as zustand from './zustand.js';
import { nachtragAnlegen, umbuchen } from './kern/nachtrag.js';
import { timerStarten, timerStoppen, timerVerwerfen, zuletztBenutzt, laufzeit, dauerText, dauerKurz, dauerLang } from './kern/timer.js';

let letzte = null; // { eintraege, timer } – für „Rückgängig“ nach dem Stoppen

export const laeuft = () => zustand.aktuell().timer ?? null;
export const letzteBuchung = () => letzte;
export const vergessen = () => { letzte = null; };

export async function starten(projektId, positionNr, notiz = '') {
  // letzte wird im Änderungsschritt gesetzt, damit die neu gezeichnete Seite die Meldung schon zeigt
  await zustand.aendern((d) => {
    const vorher = d.timer;
    const gestoppt = timerStarten(d, { projektId, positionNr, notiz });
    letzte = gestoppt.length ? { eintraege: gestoppt, timer: vorher } : null;
  });
}

export async function stoppen(ende) {
  let neu = [];
  await zustand.aendern((d) => {
    const vorher = d.timer;
    neu = timerStoppen(d, new Date(), { ende });
    letzte = { eintraege: neu, timer: vorher };
  });
  return neu;
}

/** Stoppen zurücknehmen: Buchungen löschen, Timer läuft weiter, als wäre nichts gewesen */
export async function rueckgaengig() {
  const l = letzte;
  if (!l) return;
  letzte = null;
  const ids = new Set(l.eintraege.map((z) => z.id));
  await zustand.aendern((d) => {
    d.zeiteintraege = d.zeiteintraege.filter((z) => !ids.has(z.id));
    if (l.timer && !d.timer) d.timer = l.timer;
  });
}

/** Vergessenen Timer verwerfen, ohne zu buchen */
export async function verwerfen() {
  letzte = null;
  await zustand.aendern((d) => { timerVerwerfen(d); });
}

/** Zuletzt benutzte aktive Projekte (Schnellstart) */
export const zuletzt = () => zuletztBenutzt(zustand.aktuell(), { heute: zustand.heute() });

/** Schnellstart aus Liste oder Übersicht: mit der zuletzt benutzten Position, sonst der ersten */
export async function schnellstart(projektId) {
  const d = zustand.aktuell();
  const p = d.projekte.find((x) => x.id === projektId);
  const z = zuletzt().find((x) => x.projektId === projektId);
  const nr = z?.positionNr && p?.positionen.some((x) => x.nr === z.positionNr) ? z.positionNr : p?.positionen[0]?.nr ?? null;
  await starten(projektId, nr);
}

// ---------- Nachtrag ----------
// wahl: { nr } für einen vorhandenen Nachtrag oder { text } für einen neuen

const nachtragNr = (d, projektId, wahl) => wahl.nr ?? nachtragAnlegen(d, projektId, { bezeichnung: wahl.text ?? '' });

/** Laufenden Timer auf einen Nachtrag setzen: ab jetzt (bucht die Zeit bis jetzt) oder rückwirkend seit Start */
export async function nachtragLaufend(wahl, { seitStart = false } = {}) {
  let nr = null;
  await zustand.aendern((d) => {
    const t = d.timer;
    if (!t) return;
    nr = nachtragNr(d, t.projektId, wahl);
    if (seitStart) { t.positionNr = nr; letzte = null; return; }
    const gestoppt = timerStarten(d, { projektId: t.projektId, positionNr: nr, notiz: t.notiz });
    letzte = gestoppt.length ? { eintraege: gestoppt, timer: t } : null;
  });
  return nr;
}

/** Eben gestoppte Zeit nachträglich auf einen Nachtrag umbuchen */
export async function nachtragUmbuchen(projektId, wahl) {
  const l = letzte;
  if (!l?.eintraege.length) return null;
  let nr = null;
  await zustand.aendern((d) => {
    nr = nachtragNr(d, projektId, wahl);
    umbuchen(d, l.eintraege.map((z) => z.id), nr);
    l.eintraege.forEach((z) => { z.positionNr = nr; });
  });
  return nr;
}

/** Neuen Timer direkt auf einem Nachtrag starten */
export async function nachtragStarten(projektId, wahl) {
  let nr = null;
  await zustand.aendern((d) => {
    const vorher = d.timer;
    nr = nachtragNr(d, projektId, wahl);
    const gestoppt = timerStarten(d, { projektId, positionNr: nr });
    letzte = gestoppt.length ? { eintraege: gestoppt, timer: vorher } : null;
  });
  return nr;
}

// ---------- Kurzbefehle (Siri, Kurzbefehle-App, Lesezeichen) ----------
// #/timer/start/<Projektnummer oder Name>, #/timer/stopp, #/timer/weiter

const schluessel = (s) => String(s ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');

/** Projekt zu einem Kurzbefehl: Nummer, ID, Name oder Anfang des Namens (nur Aufträge) */
export function projektZu(text) {
  const k = schluessel(decodeURIComponent(text ?? ''));
  if (!k) return null;
  const aktiv = zustand.aktuell().projekte.filter((p) => ['auftrag', 'laeuft'].includes(p.status));
  return aktiv.find((p) => p.id === text || schluessel(p.nr) === k)
    ?? aktiv.find((p) => schluessel(p.name) === k)
    ?? aktiv.find((p) => schluessel(p.name).startsWith(k) || schluessel(p.name.split(' · ')[0]) === k)
    ?? (k.length >= 4 ? aktiv.find((p) => schluessel(p.name).includes(k) || schluessel(p.kunde).includes(k)) : null) ?? null;
}

/** Adresse für den Kurzbefehl eines Projekts */
export const kurzbefehlAdresse = (basis, p) => `${basis}#/timer/start/${encodeURIComponent(p.nr || p.name.split(' · ')[0])}`;

/** Kurzbefehl ausführen. Gibt die Adresse zurück, die danach gezeigt wird (oder null, wenn es kein Kurzbefehl war). */
export async function befehl(pfad) {
  const m = /^timer\/(start|stopp|weiter)(?:\/(.+))?$/.exec(pfad);
  if (!m) return null;
  if (m[1] === 'stopp') {
    const t = laeuft();
    if (!t) return '#/uebersicht';
    await stoppen();
    return `#/projekte/${t.projektId}`;
  }
  if (m[1] === 'weiter') {
    const z = zuletzt()[0];
    if (!z) return '#/projekte';
    if (laeuft()?.projektId !== z.projektId) await schnellstart(z.projektId);
    return `#/projekte/${z.projektId}`;
  }
  const p = projektZu(m[2]);
  if (!p) return '#/projekte';
  if (laeuft()?.projektId !== p.id) await schnellstart(p.id);
  return `#/projekte/${p.id}`;
}

export async function notizSetzen(notiz) {
  await zustand.aendern((d) => { if (d.timer) d.timer.notiz = notiz; });
}

/** Alle Elemente mit data-timer-lauf jede Sekunde aktualisieren, ohne die Seite neu zu zeichnen */
export function ticken() {
  setInterval(() => {
    const t = laeuft();
    if (!t) return;
    const ms = laufzeit(t);
    const format = { kurz: dauerKurz, lang: dauerLang };
    document.querySelectorAll('[data-timer-lauf]').forEach((e) => { e.textContent = (format[e.dataset.timerLauf] ?? dauerText)(ms); });
  }, 1000);
}
