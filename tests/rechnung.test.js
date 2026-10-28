// Tests für Rechnungen: Stunden, Pauschal mit Abschlag, Status, offen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leereDaten, pruefeDaten } from '../js/kern/daten.js';
import { offeneStunden } from '../js/kern/abrechnung.js';
import {
  rechnungBerechnen, rechnungAnlegen, rechnungStatus, rechnungLoeschen, offenUebersicht, lexwareRechnung, pauschalBerechnet,
} from '../js/kern/rechnung.js';

function daten() {
  const d = leereDaten();
  d.kunden.push({ id: 'k', name: 'Beispiel Bau GmbH', stundensatz: 72, lexwareKontaktId: 'lx-1' });
  d.projekte.push({ id: 'p', name: 'Frankfurt', kunde: 'Beispiel Bau GmbH', status: 'laeuft', schaetzungH: 20, puffer: 10, prioritaet: 2, abrechnungsart: 'stunden',
    positionen: [{ nr: '1', bezeichnung: 'E-UV', sollH: 10 }, { nr: '2', bezeichnung: 'IT', sollH: 10 }] });
  d.projekte.push({ id: 'q', name: 'Bar', kunde: 'Gasthaus', status: 'laeuft', schaetzungH: 40, puffer: 0, prioritaet: 2, abrechnungsart: 'pauschal', pauschalpreis: 3000,
    positionen: [{ nr: '1', bezeichnung: 'Theke', sollH: 20, preis: 2000 }, { nr: '2', bezeichnung: 'Garderobe', sollH: 20, preis: 1000 }] });
  const z = (id, datum, positionNr, stunden, projektId = 'p') => d.zeiteintraege.push({ id, datum, projektId, positionNr, stunden, notiz: '' });
  z('a', '2026-09-20', '1', 2.5); z('b', '2026-10-26', '1', 4); z('c', '2026-10-26', '2', 1.5); z('d', '2026-10-28', '2', 1); z('e', '2026-10-27', '1', 3, 'q');
  return d;
}

test('Stunden: je Tag zusammengefasst, Auswahl, Beträge, Leistungszeitraum', () => {
  const d = daten();
  const e = rechnungBerechnen(d, 'p', { nur: new Set(['b', 'c', 'd']) });
  assert.deepEqual(e.zeilen.map((z) => [z.titel, z.menge, z.betrag]), [['Planungsleistung Mo 26.10.', 5.5, 396], ['Planungsleistung Mi 28.10.', 1, 72]]);
  assert.equal(e.zeilen[0].beschreibung, 'Pos. 1 E-UV, Pos. 2 IT');
  assert.equal(e.netto, 468);
  assert.equal(e.brutto, 556.92);
  assert.equal(e.leistungVon, '2026-10-26');
});

test('Anlegen, übertragen, löschen: Zeiteinträge sind reserviert, dann abgerechnet, dann wieder offen', () => {
  const d = daten();
  const r = rechnungAnlegen(d, 'p', rechnungBerechnen(d, 'p', { nur: new Set(['b', 'c', 'd']) }), '2026-10-28');
  assert.equal(r.titel, 'Stunden 26.–28.10.');
  assert.equal(offeneStunden(d, 'p'), 2.5);
  assert.ok(pruefeDaten(d).ok, pruefeDaten(d).fehler.join(' '));
  rechnungStatus(d, r.id, 'uebertragen', { heute: '2026-10-28', lexwareId: 'lx-r' });
  assert.equal(d.zeiteintraege.find((z) => z.id === 'b').abgerechnet, '2026-10-28');
  const lx = lexwareRechnung(d, r);
  assert.equal(lx.kontaktId, 'lx-1');
  assert.deepEqual(lx.zeilen[0], { name: 'Planungsleistung Mo 26.10.', beschreibung: 'Pos. 1 E-UV, Pos. 2 IT', menge: 5.5, einheit: 'Stunden', preisNetto: 72 });
  rechnungLoeschen(d, r.id);
  assert.equal(offeneStunden(d, 'p'), 9);
});

test('Pauschal: Abschlag, Schlussrechnung zieht ihn ab, offen sinkt', () => {
  const d = daten();
  const ab = rechnungBerechnen(d, 'q', { art: 'abschlag', abschlagProzent: 50 });
  assert.equal(ab.netto, 1500);
  rechnungAnlegen(d, 'q', ab, '2026-10-28');
  assert.equal(pauschalBerechnet(d, 'q'), 1500);
  const schluss = rechnungBerechnen(d, 'q', { art: 'pauschal' });
  assert.deepEqual(schluss.zeilen.map((z) => z.betrag), [2000, 1000, -1500]);
  assert.equal(schluss.netto, 1500);
  assert.deepEqual(schluss.eintraege, ['e']);
  const teil = rechnungBerechnen(d, 'q', { art: 'teil', positionNrs: ['2'] });
  assert.equal(teil.netto, 1000);
});

test('Offen-Übersicht: Stunden mit Betrag und „länger als 30 Tage“, Pauschal mit Restbetrag', () => {
  const d = daten();
  const o = offenUebersicht(d, '2026-10-28');
  const p = o.find((x) => x.projekt.id === 'p');
  assert.equal(p.offenH, 9);
  assert.equal(p.offenBetrag, 648);
  assert.equal(p.aelter, 180);                 // 2,5 h vom 20.09.
  assert.equal(p.seitTagen, 38);
  assert.equal(o.find((x) => x.projekt.id === 'q').offenBetrag, 3000);
});
