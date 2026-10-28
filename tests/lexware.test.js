// Tests für die Lexware-Action (ohne echten Zugang: fetch wird nachgebaut).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lexDatum, rechnungNutzlast, angebotNutzlast, ausfuehren } from '../daten-repo/lexware.mjs';

const ID = '11111111-2222-3333-4444-555555555555';
const KONTAKT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const rechnung = {
  kontaktId: KONTAKT, name: 'Beispiel Bau GmbH', titel: 'Rechnung', einleitung: 'Frankfurt', datum: '2026-10-28', leistungVon: '2026-07-01', leistungBis: '2026-10-28',
  zeilen: [{ name: 'Planungsleistung Mo 26.10.', beschreibung: 'Pos. 1', menge: 5.5, einheit: 'Stunden', preisNetto: 72 }],
};

test('Datum in deutscher Zeit (Sommer und Winter)', () => {
  assert.equal(lexDatum('2026-07-01'), '2026-07-01T00:00:00.000+02:00');
  assert.equal(lexDatum('2026-10-28'), '2026-10-28T00:00:00.000+01:00');
});

test('Nutzlast nur aus erlaubten Feldern, Kontakt oder Name', () => {
  const n = rechnungNutzlast({ ...rechnung, finalize: true, voucherStatus: 'open', irgendwas: 1 });
  assert.deepEqual(Object.keys(n).sort(), ['address', 'introduction', 'lineItems', 'shippingConditions', 'taxConditions', 'title', 'totalPrice', 'voucherDate']);
  assert.deepEqual(n.address, { contactId: KONTAKT });
  assert.deepEqual(n.lineItems[0], { type: 'custom', name: 'Planungsleistung Mo 26.10.', description: 'Pos. 1', quantity: 5.5, unitName: 'Stunden', unitPrice: { currency: 'EUR', netAmount: 72, taxRatePercentage: 19 } });
  assert.equal(n.shippingConditions.shippingType, 'serviceperiod');
  assert.deepEqual(rechnungNutzlast({ ...rechnung, kontaktId: 'kein-uuid' }).address, { name: 'Beispiel Bau GmbH', countryCode: 'DE' });
  const a = angebotNutzlast({ ...rechnung, gueltigBis: '2026-11-27' });
  assert.equal(a.expirationDate, '2026-11-27T00:00:00.000+01:00');
});

test('Ausführen: Entwurf ohne finalize, Fehler verständlich, unbekannte Art abgelehnt', async () => {
  const aufrufe = [];
  const ok = async (url, o) => { aufrufe.push([url, o.method, JSON.parse(o.body ?? 'null')]); return new Response(JSON.stringify({ id: 'lx-neu' }), { status: 201 }); };
  const e = await ausfuehren({ id: ID, art: 'rechnung', daten: rechnung }, 'schluessel', ok);
  assert.deepEqual([e.ok, e.lexwareId], [true, 'lx-neu']);
  assert.equal(aufrufe[0][0], 'https://api.lexware.io/v1/invoices');
  assert.ok(!aufrufe[0][0].includes('finalize'));
  const falsch = async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
  const f = await ausfuehren({ id: ID, art: 'angebot', daten: { ...rechnung, gueltigBis: '2026-11-27' } }, 'x', falsch);
  assert.equal(f.ok, false);
  assert.match(f.fehler, /API-Schlüssel stimmt nicht/);
  const u = await ausfuehren({ id: ID, art: 'loeschen', daten: {} }, 'x', ok);
  assert.match(u.fehler, /Unbekannte Art/);
});
