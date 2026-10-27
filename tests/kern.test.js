// Tests für den Rechenkern. Start: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  feiertageBW, regelKapazitaetWoche, tagesRechner, plane, wochen, warnung, kennzahlen,
  vorschlaege, uebernehmen, rueckgaengig, anfragePruefen, lernwerte, lernwert, leereDaten, neueId, montagVonWoche,
} from '../js/kern/index.js';
import { beispielDaten, beispielTermine } from '../js/kern/beispiel.js';

const HEUTE = '2026-10-27';
const namen = (liste) => Object.fromEntries(liste.map((f) => [f.datum, f.name]));

// ---------- Feiertage ----------

test('Feiertage BW 2026', () => {
  assert.deepEqual(namen(feiertageBW(2026)), {
    '2026-01-01': 'Neujahr', '2026-01-06': 'Heilige Drei Könige', '2026-04-03': 'Karfreitag',
    '2026-04-06': 'Ostermontag', '2026-05-01': 'Tag der Arbeit', '2026-05-14': 'Christi Himmelfahrt',
    '2026-05-25': 'Pfingstmontag', '2026-06-04': 'Fronleichnam', '2026-10-03': 'Tag der Deutschen Einheit',
    '2026-11-01': 'Allerheiligen', '2026-12-25': '1. Weihnachtstag', '2026-12-26': '2. Weihnachtstag',
  });
});

test('Feiertage BW 2027', () => {
  assert.deepEqual(namen(feiertageBW(2027)), {
    '2027-01-01': 'Neujahr', '2027-01-06': 'Heilige Drei Könige', '2027-03-26': 'Karfreitag',
    '2027-03-29': 'Ostermontag', '2027-05-01': 'Tag der Arbeit', '2027-05-06': 'Christi Himmelfahrt',
    '2027-05-17': 'Pfingstmontag', '2027-05-27': 'Fronleichnam', '2027-10-03': 'Tag der Deutschen Einheit',
    '2027-11-01': 'Allerheiligen', '2027-12-25': '1. Weihnachtstag', '2027-12-26': '2. Weihnachtstag',
  });
});

test('Ostersonntag in weiteren Jahren', () => {
  const karfreitag = (j) => feiertageBW(j).find((f) => f.name === 'Karfreitag').datum;
  assert.equal(karfreitag(2024), '2024-03-29');
  assert.equal(karfreitag(2025), '2025-04-18');
  assert.equal(karfreitag(2028), '2028-04-14');
  assert.equal(karfreitag(2038), '2038-04-23');
});

// ---------- Wochen- und Tageskapazität ----------

test('Wochenkapazität: KW 52/2026 = 32 h, KW 2/2027 = 40 h, Urlaubswoche = 0 h', () => {
  const d = beispielDaten(); // Urlaub 28.12.2026–01.01.2027
  assert.equal(regelKapazitaetWoche(d, montagVonWoche('2026-W52')), 32);
  assert.equal(regelKapazitaetWoche(d, montagVonWoche('2027-W02')), 40);
  assert.equal(regelKapazitaetWoche(d, montagVonWoche('2026-W53')), 0);
});

test('Tageskapazität: Regeltag − Blockzeiten − Termine nach Kalenderregel', () => {
  const d = beispielDaten();
  const termine = [
    { uid: 'a', kalender: 'Gerster CAD', start: '2026-11-04T09:00', ende: '2026-11-04T11:30', ganztaegig: false },
    { uid: 'b', kalender: 'Privat', start: '2026-11-04T12:00', ende: '2026-11-04T13:00', ganztaegig: false }, // zählt nicht
    { uid: 'c', kalender: 'Familie', start: '2026-11-05', ende: '2026-11-06', ganztaegig: true },             // ignoriert
    { uid: 'd', kalender: 'Privat', start: '2026-11-06', ende: '2026-11-07', ganztaegig: true },               // Tag weg
    { uid: 'e', kalender: 'Gerster CAD', start: '2026-11-03T08:00', ende: '2026-11-03T14:00', ganztaegig: false },
  ];
  d.terminRegeln.push({ uid: 'e', zaehltH: 2, projektId: null });
  const { tag } = tagesRechner(d, { termine });
  assert.equal(tag('2026-11-02').kapH, 8 - 3);    // Mo: Entwicklung 3 h
  assert.equal(tag('2026-11-03').kapH, 8 - 2);    // Di: Termin, eigene Regel 2 h statt 6 h
  assert.equal(tag('2026-11-04').kapH, 8 - 3 - 2.5); // Mi: Entwicklung + Termin, Privat zählt nicht
  assert.equal(tag('2026-11-05').kapH, 8);        // Do: Familie ignoriert
  assert.equal(tag('2026-11-06').kapH, 0);        // Fr: Privat ganztägig
  assert.equal(tag('2026-11-07').kapH, 0);        // Sa
  assert.equal(tag('2026-12-25').kapH, 0);        // Feiertag
  assert.equal(tag('2026-12-29').kapH, 0);        // Urlaub
});

// ---------- Planung ----------

test('Beispieldaten: alle festen Projekte im Plan, Anfragen zählen nicht', () => {
  const d = beispielDaten();
  const plan = plane(d, { heute: HEUTE, termine: beispielTermine() });
  const status = Object.values(plan.projekte).map((p) => p.status);
  assert.equal(status.length, 3);
  assert.ok(status.every((s) => s === 'imPlan'));
  const cafe = d.projekte.find((p) => p.status === 'anfrage');
  assert.equal(plan.projekte[cafe.id], undefined);
});

test('Planung: früheste Deadline zuerst', () => {
  const d = beispielDaten();
  const plan = plane(d, { heute: HEUTE, termine: beispielTermine() });
  const name = (id) => d.projekte.find((p) => p.id === id).name;
  assert.deepEqual(plan.reihenfolge.map(name), ['Kanzlei Muster · Empfang', 'Projekt Frankfurt · 6 Pos.', 'Gastro Getränkebar']);
  // Planung beginnt heute, nicht in der Vergangenheit
  const kanzlei = d.projekte.find((p) => p.name.startsWith('Kanzlei'));
  assert.equal(plan.tag('2026-10-27').projekte[kanzlei.id] > 0, true);
});

/** Ein Projekt, das 3 Wochen lang mehr braucht als die Regelkapazität */
function engpassDaten(sollH, extra = {}) {
  const d = leereDaten();
  Object.assign(d.einstellungen, extra.einstellungen || {});
  const id = neueId();
  d.projekte.push({ id, nr: 'T1', name: 'Test', kunde: 'Test', art: 'Werkplanung', status: 'laeuft',
    schaetzungH: sollH, puffer: 0, start: '2026-11-02', deadline: '2026-11-20', prioritaet: 1, positionen: [] });
  (extra.blockzeiten || []).forEach((b) => d.blockzeiten.push({ id: neueId(), ...b }));
  return { d, id };
}
const OPTS = { heute: '2026-11-02' };

test('Engpass: Rest als Überlast vor der Deadline, Status knapp', () => {
  const { d, id } = engpassDaten(136); // 3 × 40 h frei, 16 h fehlen
  const plan = plane(d, OPTS);
  assert.equal(plan.projekte[id].status, 'knapp');
  assert.equal(plan.projekte[id].ueberlastH, 16);
  const w = wochen(plan, '2026-11-02', 4);
  assert.deepEqual(w.map((x) => x.ueber), [true, true, true, false]);
  assert.ok(Math.abs(w[0].ueberH - 16 / 3) < 0.01);
});

test('Nie automatisch Samstage oder lange Tage: ohne Vorschlag kein Samstag geplant', () => {
  const { d } = engpassDaten(136);
  const plan = plane(d, OPTS);
  assert.equal(wochen(plan, '2026-11-02', 3).every((x) => x.samstagH === 0), true);
});

test('Zu spät: reicht auch der längste Tag nicht, läuft das Projekt über die Deadline', () => {
  const { d, id } = engpassDaten(300);
  const p = plane(d, OPTS).projekte[id];
  assert.equal(p.status, 'zuSpaet');
  assert.ok(p.fertig > '2026-11-20');
  assert.ok(p.tageZuSpaet > 0);
});

test('Warnung erscheint bei 3 Wochen in Folge über 8 h und verschwindet, wenn ein Vorschlag übernommen wird', () => {
  const { d, id } = engpassDaten(136);
  const warn = () => warnung(d, wochen(plane(d, OPTS), '2026-11-02', 8));
  assert.equal(warn().aktiv, true);
  assert.equal(warn().anzahl, 3);
  assert.equal(kennzahlen(plane(d, OPTS)).warnung.aktiv, true);

  const [engpass] = vorschlaege(d, OPTS);
  assert.equal(engpass.projektId, id);
  assert.deepEqual(engpass.vorschlaege.map((v) => v.typ), ['samstag', 'langerTag']);
  const sa = engpass.vorschlaege[0];
  assert.equal(sa.loest, true);
  assert.equal(sa.warnungDanach, false);
  assert.deepEqual(sa.aenderung.tage, ['2026-11-07', '2026-11-14']);
  assert.equal(sa.titel, 'Test: Samstage 07.11. und 14.11. zuschalten');

  const vid = uebernehmen(d, sa);
  assert.equal(plane(d, OPTS).projekte[id].status, 'imPlan');
  assert.equal(warn().aktiv, false);

  rueckgaengig(d, vid);
  assert.equal(warn().aktiv, true);
});

test('Längere Tage lösen die Deadline, die Warnung bleibt (ehrlich: Mo–Fr über 8 h)', () => {
  const { d, id } = engpassDaten(136);
  const lang = vorschlaege(d, OPTS)[0].vorschlaege.find((v) => v.typ === 'langerTag');
  assert.equal(lang.loest, true);
  assert.equal(lang.warnungDanach, true);
  uebernehmen(d, lang);
  assert.equal(plane(d, OPTS).projekte[id].status, 'imPlan');
});

test('Samstag nicht erlaubt: kein Samstags-Vorschlag', () => {
  const { d } = engpassDaten(136, { einstellungen: { samstagErlaubt: 'nie' } });
  assert.deepEqual(vorschlaege(d, OPTS)[0].vorschlaege.map((v) => v.typ), ['langerTag']);
});

test('Reihenfolge der Vorschläge: Entwicklung kürzen vor Samstag vor längeren Tagen', () => {
  const { d } = engpassDaten(136, {
    blockzeiten: [{ titel: 'Entwicklung', art: 'entwicklung', stundenProWoche: 6, wochentag: [1, 3], von: '14:00', bis: '17:00', kuerzbar: true, verschiebbar: false }],
  });
  const v = vorschlaege(d, OPTS)[0];
  assert.equal(v.fehltH, 34); // 120 − 18 h Entwicklung = 102 h frei
  assert.deepEqual(v.vorschlaege.map((x) => x.typ), ['kuerzen', 'samstag', 'langerTag']);
  assert.equal(v.vorschlaege[0].loest, false); // 18 h reichen allein nicht
  assert.equal(v.vorschlaege[2].loest, true);
});

test('Verschieben: fixierte Einplanung eines anderen Projekts nach hinten, dessen Deadline hält', () => {
  const { d, id } = engpassDaten(120);
  const anderes = neueId();
  d.projekte.push({ id: anderes, nr: 'T2', name: 'Anderes', kunde: 'X', art: 'Entwurf', status: 'auftrag',
    schaetzungH: 20, puffer: 0, start: '2026-11-02', deadline: '2026-12-18', prioritaet: 2, positionen: [] });
  d.einplanungen.push({ id: neueId(), projektId: anderes, woche: '2026-W46', stunden: 20, art: 'regulaer', fixiert: true });
  assert.equal(plane(d, OPTS).projekte[id].status, 'knapp');

  const v = vorschlaege(d, OPTS).find((x) => x.projektId === id).vorschlaege[0];
  assert.equal(v.typ, 'verschieben');
  assert.equal(v.titel, 'Anderes: 20 h aus KW 46 in KW 48 schieben');
  assert.equal(v.loest, true);
  uebernehmen(d, v);
  const plan = plane(d, OPTS);
  assert.equal(plan.projekte[id].status, 'imPlan');
  assert.equal(plan.projekte[anderes].status, 'imPlan');
});

test('Fixierte Einplanungen bleiben stehen', () => {
  const d = leereDaten();
  const id = neueId();
  d.projekte.push({ id, nr: '', name: 'Fix', kunde: '', art: '', status: 'auftrag', schaetzungH: 10, puffer: 0, start: '2026-11-02', deadline: null, prioritaet: 2, positionen: [] });
  d.einplanungen.push({ id: neueId(), projektId: id, woche: '2026-W48', stunden: 10, art: 'regulaer', fixiert: true });
  const w = wochen(plane(d, OPTS), '2026-11-02', 5);
  assert.deepEqual(w.map((x) => x.projekte[id] || 0), [0, 0, 0, 10, 0]);
});

// ---------- Anfrage prüfen ----------

test('Anfrage aus dem Entwurf: 56 h + 10 % = 62 h ab KW 49 → fertig Do 17.12.2026', () => {
  const d = beispielDaten();
  const a = anfragePruefen(d, { schaetzungH: 56, puffer: 10, start: '2026-11-30', wunschtermin: '2026-12-18' },
    { heute: HEUTE, termine: beispielTermine() });
  assert.equal(a.sollH, 61.6);
  const regulaer = a.varianten.find((v) => v.art === 'regulaer');
  assert.equal(regulaer.fertig, '2026-12-17');
  assert.equal(regulaer.haeltWunsch, true);
  assert.equal(a.empfohlen, 'regulaer');
  // Samstage und längere Tage sind schneller
  assert.ok(a.varianten[1].fertig < regulaer.fertig);
  assert.ok(a.varianten[2].fertig < regulaer.fertig);
});

test('Anfrage: Wunschtermin verfehlt → Tage zu spät, Empfehlung die erste Variante, die hält', () => {
  const d = beispielDaten();
  const a = anfragePruefen(d, { schaetzungH: 56, puffer: 10, start: '2026-11-30', wunschtermin: '2026-12-11' },
    { heute: HEUTE, termine: beispielTermine() });
  const [regulaer, samstag, lang] = a.varianten;
  assert.equal(regulaer.haeltWunsch, false);
  assert.equal(regulaer.tageZuSpaet, 6);
  assert.equal(samstag.haeltWunsch, false);
  assert.equal(lang.haeltWunsch, true);
  assert.equal(a.empfohlen, 'langerTag');
});

test('Anfrage verschiebt keine bestehenden Projekte', () => {
  const d = beispielDaten();
  const opts = { heute: HEUTE, termine: beispielTermine() };
  const vorher = JSON.stringify(wochen(plane(d, opts), HEUTE, 12));
  anfragePruefen(d, { schaetzungH: 200, puffer: 10, start: HEUTE, wunschtermin: '2026-11-20' }, opts);
  assert.equal(JSON.stringify(wochen(plane(d, opts), HEUTE, 12)), vorher);
});

test('Puffer: Soll = Schätzung × (1 + Puffer/100), 0,5-%-Schritte', () => {
  const d = leereDaten();
  const a = (puffer) => anfragePruefen(d, { schaetzungH: 40, puffer, start: '2026-11-02' }, OPTS).sollH;
  assert.equal(a(0), 40);
  assert.equal(a(12.5), 45);
  assert.equal(a(20), 48);
});

// ---------- Lernwert und Kennzahlen ----------

test('Lernwert ab 3 abgeschlossenen Projekten gleicher Art', () => {
  const d = beispielDaten();
  assert.equal(lernwerte(d).Werkplanung.anzahl, 3);
  assert.equal(lernwert(d, 'Werkplanung').abweichung, 0.2);
  d.projekte = d.projekte.filter((p) => p.nr !== '26-027');
  assert.equal(lernwert(d, 'Werkplanung'), null);
});

test('Kennzahlen der Beispieldaten', () => {
  const k = kennzahlen(plane(beispielDaten(), { heute: HEUTE, termine: beispielTermine() }));
  assert.equal(k.naechsteDeadline.datum, '2026-11-20');
  assert.ok(k.auslastung4W >= 95 && k.auslastung4W <= 110);
  assert.ok(k.freiBisJahresende > 0);
  assert.equal(k.warnung.aktiv, false);
});
