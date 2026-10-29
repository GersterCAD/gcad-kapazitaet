// Tests für Teil 3: Was wäre wenn / Urlaub finden, Termin vorbei → buchen, Jahresziel, Kurzbefehle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leereDaten, pruefeDaten } from '../js/kern/daten.js';
import { vergleichen, urlaubFinden, arbeitstage } from '../js/kern/planspiel.js';
import { offeneTermine, terminBuchen, terminNichtBuchen, projektVorschlag, kalenderFragt } from '../js/kern/terminbuchung.js';
import { jahresStand, jahresAnteil } from '../js/kern/jahresziel.js';

function daten() {
  const d = leereDaten();
  d.projekte.push({ id: 'p', nr: '26-044', name: 'Projekt Frankfurt', kunde: 'Beispiel Bau GmbH', status: 'auftrag', schaetzungH: 130, puffer: 0, prioritaet: 2, start: '2026-11-02', deadline: '2026-11-27', positionen: [] });
  d.projekte.push({ id: 'a', name: 'Café', kunde: 'Rösterei', status: 'anfrage', schaetzungH: 30, puffer: 0, prioritaet: 2, start: '2026-11-02', deadline: '2026-11-20', positionen: [] });
  return d;
}

test('Was wäre wenn: Urlaub im Projektzeitraum macht Frankfurt knapp, später nicht', () => {
  const d = daten();
  const heute = '2026-10-29';
  const v = vergleichen(d, { art: 'urlaub', von: '2026-11-09', bis: '2026-11-20' }, { heute });
  const f = v.zeilen.find((z) => z.projekt.id === 'p');
  assert.equal(f.vorher.status, 'imPlan');
  assert.notEqual(f.nachher.status, 'imPlan');
  assert.equal(v.schlechter, 1);
  assert.equal(d.abwesenheiten.length, 0, 'Original unverändert');
  assert.equal(vergleichen(d, { art: 'urlaub', von: '2026-12-07', bis: '2026-12-11' }, { heute }).schlechter, 0);
  assert.equal(arbeitstage('2026-12-21', '2026-12-31'), 8, 'ohne 25.12.');
  const z = vergleichen(d, { art: 'zusagen', projektId: 'a' }, { heute });
  assert.ok(z.zeilen.find((x) => x.projekt.id === 'a').neu);
});

test('Urlaub finden: erste freie Woche liegt nach der Deadline', () => {
  const d = daten();
  const liste = urlaubFinden(d, { wochenAnzahl: 1, suchWochen: 8, heute: '2026-10-29' });
  const erste = liste.find((x) => x.frei);
  assert.equal(erste.von, '2026-11-30');
  assert.ok(liste.filter((x) => x.von < '2026-11-23').every((x) => !x.frei));
});

test('Termin vorbei: nur fragender Kalender, Vorschlag über den Namen, buchen und nicht buchen', () => {
  const d = daten();
  const t = (uid, kalender, titel, start, ende) => ({ uid, kalender, titel, ganztaegig: false, start, ende });
  const termine = [
    t('1', 'Gerster CAD', 'Abstimmung Frankfurt', '2026-10-29T08:00:00Z', '2026-10-29T09:30:00Z'),
    t('2', 'Privat', 'Sport', '2026-10-29T06:00:00Z', '2026-10-29T07:00:00Z'),
    t('3', 'Gerster CAD', 'Später', '2026-10-29T15:00:00Z', '2026-10-29T16:00:00Z'),
  ];
  const jetzt = new Date('2026-10-29T12:00:00Z');
  assert.ok(kalenderFragt(d, 'Gerster CAD'));
  assert.equal(kalenderFragt(d, 'Privat'), false);
  const o = offeneTermine(d, termine, jetzt);
  assert.deepEqual(o.map((x) => [x.termin.uid, x.stunden, x.vorschlag?.id]), [['1', 1.5, 'p']]);
  assert.equal(projektVorschlag(d, 'Steuerberater'), null);
  terminBuchen(d, termine[0], 'p', 1.5);
  assert.equal(d.zeiteintraege[0].terminUid, '1');
  assert.equal(offeneTermine(d, termine, jetzt).length, 0);
  d.einstellungen.kalender.find((k) => k.name === 'Privat').nachfragen = true;
  d.einstellungen.kalender.find((k) => k.name === 'Privat').regel = 'alle';
  assert.equal(offeneTermine(d, termine, jetzt).length, 1);
  terminNichtBuchen(d, '2');
  assert.equal(offeneTermine(d, termine, jetzt).length, 0);
  assert.ok(pruefeDaten(d).ok, pruefeDaten(d).fehler.join(' '));
});

test('Jahresziel: Umsatz aus Lexware und App ohne Doppelte, anteilig, Ampel', () => {
  const d = daten();
  d.einstellungen.jahresziel = { umsatz: 100000, stunden: 1200 };
  d.rechnungen.push({ id: 'r1', projektId: 'p', art: 'stunden', erstellt: '2026-03-01', netto: 1000, status: 'erledigt', zeilen: [], eintraege: [] });
  d.rechnungen.push({ id: 'r2', projektId: 'p', art: 'stunden', erstellt: '2026-04-01', netto: 500, status: 'uebertragen', lexwareId: 'lx', zeilen: [], eintraege: [] });
  d.rechnungen.push({ id: 'r3', projektId: 'p', art: 'stunden', erstellt: '2026-05-01', netto: 300, status: 'entwurf', zeilen: [], eintraege: [] });
  const liste = [{ id: 'lx', status: 'paid', datum: '2026-04-01', gesamt: 595 }, { id: 'y', status: 'open', datum: '2026-06-01', gesamt: 119000 / 2 }, { id: 'z', status: 'voided', datum: '2026-06-01', gesamt: 1190 }];
  d.zeiteintraege.push({ id: 'e', datum: '2026-05-04', projektId: 'p', positionNr: null, stunden: 900, notiz: '', abgerechnet: '2026-06-01' });
  const j = jahresStand(d, '2026-07-02', liste);
  assert.equal(j.umsatz.ist, 51500);
  assert.ok(Math.abs(jahresAnteil('2026-07-02') - 0.5) < 0.01);
  assert.equal(j.umsatz.ampel, 'gruen');
  assert.equal(j.stunden.ampel, 'gruen');
  assert.equal(jahresStand(d, '2026-12-31', liste).umsatz.ampel, 'rot');
  assert.equal(j.stunden.abgerechnet, 900);
});
