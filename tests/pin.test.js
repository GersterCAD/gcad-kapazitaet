// Tests für die App-Sperre: Verschlüsselung, Sperrzeiten, Wartezeit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinGueltig, neuerTresor, schluesselAus, tresorOeffnen, tresorSchreiben, sperreFaellig, wartezeitSek } from '../js/kern/pin.js';

const TOKEN = JSON.stringify({ token: 'github_pat_nur_ein_test' });

test('PIN: sechs bis zwölf Ziffern', () => {
  assert.ok(pinGueltig('123456'));
  assert.ok(pinGueltig('123456789012'));
  assert.ok(!pinGueltig('12345'));
  assert.ok(!pinGueltig('1234567890123'));
  assert.ok(!pinGueltig('abcdef'));
  assert.ok(!pinGueltig(undefined));
});

test('Mit der richtigen PIN kommt der Token zurück, im Tresor steht er nicht', async () => {
  const { schluessel, tresor } = await neuerTresor('482913', TOKEN);
  assert.ok(!JSON.stringify(tresor).includes('github_pat'));
  assert.equal(tresor.iter, 600000);
  assert.equal(await tresorOeffnen(schluessel, tresor), TOKEN);
  assert.equal(await tresorOeffnen(await schluesselAus('482913', tresor), tresor), TOKEN);
});

test('Falsche PIN öffnet den Tresor nicht, der Schlüssel ist nicht auslesbar', async () => {
  const { schluessel, tresor } = await neuerTresor('482913', TOKEN, 1000);
  await assert.rejects(async () => tresorOeffnen(await schluesselAus('482914', tresor), tresor));
  await assert.rejects(() => globalThis.crypto.subtle.exportKey('raw', schluessel));
});

test('Veränderter Tresor wird erkannt, jedes Schreiben gibt einen neuen Inhalt', async () => {
  const { schluessel, tresor } = await neuerTresor('482913', TOKEN, 1000);
  const neu = await tresorSchreiben(schluessel, tresor, TOKEN);
  assert.notEqual(neu.iv, tresor.iv);
  assert.equal(neu.salz, tresor.salz);
  const d = Uint8Array.from(atob(neu.daten), (c) => c.charCodeAt(0));
  d[0] ^= 1;
  await assert.rejects(() => tresorOeffnen(schluessel, { ...neu, daten: btoa(String.fromCharCode(...d)) }));
});

test('Sperre: nach der Zeit ohne Nutzung und spätestens am nächsten Tag', () => {
  const m = 60000;
  const basis = { jetzt: 100 * m, minuten: 30, tag: '2026-11-10', heute: '2026-11-10' };
  assert.equal(sperreFaellig({ ...basis, letzteNutzung: 71 * m }), false);
  assert.equal(sperreFaellig({ ...basis, letzteNutzung: 70 * m }), true);
  assert.equal(sperreFaellig({ ...basis, letzteNutzung: 99 * m, heute: '2026-11-11' }), true);
  assert.equal(sperreFaellig({ ...basis, minuten: 5, letzteNutzung: 96 * m }), false);
});

test('Wartezeit erst ab dem fünften Fehlversuch, mit Obergrenze', () => {
  assert.deepEqual([1, 4, 5, 6, 7, 20].map(wartezeitSek), [0, 0, 30, 60, 120, 900]);
});
