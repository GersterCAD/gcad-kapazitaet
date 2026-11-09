// Tests für den Import alter Kalkulator-Dateien. Die Beispieldatei enthält nur erfundene Namen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leereDaten, pruefeDaten } from '../js/kern/daten.js';
import { summen, positionsBetrag } from '../js/kern/angebot.js';
import { kalkulatorLesen, angebotAusKalkulator } from '../js/kern/kalkulatorimport.js';

const DATEI = readFileSync(new URL('./beispiel-kalkulation.html', import.meta.url), 'utf8');
const importiere = (s = kalkulatorLesen(DATEI)) => { const d = leereDaten(); const r = angebotAusKalkulator(d, s, '2026-11-09'); d.angebote.push(r.angebot); return { d, ...r }; };

test('Der neueste Stand wird gefunden, auch mit Klammern und Semikolon im Text', () => {
  const s = kalkulatorLesen(DATEI);
  assert.equal(s.projName, 'Testküche; Musterstraße {12}');
  assert.equal(s.projDesc, 'Anführung " und };  im Text');
});

test('Felder werden zugeordnet, das Angebot ist ein Entwurf mit neuer Nummer', () => {
  const { d, angebot: a, hinweise } = importiere();
  assert.deepEqual(hinweise, []);
  assert.equal(a.projektname, 'Testküche; Musterstraße {12}');
  assert.equal(a.kunde, 'Musterbau GmbH');
  assert.equal(a.projektleiter, 'Erika Beispiel');
  assert.equal(a.datum, '2026-09-15');
  assert.equal(a.gueltigBis, '2026-10-15');
  assert.equal(a.status, 'entwurf');
  assert.equal(a.nummer, 'AN 26-001');
  assert.equal(a.stundensatz, 58);
  assert.equal(a.gewinnProzent, 10);
  assert.deepEqual(a.aufgabenTypen.map((t) => [t.id, t.minuten]), [['1', 60], ['2', 10], ['3', 120], ['4', 90]]);
  assert.deepEqual(a.positionen[0].aufgaben[3], { typId: '4', menge: 2 });
  assert.deepEqual(a.zulagen.map((z) => [z.art, z.wert, z.an]), [['fest', 1, true], ['fest', 1, true], ['prozent', 3, true], ['prozent', 8, true], ['prozent', 5, false], ['prozent', 20, true]]);
  const p = pruefeDaten(d);
  assert.ok(p.ok, p.fehler.join(' '));
});

test('Summe nach dem Import wie im Kalkulator', () => {
  const { d, angebot: a } = importiere();
  const s = summen(d, a);
  assert.equal(s.geplantH, 44.57);
  assert.equal(s.netto, 2843.57);
  assert.deepEqual(a.positionen.map((p) => positionsBetrag(p, 58, a)), [1370.74, 991.6, 481.23]);
});

test('Zeilen ohne bekannten Typ zählen wie im Kalkulator 60 Minuten', () => {
  const s = kalkulatorLesen(DATEI);
  s.positions[0].rows.push({ typeId: 99, qty: 2 });
  const { d, angebot: a, hinweise } = importiere(s);
  assert.equal(summen(d, a).grundH, 34.5);
  assert.equal(hinweise.length, 1);
  assert.ok(pruefeDaten(d).ok);
});

test('Fehlende Werte geben Hinweise, Müll wird nicht übernommen', () => {
  const { angebot: a, hinweise } = importiere({
    wage: '', profitPct: 'abc', discountH: -5, projDate: '<img src=x>', projName: { boese: 1 }, __proto__: null,
    taskTypes: [null, { id: 1, name: 5, min: 'x' }], positions: [null, { name: 'P', rows: [null, { typeId: 1, qty: '3' }], script: 'alert(1)' }], zulagen: 'nein',
  });
  assert.equal(a.stundensatz, null);
  assert.equal(a.gewinnProzent, 0);
  assert.equal(a.rabattH, 0);
  assert.equal(a.datum, '2026-11-09');
  assert.equal(a.projektname, '');
  assert.equal(a.positionen.length, 1);
  assert.equal(a.positionen[0].script, undefined);
  assert.deepEqual(a.zulagen, []);
  assert.equal(hinweise.length, 2);
});

test('Unplausible Dateien werden abgelehnt', () => {
  assert.throws(() => kalkulatorLesen('<html>nichts</html>'), /keine Kalkulation/);
  assert.throws(() => kalkulatorLesen('var _s = {"positions": [}; '), /keine Kalkulation/);
  assert.throws(() => kalkulatorLesen('var _s = ${JSON.stringify(state)};'), /keine Kalkulation/);
  assert.throws(() => importiere({ positions: [] }), /keine Positionen/);
  assert.throws(() => importiere({ wage: 99999, positions: [{ rows: [] }] }), /nicht plausibel/);
});

test('Die Datei wird nie ausgeführt', () => {
  globalThis.__kalkulatorLief = false;
  const s = kalkulatorLesen(`<script>globalThis.__kalkulatorLief = true;</script><script>var _s = {"positions":[{"name":"<script>globalThis.__kalkulatorLief = true</script>","rows":[]}]};</script>`);
  const { angebot: a } = importiere(s);
  assert.equal(globalThis.__kalkulatorLief, false);
  assert.match(a.positionen[0].bezeichnung, /<script>/);   // bleibt reiner Text, el() setzt ihn als Text
  delete globalThis.__kalkulatorLief;
});
