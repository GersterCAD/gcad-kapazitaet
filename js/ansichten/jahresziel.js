// Übersicht: Leiste „Jahresziel“ – Umsatz und Stunden bisher, Strich = anteiliges Ziel bis heute, Ampel.
// Kein eigener Entwurf: Kachel mit Balken wie „Soll-Ist je Position“ auf der Projektseite.

import { el, zahlText } from '../ui.js';
import * as zustand from '../zustand.js';
import * as lexware from '../lexware.js';
import { euro } from '../kern/abrechnung.js';
import { jahresStand } from '../kern/jahresziel.js';
import { beispielZahlungen } from '../kern/beispiel.js';

const AMPEL_TEXT = { gruen: 'im Plan', gelb: 'knapp dahinter', rot: 'deutlich dahinter' };

function zeile(name, t, format) {
  const anteil = t.ziel > 0 ? Math.min(1, t.ist / t.ziel) : 0;
  const strich = t.ziel > 0 ? Math.min(1, t.sollBisHeute / t.ziel) : null;
  return el('div', { class: 'jz-zeile' }, [
    el('div', { class: 'jz-name' }, [el('div', { class: 'zeile-titel' }, name), el('div', { class: 'zeile-hinweis zahl' }, `${format(t.ist)} von ${format(t.ziel)}`)]),
    el('div', { class: 'jz-balken', role: 'img', 'aria-label': `${name}: ${t.prozent} % vom Jahresziel, anteilig bis heute ${format(t.sollBisHeute)}` }, [
      el('div', { class: `jz-ist ${t.ampel ?? ''}`.trim(), style: `width:${(anteil * 100).toFixed(1)}%` }),
      strich != null ? el('div', { class: 'jz-strich', style: `left:${(strich * 100).toFixed(1)}%`, title: `bis heute anteilig ${format(t.sollBisHeute)}` }) : null,
    ]),
    el('div', { class: 'jz-wert' }, [el('span', { class: 'zahl fett-mittel' }, `${t.prozent} %`), t.ampel ? el('span', { class: `chip ${t.ampel}` }, AMPEL_TEXT[t.ampel]) : null]),
  ]);
}

export function jahreszielLeiste(d, heute) {
  const liste = zustand.istBeispiel() ? beispielZahlungen() : lexware.zahlungen();
  const j = jahresStand(d, heute, liste);
  const mitUmsatz = j.umsatz.ziel > 0, mitStunden = j.stunden.ziel > 0;
  if (!mitUmsatz && !mitStunden) return null;
  return el('section', { class: 'kachel jahresziel', 'aria-labelledby': 'h-jz' }, [
    el('div', { class: 'knopfreihe' }, [
      el('h2', { id: 'h-jz', class: 'label fuellung' }, `Jahresziel ${j.jahr}`),
      el('span', { class: 'zeile-hinweis' }, `Strich = anteilig bis heute (${Math.round(j.anteil * 100)} % vom Jahr)${j.satz ? ` · Ø ${euro(j.satz)} je Stunde` : ''}`),
    ]),
    mitUmsatz ? zeile('Umsatz netto', j.umsatz, (x) => euro(Math.round(x ?? 0)).replace(/,00\s/, ' ')) : null,
    mitStunden ? zeile('Stunden gebucht', j.stunden, (x) => `${zahlText(Math.round(x ?? 0), 0)} h`) : null,
  ]);
}
