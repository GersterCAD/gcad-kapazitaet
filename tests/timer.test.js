// Tests für den Zeitstopper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timerStarten, timerStoppen, runden, dauerText } from '../js/kern/timer.js';
import { leereDaten, pruefeDaten } from '../js/kern/daten.js';
import { zusammenfuehren } from '../js/kern/abgleich.js';

const d0 = () => {
  const d = leereDaten();
  d.projekte.push({ id: 'p', name: 'Test', status: 'laeuft', schaetzungH: 10, puffer: 10, prioritaet: 2, positionen: [{ nr: '1', bezeichnung: 'A', sollH: 10 }] });
  return d;
};
const um = (s) => new Date(s); // lokale Zeit

test('Runden auf Viertelstunden, unter einer Minute nichts', () => {
  assert.equal(runden(0.5), 0);
  assert.equal(runden(3), 0.25);       // mindestens eine Stufe
  assert.equal(runden(52), 0.75);
  assert.equal(runden(83), 1.5);       // 1:23 → 1,5 h (nächste Viertelstunde 1:30)
  assert.equal(runden(83, 6), 1.4);
  assert.equal(runden(80, 30), 1.5);
  assert.equal(dauerText(4925000), '1:22:05');
});

test('Starten und Stoppen bucht einen Zeiteintrag mit von/bis', () => {
  const d = d0();
  timerStarten(d, { projektId: 'p', positionNr: '1', notiz: 'Zeichnen' }, um('2026-10-28T09:12:00'));
  assert.equal(d.timer.projektId, 'p');
  const neu = timerStoppen(d, um('2026-10-28T10:35:00'));
  assert.equal(d.timer, null);
  assert.deepEqual(neu.map((z) => [z.datum, z.stunden, z.von, z.bis, z.positionNr, z.notiz]), [['2026-10-28', 1.5, '09:12', '10:35', '1', 'Zeichnen']]);
  assert.equal(d.zeiteintraege.length, 1);
  assert.ok(pruefeDaten(d).ok, pruefeDaten(d).fehler.join(' '));
});

test('Über Mitternacht: zwei Einträge; anderes Ende für vergessene Timer', () => {
  const d = d0();
  timerStarten(d, { projektId: 'p' }, um('2026-10-28T22:00:00'));
  const neu = timerStoppen(d, um('2026-10-29T08:00:00'), { ende: um('2026-10-29T00:45:00') });
  assert.deepEqual(neu.map((z) => [z.datum, z.stunden, z.von, z.bis]), [['2026-10-28', 2, '22:00', '24:00'], ['2026-10-29', 0.75, '00:00', '00:45']]);
});

test('Neuer Start stoppt den laufenden Timer', () => {
  const d = d0();
  timerStarten(d, { projektId: 'p' }, um('2026-10-28T09:00:00'));
  const gestoppt = timerStarten(d, { projektId: 'p', positionNr: '1' }, um('2026-10-28T09:30:00'));
  assert.equal(gestoppt.length, 1);
  assert.equal(d.timer.positionNr, '1');
});

test('Abgleich: Timer auf einem Gerät gestartet kommt auf dem anderen an', () => {
  const basis = d0();
  const lokal = structuredClone(basis), entfernt = structuredClone(basis);
  timerStarten(entfernt, { projektId: 'p' }, um('2026-10-28T09:00:00'));
  const { daten, konflikte } = zusammenfuehren(basis, lokal, entfernt);
  assert.equal(konflikte.length, 0);
  assert.equal(daten.timer.projektId, 'p');
});
