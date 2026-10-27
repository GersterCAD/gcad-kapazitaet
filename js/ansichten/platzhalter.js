// Platzhalter für Bereiche, die in späteren Schritten gebaut werden.

import { el } from '../ui.js';

export function platzhalter({ label, titel, text }) {
  return el('div', { class: 'platzhalter' }, [
    el('div', { class: 'seitenkopf' }, [
      el('div', {}, [
        el('div', { class: 'label' }, label),
        el('h1', {}, titel),
      ]),
    ]),
    el('div', { class: 'kachel platzhalter' }, [
      el('div', { class: 'label' }, 'In Arbeit'),
      el('p', {}, text),
    ]),
  ]);
}
