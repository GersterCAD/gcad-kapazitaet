// Abrechnung → Einnahmen: was kommt in den nächsten 8 Wochen aufs Konto (brutto).
// Kein eigener Entwurf: Kacheln, Balken in den Stahlblau-Stufen wie im Diagramm der Übersicht, Zeilen, Chips.

import { el } from '../ui.js';
import * as zustand from '../zustand.js';
import * as lexware from '../lexware.js';
import { plane } from '../kern/planung.js';
import { euro } from '../kern/abrechnung.js';
import { ZAHLUNG_NAME, ZAHLUNG_CHIP } from '../kern/rechnung.js';
import { einnahmenVorschau, zahlungsziel } from '../kern/einnahmen.js';
import { beispielZahlungen } from '../kern/beispiel.js';
import { ausText, tagKurz } from '../kern/datum.js';
import { unterseiten, lexwareHinweis } from './abrechnung.js';

const STUFEN = [
  ['sicher', 'In Lexware offen'],
  ['bald', 'Abzurechnen'],
  ['geplant', 'Eingeplant'],
];
const HOEHE = 160;
const tm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : '–');
let nurOffen = false;

const kachel = (label, wert, unter, chip) => el('div', { class: 'kachel' }, [
  el('div', { class: 'label' }, label),
  el('div', { class: 'knopfreihe eng mit-abstand-mittel' }, [el('span', { class: 'kennzahl zahl' }, wert), chip]),
  el('div', { class: 'kachel-unter' }, unter),
]);

export function einnahmenSeite() {
  const d = zustand.aktuell();
  const opts = zustand.planOptionen();
  const heute = opts.heute;
  const beispiel = zustand.istBeispiel();
  const liste = beispiel ? beispielZahlungen() : lexware.zahlungen();
  const v = einnahmenVorschau(d, { plan: plane(d, opts), heute, lexwareListe: liste });
  const acht = v.summen.sicher + v.summen.bald + v.summen.geplant;
  const vier = v.wochen.slice(0, 4).reduce((s, w) => s + w.summe, 0);
  const abgeholt = beispiel ? null : lexware.zahlungenAbgeholt();
  const laeuft = lexware.laeuft('zahlungen', 'zahlungen');

  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf mitte' }, [el('h1', {}, 'Einnahmen'), unterseiten('einnahmen')]),
    lexwareHinweis(),
    el('div', { class: 'raster-kacheln' }, [
      kachel('Überfällig', euro(v.ueberfaellig), v.ueberfaellig ? 'in Lexware, Fälligkeit vorbei' : 'nichts überfällig', v.ueberfaellig ? el('span', { class: 'chip rot' }, 'nachhaken') : null),
      kachel('Nächste 4 Wochen', euro(vier), 'erwartet, brutto'),
      kachel('Nächste 8 Wochen', euro(acht), `davon ${euro(v.summen.sicher)} schon in Lexware`),
      kachel('Bezahlt diesen Monat', euro(v.bezahltMonat), liste.length ? 'laut Lexware' : 'noch kein Zahlungsstand'),
    ]),
    el('section', { class: 'karte', 'aria-labelledby': 'h-ein' }, [
      el('div', { class: 'kartenkopf' }, [
        el('h2', { id: 'h-ein', class: 'fuellung' }, 'Erwartete Einnahmen je Woche'),
        el('div', { class: 'legende' }, STUFEN.map(([k, n]) => el('span', { class: 'legende-eintrag' }, [el('span', { class: `legende-farbe ein-${k}`, 'aria-hidden': 'true' }), n]))),
      ]),
      balken(v),
      el('p', { class: 'kartentext mit-abstand-mittel' }, `Brutto. Annahmen: Stunden rechnest du am Monatsende ab, Pauschalaufträge zur Deadline, bezahlt wird nach ${zahlungsziel(d)} Tagen (Einstellungen → Abrechnung).${v.spaeter ? ` Danach: ${euro(v.spaeter)}.` : ''}`),
    ]),
    postenListe(d, v, heute, { abgeholt, laeuft, beispiel }),
  ]);
}

function balken(v) {
  const max = Math.max(1, ...v.wochen.map((w) => w.summe));
  return el('div', { class: 'ein-diagramm', role: 'img', 'aria-label': v.wochen.map((w) => `KW ${w.kw}: ${euro(w.summe)}`).join(', ') }, v.wochen.map((w) => el('div', { class: 'ein-spalte' }, [
    el('div', { class: 'ein-wert zahl' }, w.summe ? euro(Math.round(w.summe)).replace(/,00\s/, ' ') : ''),
    el('div', { class: 'ein-saeule', style: `height:${HOEHE}px` }, ['geplant', 'bald', 'sicher'].map((k) => (w[k] > 0
      ? el('div', { class: `ein-teil ein-${k}`, style: `height:${Math.max(2, Math.round((w[k] / max) * HOEHE))}px`, title: `${STUFEN.find((s) => s[0] === k)[1]}: ${euro(w[k])}` })
      : null))),
    el('div', { class: 'ein-kw zahl' }, `KW ${w.kw}`),
    el('div', { class: 'ein-datum zahl' }, tm(w.montag)),
  ])));
}

function postenListe(d, v, heute, { abgeholt, laeuft, beispiel }) {
  const projekt = (id) => d.projekte.find((p) => p.id === id);
  const zeilen = v.posten.filter((x) => !nurOffen || x.stufe === 'sicher');
  const stufeName = Object.fromEntries(STUFEN);
  return el('section', { class: 'karte', 'aria-labelledby': 'h-posten' }, [
    el('div', { class: 'kartenkopf' }, [
      el('h2', { id: 'h-posten', class: 'fuellung' }, 'Posten'),
      el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Filter' }, [[false, 'alle'], [true, 'in Lexware offen']].map(([k, n]) => el('button', {
        type: 'button', 'aria-pressed': String(nurOffen === k), 'data-fokus': `efilter-${k}`, onclick: () => { nurOffen = k; zustand.neuZeichnen(); },
      }, n))),
    ]),
    el('div', { class: 'knopfreihe eng mit-abstand-mittel' }, [
      el('span', { class: 'zeile-hinweis fuellung' }, beispiel ? 'Beispiel: erfundener Zahlungsstand.' : abgeholt ? `Zahlungsstand aus Lexware vom ${tagKurz(new Date(abgeholt))} ${new Date(abgeholt).toTimeString().slice(0, 5)}` : 'Noch kein Zahlungsstand aus Lexware.'),
      lexware.verbunden() ? el('button', {
        type: 'button', class: 'pille', disabled: laeuft ? '' : null, 'data-fokus': 'zahlungen-holen',
        onclick: async () => { try { await lexware.zahlungenAktualisieren(); } catch (f) { alert(f.message); } },
      }, laeuft ? 'wird geholt …' : 'Zahlungsstand holen') : null,
    ]),
    el('div', { class: 'mit-abstand-mittel' }, zeilen.length ? zeilen.map((x) => {
      const p = x.projektId && projekt(x.projektId);
      const chip = x.ueberfaellig ? ['rot', 'überfällig'] : x.stufe === 'sicher' ? [ZAHLUNG_CHIP[x.status] ?? '', ZAHLUNG_NAME[x.status] ?? x.status] : ['', stufeName[x.stufe]];
      const ziel = x.lexwareId && !beispiel ? lexware.link('rechnung', x.lexwareId) : p ? `#/projekte/${p.id}${x.stufe === 'geplant' ? '' : '/rechnung'}` : null;
      return el(ziel ? 'a' : 'div', { class: 'ein-zeile', href: ziel, target: x.lexwareId && !beispiel ? '_blank' : null, rel: x.lexwareId ? 'noopener' : null }, [
        el('div', { class: 'termin-wann zahl' }, x.ueberfaellig ? `seit ${tm(x.datum)}` : tagKurz(ausText(x.datum))),
        el('div', { class: 'termin-was' }, [
          el('div', { class: 'zeile-text' }, [x.titel, p ? ` · ${p.name}` : '']),
          el('div', { class: 'termin-meta' }, x.kunde || '–'),
        ]),
        el('div', { class: 'ein-rechts' }, [
          el('span', { class: 'zahl fett-mittel nowrap-text' }, euro(x.betrag)),
          el('span', { class: `chip ${chip[0]}`.trim() }, chip[1]),
        ]),
      ]);
    }) : [el('p', { class: 'kartentext' }, 'Keine offenen Posten.')]),
  ]);
}
