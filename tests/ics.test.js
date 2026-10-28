// Tests für Kalender lesen (ICS → Termine) und schreiben (Meilensteine → ICS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { termineAusIcs, meilensteineAlsIcs, ereignisseLesen, zoneNachDate } from '../js/kern/ics.js';

const ics = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const ev = (...z) => ['BEGIN:VEVENT', ...z, 'END:VEVENT'];
const FENSTER = { von: '2026-10-01', bis: '2027-03-31' };

test('Zeitzone: Wanduhrzeit Berlin → UTC, auch über die Zeitumstellung', () => {
  assert.equal(zoneNachDate({ j: 2026, m: 10, t: 23, h: 9, mi: 0 }, 'Europe/Berlin').toISOString(), '2026-10-23T07:00:00.000Z'); // Sommerzeit
  assert.equal(zoneNachDate({ j: 2026, m: 10, t: 26, h: 9, mi: 0 }, 'Europe/Berlin').toISOString(), '2026-10-26T08:00:00.000Z'); // Winterzeit
});

test('Einzeltermin mit TZID, UTC und ganztägig', () => {
  const t = termineAusIcs(ics(
    ev('UID:a', 'SUMMARY:Baustellentermin\\, Getränkebar', 'DTSTART;TZID=Europe/Berlin:20261028T090000', 'DTEND;TZID=Europe/Berlin:20261028T120000'),
    ev('UID:b', 'SUMMARY:Telefonat', 'DTSTART:20261029T130000Z', 'DURATION:PT1H'),
    ev('UID:c', 'SUMMARY:Messe', 'DTSTART;VALUE=DATE:20261124', 'DTEND;VALUE=DATE:20261126'),
  ), 'Gerster CAD', FENSTER);
  assert.deepEqual(t.map((x) => [x.uid, x.titel, x.start, x.ende, x.ganztaegig]), [
    ['a', 'Baustellentermin, Getränkebar', '2026-10-28T08:00:00.000Z', '2026-10-28T11:00:00.000Z', false],
    ['b', 'Telefonat', '2026-10-29T13:00:00.000Z', '2026-10-29T14:00:00.000Z', false],
    ['c', 'Messe', '2026-11-24', '2026-11-26', true],
  ]);
});

test('Wöchentliche Serie mit BYDAY, COUNT, EXDATE und geändertem Einzeltermin', () => {
  const t = termineAusIcs(ics(
    ev('UID:s', 'SUMMARY:Jour fixe', 'DTSTART;TZID=Europe/Berlin:20261020T100000', 'DTEND;TZID=Europe/Berlin:20261020T110000',
      'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6', 'EXDATE;TZID=Europe/Berlin:20261027T100000'),
    ev('UID:s', 'SUMMARY:Jour fixe (verlegt)', 'RECURRENCE-ID;TZID=Europe/Berlin:20261029T100000',
      'DTSTART;TZID=Europe/Berlin:20261030T140000', 'DTEND;TZID=Europe/Berlin:20261030T150000'),
  ), 'Gerster CAD', FENSTER);
  // Di 20., Do 22., (Di 27. gestrichen), Do 29. → Fr 30. verlegt, Di 03.11., Do 05.11.
  assert.deepEqual(t.map((x) => [x.start, x.titel]), [
    ['2026-10-20T08:00:00.000Z', 'Jour fixe'],
    ['2026-10-22T08:00:00.000Z', 'Jour fixe'],
    ['2026-10-30T13:00:00.000Z', 'Jour fixe (verlegt)'],
    ['2026-11-03T09:00:00.000Z', 'Jour fixe'],   // Winterzeit: 10 Uhr = 09 UTC
    ['2026-11-05T09:00:00.000Z', 'Jour fixe'],
  ]);
  assert.equal(new Set(t.map((x) => x.uid)).size, 5);
});

test('Serie mit UNTIL in UTC schließt den letzten Termin ein', () => {
  const t = termineAusIcs(ics(
    ev('UID:u', 'SUMMARY:Sport', 'DTSTART;TZID=Europe/Berlin:20261103T090000', 'DTEND;TZID=Europe/Berlin:20261103T100000',
      'RRULE:FREQ=WEEKLY;UNTIL=20261117T080000Z'),
  ), 'Privat', FENSTER);
  assert.deepEqual(t.map((x) => x.start.slice(0, 10)), ['2026-11-03', '2026-11-10', '2026-11-17']);
});

test('Monatlich am letzten Freitag, jährlich ganztägig, frei markierte und abgesagte Termine fehlen', () => {
  const t = termineAusIcs(ics(
    ev('UID:m', 'SUMMARY:Steuer', 'DTSTART;TZID=Europe/Berlin:20261030T080000', 'DTEND;TZID=Europe/Berlin:20261030T090000', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=3'),
    ev('UID:y', 'SUMMARY:Geburtstag', 'DTSTART;VALUE=DATE:20251107', 'RRULE:FREQ=YEARLY'),
    ev('UID:f', 'SUMMARY:Frei', 'DTSTART:20261102T080000Z', 'DTEND:20261102T090000Z', 'TRANSP:TRANSPARENT'),
    ev('UID:x', 'SUMMARY:Abgesagt', 'DTSTART:20261102T080000Z', 'DTEND:20261102T090000Z', 'STATUS:CANCELLED'),
  ), 'Familie', FENSTER);
  assert.deepEqual(t.map((x) => [x.titel, x.start.slice(0, 10)]), [
    ['Steuer', '2026-10-30'], ['Geburtstag', '2026-11-07'], ['Steuer', '2026-11-27'], ['Steuer', '2026-12-25'],
  ]);
  assert.equal(t.find((x) => x.titel === 'Geburtstag').ende, '2026-11-08');
});

test('Ohne Titel: privater Kalender nur als „belegt“', () => {
  const t = termineAusIcs(ics(ev('UID:p', 'SUMMARY:Arzt', 'DTSTART:20261102T080000Z', 'DTEND:20261102T090000Z')), 'Privat', { ...FENSTER, titel: false });
  assert.equal(t[0].titel, 'belegt');
});

test('Meilensteine als ICS: ganztägig, Erinnerungen, gleiche UID, lesbar', () => {
  const m = [
    { id: 'm1', projektId: 'p1', datum: '2026-11-27', titel: 'Abgabe Werkplanung', typ: 'deadline', notiz: 'Pos. 1–6', erinnerungTage: [7, 2] },
    { id: 'm2', projektId: 'p1', datum: '2026-11-13', titel: 'Pos. 1–3, an Kunde', typ: 'meilenstein', erinnerungTage: [0] },
  ];
  const text = meilensteineAlsIcs(m, [{ id: 'p1', name: 'Projekt Frankfurt' }], { jetzt: new Date('2026-10-28T10:00:00Z') });
  assert.match(text, /X-WR-CALNAME:Kapazität · Gerster CAD/);
  assert.match(text, /UID:m1@kapazitaet\.gerster-cad\.de/);
  assert.match(text, /DTSTART;VALUE=DATE:20261127\r\nDTEND;VALUE=DATE:20261128/);
  assert.match(text, /TRIGGER:-P6DT15H/);  // 7 Tage vorher, 9 Uhr
  assert.match(text, /TRIGGER:-P1DT15H/);  // 2 Tage vorher, 9 Uhr
  assert.match(text, /TRIGGER:PT9H/);      // am Tag, 9 Uhr
  assert.ok(text.split('\r\n').every((z) => new TextEncoder().encode(z).length <= 75));
  const zurueck = ereignisseLesen(text);
  assert.deepEqual(zurueck.map((e) => e.titel), ['Deadline: Projekt Frankfurt – Abgabe Werkplanung', 'Meilenstein: Projekt Frankfurt – Pos. 1–3, an Kunde']);
  // Erneuter Export: gleiche UID, höhere SEQUENCE
  const spaeter = meilensteineAlsIcs(m, [], { jetzt: new Date('2026-10-29T10:00:00Z') });
  const seq = (t) => Number(t.match(/SEQUENCE:(\d+)/)[1]);
  assert.ok(seq(spaeter) > seq(text));
});
