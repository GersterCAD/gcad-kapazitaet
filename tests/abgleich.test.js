// Tests für den Abgleich zwischen Geräten (Drei-Wege-Zusammenführung).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zusammenfuehren, konflikteLoesen, unterschiede } from '../js/kern/abgleich.js';
import { beispielDaten } from '../js/kern/beispiel.js';

const kopie = (x) => structuredClone(x);

test('Änderungen an verschiedenen Einträgen werden zusammengeführt', () => {
  const basis = beispielDaten();
  const lokal = kopie(basis), entfernt = kopie(basis);
  lokal.projekte[0].deadline = '2026-11-25';                       // hier: Deadline geändert
  entfernt.projekte[1].puffer = 15;                                 // dort: anderes Projekt geändert
  entfernt.zeiteintraege.push({ id: 'neu', datum: '2026-10-28', projektId: basis.projekte[1].id, positionNr: '2', stunden: 2, notiz: '' });
  lokal.meilensteine = lokal.meilensteine.filter((m) => m.id !== basis.meilensteine[0].id); // hier gelöscht
  entfernt.einstellungen.warnWochen = 4;

  const { daten, konflikte } = zusammenfuehren(basis, lokal, entfernt);
  assert.equal(konflikte.length, 0);
  assert.equal(daten.projekte[0].deadline, '2026-11-25');
  assert.equal(daten.projekte[1].puffer, 15);
  assert.ok(daten.zeiteintraege.some((z) => z.id === 'neu'));
  assert.ok(!daten.meilensteine.some((m) => m.id === basis.meilensteine[0].id));
  assert.equal(daten.einstellungen.warnWochen, 4);
});

test('Gleicher Eintrag auf beiden Geräten verschieden geändert → Konflikt, Entscheidung pro Eintrag', () => {
  const basis = beispielDaten();
  const lokal = kopie(basis), entfernt = kopie(basis);
  lokal.projekte[0].deadline = '2026-11-25';
  entfernt.projekte[0].deadline = '2026-11-27';
  entfernt.projekte[0].schaetzungH = 50;
  lokal.einstellungen.regeltagH = 7;
  entfernt.einstellungen.regeltagH = 9;

  const erg = zusammenfuehren(basis, lokal, entfernt);
  assert.deepEqual(erg.konflikte.map((k) => k.bereich), ['einstellungen', 'projekte']);
  const p = erg.konflikte.find((k) => k.bereich === 'projekte');
  assert.equal(p.titel, 'Kanzlei Muster · Empfang');
  assert.deepEqual(unterschiede(p), [{ feld: 'Schätzung', lokal: '42', entfernt: '50' }, { feld: 'Deadline', lokal: '2026-11-25', entfernt: '2026-11-27' }]);

  const daten = konflikteLoesen(erg, { [p.schluessel]: 'entfernt' });
  assert.equal(daten.projekte[0].deadline, '2026-11-27');
  assert.equal(daten.einstellungen.regeltagH, 7); // ohne Wahl: dieses Gerät
});

test('Hier gelöscht, dort geändert → Konflikt; gelöscht lassen oder wiederherstellen', () => {
  const basis = beispielDaten();
  const lokal = kopie(basis), entfernt = kopie(basis);
  const id = basis.blockzeiten[0].id;
  lokal.blockzeiten = lokal.blockzeiten.filter((b) => b.id !== id);
  entfernt.blockzeiten[0].stundenProWoche = 5;
  const erg = zusammenfuehren(basis, lokal, entfernt);
  assert.equal(erg.konflikte.length, 1);
  assert.deepEqual(unterschiede(erg.konflikte[0]), [{ feld: 'Eintrag', lokal: 'gelöscht', entfernt: 'geändert' }]);
  assert.ok(!konflikteLoesen(erg, {}).blockzeiten.some((b) => b.id === id));
  assert.equal(konflikteLoesen(erg, { [erg.konflikte[0].schluessel]: 'entfernt' }).blockzeiten.find((b) => b.id === id).stundenProWoche, 5);
});

test('Erster Abgleich ohne Basis: Einträge beider Geräte bleiben erhalten', () => {
  const a = beispielDaten(), b = beispielDaten(); // verschiedene IDs
  const { daten, konflikte } = zusammenfuehren(null, a, b);
  assert.equal(konflikte.length, 0);
  assert.equal(daten.projekte.length, a.projekte.length + b.projekte.length);
});
