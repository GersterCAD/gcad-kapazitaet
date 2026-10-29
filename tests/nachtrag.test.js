// Tests für Nachträge beim Zeitstopper und die Wochenkarte (Wochenstart, Wochenabschluss).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leereDaten, pruefeDaten } from '../js/kern/daten.js';
import { timerStarten, timerStoppen } from '../js/kern/timer.js';
import { nachtragAnlegen, naechsteNachtragNr, umbuchen, nachStundenOffen } from '../js/kern/nachtrag.js';
import { rechnungBerechnen, offenUebersicht } from '../js/kern/rechnung.js';
import { nachkalkulation } from '../js/kern/nachkalkulation.js';
import { plane } from '../js/kern/planung.js';
import { wochenModus, wochenStart, wochenAbschluss, nachfassen } from '../js/kern/woche.js';

function daten() {
  const d = leereDaten();
  d.kunden.push({ id: 'k', name: 'Gasthaus', stundensatz: 70 });
  d.projekte.push({ id: 'q', name: 'Bar', kunde: 'Gasthaus', status: 'laeuft', schaetzungH: 40, puffer: 0, prioritaet: 2, abrechnungsart: 'pauschal', pauschalpreis: 3000,
    deadline: '2026-11-06', positionen: [{ nr: '1', bezeichnung: 'Theke', sollH: 20, preis: 2000 }, { nr: '2', bezeichnung: 'Garderobe', sollH: 20, preis: 1000 }] });
  return d;
}

test('Nachtrag: Nummern N1, N2, Timer läuft darauf, umbuchen', () => {
  const d = daten();
  assert.equal(nachtragAnlegen(d, 'q', { bezeichnung: 'Theke 20 cm länger' }), 'N1');
  assert.equal(naechsteNachtragNr(d.projekte[0]), 'N2');
  const n1 = d.projekte[0].positionen.find((x) => x.nr === 'N1');
  assert.deepEqual([n1.typ, n1.status, n1.sollH], ['nachtrag', 'verguetet', 0]);
  timerStarten(d, { projektId: 'q', positionNr: '1' }, new Date('2026-10-27T08:00:00'));
  const [z] = timerStoppen(d, new Date('2026-10-27T10:00:00'));
  assert.equal(umbuchen(d, [z.id], 'N1'), 1);
  assert.equal(d.zeiteintraege[0].positionNr, 'N1');
  assert.ok(pruefeDaten(d).ok, pruefeDaten(d).fehler.join(' '));
});

test('Pauschal mit Nachtrag: Schlussrechnung und offen enthalten die Nachtrag-Stunden, Nachkalkulation zählt den Erlös', () => {
  const d = daten();
  nachtragAnlegen(d, 'q', { bezeichnung: 'Zusatzregal' });
  d.zeiteintraege.push({ id: 'a', datum: '2026-10-26', projektId: 'q', positionNr: '1', stunden: 10, notiz: '' });
  d.zeiteintraege.push({ id: 'b', datum: '2026-10-27', projektId: 'q', positionNr: 'N1', stunden: 2.5, notiz: '' });
  assert.deepEqual(nachStundenOffen(d, 'q').map((x) => [x.nr, x.stunden]), [['N1', 2.5]]);
  const e = rechnungBerechnen(d, 'q', { art: 'pauschal' });
  assert.deepEqual(e.zeilen.map((z) => [z.titel, z.betrag]), [['Pos. 1 Theke', 2000], ['Pos. 2 Garderobe', 1000], ['Pos. N1 Zusatzregal', 175]]);
  const o = offenUebersicht(d, '2026-10-28')[0];
  assert.deepEqual([o.offenBetrag, o.nachtragH], [3175, 2.5]);
  const n = nachkalkulation(d, 'q');
  assert.equal(n.positionen.find((x) => x.nr === 'N1').erloes, 175);
  // nicht vergütet: kein Erlös, keine Rechnungszeile
  d.projekte[0].positionen.find((x) => x.nr === 'N1').status = 'unverguetet';
  assert.equal(rechnungBerechnen(d, 'q', { art: 'pauschal' }).zeilen.length, 2);
});

test('Woche: Modus, Wochenstart mit Deadline und Nachfassen, Wochenabschluss mit Lücken', () => {
  assert.equal(wochenModus('2026-10-26'), 'start');
  assert.equal(wochenModus('2026-10-30'), 'abschluss');
  const d = daten();
  d.meilensteine.push({ id: 'm', projektId: 'q', datum: '2026-10-29', titel: 'Abgabe Vorabzug', typ: 'meilenstein', erledigt: false, erinnerungTage: [] });
  d.angebote.push({ id: 'a1', nummer: 'AN 26-001', kunde: 'Muster', status: 'versendet', datum: '2026-10-01', versendetAm: '2026-10-05', gueltigBis: '2026-10-31', positionen: [] });
  d.angebote.push({ id: 'a2', nummer: 'AN 26-002', kunde: 'Muster', status: 'versendet', datum: '2026-10-20', positionen: [] });
  const s = wochenStart(d, plane(d, { heute: '2026-10-26' }), '2026-10-26');
  assert.deepEqual(s.termine.map((t) => t.titel), ['Abgabe Vorabzug']);
  assert.deepEqual(nachfassen(d, '2026-10-26').map((x) => [x.angebot.id, x.seitTagen]), [['a1', 21]]);
  assert.equal(s.nachfassen.length, 1);

  d.zeiteintraege.push({ id: 'x', datum: '2026-10-26', projektId: 'q', positionNr: '1', stunden: 8, notiz: '' });
  d.zeiteintraege.push({ id: 'y', datum: '2026-10-27', projektId: 'q', positionNr: '1', stunden: 3, notiz: '' });
  const a = wochenAbschluss(d, plane(d, { heute: '2026-10-30' }), '2026-10-30');
  assert.equal(a.tage.length, 5);
  assert.equal(a.gebuchtH, 11);
  assert.ok(a.tage[1].lueckeH > 1, 'Dienstag hat eine Lücke');
  assert.equal(a.offenNeuH, 11);
});
