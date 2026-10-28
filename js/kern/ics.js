// Kalenderdateien (ICS, RFC 5545) lesen und schreiben. Ohne Oberfläche, ohne DOM.
// Lesen: läuft in der GitHub Action (Node) und in den Tests. Wiederholungen (RRULE) werden im Zeitfenster aufgelöst.
// Schreiben: Meilensteine und Deadlines als ganztägige Termine mit Erinnerungen (VALARM), gleiche UID je Meilenstein.

import { alsText, ausText, plusTage } from './datum.js';

const STANDARD_ZONE = 'Europe/Berlin';
const zwei = (n) => String(n).padStart(2, '0');

// ---------- Lesen ----------

/** Zeilen entfalten (Fortsetzungszeilen beginnen mit Leerzeichen/Tab) und in { name, params, wert } zerlegen */
function zeilen(text) {
  const roh = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const liste = [];
  for (const z of roh) {
    if (!z.trim()) continue;
    // Doppelpunkt außerhalb von Anführungszeichen trennt Name;Parameter von Wert
    let i = 0, inQ = false;
    for (; i < z.length; i++) { if (z[i] === '"') inQ = !inQ; else if (z[i] === ':' && !inQ) break; }
    const kopf = z.slice(0, i), wert = z.slice(i + 1);
    const [name, ...p] = kopf.split(';');
    const params = {};
    for (const x of p) { const [k, v = ''] = x.split('='); params[k.toUpperCase()] = v.replace(/^"|"$/g, ''); }
    liste.push({ name: name.toUpperCase(), params, wert });
  }
  return liste;
}

const entschluesseln = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** Ereignisse aus einer ICS-Datei: [{ uid, titel, dtstart, dtend, dauer, rrule, exdate[], recurrenceId }] */
export function ereignisseLesen(text) {
  const liste = [];
  let ev = null, tiefe = 0;
  for (const z of zeilen(text)) {
    if (z.name === 'BEGIN' && z.wert === 'VEVENT') { ev = { exdate: [] }; tiefe = 0; continue; }
    if (!ev) continue;
    if (z.name === 'BEGIN') { tiefe++; continue; }          // z. B. VALARM im Termin überspringen
    if (z.name === 'END' && z.wert !== 'VEVENT') { tiefe--; continue; }
    if (z.name === 'END' && z.wert === 'VEVENT') { liste.push(ev); ev = null; continue; }
    if (tiefe > 0) continue;
    switch (z.name) {
      case 'UID': ev.uid = z.wert; break;
      case 'SUMMARY': ev.titel = entschluesseln(z.wert); break;
      case 'DTSTART': ev.dtstart = zeitpunkt(z); break;
      case 'DTEND': ev.dtend = zeitpunkt(z); break;
      case 'DURATION': ev.dauer = dauerMs(z.wert); break;
      case 'RRULE': ev.rrule = regelLesen(z.wert); break;
      case 'EXDATE': for (const w of z.wert.split(',')) ev.exdate.push(zeitpunkt({ ...z, wert: w })); break;
      case 'RECURRENCE-ID': ev.recurrenceId = zeitpunkt(z); break;
      case 'STATUS': ev.status = z.wert.toUpperCase(); break;
      case 'TRANSP': ev.transp = z.wert.toUpperCase(); break;
      default: break;
    }
  }
  return liste;
}

/**
 * Zeitpunkt aus DTSTART/DTEND/EXDATE: { datum: true, d: 'YYYY-MM-DD' } für ganztägig,
 * sonst { wand: {j,m,t,h,mi,s}, zone: 'Europe/Berlin' | 'UTC' } (Wanduhrzeit in der Zone).
 */
function zeitpunkt(z) {
  const w = z.wert.trim();
  if (z.params.VALUE === 'DATE' || /^\d{8}$/.test(w)) return { datum: true, d: `${w.slice(0, 4)}-${w.slice(4, 6)}-${w.slice(6, 8)}` };
  const m = w.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const wand = { j: +m[1], m: +m[2], t: +m[3], h: +m[4], mi: +m[5], s: +(m[6] || 0) };
  return { wand, zone: m[7] ? 'UTC' : gueltigeZone(z.params.TZID) };
}

function gueltigeZone(tzid) {
  if (!tzid) return STANDARD_ZONE; // „floating“: wie Ortszeit in Deutschland behandeln
  try { new Intl.DateTimeFormat('de', { timeZone: tzid }); return tzid; } catch { return STANDARD_ZONE; }
}

function dauerMs(w) {
  const m = w.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const ms = ((+m[2] || 0) * 7 * 86400 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function regelLesen(w) {
  const r = {};
  for (const teil of w.split(';')) { const [k, v] = teil.split('='); r[k.toUpperCase()] = v; }
  return {
    freq: r.FREQ, intervall: +(r.INTERVAL || 1), anzahl: r.COUNT ? +r.COUNT : null,
    bis: r.UNTIL ? zeitpunkt({ params: {}, wert: r.UNTIL }) : null,
    byday: r.BYDAY ? r.BYDAY.split(',').map((x) => { const m = x.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/); return { n: m[1] ? +m[1] : null, wt: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(m[2]) }; }) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null,
  };
}

/** Wanduhrzeit in einer Zeitzone → Date (UTC-Zeitpunkt). Über Intl, damit Sommer-/Winterzeit stimmt. */
export function zoneNachDate(w, zone) {
  const utc = Date.UTC(w.j, w.m - 1, w.t, w.h, w.mi, w.s || 0);
  if (zone === 'UTC') return new Date(utc);
  const versatz = (ms) => {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const t = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    return Date.UTC(+t.year, +t.month - 1, +t.day, +t.hour, +t.minute, +t.second) - ms;
  };
  let ms = utc - versatz(utc);
  ms = utc - versatz(ms); // zweiter Schritt für die Tage der Zeitumstellung
  return new Date(ms);
}

// Kalenderrechnung auf Wanduhrzeit (als UTC-Date, nur als Zähler)
const wandDate = (w) => new Date(Date.UTC(w.j, w.m - 1, w.t, w.h || 0, w.mi || 0, w.s || 0));
const ausWandDate = (d) => ({ j: d.getUTCFullYear(), m: d.getUTCMonth() + 1, t: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() });
const datumWand = (s) => { const [j, m, t] = s.split('-').map(Number); return { j, m, t, h: 0, mi: 0, s: 0 }; };
const tageImMonat = (j, m) => new Date(Date.UTC(j, m, 0)).getUTCDate();

/** Startzeitpunkte (als Wanduhr-Dates) einer Regel bis zur Grenze */
function wiederholungen(start, r, grenzeWand, zone, max = 2000) {
  const liste = [];
  const bisWand = r.bis ? (r.bis.datum ? wandDate({ ...datumWand(r.bis.d), h: 23, mi: 59, s: 59 }) : r.bis.zone === 'UTC' ? null : wandDate(r.bis.wand)) : null;
  const bisUtc = r.bis && !r.bis.datum && r.bis.zone === 'UTC' ? zoneNachDate(r.bis.wand, 'UTC') : null;
  const s = ausWandDate(start);
  const passt = (d) => d >= start && (!bisWand || d <= bisWand);
  let zahl = 0;
  const nimm = (d) => {
    if (!passt(d)) return true;
    if (bisUtc && zoneNachDate(ausWandDate(d), zone) > bisUtc) return false; // UNTIL in UTC: echten Zeitpunkt vergleichen
    liste.push(d); zahl++;
    return !(r.anzahl && zahl >= r.anzahl);
  };
  const ende = (d) => d > grenzeWand || (bisWand && d > bisWand) || liste.length >= max;

  for (let i = 0; i < 5000; i++) {
    let kandidaten = [];
    if (r.freq === 'DAILY') {
      kandidaten = [new Date(start.getTime() + i * r.intervall * 86400000)];
    } else if (r.freq === 'WEEKLY') {
      const wocheStart = new Date(start.getTime() - ((start.getUTCDay() + 6) % 7) * 86400000 + i * r.intervall * 7 * 86400000);
      const tage = r.byday ? r.byday.map((b) => b.wt) : [start.getUTCDay()];
      kandidaten = tage.map((wt) => new Date(wocheStart.getTime() + ((wt + 6) % 7) * 86400000)).sort((a, b) => a - b);
    } else if (r.freq === 'MONTHLY') {
      const mon = s.m - 1 + i * r.intervall;
      const j = s.j + Math.floor(mon / 12), m = (mon % 12) + 1;
      kandidaten = monatsTage(j, m, r, s).map((t) => wandDate({ ...s, j, m, t }));
    } else if (r.freq === 'YEARLY') {
      const j = s.j + i * r.intervall;
      const monate = r.bymonth ?? [s.m];
      for (const m of monate) {
        const tage = r.byday || r.bymonthday ? monatsTage(j, m, r, s) : (s.t <= tageImMonat(j, m) ? [s.t] : []);
        kandidaten.push(...tage.map((t) => wandDate({ ...s, j, m, t })));
      }
    } else {
      return [start];
    }
    for (const d of kandidaten) {
      if (ende(d)) return liste;
      if (!nimm(d)) return liste;
    }
    if (!kandidaten.length && i > 2000) break;
  }
  return liste;
}

function monatsTage(j, m, r, s) {
  const n = tageImMonat(j, m);
  if (r.bymonthday) return r.bymonthday.map((t) => (t < 0 ? n + t + 1 : t)).filter((t) => t >= 1 && t <= n).sort((a, b) => a - b);
  if (r.byday) {
    const tage = [];
    for (const b of r.byday) {
      const alle = [];
      for (let t = 1; t <= n; t++) if (new Date(Date.UTC(j, m - 1, t)).getUTCDay() === b.wt) alle.push(t);
      if (b.n == null) tage.push(...alle);
      else { const t = b.n > 0 ? alle[b.n - 1] : alle[alle.length + b.n]; if (t) tage.push(t); }
    }
    return [...new Set(tage)].sort((a, b) => a - b);
  }
  return s.t <= n ? [s.t] : [];
}

/**
 * Termine eines Kalenders im Zeitfenster [von, bis] (Text YYYY-MM-DD).
 * Ergebnis: [{ uid, kalender, titel, ganztaegig, start, ende }]. Ganztägig: Datum, ende exklusiv. Sonst ISO in UTC.
 */
export function termineAusIcs(text, kalender, { von, bis, titel = true } = {}) {
  const ereignisse = ereignisseLesen(text).filter((e) => e.dtstart && e.status !== 'CANCELLED' && e.transp !== 'TRANSPARENT');
  const ueberschrieben = new Map(); // uid → Set der Schlüssel (Einzeltermine einer Serie, die geändert wurden)
  for (const e of ereignisse) if (e.recurrenceId) {
    if (!ueberschrieben.has(e.uid)) ueberschrieben.set(e.uid, new Set());
    ueberschrieben.get(e.uid).add(schluessel(e.recurrenceId));
  }

  const grenzeWand = wandDate({ ...datumWand(bis), h: 23, mi: 59, s: 59 });
  const termine = [];
  for (const e of ereignisse) {
    const ganz = !!e.dtstart.datum;
    const startWand = ganz ? wandDate(datumWand(e.dtstart.d)) : wandDate(e.dtstart.wand);
    let dauer;
    if (e.dtend) dauer = (ganz ? wandDate(datumWand(e.dtend.d)) : wandDate(e.dtend.wand)) - startWand;
    else if (e.dauer != null) dauer = e.dauer;
    else dauer = ganz ? 86400000 : 0;
    // Endzeit in anderer Zone als der Start: Dauer über echte Zeitpunkte
    if (!ganz && e.dtend && e.dtend.zone !== e.dtstart.zone) dauer = zoneNachDate(e.dtend.wand, e.dtend.zone) - zoneNachDate(e.dtstart.wand, e.dtstart.zone);

    const starts = e.rrule && !e.recurrenceId ? wiederholungen(startWand, e.rrule, grenzeWand, ganz ? STANDARD_ZONE : e.dtstart.zone) : [startWand];
    const aus = new Set(e.exdate.filter(Boolean).map(schluessel));
    const ueber = ueberschrieben.get(e.uid);
    for (const sw of starts) {
      const w = ausWandDate(sw);
      const key = ganz ? `${w.j}-${zwei(w.m)}-${zwei(w.t)}` : `${w.j}${zwei(w.m)}${zwei(w.t)}T${zwei(w.h)}${zwei(w.mi)}`;
      if (!e.recurrenceId && (aus.has(key) || aus.has(key.slice(0, 8)) || ueber?.has(key))) continue;
      let t;
      if (ganz) {
        const s = `${w.j}-${zwei(w.m)}-${zwei(w.t)}`;
        const tage = Math.max(1, Math.round(dauer / 86400000));
        t = { start: s, ende: alsText(plusTage(ausText(s), tage)) };
        if (t.ende <= von || s > bis) continue;
      } else {
        const beginn = zoneNachDate(w, e.dtstart.zone);
        const ende = new Date(beginn.getTime() + dauer);
        if (ende.toISOString().slice(0, 10) < von || beginn.toISOString().slice(0, 10) > bis) continue;
        t = { start: beginn.toISOString(), ende: ende.toISOString() };
      }
      const einzel = e.rrule || e.recurrenceId;
      termine.push({
        uid: einzel ? `${e.uid}|${key}` : e.uid,
        kalender, titel: titel ? (e.titel || '(ohne Titel)') : 'belegt', ganztaegig: ganz, ...t,
      });
    }
  }
  return termine.sort((a, b) => a.start.localeCompare(b.start));
}

/** Schlüssel eines Einzeltermins: Datum (ganztägig) oder Wanduhrzeit in der Zone des Serienstarts */
function schluessel(z) {
  if (z.datum) return z.d;
  const w = z.wand;
  if (z.zone === 'UTC') {
    // in Wanduhrzeit der Standardzone umrechnen, damit es zu den Serien passt
    const d = zoneNachDate(w, 'UTC');
    const f = new Intl.DateTimeFormat('en-US', { timeZone: STANDARD_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const t = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
    return `${t.year}${t.month}${t.day}T${t.hour}${t.minute}`;
  }
  return `${w.j}${zwei(w.m)}${zwei(w.t)}T${zwei(w.h)}${zwei(w.mi)}`;
}

// ---------- Schreiben ----------

export const KALENDER_NAME = 'Kapazität · Gerster CAD';
const UID_DOMAIN = 'kapazitaet.gerster-cad.de';

const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Zeilen auf 75 Zeichen falten (RFC 5545) */
function falten(zeile) {
  const teile = [];
  let rest = zeile;
  while (new TextEncoder().encode(rest).length > 75) {
    let n = 74;
    while (new TextEncoder().encode(rest.slice(0, n)).length > 74) n--;
    teile.push(rest.slice(0, n));
    rest = ' ' + rest.slice(n);
  }
  teile.push(rest);
  return teile.join('\r\n');
}

const stempel = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Erinnerung n Tage vorher um 9 Uhr (bei ganztägigen Terminen relativ zu 0 Uhr des Tages) */
function ausloeser(tage) {
  if (tage <= 0) return 'PT9H';
  return tage === 1 ? '-PT15H' : `-P${tage - 1}DT15H`;
}

export const meilensteinUid = (m) => `${m.id}@${UID_DOMAIN}`;

/**
 * ICS mit Meilensteinen und Deadlines als ganztägige Termine.
 * meilensteine: [{ id, datum, titel, typ, notiz, erinnerungTage }], projekte: Liste zum Nachschlagen des Namens.
 * Gleiche UID je Meilenstein, SEQUENCE steigt mit der Zeit – ein erneuter Import aktualisiert statt verdoppelt.
 */
export function meilensteineAlsIcs(meilensteine, projekte = [], { jetzt = new Date() } = {}) {
  const z = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gerster CAD//Kapazitaet//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(KALENDER_NAME)}`, 'X-WR-TIMEZONE:Europe/Berlin'];
  const sequenz = Math.floor((jetzt.getTime() - Date.UTC(2026, 0, 1)) / 60000); // Minuten seit 2026, steigt immer
  for (const m of meilensteine) {
    const p = projekte.find((x) => x.id === m.projektId);
    const titel = `${m.typ === 'deadline' ? 'Deadline' : 'Meilenstein'}: ${p ? `${p.name} – ` : ''}${m.titel}`;
    const start = m.datum.replace(/-/g, '');
    const ende = alsText(plusTage(ausText(m.datum), 1)).replace(/-/g, '');
    z.push('BEGIN:VEVENT', `UID:${meilensteinUid(m)}`, `DTSTAMP:${stempel(jetzt)}`, `SEQUENCE:${Math.max(0, sequenz)}`,
      `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${ende}`, `SUMMARY:${icsText(titel)}`, 'TRANSP:TRANSPARENT');
    if (m.notiz) z.push(`DESCRIPTION:${icsText(m.notiz)}`);
    if (m.erledigt) z.push('STATUS:CANCELLED');
    for (const t of [...new Set(m.erinnerungTage ?? [])].sort((a, b) => b - a)) {
      z.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(titel)}`, `TRIGGER:${ausloeser(t)}`, 'END:VALARM');
    }
    z.push('END:VEVENT');
  }
  z.push('END:VCALENDAR');
  return z.map(falten).join('\r\n') + '\r\n';
}
