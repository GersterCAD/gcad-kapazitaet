// Übersicht: „Termin vorbei – auf ein Projekt buchen?“ Kein eigener Entwurf: Karte, Terminzeilen, Pillen, Auswahlfeld.

import { el, zahlText } from '../ui.js';
import * as zustand from '../zustand.js';
import { offeneTermine, terminBuchen, terminNichtBuchen } from '../kern/terminbuchung.js';
import { tagKurz } from '../kern/datum.js';
import { uhrzeit } from '../kalender.js';

const ZEIGEN = 3;
let andere = null; // uid, bei dem die Projektauswahl offen ist

export function terminFrageKarte(d, termine) {
  const liste = offeneTermine(d, termine, new Date());
  if (!liste.length) return null;
  const projekte = d.projekte.filter((p) => ['auftrag', 'laeuft'].includes(p.status)).sort((a, b) => a.name.localeCompare(b.name));
  const buchen = (t, projektId, h) => zustand.aendern((x) => { terminBuchen(x, t, projektId, h); });

  return el('section', { class: 'karte termin-frage', 'aria-labelledby': 'h-tfrage' }, [
    el('div', { class: 'label' }, liste.length === 1 ? 'Termin vorbei' : `${liste.length} Termine vorbei`),
    el('h2', { id: 'h-tfrage' }, 'Auf ein Projekt buchen?'),
    el('div', { class: 'mit-abstand-mittel' }, liste.slice(0, ZEIGEN).map(({ termin: t, stunden, vorschlag }) => {
      const start = new Date(t.start);
      const offen = andere === t.uid || !vorschlag;
      const auswahl = offen ? el('select', { class: 'feld', 'aria-label': `Projekt für ${t.titel}`, 'data-fokus': `tf-wahl-${t.uid}` }, [
        el('option', { value: '' }, 'Projekt wählen …'),
        ...projekte.map((p) => el('option', { value: p.id, selected: p.id === vorschlag?.id }, p.name)),
      ]) : null;
      return el('div', { class: 'termin-frage-zeile' }, [
        el('div', { class: 'termin-wann zahl' }, [tagKurz(start), el('div', { class: 'termin-meta' }, `${uhrzeit(t.start)}–${uhrzeit(t.ende)}`)]),
        el('div', { class: 'termin-was fuellung' }, [
          el('div', { class: 'zeile-text' }, t.titel),
          el('div', { class: 'termin-meta zahl' }, `${zahlText(stunden, 2)} h · ${t.kalender}`),
        ]),
        el('div', { class: 'knopfreihe eng' }, [
          offen ? auswahl : el('button', {
            type: 'button', class: 'pille haupt', 'data-fokus': `tf-ja-${t.uid}`, onclick: () => buchen(t, vorschlag.id, stunden),
          }, `${vorschlag.name.split(' · ')[0]} · ${zahlText(stunden, 2)} h`),
          offen ? el('button', {
            type: 'button', class: 'pille haupt', 'data-fokus': `tf-buchen-${t.uid}`,
            onclick: () => { if (auswahl.value) { andere = null; buchen(t, auswahl.value, stunden); } else auswahl.focus(); },
          }, 'Buchen') : el('button', {
            type: 'button', class: 'pille', 'data-fokus': `tf-anders-${t.uid}`, onclick: () => { andere = t.uid; zustand.neuZeichnen(); },
          }, 'Anderes Projekt'),
          el('button', {
            type: 'button', class: 'pille leise', 'data-fokus': `tf-nein-${t.uid}`, title: 'Nicht mehr fragen',
            onclick: () => zustand.aendern((x) => { terminNichtBuchen(x, t.uid); }),
          }, 'Kein Projekt'),
        ]),
      ]);
    })),
    liste.length > ZEIGEN ? el('p', { class: 'kartentext' }, [`Weitere ${liste.length - ZEIGEN} im `, el('a', { href: '#/kalender' }, 'Kalender'), '.']) : null,
  ]);
}
