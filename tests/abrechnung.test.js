// Tests für die Rechnungszeilen (Vorbereitung Lexware Office).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rechnungsZeilen, offeneStunden } from '../js/kern/abrechnung.js';
import { leereDaten } from '../js/kern/daten.js';

function daten() {
  const d = leereDaten();
  d.projekte.push({ id: 'p', name: 'Frankfurt', status: 'laeuft', schaetzungH: 20, puffer: 10, prioritaet: 2,
    positionen: [{ nr: '1', bezeichnung: 'Schrankwand', sollH: 10 }, { nr: '2', bezeichnung: 'Teeküche', sollH: 10 }] });
  const z = (id, datum, positionNr, stunden, von, bis, notiz = '') => d.zeiteintraege.push({ id, datum, projektId: 'p', positionNr, stunden, notiz, von, bis });
  z('a', '2026-10-28', '1', 0.5, '08:00', '08:30');
  z('b', '2026-10-28', '1', 0.75, '10:00', '10:45', 'Details');
  z('c', '2026-10-28', '2', 2, '13:00', '15:00');
  z('d', '2026-10-29', '2', 3, '09:00', '12:00');
  d.zeiteintraege.push({ id: 'x', datum: '2026-10-29', projektId: 'anderes', positionNr: null, stunden: 1, notiz: '' });
  return d;
}

test('Standard: je Tag und Projekt eine Zeile', () => {
  const z = rechnungsZeilen(daten(), 'p');
  assert.deepEqual(z.map((x) => [x.datum, x.stunden, x.text]), [
    ['2026-10-28', 3.25, 'Mi 28.10.2026 · Pos. 1 Schrankwand, Pos. 2 Teeküche · Details'],
    ['2026-10-29', 3, 'Do 29.10.2026 · Pos. 2 Teeküche'],
  ]);
  assert.deepEqual(z[0].eintraege, ['a', 'b', 'c']);
});

test('Je Tag und Position, oder jeder Eintrag einzeln', () => {
  const d = daten();
  assert.deepEqual(rechnungsZeilen(d, 'p', { art: 'tagPosition' }).map((x) => [x.datum, x.positionen.join(), x.stunden]),
    [['2026-10-28', '1', 1.25], ['2026-10-28', '2', 2], ['2026-10-29', '2', 3]]);
  const einzeln = rechnungsZeilen(d, 'p', { art: 'einzeln' });
  assert.equal(einzeln.length, 4);
  assert.equal(einzeln[1].text, 'Mi 28.10.2026 · Pos. 1 Schrankwand · 10:00–10:45 · Details');
});

test('Einstellung wirkt, abgerechnete Einträge fehlen, Zeitraum', () => {
  const d = daten();
  d.einstellungen.abrechnungZusammenfassen = 'tagPosition';
  assert.equal(rechnungsZeilen(d, 'p').length, 3);
  d.zeiteintraege.find((z) => z.id === 'd').abgerechnet = '2026-10-30';
  assert.equal(offeneStunden(d, 'p'), 3.25);
  assert.equal(rechnungsZeilen(d, 'p', { bis: '2026-10-28', art: 'tag' }).length, 1);
});
