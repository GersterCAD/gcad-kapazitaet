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

test('Anzeige kurz und lang, vergessen ab 10 h, verwerfen', async () => {
  const { dauerKurz, dauerLang, vergessen, timerVerwerfen } = await import('../js/kern/timer.js');
  assert.equal(dauerKurz(5050000), '01:24');
  assert.equal(dauerLang(5050000), '01:24:10');
  assert.equal(dauerKurz(94080000), '26:08');
  const d = d0();
  timerStarten(d, { projektId: 'p', positionNr: '1' }, um('2026-10-27T08:52:00'));
  assert.equal(vergessen(d.timer, um('2026-10-27T18:00:00')), false);
  assert.equal(vergessen(d.timer, um('2026-10-27T19:00:00')), true);
  timerVerwerfen(d);
  assert.equal(d.timer, null);
  assert.equal(d.zeiteintraege.length, 0);
});

test('Vorschlag für das Ende eines vergessenen Timers', async () => {
  const { endeVorschlag, stundenBis } = await import('../js/kern/timer.js');
  const d = d0();
  timerStarten(d, { projektId: 'p', positionNr: '1' }, um('2026-10-27T08:52:00'));
  const jetzt = um('2026-10-28T11:00:00');
  // ohne Termine: Start + Regeltag (8 h) = 16:52, aufgerundet 17:00
  let v = endeVorschlag(d, [], jetzt);
  assert.equal(v.grund, 'regeltag');
  assert.equal(v.ende.getHours(), 17);
  assert.equal(stundenBis(d, v.ende), 8.25);   // 08:52–17:00 = 8:08 → 8,25 h
  assert.ok(d.timer, 'Vorschau ändert nichts');
  // letzter Termin des Tages endete 16:30 → 17:00
  const t = (s, e) => ({ start: um(s).toISOString(), ende: um(e).toISOString(), ganztaegig: false });
  v = endeVorschlag(d, [t('2026-10-27T14:00:00', '2026-10-27T16:30:00'), t('2026-10-28T09:00:00', '2026-10-28T10:00:00')], jetzt);
  assert.equal(v.grund, 'termin');
  assert.equal(v.terminEnde.getMinutes(), 30);
  assert.equal(v.ende.getHours(), 17);
});

test('Zuletzt benutzt für den Schnellstart', async () => {
  const { zuletztBenutzt } = await import('../js/kern/timer.js');
  const d = d0();
  d.projekte.push({ id: 'q', name: 'Zwei', status: 'auftrag', schaetzungH: 5, puffer: 0, prioritaet: 2, positionen: [] });
  d.projekte.push({ id: 'z', name: 'Zu', status: 'abgeschlossen', schaetzungH: 5, puffer: 0, prioritaet: 2, positionen: [] });
  d.zeiteintraege.push(
    { id: 'a', datum: '2026-10-27', projektId: 'q', positionNr: null, stunden: 2, notiz: '' },
    { id: 'b', datum: '2026-10-28', projektId: 'p', positionNr: '1', stunden: 1, notiz: '', von: '08:00', bis: '09:00' },
    { id: 'c', datum: '2026-10-28', projektId: 'p', positionNr: '2', stunden: 0.5, notiz: '', von: '10:00', bis: '10:30' },
    { id: 'd', datum: '2026-10-29', projektId: 'z', positionNr: null, stunden: 1, notiz: '' },
  );
  const z = zuletztBenutzt(d, { heute: '2026-10-28' });
  assert.deepEqual(z.map((x) => [x.projektId, x.positionNr, x.stundenHeute]), [['p', '2', 1.5], ['q', null, 0]]);
});
