// Kunden (A8). Vor allem die Stelle, an der es still falsch werden könnte: die Zuordnung über den Namen.
// Die Fälle zu schluesselform() und finde() sind aus test_kunden.py (90_CAM-Scripts, Stand 22.11.2026) übernommen,
// damit beide Umsetzungen dasselbe tun. Kontakte und Namen sind erfunden – geprüft wird das Verhalten der Suche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leereDaten, pruefeDaten } from '../js/kern/daten.js';
import {
  schluesselform, finde, zuordnen, zuordnungPruefen, verknuepfen, bestaetigen, kontaktIdFuer, kundenListe, belegeVon,
} from '../js/kern/kunden.js';

const K = (id, name, nummer) => ({ id, name, nummer });
const kunde = (name, nummer = '', id = '') => ({ name, nummer, lexwareKontaktId: id });

test('Schlüsselform: was einen Namen ausmacht', () => {
  assert.equal(schluesselform('Ahornfeld GmbH'), schluesselform('Ahornfeld'));
  assert.equal(schluesselform('Muster GmbH & Co. KG'), 'muster');
  assert.equal(schluesselform('Muster e.K.'), 'muster');
  assert.equal(schluesselform('Möbelwerkstätten'), 'moebelwerkstaetten');
  assert.equal(schluesselform('Ahornfeld-Innenausbau, GmbH'), 'ahornfeld innenausbau');
  assert.equal(schluesselform('HOLZWERK'), schluesselform('HolzWerk'));
  assert.equal(schluesselform(''), '');
  assert.equal(schluesselform('GmbH'), '');
  assert.equal(schluesselform('Café'), 'cafe');                                  // Akzent fällt weg wie bei NFKD/ascii
});

const KO = [K('id-a', 'Alpha GmbH', 10001), K('id-b', 'Beta KG', 10002)];

test('Stufe 1: eine eingetragene Lexware-ID gewinnt, eine verschwundene wird gemeldet', () => {
  let r = finde(KO, kunde('völlig anderer Name', '', 'id-b'));
  assert.deepEqual([r.zustand, r.treffer.nummer], ['treffer', 10002]);
  r = finde(KO, kunde('Alpha GmbH', '', 'id-weg'));
  assert.equal(r.zustand, 'nichts');
  assert.match(r.text, /Lexware-ID/);
});

test('Stufe 2: die Kundennummer gewinnt vor dem Namen, doppelt ist unklar', () => {
  let r = finde(KO, kunde('Alpha GmbH', 10002));
  assert.equal(r.treffer.id, 'id-b');
  assert.match(r.text, /Kundennummer/);
  r = finde(KO, kunde('Alpha GmbH', 99999));
  assert.equal(r.treffer.id, 'id-a');                                             // unbekannte Nummer → Name
  r = finde([K('id-a', 'Alpha GmbH', 10001), K('id-b', 'Beta KG', 10001)], kunde('Alpha GmbH', 10001));
  assert.deepEqual([r.zustand, r.treffer.length], ['mehrdeutig', 2]);
});

test('Stufe 3 und 4: Name genau oder ohne Rechtsform und Schreibweise', () => {
  assert.deepEqual([finde(KO, kunde('Alpha GmbH')).zustand, finde(KO, kunde('Alpha GmbH')).treffer.id], ['treffer', 'id-a']);
  assert.equal(finde(KO, kunde('alpha gmbh')).treffer.id, 'id-a');
  assert.equal(finde(KO, kunde('Alpha')).treffer.id, 'id-a');
  const r = finde([K('x', 'Möbelwerkstätten Ahornfeld', 1)], kunde('Moebelwerkstaetten Ahornfeld'));
  assert.deepEqual([r.zustand, r.treffer.id], ['treffer', 'x']);
});

test('Nicht raten: zwei mit gleichem Anfang, nur das erste Wort, nichts', () => {
  const ZWEI = [K('id-1', 'Ahornfeld Möbelwerkstätten GmbH', 10004), K('id-2', 'Ahornfeld Innenausbau KG', 10005)];
  let r = finde(ZWEI, kunde('Ahornfeld'));
  assert.deepEqual([r.zustand, r.treffer.length], ['mehrdeutig', 2]);
  assert.match(r.text, /erste|fangen mit/);
  r = finde(ZWEI, kunde('Gibtsnicht AG'));
  assert.deepEqual([r.zustand, r.treffer], ['nichts', null]);

  // Die Zeile, die davor bewahrt, still den falschen Kunden einzutragen
  const EINER = [K('id-1', 'Ahornfeld Möbelwerkstätten-Innenausbau GmbH', 10004)];
  r = finde(EINER, kunde('Ahornfeld Holzbau Süd'));
  assert.equal(r.zustand, 'mehrdeutig');
  assert.match(r.text, /unsicher/);
  // Joachims Fall vom 22.11.2026: Steckbriefname gegen Lexware-Name trifft nur über das erste Wort
  assert.equal(finde(EINER, kunde('Ahornfeld Moebelwerkstaetten')).zustand, 'mehrdeutig');
  assert.equal(finde(EINER, kunde('Ahornfeld Möbelwerkstätten-Innenausbau')).zustand, 'treffer'); // nur die Rechtsform fehlt
  assert.equal(finde(KO, kunde('')).zustand, 'nichts');
});

function daten() {
  const d = leereDaten();
  const p = (id, kunde, status = 'laeuft') => ({ id, nr: id, name: id, kunde, status, positionen: [], schaetzungH: 10, puffer: 0, art: '', start: '2026-01-05', deadline: '' });
  d.projekte.push(p('p1', 'Alpha GmbH'), p('p2', 'Ahornfeld'), p('p3', 'Gibtsnicht AG'), p('p4', 'Alpha GmbH', 'abgeschlossen'));
  d.kunden.push({ id: 'k1', name: 'Ahornfeld', stundensatz: 70 });
  return d;
}
const ALLE = [...KO, K('id-1', 'Ahornfeld Möbelwerkstätten GmbH', 10004), K('id-2', 'Ahornfeld Innenausbau KG', 10005)];

test('Zuordnen: nur der eindeutige wird verknüpft, der Probelauf ändert nichts', () => {
  const d = daten();
  const probe = zuordnungPruefen(d, ALLE);
  const zustaende = (l) => Object.fromEntries(l.map((z) => [z.name, z.zustand]));
  assert.deepEqual(zustaende(probe), { 'Alpha GmbH': 'gesetzt', Ahornfeld: 'unklar', 'Gibtsnicht AG': 'nichts' });
  assert.equal(d.kunden.length, 1);                                               // Probelauf

  const erg = zuordnen(d, ALLE);
  assert.deepEqual(zustaende(erg), { 'Alpha GmbH': 'gesetzt', Ahornfeld: 'unklar', 'Gibtsnicht AG': 'nichts' });
  const a = d.kunden.find((k) => k.name === 'Alpha GmbH');
  assert.deepEqual([a.id, a.nummer, a.lexwareKontaktId], ['k-id-a', 10001, 'id-a']);   // ID aus Lexware: gleich auf jedem Gerät
  const b = d.kunden.find((k) => k.id === 'k1');
  assert.equal(b.lexwareKontaktId, undefined);                                    // der unklare bleibt unverknüpft
  assert.equal(b.name, 'Ahornfeld');
  assert.deepEqual(erg.find((z) => z.name === 'Ahornfeld').vorschlaege.map((c) => c.nummer), [10004, 10005]);      // mit den Vorschlägen daneben
  assert.deepEqual(zustaende(zuordnen(d, ALLE)), { 'Alpha GmbH': 'steht', Ahornfeld: 'unklar', 'Gibtsnicht AG': 'nichts' });
});

test('Bestätigen: Name kommt aus Lexware und wandert in Projekte und Angebote', () => {
  const d = daten();
  d.angebote.push({ id: 'a1', kunde: 'Ahornfeld', positionen: [] });
  const c = bestaetigen(d, 'Ahornfeld', 10005, ALLE);
  assert.equal(c.id, 'id-2');
  const k = d.kunden.find((x) => x.id === 'k1');
  assert.deepEqual([k.name, k.nummer, k.lexwareKontaktId, k.stundensatz], ['Ahornfeld Innenausbau KG', 10005, 'id-2', 70]);
  assert.equal(d.projekte.find((p) => p.id === 'p2').kunde, 'Ahornfeld Innenausbau KG');
  assert.equal(d.angebote[0].kunde, 'Ahornfeld Innenausbau KG');
  assert.throws(() => bestaetigen(d, 'Gibtsnicht AG', 99999, ALLE), /99999/);
  assert.throws(() => bestaetigen(d, 'Gibtsnicht AG', 10001, [K('x', 'X', 10001), K('y', 'Y', 10001)]), /2-mal/);
});

test('Verknüpfen: beide Kennungen oder gar nichts; zwei Namen für einen Kontakt werden zusammengelegt', () => {
  const d = daten();
  for (const fehlt of ['id', 'name', 'nummer']) {
    const kaputt = { ...K('id-a', 'Alpha', 10001), [fehlt]: '' };
    assert.throws(() => verknuepfen(d, 'Alpha GmbH', kaputt));
  }
  assert.equal(d.kunden.length, 1);                                               // dabei unberührt
  d.projekte.push({ ...d.projekte[0], id: 'p5', kunde: 'Alpha' });
  d.kunden.push({ id: 'k2', name: 'Alpha', stundensatz: 80 });
  zuordnen(d, KO);
  const alpha = d.kunden.filter((k) => k.lexwareKontaktId === 'id-a');
  assert.equal(alpha.length, 1);
  assert.equal(alpha[0].stundensatz, 80);                                         // Satz bleibt erhalten
  assert.deepEqual(d.projekte.filter((p) => p.kunde === 'Alpha GmbH').map((p) => p.id), ['p1', 'p4', 'p5']);
});

test('Kontakt-ID für Lexware nur bei eindeutigem Treffer, nie über den Namensanfang', () => {
  const d = daten();
  assert.equal(kontaktIdFuer(d, 'Alpha GmbH', ALLE), 'id-a');
  assert.equal(kontaktIdFuer(d, 'Ahornfeld', ALLE), null);
  assert.equal(kontaktIdFuer(d, 'Ahornfeld Holzbau', [K('id-1', 'Ahornfeld Möbel GmbH', 1)]), null);
});

test('Lexware-ID ohne Kundennummer (ältere Stände): Stufe 1 findet den Kontakt, die Nummer wird nachgetragen', () => {
  const d = daten();
  d.kunden[0].lexwareKontaktId = 'id-1';
  assert.equal(pruefeDaten(d).ok, true);                                          // Laden wird nicht gesperrt
  assert.equal(zuordnen(d, ALLE).find((z) => z.text.includes('10004')).zustand, 'gesetzt');
  assert.deepEqual([d.kunden[0].nummer, d.kunden[0].name], [10004, 'Ahornfeld Möbelwerkstätten GmbH']);
});

test('Kundenliste: Aufträge, offen und Belege hängen am Namen', () => {
  const d = daten();
  d.zeiteintraege.push({ id: 'z1', projektId: 'p2', datum: '2026-11-02', stunden: 2 });
  const l = kundenListe(d, '2026-11-22');
  const b = l.find((z) => z.name === 'Ahornfeld');
  // 2 h offen × 70 €/h Stundensatz des Kunden (aus daten())
  assert.deepEqual([b.auftraege, b.offen, b.verknuepft], [1, 140, false]);
  assert.equal(l.find((z) => z.name === 'Alpha GmbH').auftraege, 2);
  assert.deepEqual(belegeVon(d, 'Alpha GmbH').auftraege.map((p) => p.id).sort(), ['p1', 'p4']);
});
