// Tests für die Rechnung aus dem Kalkulator: Aufgaben-Typen, Gewinn, Rabatt, Umstellung bestehender Angebote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leereDaten, pruefeDaten, SCHEMA_VERSION } from '../js/kern/daten.js';
import {
  neuesAngebot, neuePosition, summen, positionsBetrag, geplantH, grundVon, zulagenListe, angebotAnnehmen, STANDARD_GEWINN,
  aufgabenAn, aufgabenAus, grundAusAufgaben, aufgabenTypenAbgleichen, lexwareAngebot, PREIS_HINWEIS,
} from '../js/kern/angebot.js';
import { zusammenfuehren } from '../js/kern/abgleich.js';

const AUFGABEN = [[6, 4, 3, 2], [4, 2, 2, 2], [2, 0, 1, 1]];
const TYPEN = ['zeichnung', 'symbol', 'layout', 'export'];

/** Prüfrechnung aus der Anweisung: 3 Positionen, 58 €/h, Kalk. Risiko aus */
function beispiel(gewinn = 10) {
  const d = leereDaten();
  const a = neuesAngebot(d, '2026-11-09');
  a.stundensatz = 58;
  a.gewinnProzent = gewinn;
  a.positionen = AUFGABEN.map((mengen, i) => neuePosition({
    bezeichnung: `Position ${i + 1}`, aufgaben: mengen.map((menge, j) => ({ typId: TYPEN[j], menge })),
  }));
  a.zulagen.find((z) => z.name === 'Kalk. Risiko').an = false;
  d.angebote.push(a);
  return { d, a };
}

test('Pflichttest: Rechenbeispiel aus dem Kalkulator', () => {
  const { d, a } = beispiel();
  const s = summen(d, a);
  assert.equal(s.grundH, 32.5);
  assert.equal(s.pufferH, 12.07);
  assert.equal(s.geplantH, 44.57);
  assert.equal(s.lohnsumme, 2585.06);
  assert.equal(s.gewinn, 258.51);
  assert.equal(s.rabatt, 0);
  assert.equal(s.netto, 2843.57);
  assert.equal(s.entsprichtH, 49.03);
  // Kalkulator-Anteile wären 1.370,74 / 991,60 / 481,22 = 2.843,56: die letzte Position gleicht den Cent aus
  assert.deepEqual(a.positionen.map((p) => positionsBetrag(p, 58, a)), [1370.74, 991.6, 481.23]);
});

test('Stunden einer Position aus den Aufgaben, ohne Aufgaben wie eingetippt', () => {
  const { a } = beispiel();
  assert.equal(grundVon(a.positionen[2], a), 5.5);
  assert.equal(grundVon(neuePosition({ grundH: 7 }), a), 7);
  a.aufgabenTypen.find((t) => t.id === 'export').minuten = 60;     // Typ geändert: Position rechnet mit
  assert.equal(grundVon(a.positionen[2], a), 5);
  a.aufgabenTypen = a.aufgabenTypen.filter((t) => t.id !== 'export'); // Typ gelöscht: zählt nicht mehr
  assert.equal(grundVon(a.positionen[2], a), 4);
});

test('Umschalten Stunden · Aufgaben verliert nichts', () => {
  const { a } = beispiel();
  const p = neuePosition({ grundH: 7 });
  aufgabenAn(p, a);
  assert.equal(p.aufgaben.length, 4);
  assert.equal(grundVon(p, a), 0);
  aufgabenAus(p, a);                                                  // ohne Mengen: die eingetippten Stunden sind wieder da
  assert.equal(p.grundH, 7);
  aufgabenAn(p, a);
  p.aufgaben[0].menge = 2;
  grundAusAufgaben({ positionen: [p], aufgabenTypen: a.aufgabenTypen });
  assert.equal(p.grundH, 2);
  aufgabenAus(p, a);                                                  // mit Mengen: die Summe bleibt, zurück kommen die Mengen
  assert.equal(p.grundH, 2);
  p.grundH = 9;
  aufgabenAn(p, a);
  assert.equal(p.aufgaben[0].menge, 2);
  assert.equal(grundVon(p, a), 2);
});

test('Neue und gelöschte Aufgaben-Typen kommen in den Positionen an', () => {
  const { a } = beispiel();
  const alt = a.aufgabenTypen.map((t) => t.id);
  a.aufgabenTypen = [...a.aufgabenTypen.filter((t) => t.id !== 'export'), { id: 'neu', name: 'Neu', minuten: 30 }];
  aufgabenTypenAbgleichen(a, alt);
  assert.deepEqual(a.positionen[0].aufgaben.map((x) => x.typId), ['zeichnung', 'symbol', 'layout', 'neu']);
  assert.equal(a.positionen[0].aufgaben[0].menge, 6);
});

test('Ohne Aufgaben, Gewinn und Rabatt bleibt alles exakt wie bisher', () => {
  const { d, a } = beispiel(0);
  a.positionen.forEach((p) => { p.grundH = grundVon(p, a); delete p.aufgaben; });
  const s = summen(d, a);
  assert.deepEqual(zulagenListe(a).map((z) => z.h), [1, 1, 0.98, 2.6, 0, 6.5]);
  assert.equal(s.geplantH, 44.58);
  assert.equal(s.netto, 2585.06);
  assert.equal(s.lohnsumme, 2585.06);
  assert.equal(s.gewinn, 0);
  assert.deepEqual(a.positionen.map((p) => positionsBetrag(p, 58, a)), [1246.42, 901.32, 437.32]);
});

test('Mit Aufgaben rechnet auch 0 % Gewinn wie der Kalkulator', () => {
  const { d, a } = beispiel(0);
  const s = summen(d, a);
  assert.equal(s.geplantH, 44.57);
  assert.equal(s.netto, 2585.06);
});

test('Rabatt zieht Stunden × Satz ab, der Preis wird nie negativ', () => {
  const { d, a } = beispiel();
  a.rabattH = 2;
  const s = summen(d, a);
  assert.equal(s.rabatt, 116);
  assert.equal(s.netto, 2727.57);
  assert.equal(s.entsprichtH, 47.03);
  assert.equal(Math.round(a.positionen.reduce((x, p) => x + positionsBetrag(p, 58, a), 0) * 100) / 100, s.netto);
  a.rabattH = 1000;
  assert.equal(summen(d, a).netto, 0);
  assert.equal(positionsBetrag(a.positionen[0], 58, a), 0);
});

test('Gewinn und Rabatt ändern das Soll für die Planung nicht', () => {
  const mit = beispiel(), ohne = beispiel(25);
  ohne.a.rabattH = 3;
  assert.deepEqual(mit.a.positionen.map((p) => geplantH(p, mit.a)), ohne.a.positionen.map((p) => geplantH(p, ohne.a)));
  const id = angebotAnnehmen(mit.d, mit.a.id, { puffer: 0, heute: '2026-11-09' });
  const p = mit.d.projekte.find((x) => x.id === id);
  assert.deepEqual(p.positionen.map((x) => x.preis), [1370.74, 991.6, 481.23]);
  assert.equal(p.positionen[0].sollH, 21.5);                        // 15,67 h Grund + 5,82 h Anteil an den Zulagen
});

test('Zulagen nicht im Preis: Satz × Grund, Gewinn und Rabatt wirken auf diese Summe', () => {
  const { d, a } = beispiel();
  a.pufferImPreis = false;
  const s = summen(d, a);
  assert.equal(s.lohnsumme, 1885);                                  // 32,5 h × 58 €
  assert.equal(s.netto, 2073.5);
  assert.equal(s.geplantH, 44.57);
});

test('Pauschal-Positionen kommen unverändert dazu', () => {
  const { d, a } = beispiel();
  a.positionen.push(neuePosition({ bezeichnung: 'Visualisierung', abrechnung: 'pauschal', pauschalpreis: 500 }));
  assert.equal(summen(d, a).netto, 3343.57);
  assert.equal(positionsBetrag(a.positionen[3], 58, a), 500);
  assert.deepEqual(a.positionen.slice(0, 3).map((p) => positionsBetrag(p, 58, a)), [1370.74, 991.6, 481.23]);
});

test('Neue Angebote bekommen die Vorlage aus den Einstellungen', () => {
  const d = leereDaten();
  assert.equal(neuesAngebot(d, '2026-11-09').gewinnProzent, STANDARD_GEWINN);
  d.einstellungen.angebotGewinnProzent = 15;
  d.einstellungen.angebotAufgabenTypen = [{ id: 'x', name: 'Eigener Typ', minuten: 45 }];
  const a = neuesAngebot(d, '2026-11-09');
  assert.equal(a.gewinnProzent, 15);
  assert.equal(a.rabattH, 0);
  a.aufgabenTypen[0].minuten = 30;                                  // Kopie: die Vorlage bleibt
  assert.equal(d.einstellungen.angebotAufgabenTypen[0].minuten, 45);
});

test('Lexware: jede Position als 1 × Pauschal, Summe gleich dem Angebotspreis', () => {
  const { d, a } = beispiel();
  a.positionen[1].beschreibung = 'Text zur Position';
  a.positionen.push(neuePosition({ bezeichnung: 'Leer' }));           // 0 € fällt weg
  a.positionen.push(neuePosition({ bezeichnung: 'Visualisierung', abrechnung: 'pauschal', pauschalpreis: 500 }));
  const n = lexwareAngebot(d, a);
  assert.deepEqual(n.zeilen.map((z) => [z.name, z.menge, z.einheit, z.preisNetto]), [
    ['Position 1', 1, 'Pauschal', 1370.74], ['Position 2', 1, 'Pauschal', 991.6], ['Position 3', 1, 'Pauschal', 481.23], ['Visualisierung', 1, 'Pauschal', 500],
  ]);
  assert.equal(n.zeilen[1].beschreibung, 'Text zur Position');
  assert.equal(Math.round(n.zeilen.reduce((s, z) => s + z.preisNetto, 0) * 100) / 100, summen(d, a).netto);
  assert.equal(n.bemerkung, PREIS_HINWEIS);
  assert.ok(!JSON.stringify(n).includes('Gewinn'));
});

test('Lexware: Fußtext und Zahlungsbedingungen bleiben, der Hinweis kommt nur einmal', () => {
  const { d, a } = beispiel();
  a.fusstext = 'Gruß'; a.zahlungsbedingungen = '14 Tage';
  assert.equal(lexwareAngebot(d, a).bemerkung, `Gruß\n\n14 Tage\n\n${PREIS_HINWEIS}`);
  a.fusstext = `Danke. ${PREIS_HINWEIS}`; a.zahlungsbedingungen = '';
  assert.equal(lexwareAngebot(d, a).bemerkung, `Danke. ${PREIS_HINWEIS}`);
});

test('Lexware: auch alte Angebote gehen als Pauschal-Zeilen mit unverändertem Betrag', () => {
  const alt = altStand();
  const a = alt.angebote[0];
  const n = lexwareAngebot(alt, a);
  assert.deepEqual(n.zeilen.map((z) => [z.menge, z.einheit, z.preisNetto]), [[1, 'Pauschal', summen(alt, a).netto]]);
});

function altStand() {
  const d = leereDaten();
  d.schemaVersion = 1;
  delete d.einstellungen.angebotAufgabenTypen;
  delete d.einstellungen.angebotGewinnProzent;
  d.angebote.push({
    id: 'a1', nummer: 'AN 26-001', datum: '2026-10-01', gueltigBis: '2026-10-31', kunde: 'Muster', projektname: 'Test', art: '', status: 'entwurf',
    stundensatz: 58, pufferImPreis: true, kopftext: '', fusstext: '', zahlungsbedingungen: '', projektId: null, angenommenAm: null, lexwareId: null,
    zulagen: [{ id: 'z', name: 'Rückläufer', art: 'prozent', wert: 20, an: true }],
    positionen: [{ id: 'p1', bezeichnung: 'A', beschreibung: '', grundH: 12.3, abrechnung: 'stunden', pauschalpreis: null }],
  });
  return d;
}

test('Umstellung: bestehende Angebote behalten ihren Betrag', () => {
  const alt = altStand();
  const vorher = summen(alt, alt.angebote[0]).netto;
  const p = pruefeDaten(alt);
  assert.ok(p.ok, p.fehler.join(' '));
  assert.equal(p.daten.schemaVersion, SCHEMA_VERSION);
  const a = p.daten.angebote[0];
  assert.equal(a.gewinnProzent, 0);
  assert.equal(a.rabattH, 0);
  assert.equal(a.aufgabenTypen.length, 4);
  assert.equal(summen(p.daten, a).netto, vorher);
  assert.equal(p.daten.einstellungen.angebotGewinnProzent, STANDARD_GEWINN);
});

test('Umstellung auf zwei Geräten gibt keinen Konflikt im Abgleich', () => {
  const basis = pruefeDaten(altStand()).daten, lokal = pruefeDaten(altStand()).daten, entfernt = pruefeDaten(altStand()).daten;
  assert.deepEqual(lokal, entfernt);
  assert.equal(zusammenfuehren(altStand(), lokal, entfernt).konflikte.length, 0);
  assert.equal(zusammenfuehren(basis, lokal, entfernt).konflikte.length, 0);
});

test('Prüfung lehnt kaputte Werte ab', () => {
  const { d, a } = beispiel();
  assert.ok(pruefeDaten(d).ok, pruefeDaten(d).fehler.join(' '));
  a.gewinnProzent = 'viel';
  a.positionen[0].aufgaben[0].menge = -1;
  a.aufgabenTypen[0].minuten = null;
  const r = pruefeDaten(d);
  assert.equal(r.ok, false);
  assert.equal(r.fehler.length, 3);
});
