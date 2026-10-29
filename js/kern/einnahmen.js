// Einnahmen-Vorschau: was kommt in den nächsten Wochen aufs Konto. Ohne Oberfläche, ohne DOM.
// Beträge brutto (so kommen sie an). Drei Stufen:
//   sicher   – festgeschriebene Rechnungen in Lexware Office, offener Betrag zum Fälligkeitstag
//   bald     – Rechnungen aus der App, die noch nicht festgeschrieben sind, und gearbeitete Stunden, die noch nicht abgerechnet sind
//   geplant  – Rest der Pauschalaufträge (zur Deadline) und eingeplante Stunden nach Satz
// Annahmen: Stunden werden am Monatsende abgerechnet, bezahlt wird nach dem Zahlungsziel (Einstellung, Standard 14 Tage).

import { alsText, ausText, plusTage, montag, isoWoche } from './datum.js';
import { MWST } from './angebot.js';
import { offenUebersicht, lexwareEntwurf, bezahlt } from './rechnung.js';
import { stundensatz } from './abrechnung.js';

export const STANDARD_ZAHLUNGSZIEL = 14;
export const ZAHLUNGSZIEL_TAGE = [7, 14, 30];
const runde2 = (x) => Math.round(x * 100) / 100;
const brutto = (netto) => runde2(netto * (1 + MWST));
const tag = (d, n) => alsText(plusTage(ausText(d), n));
const monatsende = (d) => { const x = ausText(d); return alsText(new Date(x.getFullYear(), x.getMonth() + 1, 0)); };

export const zahlungsziel = (daten) => daten.einstellungen.zahlungszielTage ?? STANDARD_ZAHLUNGSZIEL;

/**
 * Posten: [{ stufe, datum, betrag, titel, kunde, projektId, rechnungId, lexwareId, status, ueberfaellig }]
 * lexwareListe: rechnungen aus zahlungen.json (alle Rechnungen in Lexware, auch solche, die nicht aus der App kommen).
 * plan: aus plane() (für die eingeplanten Stunden). heute: 'YYYY-MM-DD'.
 */
export function einnahmenPosten(daten, { plan, heute, lexwareListe = [] }) {
  const ziel = zahlungsziel(daten);
  const posten = [];
  const projekt = (id) => daten.projekte.find((p) => p.id === id);
  const appNachLexId = new Map((daten.rechnungen ?? []).filter((r) => r.lexwareId).map((r) => [r.lexwareId, r]));

  // sicher: in Lexware festgeschrieben und offen
  for (const x of lexwareListe) {
    if (!['open', 'overdue'].includes(x.status) || !(x.offen > 0)) continue;
    const datum = x.faellig ?? tag(x.datum ?? heute, ziel);
    const r = appNachLexId.get(x.id);
    posten.push({
      stufe: 'sicher', datum, betrag: runde2(x.offen), titel: `${x.art === 'abschlag' ? 'Abschlag' : 'Rechnung'} ${x.nummer ?? ''}`.trim(),
      kunde: x.kunde, projektId: r?.projektId ?? null, rechnungId: r?.id ?? null, lexwareId: x.id, status: x.status,
      ueberfaellig: x.status === 'overdue' || datum < heute,
    });
  }

  // bald: Rechnungen aus der App, noch nicht festgeschrieben
  for (const r of daten.rechnungen ?? []) {
    const nochNichtFest = ['entwurf', 'sendet', 'fehler'].includes(r.status) || lexwareEntwurf(r);
    if (!nochNichtFest || !(r.netto > 0)) continue;
    const p = projekt(r.projektId);
    posten.push({ stufe: 'bald', datum: tag(heute, ziel), betrag: brutto(r.netto), titel: r.titel, kunde: p?.kunde ?? null, projektId: r.projektId, rechnungId: r.id, status: 'entwurf', ueberfaellig: false });
  }

  // bald / geplant: noch nicht abgerechnet (Stunden: Monatsende; Pauschal: Rest zur Deadline)
  for (const z of offenUebersicht(daten, heute)) {
    if (!(z.offenBetrag > 0)) continue;
    const p = z.projekt;
    if (z.art === 'pauschal') {
      const { satz } = stundensatz(daten, p);
      const nachtrag = runde2((z.nachtragH ?? 0) * (satz ?? 0));
      if (nachtrag > 0) posten.push({ stufe: 'bald', datum: tag(monatsende(heute), ziel), betrag: brutto(nachtrag), titel: 'Nachträge nach Stunden', kunde: p.kunde, projektId: p.id, status: 'offen', ueberfaellig: false });
      const rest = runde2(z.offenBetrag - nachtrag);
      if (rest > 0) {
        const abgabe = z.abgeschlossen || !p.deadline || p.deadline < heute ? heute : p.deadline;
        posten.push({ stufe: z.abgeschlossen ? 'bald' : 'geplant', datum: tag(abgabe, ziel), betrag: brutto(rest), titel: 'Pauschal, noch nicht abgerechnet', kunde: p.kunde, projektId: p.id, status: 'offen', ueberfaellig: false });
      }
    } else {
      posten.push({ stufe: 'bald', datum: tag(monatsende(heute), ziel), betrag: brutto(z.offenBetrag), titel: `${String(z.offenH).replace('.', ',')} h noch nicht abgerechnet`, kunde: p.kunde, projektId: p.id, status: 'offen', ueberfaellig: false });
    }
  }

  // geplant: eingeplante Stunden der Stunden-Projekte, je Monat abgerechnet
  if (plan) {
    const jeMonat = new Map(); // `${projektId}|${monatsende}` → h
    const bis = tag(heute, 7 * 26);
    for (let d = tag(heute, 1); d <= bis; d = tag(d, 1)) {
      for (const [id, h] of Object.entries(plan.tag(d).projekte)) {
        const k = `${id}|${monatsende(d)}`;
        jeMonat.set(k, (jeMonat.get(k) ?? 0) + h);
      }
    }
    for (const [k, h] of jeMonat) {
      const [id, ende] = k.split('|');
      const p = projekt(id);
      if (!p || p.abrechnungsart === 'pauschal') continue;
      const { satz } = stundensatz(daten, p);
      if (!satz || h <= 0) continue;
      posten.push({ stufe: 'geplant', datum: tag(ende, ziel), betrag: brutto(h * satz), titel: `${String(runde2(h)).replace('.', ',')} h eingeplant`, kunde: p.kunde, projektId: p.id, status: 'plan', ueberfaellig: false });
    }
  }
  return posten.sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Vorschau je Woche: { ueberfaellig, wochen: [{ montag, kw, sicher, bald, geplant, summe }], spaeter, summen: { sicher, bald, geplant },
 *   bezahltMonat, posten }
 */
export function einnahmenVorschau(daten, { plan, heute, lexwareListe = [], anzahl = 8 }) {
  const posten = einnahmenPosten(daten, { plan, heute, lexwareListe });
  const mo = montag(ausText(heute));
  const wochen = Array.from({ length: anzahl }, (_, i) => {
    const m = plusTage(mo, 7 * i);
    return { montag: alsText(m), kw: isoWoche(m).woche, sicher: 0, bald: 0, geplant: 0, summe: 0 };
  });
  const ende = tag(wochen[wochen.length - 1].montag, 7);
  let ueberfaellig = 0, spaeter = 0;
  const summen = { sicher: 0, bald: 0, geplant: 0 };
  for (const x of posten) {
    if (x.ueberfaellig) { ueberfaellig += x.betrag; continue; }
    if (x.datum >= ende) { spaeter += x.betrag; continue; }
    const w = wochen.find((y, i) => x.datum >= y.montag && (i === wochen.length - 1 || x.datum < wochen[i + 1].montag)) ?? wochen[0];
    w[x.stufe] += x.betrag; w.summe += x.betrag; summen[x.stufe] += x.betrag;
  }
  for (const w of wochen) for (const k of ['sicher', 'bald', 'geplant', 'summe']) w[k] = runde2(w[k]);
  const monat = heute.slice(0, 7);
  const bezahltMonat = runde2(lexwareListe.filter((x) => bezahlt(x) && (x.geaendert ?? '').startsWith(monat)).reduce((s, x) => s + (x.gesamt ?? 0), 0));
  return {
    ueberfaellig: runde2(ueberfaellig), wochen, spaeter: runde2(spaeter), bezahltMonat, posten,
    summen: { sicher: runde2(summen.sicher), bald: runde2(summen.bald), geplant: runde2(summen.geplant) },
  };
}
