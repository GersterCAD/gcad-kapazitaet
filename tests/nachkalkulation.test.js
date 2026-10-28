// Tests für die Nachkalkulation (Formeln wie im Werkzeug „Nachkalk“).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leereDaten, pruefeDaten } from '../js/kern/daten.js';
import { nachkalkulation, nachkalkUebersicht, ampel, pufferHinweis } from '../js/kern/nachkalkulation.js';

function daten() {
  const d = leereDaten();
  d.einstellungen.nachkalk = { zielSatz: 60, selbstkosten: 30, jahresstunden: 1000, kmSatz: 0.3 };
  // Pauschal 3.000 €: Pos. 1 2.000 €, Pos. 2 1.000 €, Nachtrag nicht vergütet, eine abgelehnte Position
  d.projekte.push({ id: 'p', name: 'Bar', kunde: 'Gasthaus', art: 'Werkplanung', status: 'abgeschlossen', schaetzungH: 40, puffer: 0, prioritaet: 2,
    abrechnungsart: 'pauschal', pauschalpreis: 3000, positionen: [
      { nr: '1', bezeichnung: 'Theke', sollH: 25, preis: 2000 },
      { nr: '2', bezeichnung: 'Garderobe', sollH: 15, preis: 1000 },
      { nr: '3', bezeichnung: 'Zusatz', sollH: 0, preis: 300, typ: 'nachtrag', status: 'unverguetet' },
      { nr: '4', bezeichnung: 'Weg', sollH: 5, preis: 500, status: 'abgelehnt' },
    ] });
  const z = (id, positionNr, stunden) => d.zeiteintraege.push({ id, datum: '2026-10-20', projektId: 'p', positionNr, stunden, notiz: '' });
  z('a', '1', 20); z('b', '3', 4); z('c', null, 6); z('d', '4', 9);
  d.kosten.push(
    { id: 'k1', projektId: 'p', art: 'material', bez: 'Plots', betrag: 100, positionNr: '1', weiter: false },
    { id: 'k2', projektId: 'p', art: 'reise', bez: 'Fahrt 3 × 100 km', km: 300, betrag: 90, positionNr: null, weiter: false },
  );
  return d;
}

test('Ist-Stunden: gebucht je Position, ohne Position nach Preisanteil auf Positionen ohne Buchung; abgelehnt zählt nicht', () => {
  const { positionen, T } = nachkalkulation(daten(), 'p');
  assert.deepEqual(positionen.map((x) => [x.nr, x.istH, x.erloes]), [['1', 20, 2000], ['2', 6, 1000], ['3', 4, 0]]);
  assert.equal(T.istH, 30);
  assert.equal(T.sollH, 40);
  assert.equal(T.abwPct, -25);
});

test('Kennzahlen wie im Werkzeug: DB, Ist-Satz, Gewinn, Break-even, Kapazitätsbindung, Ampel', () => {
  const { positionen, T } = nachkalkulation(daten(), 'p');
  assert.equal(T.erloes, 3000);
  assert.equal(T.kosten, 190);
  assert.equal(T.db, 2810);
  assert.equal(T.satz, 93.67);                   // 2.810 / 30
  assert.equal(T.satzBrutto, 100);
  assert.equal(T.gewinn, 1910);                  // 2.810 − 30 × 30
  assert.equal(T.breakH, 93.67);
  assert.equal(T.kapaPct, 3);
  assert.equal(T.ampel, 'gruen');
  // Fahrt ohne Position nach Erlösanteil umgelegt: Pos. 1 trägt 100 + 60, Pos. 2 trägt 30
  assert.deepEqual(positionen.map((x) => Math.round(x.kosten)), [160, 30, 0]);
  assert.equal(positionen[2].ampel, 'rot');      // nicht vergütet: Stunden ohne Erlös
});

test('Ampel: grün ab Ziel, gelb deckt Selbstkosten, rot darunter', () => {
  assert.equal(ampel(65, 60, 30), 'gruen');
  assert.equal(ampel(45, 60, 30), 'gelb');
  assert.equal(ampel(20, 60, 30), 'rot');
  assert.equal(ampel(NaN, 60, 30), '');
});

test('Stunden-Projekt: Erlös = Stunden × Satz (vorläufig), Puffer-Hinweis, Übersicht nach Art', () => {
  const d = daten();
  d.kunden.push({ id: 'k', name: 'Muster', stundensatz: 70 });
  d.projekte.push({ id: 'q', name: 'Std', kunde: 'Muster', art: 'Entwurf', status: 'abgeschlossen', schaetzungH: 10, puffer: 0, prioritaet: 2, abrechnungsart: 'stunden', positionen: [] });
  d.zeiteintraege.push({ id: 'e', datum: '2026-10-21', projektId: 'q', positionNr: null, stunden: 12, notiz: '' });
  const n = nachkalkulation(d, 'q');
  assert.equal(n.T.erloes, 840);
  assert.equal(n.T.nachStunden, true);
  assert.equal(n.T.vorlaeufig, false);
  assert.equal(n.T.ziel, 70);
  const h = pufferHinweis(d, 'q', n);
  assert.deepEqual([h.puffer, h.stunden, h.preis], [20, 12, 840]);
  const u = nachkalkUebersicht(d, { jahr: '2026' });
  assert.equal(u.zeilen.length, 2);
  assert.equal(u.nachArt.length, 2);
  assert.equal(u.stunden.satz, 70);
  assert.ok(pruefeDaten(d).ok, pruefeDaten(d).fehler.join(' '));
});
