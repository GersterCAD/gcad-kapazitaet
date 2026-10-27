// Tests für die Datenstruktur. Start: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leereDaten, pruefeDaten, soll, ist, rest, SCHEMA_VERSION } from '../js/kern/daten.js';
import { beispielDaten } from '../js/kern/beispiel.js';

test('leere Daten sind gültig', () => {
  const p = pruefeDaten(leereDaten());
  assert.equal(p.ok, true, p.fehler.join('\n'));
  assert.equal(p.daten.schemaVersion, SCHEMA_VERSION);
});

test('Beispieldaten sind gültig', () => {
  const p = pruefeDaten(beispielDaten());
  assert.equal(p.ok, true, p.fehler.join('\n'));
});

test('Beispieldaten: Soll und Ist wie im Entwurf', () => {
  const d = beispielDaten();
  const nach = (n) => d.projekte.find((p) => p.name.startsWith(n));
  assert.equal(soll(nach('Kanzlei')), 46.2);
  assert.equal(ist(d, nach('Kanzlei').id), 21);
  assert.equal(ist(d, nach('Projekt Frankfurt').id), 8);
  assert.equal(soll(nach('Café')), 61.6);
  assert.equal(rest(d, nach('Kanzlei')), 46.2 - 21);
});

test('fehlende Listen und Einstellungen werden ergänzt', () => {
  const p = pruefeDaten({ schemaVersion: 1, einstellungen: { regeltagH: 7 } });
  assert.equal(p.ok, true, p.fehler.join('\n'));
  assert.deepEqual(p.daten.projekte, []);
  assert.equal(p.daten.einstellungen.regeltagH, 7);
  assert.equal(p.daten.einstellungen.maxTagH, 12);
});

test('Original bleibt beim Prüfen unverändert', () => {
  const roh = { schemaVersion: 1 };
  pruefeDaten(roh);
  assert.deepEqual(roh, { schemaVersion: 1 });
});

test('kaputte Dateien werden abgelehnt', () => {
  assert.equal(pruefeDaten(null).ok, false);
  assert.equal(pruefeDaten([]).ok, false);
  assert.equal(pruefeDaten({}).ok, false);
  const neuer = pruefeDaten({ schemaVersion: SCHEMA_VERSION + 1 });
  assert.equal(neuer.ok, false);
  assert.match(neuer.fehler[0], /neueren Version/);
});

test('falsche Werte werden gemeldet', () => {
  const d = beispielDaten();
  d.projekte[0].status = 'irgendwas';
  d.projekte[1].puffer = 25;
  d.meilensteine[0].datum = '20.11.2026';
  d.zeiteintraege[0].projektId = 'gibt-es-nicht';
  const p = pruefeDaten(d);
  assert.equal(p.ok, false);
  assert.equal(p.fehler.length, 4, p.fehler.join('\n'));
});
