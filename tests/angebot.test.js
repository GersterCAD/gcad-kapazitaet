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
    neuePosition({ bezeichnung: 'Aufmaß', grundH: 6 }),
    neuePosition({ bezeichnung: 'Konzept', grundH: 14 }),
    neuePosition({ bezeichnung: 'Visualisierung', grundH: 10, abrechnung: 'pauschal', pauschalpreis: 850 }),
    neuePosition({ bezeichnung: 'Änderungen', grundH: 10 }),
  ];
  // 10 % auf die Grundstunden und 2 h fest, eine Zulage ausgeschaltet
  a.zulagen = [
    { id: 'z1', name: 'Auftrag anlegen', art: 'fest', wert: 2, an: true },
    { id: 'z2', name: 'Rückläufer', art: 'prozent', wert: 10, an: true },
    { id: 'z3', name: 'Risiko', art: 'prozent', wert: 5, an: false },
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

test('Zulagen wie im Kalkulator: fest und Prozent, schaltbar, nach Stundenanteil verteilt', async () => {
  const { d, a } = daten();
  const { zulagenListe, zulagenGesamt, STANDARD_ZULAGEN } = await import('../js/kern/angebot.js');
  assert.deepEqual(zulagenListe(a).map((z) => z.h), [2, 4, 0]);   // 10 % von 40 h, Risiko aus
  assert.equal(zulagenGesamt(a), 6);
  assert.equal(pufferH(a.positionen[0], a), 0.9);                   // 6/40 von 6 h
  assert.equal(geplantH(a.positionen[1], a), 16.1);
  const s = summen(d, a);
  assert.equal(s.quelle, 'kunde');
  assert.equal(s.grundH, 40);
  assert.equal(s.pufferH, 6);
  assert.equal(s.geplantH, 46);
  assert.equal(s.pufferProzent, 15);
  // Stunden mit Zulagen: (6,9 + 16,1 + 11,5) × 75 = 2.587,50 + 850 pauschal
  assert.equal(s.netto, 3437.5);
  a.pufferImPreis = false;                                           // nur Grundstunden berechnen
  assert.equal(summen(d, a).netto, 30 * 75 + 850);
  a.stundensatz = 80;
  assert.equal(summen(d, a).quelle, 'angebot');
  // Neue Angebote bekommen die Vorlage aus den Einstellungen (Standard = Kalkulator: 2 h + 36 %)
  const neu = neuesAngebot(d, '2026-10-28');
  assert.equal(neu.zulagen.length, STANDARD_ZULAGEN.length);
  neu.positionen[0].grundH = 10;
  assert.equal(zulagenGesamt(neu), 5.6);
});

test('Ältere Angebote mit Puffer je Position werden umgestellt', async () => {
  const { zulagenUmstellen, zulagenGesamt } = await import('../js/kern/angebot.js');
  const a = { positionen: [{ grundH: 10, puffer: 10, pufferEinheit: '%' }, { grundH: 20, puffer: 10, pufferEinheit: '%' }] };
  zulagenUmstellen(a);
  assert.deepEqual([a.zulagen[0].art, a.zulagen[0].wert], ['prozent', 10]);
  const b = { positionen: [{ grundH: 10, puffer: 20, pufferEinheit: '%' }, { grundH: 10, puffer: 1, pufferEinheit: 'h' }] };
  zulagenUmstellen(b);
  assert.equal(zulagenGesamt(b), 3);
  assert.equal(b.positionen[0].puffer, undefined);
});

test('Annehmen: Projekt mit geplanten Stunden als Soll, Planungspuffer obendrauf, Rückgängig', () => {
  const { d, a } = daten();
  const ids = a.positionen.filter((p) => p.bezeichnung !== 'Änderungen').map((p) => p.id);
  const pid = angebotAnnehmen(d, a.id, { positionIds: ids, start: '2026-11-30', deadline: '2026-12-18', puffer: 10, heute: '2026-10-28' });
  const p = d.projekte.find((x) => x.id === pid);
  assert.equal(p.status, 'auftrag');
  assert.deepEqual(p.positionen.map((x) => [x.nr, x.sollH]), [['1', 6.9], ['2', 16.1], ['3', 11.5]]);
  assert.equal(p.schaetzungH, 34.5);
  assert.equal(soll(p), 38);                         // zweiter Puffer: 10 % Planung (34,5 × 1,1 = 37,95)
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
