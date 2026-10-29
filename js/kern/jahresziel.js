// Jahresziel: Umsatz und Stunden bisher gegenüber dem Ziel, anteilig bis heute. Ohne Oberfläche, ohne DOM.
// Umsatz netto aus den Rechnungen: in Lexware (alle, auch die nicht aus der App, ohne Stornos) und die der App,
// die nicht in Lexware stehen (von Hand abgerechnet oder noch Entwurf in Lexware). Entwürfe in der App zählen nicht.

import { ausText } from './datum.js';
import { MWST } from './angebot.js';

const runde2 = (x) => Math.round(x * 100) / 100;
export const GELB_AB = 0.85;    // ab 85 % des anteiligen Ziels gelb, darunter rot

export const jahresziel = (daten) => daten.einstellungen.jahresziel ?? { umsatz: null, stunden: null };

/** Anteil des Jahres bis heute (0–1) */
export function jahresAnteil(heute) {
  const d = ausText(heute);
  const anfang = new Date(d.getFullYear(), 0, 1), ende = new Date(d.getFullYear() + 1, 0, 1);
  return (d - anfang + 86400000) / (ende - anfang);
}

const ampel = (ist, soll) => (!(soll > 0) ? null : ist >= soll ? 'gruen' : ist >= soll * GELB_AB ? 'gelb' : 'rot');

/**
 * { jahr, anteil, umsatz: { ist, ziel, sollBisHeute, prozent, ampel }, stunden: { ist, abgerechnet, ziel, sollBisHeute, prozent, ampel }, satz }
 * lexwareListe: rechnungen aus zahlungen.json.
 */
export function jahresStand(daten, heute, lexwareListe = []) {
  const jahr = heute.slice(0, 4);
  const ziel = jahresziel(daten);
  const anteil = jahresAnteil(heute);
  const inLexware = new Set(lexwareListe.map((x) => x.id));

  let umsatz = 0;
  for (const x of lexwareListe) {
    if (x.status === 'voided' || !(x.datum ?? '').startsWith(jahr)) continue;
    umsatz += (x.gesamt ?? 0) / (1 + MWST);
  }
  for (const r of daten.rechnungen ?? []) {
    if (!(r.erstellt ?? '').startsWith(jahr) || (r.lexwareId && inLexware.has(r.lexwareId))) continue;
    if (['erledigt', 'uebertragen'].includes(r.status)) umsatz += r.netto ?? 0;
  }
  const imJahr = daten.zeiteintraege.filter((z) => (z.datum ?? '').startsWith(jahr) && z.datum <= heute);
  const stunden = imJahr.reduce((s, z) => s + z.stunden, 0);
  const abgerechnet = imJahr.filter((z) => z.abgerechnet || z.rechnungId).reduce((s, z) => s + z.stunden, 0);

  const teil = (ist, z) => {
    const soll = z > 0 ? z * anteil : null;
    return { ist: runde2(ist), ziel: z ?? null, sollBisHeute: soll == null ? null : runde2(soll), prozent: z > 0 ? Math.round((ist / z) * 100) : null, ampel: ampel(ist, soll) };
  };
  return {
    jahr: Number(jahr), anteil,
    umsatz: teil(umsatz, ziel.umsatz),
    stunden: { ...teil(stunden, ziel.stunden), abgerechnet: runde2(abgerechnet) },
    satz: stunden > 0 && umsatz > 0 ? runde2(umsatz / stunden) : null,
  };
}
