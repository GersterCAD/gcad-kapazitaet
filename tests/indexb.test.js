// Tests zum Nachziehen von Index B: verkaufte Stunden (Projektformular), Zeiteintrag bearbeiten (Zeitstopper).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leereDaten, pruefeDaten } from '../js/kern/daten.js';
import { neuesAngebot, neuePosition, angebotAnnehmen, verkaufteStunden, verkaufteStundenTeile } from '../js/kern/angebot.js';
import { minutenAus, dauerWorte, eintragAendern } from '../js/kern/timer.js';

function auftrag() {
  const d = leereDaten();
  const a = neuesAngebot(d, '2026-11-21');
  a.stundensatz = 70;
  a.zulagen = [{ id: 'z', name: 'Rückläufer', art: 'prozent', wert: 10, an: true }];
  a.positionen = [neuePosition({ bezeichnung: 'A', grundH: 20 }), neuePosition({ bezeichnung: 'B', grundH: 30 })];
  d.angebote.push(a);
  const id = angebotAnnehmen(d, a.id, { puffer: 10, heute: '2026-11-21' });
  return { d, p: d.projekte.find((x) => x.id === id) };
}

// Alle Zahlen hier kommen aus dem Aufbau in auftrag(): Grund 20 + 30 h, Zulage 10 % → geplant 22 + 33 = 55 h.
// Sie hängen nicht vom Tag ab (fester Tag 21.11.2026, leere Daten).
test('Verkaufte Stunden: geplante Stunden aus dem Angebot, beim Annehmen gleich der Summe', () => {
  const { d, p } = auftrag();
  assert.equal(verkaufteStunden(d, p), 55);
  assert.equal(p.positionen.reduce((s, x) => s + x.sollH, 0), 55);
});

test('Hochgezogenes Soll fällt auf, Nachträge zählen zu den verkauften Stunden', () => {
  const { d, p } = auftrag();
  const pos = structuredClone(p.positionen);
  pos[1].sollH += 5;                                                           // geplant 60, verkauft 55
  assert.equal(verkaufteStunden(d, p, pos), 55);
  pos.push({ nr: 'N1', bezeichnung: 'Nachtrag', sollH: 5, typ: 'nachtrag', status: 'verguetet' });
  assert.equal(verkaufteStunden(d, p, pos), 60);                               // jetzt gedeckt
  pos.push({ nr: 'N2', bezeichnung: 'Kulanz', sollH: 3, typ: 'nachtrag', status: 'unverguetet' });
  pos.push({ nr: '3', bezeichnung: 'Neu ohne Angebot', sollH: 2 });
  assert.equal(verkaufteStunden(d, p, pos), 60);                               // nicht vergütet und ohne Angebot zählt nicht
  pos[0].status = 'abgelehnt';
  assert.equal(verkaufteStunden(d, p, pos), 38);                               // 33 h aus B + 5 h Nachtrag
});

test('Herkunft der verkauften Stunden: Angebot, Nachträge und Regie getrennt', () => {
  const { d, p } = auftrag();
  const pos = structuredClone(p.positionen);
  pos.push({ nr: 'N1', sollH: 12, typ: 'nachtrag', status: 'verguetet' });
  pos.push({ nr: 'R1', sollH: 8, typ: 'regie' });                              // ohne Status = vergütet
  pos.push({ nr: 'R2', sollH: 4, typ: 'regie', status: 'unverguetet' });       // zählt nicht
  assert.deepEqual(verkaufteStundenTeile(d, p, pos), { angebot: 55, nachtrag: 12, regie: 8, summe: 75 });
  assert.equal(verkaufteStunden(d, p, pos), 75);                               // Summe = Teile
  assert.equal(verkaufteStundenTeile(leereDaten(), { positionen: [] }), null);
});

test('Ohne Angebot gibt es keine verkauften Stunden', () => {
  const d = leereDaten();
  assert.equal(verkaufteStunden(d, { id: 'x', positionen: [{ nr: '1', sollH: 4 }] }), null);
});

test('Uhrzeiten und gemessene Zeit in Worten', () => {
  assert.equal(minutenAus('08:52'), 532);
  assert.equal(minutenAus('24:00'), 1440);
  assert.equal(minutenAus('8:5'), null);
  assert.equal(minutenAus('10:61'), null);
  assert.equal(dauerWorte(83), '1 h 23 min');
  assert.equal(dauerWorte(60), '1 h');
  assert.equal(dauerWorte(7), '7 min');
});

test('Zeiteintrag bearbeiten: Stunden neu gerundet, abgerechnete bleiben gesperrt', () => {
  const d = leereDaten();
  d.projekte.push({ id: 'p', nr: '26-001', name: 'Test', kunde: '', art: '', status: 'laeuft', start: '', deadline: '', prioritaet: 2, schaetzungH: 10, puffer: 0, positionen: [{ nr: '1', bezeichnung: 'A', sollH: 10 }], farbe: '#445F6E' });
  d.zeiteintraege.push({ id: 'z', datum: '2026-11-21', projektId: 'p', positionNr: null, stunden: 1.5, notiz: '', von: '08:52', bis: '10:15', quelle: 'timer' });
  assert.equal(eintragAendern(d, 'z', { von: '08:52', bis: '10:30', positionNr: '1', notiz: ' Abstimmung ' }), null);
  assert.deepEqual((({ von, bis, stunden, positionNr, notiz }) => ({ von, bis, stunden, positionNr, notiz }))(d.zeiteintraege[0]),
    { von: '08:52', bis: '10:30', stunden: 1.75, positionNr: '1', notiz: 'Abstimmung' });      // 98 min auf 15 min gerundet
  assert.equal(eintragAendern(d, 'z', { von: '09:00', bis: '11:00' }), null);
  assert.equal(d.zeiteintraege[0].stunden, 2);
  assert.equal(d.zeiteintraege[0].positionNr, null);
  assert.match(eintragAendern(d, 'z', { von: '11:00', bis: '10:00' }), /bis muss nach von/);
  d.zeiteintraege[0].rechnungId = 'r';
  assert.match(eintragAendern(d, 'z', { von: '09:00', bis: '12:00' }), /abgerechnet/);
  assert.equal(d.zeiteintraege[0].stunden, 2);
  assert.ok(pruefeDaten(d).ok, pruefeDaten(d).fehler.join(' '));
});
