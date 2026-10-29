// Tests für Zahlungsstand aus Lexware, Einnahmen-Vorschau und Nachfassen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leereDaten, pruefeDaten } from '../js/kern/daten.js';
import { zahlungenUebernehmen, lexwareEntwurf } from '../js/kern/rechnung.js';
import { einnahmenVorschau, einnahmenPosten } from '../js/kern/einnahmen.js';
import { nachfassen } from '../js/kern/woche.js';
import { plane } from '../js/kern/planung.js';
import { zahlungenHolen } from '../daten-repo/lexware.mjs';

const LX = '11111111-2222-3333-4444-555555555555';

function daten() {
  const d = leereDaten();
  d.kunden.push({ id: 'k', name: 'Muster', stundensatz: 70 });
  d.projekte.push({ id: 'p', name: 'Stunden', kunde: 'Muster', status: 'laeuft', schaetzungH: 30, puffer: 0, prioritaet: 2, abrechnungsart: 'stunden', positionen: [], start: '2026-10-26' });
  d.projekte.push({ id: 'q', name: 'Pauschal', kunde: 'Muster', status: 'laeuft', schaetzungH: 10, puffer: 0, prioritaet: 2, abrechnungsart: 'pauschal', pauschalpreis: 1000, deadline: '2026-11-20', positionen: [] });
  d.zeiteintraege.push({ id: 'z', datum: '2026-10-27', projektId: 'p', positionNr: null, stunden: 10, notiz: '' });
  d.rechnungen.push({ id: 'r', projektId: 'p', art: 'stunden', titel: 'Stunden', erstellt: '2026-10-20', zeilen: [], eintraege: [], netto: 700, status: 'uebertragen', lexwareId: LX });
  return d;
}

test('Zahlungsstand übernehmen: festgeschrieben, dann bezahlt mit Datum', () => {
  const d = daten();
  assert.ok(lexwareEntwurf(d.rechnungen[0]));
  assert.ok(zahlungenUebernehmen(d, [{ id: LX, nummer: 'RE 1', status: 'open', faellig: '2026-11-03', gesamt: 833, offen: 833, geaendert: '2026-10-20' }]));
  assert.equal(lexwareEntwurf(d.rechnungen[0]), false);
  assert.equal(zahlungenUebernehmen(d, [{ id: LX, nummer: 'RE 1', status: 'open', faellig: '2026-11-03', gesamt: 833, offen: 833, geaendert: '2026-10-20' }]), false, 'nichts geändert');
  zahlungenUebernehmen(d, [{ id: LX, nummer: 'RE 1', status: 'paid', faellig: '2026-11-03', gesamt: 833, offen: 0, geaendert: '2026-11-02' }]);
  assert.deepEqual([d.rechnungen[0].lexware.status, d.rechnungen[0].lexware.bezahltAm], ['paid', '2026-11-02']);
  assert.ok(pruefeDaten(d).ok);
});

test('Einnahmen: sicher aus Lexware, bald aus offenen Stunden, geplant aus Pauschal und Plan', () => {
  const d = daten();
  const liste = [
    { id: LX, nummer: 'RE 1', status: 'open', datum: '2026-10-20', faellig: '2026-11-03', gesamt: 833, offen: 833 },
    { id: 'x', nummer: 'RE 0', status: 'overdue', datum: '2026-09-01', faellig: '2026-09-15', gesamt: 119, offen: 119 },
    { id: 'y', nummer: 'RE 2', status: 'paid', datum: '2026-10-01', faellig: '2026-10-15', gesamt: 500, offen: 0, geaendert: '2026-10-10' },
  ];
  zahlungenUebernehmen(d, liste);
  const heute = '2026-10-28';
  const posten = einnahmenPosten(d, { plan: plane(d, { heute }), heute, lexwareListe: liste });
  const sicher = posten.filter((x) => x.stufe === 'sicher');
  assert.deepEqual(sicher.map((x) => [x.titel, x.betrag, x.ueberfaellig]), [['Rechnung RE 0', 119, true], ['Rechnung RE 1', 833, false]]);
  const bald = posten.find((x) => x.stufe === 'bald' && x.projektId === 'p');
  assert.deepEqual([bald.betrag, bald.datum], [833, '2026-11-14'], '10 h × 70 € brutto, Monatsende + 14 Tage');
  const pauschal = posten.find((x) => x.projektId === 'q');
  assert.deepEqual([pauschal.stufe, pauschal.betrag, pauschal.datum], ['geplant', 1190, '2026-12-04']);
  assert.ok(posten.some((x) => x.stufe === 'geplant' && x.projektId === 'p'), 'eingeplante Reststunden');
  const v = einnahmenVorschau(d, { plan: plane(d, { heute }), heute, lexwareListe: liste });
  assert.equal(v.ueberfaellig, 119);
  assert.equal(v.bezahltMonat, 500);
  assert.equal(v.wochen.length, 8);
  assert.equal(v.wochen[1].sicher, 833);
});

test('Nachfassen: nach 14 Tagen, „Nachgefasst“ setzt neu', () => {
  const d = leereDaten();
  d.angebote.push({ id: 'a', nummer: 'AN 1', status: 'versendet', datum: '2026-10-01', versendetAm: '2026-10-05', positionen: [] });
  assert.equal(nachfassen(d, '2026-10-18').length, 0);
  assert.equal(nachfassen(d, '2026-10-19')[0].seitTagen, 14);
  d.angebote[0].nachgefasstAm = '2026-10-19';
  assert.equal(nachfassen(d, '2026-10-25').length, 0);
});

test('Action: Zahlungsstand über die Belegliste, nur lesen', async () => {
  const aufrufe = [];
  const holen = async (url, o) => {
    aufrufe.push([o.method, url]);
    return { ok: true, status: 200, text: async () => JSON.stringify({ last: true, totalPages: 1, content: [
      { id: LX, voucherType: 'invoice', voucherStatus: 'open', voucherNumber: 'RE 1', voucherDate: '2026-10-20T00:00:00.000+02:00', dueDate: '2026-11-03T00:00:00.000+01:00', contactName: 'Muster', totalAmount: 833, openAmount: 833, updatedDate: '2026-10-21T10:00:00.000+02:00' },
    ] }) };
  };
  const r = await zahlungenHolen('schluessel', holen, new Date('2026-10-28T12:00:00Z'));
  assert.deepEqual(r, [{ id: LX, nummer: 'RE 1', art: 'rechnung', status: 'open', kunde: 'Muster', datum: '2026-10-20', faellig: '2026-11-03', gesamt: 833, offen: 833, geaendert: '2026-10-21' }]);
  assert.equal(aufrufe.length, 1);
  assert.equal(aufrufe[0][0], 'GET');
  assert.match(aufrufe[0][1], /\/v1\/voucherlist\?voucherType=invoice,downpaymentinvoice&voucherStatus=open,overdue,paid,paidoff,voided&voucherDateFrom=2025-09-23/);
});
