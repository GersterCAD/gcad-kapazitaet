// Projektliste. Für die Liste gibt es keinen eigenen Entwurf – sie nutzt Seitenkopf, Umschalter,
// Zeilen, Statuschips und Farbstreifen aus dem Entwurf Index A.

import { el, plusIcon, zahlText } from '../ui.js';
import * as zustand from '../zustand.js';
import { STATUS_FEST, soll, ist } from '../kern/daten.js';
import { plane } from '../kern/planung.js';
import { ausText, tagKurz } from '../kern/datum.js';
import { statusChip, planChip } from './projekt.js';

const FILTER = [
  { id: 'aktiv', name: 'Aktiv', status: ['auftrag', 'laeuft', 'pausiert'] },
  { id: 'anfragen', name: 'Anfragen', status: ['anfrage', 'angebot'] },
  { id: 'abgeschlossen', name: 'Abgeschlossen', status: ['abgeschlossen', 'abgesagt'] },
  { id: 'alle', name: 'Alle', status: null },
];
let filter = 'aktiv';

export function projektliste() {
  const d = zustand.aktuell();
  const plan = plane(d, zustand.planOptionen());
  const f = FILTER.find((x) => x.id === filter);
  const projekte = d.projekte
    .filter((p) => !f.status || f.status.includes(p.status))
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.name.localeCompare(b.name));
  const anzahl = (x) => d.projekte.filter((p) => !x.status || x.status.includes(p.status)).length;

  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf' }, [
      el('div', {}, [
        el('div', { class: 'label' }, 'Projekte'),
        el('h1', {}, 'Alle Projekte'),
      ]),
      el('a', { class: 'pille haupt', href: '#/projekte/neu' }, [plusIcon(), 'Projekt anlegen']),
    ]),
    el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Projekte filtern' }, FILTER.map((x) =>
      el('button', {
        type: 'button', 'aria-pressed': String(x.id === filter), 'data-fokus': `filter-${x.id}`,
        onclick: () => { filter = x.id; zustand.neuZeichnen(); },
      }, [x.name, el('span', { class: 'sekundaer zahl' }, ` ${anzahl(x)}`)]))),
    el('section', { class: 'karte', 'aria-label': 'Projektliste' }, projekte.length
      ? projekte.map((p, i) => projektZeile(d, plan, p, i === projekte.length - 1))
      : [el('p', { class: 'zeile-hinweis' }, filter === 'aktiv' ? 'Keine laufenden Projekte. Leg eins an oder schau bei den Anfragen.' : 'Hier ist nichts.')]),
  ]);
}

function projektZeile(d, plan, p, letzte) {
  const sollH = soll(p);
  const istH = ist(d, p.id);
  const info = STATUS_FEST.includes(p.status) ? plan.projekte[p.id] : null;
  const unter = [p.nr, p.art, p.kunde].filter(Boolean).join(' · ');
  return el('a', { class: `zeile projektzeile${letzte ? ' ohne-linie' : ''}`, href: `#/projekte/${p.id}` }, [
    el('span', {
      class: `farbstreifen${['anfrage', 'angebot'].includes(p.status) ? ' anfrage' : ''}`, 'aria-hidden': 'true',
      style: p.farbe && !['anfrage', 'angebot'].includes(p.status) ? `background:${p.farbe}` : null,
    }),
    el('div', { class: 'fuellung' }, [
      el('div', { class: 'zeile-titel' }, p.name),
      unter ? el('div', { class: 'zeile-hinweis' }, unter) : null,
    ]),
    el('div', { class: 'projektzeile-werte' }, [
      el('span', { class: 'spalte-status' }, statusChip(p)),
      el('span', { class: 'spalte-plan' }, info ? planChip(info.status) : null),
      el('span', { class: 'zeile-text zahl spalte-stunden' }, `${zahlText(istH)} / ${zahlText(sollH)} h`),
      el('span', { class: 'zeile-hinweis zahl spalte-abgabe' }, p.deadline ? `Abgabe ${tagKurz(ausText(p.deadline))}` : 'ohne Deadline'),
    ]),
  ]);
}
