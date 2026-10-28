// Rechnungen nach Entwurf Index B (Rechnung.dc.html, Abrechnung.dc.html). Ohne Oberfläche, ohne DOM.
// Die App erzeugt nur Entwürfe. Festschreiben und Versenden macht Joachim immer selbst in Lexware Office.
//
// Ablauf: Entwurf in der App (Zeiteinträge bekommen rechnungId und sind nicht mehr offen)
//   → an Lexware Office (status 'sendet') → Entwurf dort angelegt ('uebertragen', Zeiteinträge bekommen abgerechnet)
//   oder ohne Lexware „von Hand erledigt“ ('erledigt'). Löschen gibt die Zeiteinträge wieder frei.

import { neueId } from './daten.js';
import { ausText, tagKurz } from './datum.js';
import { rechnungsZeilen, stundensatz, offen, kundeVon } from './abrechnung.js';
import { MWST } from './angebot.js';

export const RECHNUNG_ART = [
  { id: 'stunden', name: 'nach Stunden' },
  { id: 'pauschal', name: 'Pauschal' },
  { id: 'abschlag', name: 'Abschlag' },
  { id: 'teil', name: 'Teilrechnung' },
];
export const RECHNUNG_STATUS_NAME = {
  entwurf: 'Entwurf in der App', sendet: 'wird übertragen', uebertragen: 'Entwurf in Lexware', fehler: 'Fehler', erledigt: 'von Hand abgerechnet',
};
export const LAENGER_OFFEN_TAGE = 30;

const runde2 = (x) => Math.round(x * 100) / 100;
const tm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Rechnungen eines Projekts, neueste zuerst */
export const rechnungenVon = (daten, projektId) => (daten.rechnungen ?? [])
  .filter((r) => r.projektId === projektId).sort((a, b) => (b.erstellt ?? '').localeCompare(a.erstellt ?? ''));

/** Schon berechnet (Pauschal, Abschlag, Teil), ohne gelöschte */
export const pauschalBerechnet = (daten, projektId) => runde2(rechnungenVon(daten, projektId)
  .filter((r) => r.art !== 'stunden').reduce((s, r) => s + r.netto, 0));

/** Abschläge, die in der Schlussrechnung abgezogen werden */
const abschlaege = (daten, projektId) => rechnungenVon(daten, projektId).filter((r) => r.art === 'abschlag' || r.art === 'teil');

/**
 * Rechnungsentwurf berechnen (ändert nichts).
 * opts: { art, von, bis, zusammenfassen, nur (Set von Zeiteintrag-IDs), abschlagProzent, positionNrs }
 * Ergebnis: { art, zeilen: [{ titel, beschreibung, menge, einheit, preis, betrag }], eintraege, netto, mwst, brutto, leistungVon, leistungBis, satz, quelle }
 */
export function rechnungBerechnen(daten, projektId, opts = {}) {
  const p = daten.projekte.find((x) => x.id === projektId);
  const art = opts.art ?? (p?.abrechnungsart === 'pauschal' ? 'pauschal' : 'stunden');
  const { satz, quelle } = stundensatz(daten, p);
  let zeilen = [], eintraege = [];

  if (art === 'stunden') {
    const z = rechnungsZeilen(daten, projektId, { von: opts.von, bis: opts.bis, art: opts.zusammenfassen, nur: opts.nur });
    zeilen = z.map((x) => ({ titel: x.titel, beschreibung: x.beschreibung, menge: x.stunden, einheit: 'Stunden', preis: satz ?? 0, betrag: runde2(x.stunden * (satz ?? 0)), datum: x.datum }));
    eintraege = z.flatMap((x) => x.eintraege);
  } else {
    const pos = (p?.positionen ?? []).filter((x) => x.preis > 0);
    if (art === 'abschlag') {
      const prozent = opts.abschlagProzent ?? 30;
      const basis = p?.pauschalpreis ?? pos.reduce((s, x) => s + x.preis, 0);
      const nr = abschlaege(daten, projektId).filter((r) => r.art === 'abschlag').length + 1;
      zeilen = [{ titel: `${nr}. Abschlag ${prozent} %`, beschreibung: `${p?.name ?? ''} · Auftragssumme ${euroText(basis)} netto`, menge: 1, einheit: 'Pauschal', preis: runde2(basis * prozent / 100) }];
    } else if (art === 'teil') {
      const nrs = opts.positionNrs ?? [];
      zeilen = pos.filter((x) => nrs.includes(x.nr)).map((x) => ({ titel: `Pos. ${x.nr} ${x.bezeichnung}`, beschreibung: 'Teilleistung', menge: 1, einheit: 'Pauschal', preis: x.preis }));
    } else {
      // Schlussrechnung: alle Positionen (oder der Pauschalpreis), abzüglich Abschläge und Teilrechnungen
      zeilen = pos.length
        ? pos.map((x) => ({ titel: `Pos. ${x.nr} ${x.bezeichnung}`, beschreibung: '', menge: 1, einheit: 'Pauschal', preis: x.preis }))
        : [{ titel: p?.name ?? 'Pauschal', beschreibung: 'Pauschal laut Angebot', menge: 1, einheit: 'Pauschal', preis: p?.pauschalpreis ?? 0 }];
      for (const r of abschlaege(daten, projektId)) {
        zeilen.push({ titel: `abzüglich ${r.titel ?? 'Abschlag'}`, beschreibung: `vom ${tm(r.erstellt)}`, menge: 1, einheit: 'Pauschal', preis: -r.netto });
      }
      // Gebuchte Stunden zählen bei Pauschal nur zur Nachkalkulation – sie werden mit abgeschlossen
      eintraege = daten.zeiteintraege.filter((z) => z.projektId === projektId && offen(z)).map((z) => z.id);
    }
    zeilen = zeilen.map((z) => ({ ...z, betrag: runde2(z.menge * z.preis) }));
  }

  const netto = runde2(zeilen.reduce((s, z) => s + z.betrag, 0));
  const daten2 = zeilen.map((z) => z.datum).filter(Boolean).sort();
  const ez = daten.zeiteintraege.filter((z) => eintraege.includes(z.id)).map((z) => z.datum).sort();
  return {
    art, zeilen, eintraege, netto, mwst: runde2(netto * MWST), brutto: runde2(netto * (1 + MWST)), satz, quelle,
    leistungVon: daten2[0] ?? ez[0] ?? opts.von ?? null, leistungBis: daten2[daten2.length - 1] ?? ez[ez.length - 1] ?? opts.bis ?? null,
  };
}

const euroText = (x) => `${x.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;

/** Titel einer Rechnung: „Stunden 23.–28.10.“, „1. Abschlag 30 %“, „Schlussrechnung“ */
export function rechnungTitel(e) {
  if (e.art === 'stunden') {
    if (!e.leistungVon) return 'Stunden';
    const v = tm(e.leistungVon), b = tm(e.leistungBis);
    return v === b ? `Stunden ${v}` : `Stunden ${v.slice(3) === b.slice(3) ? v.slice(0, 3) : v}–${b}`;
  }
  if (e.art === 'abschlag') return e.zeilen[0]?.titel ?? 'Abschlag';
  if (e.art === 'teil') return 'Teilrechnung';
  return 'Schlussrechnung';
}

/** Entwurf in der App anlegen (ändert daten). Gibt die neue Rechnung zurück. */
export function rechnungAnlegen(daten, projektId, entwurf, heute) {
  if (!entwurf.zeilen.length) throw new Error('Die Rechnung hat keine Zeilen.');
  const r = {
    id: neueId(), projektId, art: entwurf.art, titel: rechnungTitel(entwurf), erstellt: heute,
    leistungVon: entwurf.leistungVon, leistungBis: entwurf.leistungBis, zeilen: entwurf.zeilen.map(({ datum, ...z }) => z),
    eintraege: entwurf.eintraege, netto: entwurf.netto, status: 'entwurf', lexwareId: null, uebertragen: null, fehler: null,
  };
  daten.rechnungen ??= [];
  daten.rechnungen.push(r);
  const ids = new Set(r.eintraege);
  daten.zeiteintraege.forEach((z) => { if (ids.has(z.id)) z.rechnungId = r.id; });
  return r;
}

/** Status setzen (ändert daten). 'uebertragen' und 'erledigt' setzen „abgerechnet“ an den Zeiteinträgen. */
export function rechnungStatus(daten, id, status, { heute, lexwareId, fehler } = {}) {
  const r = (daten.rechnungen ?? []).find((x) => x.id === id);
  if (!r) return null;
  r.status = status;
  r.fehler = status === 'fehler' ? fehler ?? 'Unbekannter Fehler' : null;
  if (lexwareId) r.lexwareId = lexwareId;
  if (status === 'uebertragen' || status === 'erledigt') {
    r.uebertragen = heute;
    daten.zeiteintraege.forEach((z) => { if (z.rechnungId === id) z.abgerechnet = heute; });
  }
  return r;
}

/** Rechnung löschen: Zeiteinträge werden wieder offen (ändert daten). Den Entwurf in Lexware löscht Joachim dort. */
export function rechnungLoeschen(daten, id) {
  daten.rechnungen = (daten.rechnungen ?? []).filter((r) => r.id !== id);
  daten.zeiteintraege.forEach((z) => { if (z.rechnungId === id) { delete z.rechnungId; delete z.abgerechnet; } });
}

/**
 * Offen zur Abrechnung, je Projekt (Abrechnung.dc.html).
 * [{ projekt, art: 'stunden' | 'pauschal', offenH, offenBetrag, seitTagen, aelter: Betrag älter als 30 Tage, abgeschlossen }]
 */
export function offenUebersicht(daten, heute) {
  const tage = (a, b) => Math.round((ausText(b) - ausText(a)) / 86400000);
  const zeilen = [];
  for (const p of daten.projekte) {
    if (['anfrage', 'angebot', 'abgesagt'].includes(p.status)) continue;
    const eintraege = daten.zeiteintraege.filter((z) => z.projektId === p.id && offen(z));
    const aeltester = eintraege.map((z) => z.datum).sort()[0] ?? null;
    if (p.abrechnungsart === 'pauschal') {
      const offenBetrag = runde2((p.pauschalpreis ?? 0) - pauschalBerechnet(daten, p.id));
      if (offenBetrag <= 0.005) continue;
      zeilen.push({ projekt: p, art: 'pauschal', offenH: null, offenBetrag, seitTagen: aeltester ? tage(aeltester, heute) : null, aelter: 0, abgeschlossen: p.status === 'abgeschlossen' });
      continue;
    }
    if (!eintraege.length) continue;
    const { satz } = stundensatz(daten, p);
    const h = eintraege.reduce((s, z) => s + z.stunden, 0);
    const alt = eintraege.filter((z) => tage(z.datum, heute) > LAENGER_OFFEN_TAGE).reduce((s, z) => s + z.stunden, 0);
    zeilen.push({
      projekt: p, art: 'stunden', offenH: runde2(h), offenBetrag: satz ? runde2(h * satz) : null,
      seitTagen: tage(aeltester, heute), aelter: satz ? runde2(alt * satz) : 0, abgeschlossen: p.status === 'abgeschlossen',
    });
  }
  return zeilen.sort((a, b) => (b.seitTagen ?? -1) - (a.seitTagen ?? -1));
}

// ---------- Für Lexware Office (nur die Felder, die die GitHub Action annimmt) ----------

/** Auftrag für die Action: Rechnung als Entwurf */
export function lexwareRechnung(daten, r) {
  const p = daten.projekte.find((x) => x.id === r.projektId);
  const k = kundeVon(daten, p);
  return {
    art: 'rechnung', kontaktId: k?.lexwareKontaktId ?? null, name: p?.kunde || p?.name || 'Kunde',
    titel: 'Rechnung', einleitung: `${p?.name ?? ''}${r.leistungVon ? ` · Leistungszeitraum ${tagKurz(ausText(r.leistungVon))}–${tagKurz(ausText(r.leistungBis))}` : ''}`,
    datum: r.erstellt, leistungVon: r.leistungVon ?? r.erstellt, leistungBis: r.leistungBis ?? r.erstellt,
    zeilen: r.zeilen.map((z) => ({ name: z.titel, beschreibung: z.beschreibung, menge: z.menge, einheit: z.einheit, preisNetto: z.preis })),
  };
}
