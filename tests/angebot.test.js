// Tests für Angebote: Puffer, Summen, Nummern, Annahme als Auftrag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leereDaten, pruefeDaten, soll } from '../js/kern/daten.js';
import {
  neuesAngebot, neuePosition, naechsteNummer, pufferH, geplantH, summen, angebotAnnehmen, annahmeZuruecknehmen, angebotsKennzahlen,
} from '../js/kern/angebot.js';

function daten() {
  const d = leereDaten();
  d.kunden.push({ id: 'k', name: 'Café Beispiel', stundensatz: 75 });
  const a = neuesAngebot(d, '2026-10-28');
  Object.assign(a, { kunde: 'Café Beispiel', projektname: 'Entwurfsplanung Café', art: 'Entwurf' });
  a.positionen = [
    neuePosition({ bezeichnung: 'Aufmaß', grundH: 6, puffer: 10 }),
    neuePosition({ bezeichnung: 'Konzept', grundH: 14, puffer: 10 }),
    neuePosition({ bezeichnung: 'Visualisierung', grundH: 10, puffer: 10, abrechnung: 'pauschal', pauschalpreis: 850 }),
    neuePosition({ bezeichnung: 'Änderungen', grundH: 6, puffer: 2, pufferEinheit: 'h' }),
  ];
  d.angebote.push(a);
  return { d, a };
}

test('Nummern laufen je Jahr', () => {
  const { d } = daten();
  assert.equal(d.angebote[0].nummer, 'AN 26-001');
  assert.equal(naechsteNummer(d, '2026-11-02'), 'AN 26-002');
  assert.equal(naechsteNummer(d, '2027-01-04'), 'AN 27-001');
});

test('Puffer in % oder h, geplante Stunden, Summen mit Satz vom Kunden', () => {
  const { d, a } = daten();
  assert.equal(pufferH(a.positionen[0]), 0.6);
  assert.equal(geplantH(a.positionen[3]), 8);
  const s = summen(d, a);
  assert.equal(s.quelle, 'kunde');
  assert.equal(s.grundH, 36);
  assert.equal(s.pufferH, 5);                        // 0,6 + 1,4 + 1 + 2
  assert.equal(s.geplantH, 41);
  // Stunden mit Puffer: (6,6 + 15,4 + 8) × 75 = 2.250 + 850 pauschal
  assert.equal(s.netto, 3100);
  assert.equal(s.mwst, 589);
  assert.equal(s.brutto, 3689);
  a.pufferImPreis = false;                           // nur Grundstunden berechnen
  assert.equal(summen(d, a).netto, 26 * 75 + 850);
  a.stundensatz = 80;
  assert.equal(summen(d, a).quelle, 'angebot');
});

test('Annehmen: Projekt mit geplanten Stunden als Soll, Planungspuffer obendrauf, Rückgängig', () => {
  const { d, a } = daten();
  const ids = a.positionen.filter((p) => p.bezeichnung !== 'Änderungen').map((p) => p.id);
  const pid = angebotAnnehmen(d, a.id, { positionIds: ids, start: '2026-11-30', deadline: '2026-12-18', puffer: 10, heute: '2026-10-28' });
  const p = d.projekte.find((x) => x.id === pid);
  assert.equal(p.status, 'auftrag');
  assert.deepEqual(p.positionen.map((x) => [x.nr, x.sollH]), [['1', 6.6], ['2', 15.4], ['3', 11]]);
  assert.equal(p.schaetzungH, 33);
  assert.equal(soll(p), 36.3);                       // zweiter Puffer: 10 % Planung
  assert.equal(p.abrechnungsart, 'stunden');
  assert.equal(d.meilensteine[0].datum, '2026-12-18');
  assert.equal(a.status, 'angenommen');
  assert.ok(pruefeDaten(d).ok, pruefeDaten(d).fehler.join(' '));
  assert.equal(angebotsKennzahlen(d, '2026-10-28').quote, 100);
  assert.equal(annahmeZuruecknehmen(d, a.id), true);
  assert.equal(d.projekte.length, 0);
  assert.equal(d.meilensteine.length, 0);
  assert.equal(a.status, 'entwurf');
});

test('Nur Pauschal-Positionen ergeben ein Pauschalprojekt; mit gebuchter Zeit kein Zurücknehmen', () => {
  const { d, a } = daten();
  const pid = angebotAnnehmen(d, a.id, { positionIds: [a.positionen[2].id], puffer: 0, heute: '2026-10-28' });
  const p = d.projekte.find((x) => x.id === pid);
  assert.equal(p.abrechnungsart, 'pauschal');
  assert.equal(p.pauschalpreis, 850);
  d.zeiteintraege.push({ id: 'z', datum: '2026-10-29', projektId: pid, positionNr: '1', stunden: 1, notiz: '' });
  assert.equal(annahmeZuruecknehmen(d, a.id), false);
});

test('Prüfung beim Laden: kaputte Position wird gemeldet', () => {
  const { d, a } = daten();
  a.positionen[0].abrechnung = 'irgendwie';
  const r = pruefeDaten(d);
  assert.equal(r.ok, false);
  assert.match(r.fehler.join(' '), /Abrechnung „irgendwie“/);
});
