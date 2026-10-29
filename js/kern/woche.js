// Wochenstart und Wochenabschluss für die Übersicht. Ohne Oberfläche, ohne DOM.
// Montag: was steht an (Deadlines, Engpässe, alte offene Rechnungen, Angebote ohne Antwort).
// Freitag: stimmen die gebuchten Stunden, wo sind Lücken, was ist neu abzurechnen.

import { alsText, ausText, plusTage, montag, isoWoche } from './datum.js';
import { offen } from './abrechnung.js';
import { offenUebersicht } from './rechnung.js';
import { nachtraege } from './nachtrag.js';

export const NACHFASSEN_TAGE = 14;      // Angebot versendet, keine Antwort
export const LUECKE_AB_H = 1;           // Tag mit mehr als 1 h weniger gebucht als frei
const runde2 = (x) => Math.round(x * 100) / 100;
const tageZwischen = (a, b) => Math.round((ausText(b) - ausText(a)) / 86400000);

/** Schlüssel „2026-W44“ der Woche von heute */
export function wochenKey(heute) {
  const { jahr, woche } = isoWoche(ausText(heute));
  return `${jahr}-W${String(woche).padStart(2, '0')}`;
}

/** Montag bis Donnerstag Wochenstart, ab Freitag Wochenabschluss */
export const wochenModus = (heute) => ([5, 6, 0].includes(ausText(heute).getDay()) ? 'abschluss' : 'start');

/** Angebote, bei denen du nachfassen solltest: versendet, seit 14 Tagen keine Antwort */
export function nachfassen(daten, heute, ab = NACHFASSEN_TAGE) {
  return (daten.angebote ?? [])
    .filter((a) => a.status === 'versendet')
    .map((a) => ({ angebot: a, seitTagen: tageZwischen(a.versendetAm ?? a.datum, heute), abgelaufen: !!a.gueltigBis && a.gueltigBis < heute }))
    .filter((x) => x.seitTagen >= ab)
    .sort((a, b) => b.seitTagen - a.seitTagen);
}

/**
 * Wochenstart. plan aus plane(). Ergebnis:
 * { key, montag, freitag, termine: [{ datum, titel, typ, projekt }], engpaesse: [{ projekt, status, deadline }],
 *   freiH, rechnungenAlt: [Zeilen aus offenUebersicht], nachfassen: [...] }
 */
export function wochenStart(daten, plan, heute) {
  const mo = alsText(montag(ausText(heute)));
  const so = alsText(plusTage(ausText(mo), 6));
  const projekt = (id) => daten.projekte.find((p) => p.id === id);
  const termine = daten.meilensteine
    .filter((m) => !m.erledigt && m.datum >= mo && m.datum <= so)
    .map((m) => ({ datum: m.datum, titel: m.titel, typ: m.typ, projekt: projekt(m.projektId) }))
    .filter((x) => x.projekt && !['abgeschlossen', 'abgesagt'].includes(x.projekt.status))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const engpaesse = Object.values(plan.projekte)
    .filter((x) => x.status === 'knapp' || x.status === 'zuSpaet')
    .map((x) => ({ projekt: projekt(x.id), status: x.status, deadline: x.deadline }))
    .filter((x) => x.projekt);
  let freiH = 0;
  for (let d = ausText(heute); alsText(d) <= so; d = plusTage(d, 1)) {
    const t = plan.tag(alsText(d));
    freiH += Math.max(0, t.kapH - Object.values(t.projekte).reduce((s, h) => s + h, 0));
  }
  return {
    key: wochenKey(heute), montag: mo, freitag: alsText(plusTage(ausText(mo), 4)), termine, engpaesse, freiH: runde2(freiH),
    rechnungenAlt: offenUebersicht(daten, heute).filter((z) => z.abgeschlossen || (z.seitTagen ?? 0) > 30),
    nachfassen: nachfassen(daten, heute),
  };
}

/**
 * Wochenabschluss. plan aus plane() (liefert die freie Zeit je Tag). Ergebnis:
 * { key, tage: [{ datum, freiH, gebuchtH, lueckeH }], gebuchtH, freiH, lueckeH, nachtragH, offenNeuH, naechste: [Termine nächste Woche] }
 */
export function wochenAbschluss(daten, plan, heute) {
  const mo = montag(ausText(heute));
  const tage = [];
  for (let i = 0; i < 5; i++) {
    const datum = alsText(plusTage(mo, i));
    if (datum > heute) break;
    const t = plan.tag(datum);
    if (!t.werktag || t.feiertag || t.abwesend) continue;
    // Termine mit Projekt buchen sich selbst (terminUid) – sie stecken nicht in der freien Zeit
    const gebuchtH = daten.zeiteintraege.filter((z) => z.datum === datum && !z.terminUid).reduce((s, z) => s + z.stunden, 0);
    const freiH = t.kapH;
    tage.push({ datum, freiH: runde2(freiH), gebuchtH: runde2(gebuchtH), lueckeH: runde2(Math.max(0, freiH - gebuchtH)) });
  }
  const von = alsText(mo), bis = heute;
  const woche = daten.zeiteintraege.filter((z) => z.datum >= von && z.datum <= bis);
  const nachtragNr = new Map(daten.projekte.map((p) => [p.id, new Set(nachtraege(p).map((x) => x.nr))]));
  const naechsterMo = alsText(plusTage(mo, 7)), naechsterSo = alsText(plusTage(mo, 13));
  return {
    key: wochenKey(heute), tage,
    gebuchtH: runde2(woche.reduce((s, z) => s + z.stunden, 0)),
    freiH: runde2(tage.reduce((s, t) => s + t.freiH, 0)),
    lueckeH: runde2(tage.filter((t) => t.lueckeH > LUECKE_AB_H).reduce((s, t) => s + t.lueckeH, 0)),
    nachtragH: runde2(woche.filter((z) => nachtragNr.get(z.projektId)?.has(z.positionNr)).reduce((s, z) => s + z.stunden, 0)),
    offenNeuH: runde2(woche.filter(offen).reduce((s, z) => s + z.stunden, 0)),
    naechste: daten.meilensteine
      .filter((m) => !m.erledigt && m.datum >= naechsterMo && m.datum <= naechsterSo)
      .map((m) => ({ datum: m.datum, titel: m.titel, typ: m.typ, projekt: daten.projekte.find((p) => p.id === m.projektId) }))
      .filter((x) => x.projekt && !['abgeschlossen', 'abgesagt'].includes(x.projekt.status))
      .sort((a, b) => a.datum.localeCompare(b.datum)),
  };
}
