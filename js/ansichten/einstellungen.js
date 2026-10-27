// Einstellungen. Schritt 2: nur der Bereich „Daten“ (Beispieldaten, Export, Import, Sicherungen).
// Arbeitszeit, Blockzeiten, Urlaub und Kalender folgen in Schritt 4.

import { el } from '../ui.js';
import * as zustand from '../zustand.js';
import * as speicher from '../speicher.js';
import * as austausch from '../austausch.js';
import { zusammenfassung } from '../kern/daten.js';

const ANLASS = { export: 'beim Export', import: 'vor dem Import', wiederherstellen: 'vor dem Wiederherstellen' };

export function einstellungen() {
  return el('div', { class: 'seite' }, [
    el('div', {}, [
      el('div', { class: 'label' }, 'Einstellungen'),
      el('h1', { class: 'mit-abstand' }, 'Kapazität, Blockzeiten, Kalender'),
      el('p', { class: 'einleitung' }, 'Wochenkapazität = Arbeitstage × Regeltag − Feiertage − Urlaub − Blockzeiten − Termine.'),
    ]),
    el('div', { class: 'raster-karten' }, [
      datenKarte(),
      el('div', { class: 'kachel platzhalter' }, [
        el('div', { class: 'label' }, 'In Arbeit'),
        el('p', {}, 'Arbeitszeit, geblockte Zeiten, Urlaub, Feiertage und Kalender folgen in Schritt 4.'),
      ]),
    ]),
  ]);
}

function datenKarte() {
  const meldung = el('div', { class: 'meldung', role: 'status', 'aria-live': 'polite' });
  const pruefung = el('div');
  const sicherungen = el('div');
  const melden = (text, art = '') => { meldung.className = `meldung ${art}`; meldung.textContent = text; };

  const d = zustand.aktuell();
  const beispiel = zustand.istBeispiel();

  const datei = el('input', {
    type: 'file', accept: '.json,application/json', class: 'nur-vorleser', tabindex: '-1', 'aria-hidden': 'true',
    onchange: async () => {
      const f = datei.files[0];
      datei.value = '';
      if (!f) return;
      zeigePruefung(await austausch.dateiPruefen(f), f.name);
    },
  });

  function zeigePruefung(p, name) {
    melden('');
    if (!p.ok) {
      pruefung.replaceChildren(fehlerKasten(`„${name}“ kann nicht importiert werden.`, p.fehler));
      return;
    }
    const knoepfe = el('div', { class: 'knopfreihe' }, [
      el('button', {
        type: 'button', class: 'pille haupt',
        onclick: async () => {
          await austausch.importieren(p.daten);
          pruefung.replaceChildren();
          melden(`Importiert: ${zusammenfassung(p.daten)}.`, 'gruen');
        },
      }, 'Daten ersetzen'),
      el('button', { type: 'button', class: 'pille', onclick: () => pruefung.replaceChildren() }, 'Abbrechen'),
    ]);
    pruefung.replaceChildren(el('div', { class: 'kachel klein' }, [
      el('div', { class: 'zeile-titel' }, `„${name}“ geprüft`),
      el('div', { class: 'zeile-hinweis zahl' }, zusammenfassung(p.daten)),
      el('p', { class: 'zeile-hinweis' }, `Ersetzt ${beispiel ? 'die Beispieldaten' : 'deine Daten in diesem Browser'}. Der jetzige Stand wird vorher gesichert.`),
      knoepfe,
    ]));
  }

  speicher.sicherungenListe().then((alle) => {
    const eigene = alle.filter((s) => s.satz === zustand.aktiverSatz()).slice(0, 5);
    if (!eigene.length) return;
    sicherungen.replaceChildren(
      el('div', { class: 'label mit-abstand-gross' }, 'Sicherungen in diesem Browser'),
      el('div', { class: 'mit-abstand' }, eigene.map((s) => el('div', { class: 'zeile schmal' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-text zahl' }, zeitText(s.zeit)),
          el('div', { class: 'zeile-hinweis' }, `${ANLASS[s.anlass] ?? s.anlass} · ${zusammenfassung(s.daten)}`),
        ]),
        el('button', {
          type: 'button', class: 'pille leise',
          onclick: async () => {
            await austausch.wiederherstellen(s.nr);
            melden(`Stand vom ${zeitText(s.zeit)} wiederhergestellt.`, 'gruen');
          },
        }, 'Wiederherstellen'),
      ]))),
    );
  });

  return el('section', { class: 'karte', 'aria-labelledby': 'h-daten' }, [
    el('h2', { id: 'h-daten' }, 'Daten'),
    el('p', { class: 'zeile-hinweis mit-abstand' }, 'Deine Daten liegen nur in diesem Browser. Exportiere regelmäßig, dann hast du eine Sicherung als Datei.'),
    el('div', { class: 'mit-abstand' }, [
      el('div', { class: 'zeile' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel', id: 'l-beispiel' }, 'Beispieldaten'),
          el('div', { class: 'zeile-hinweis' }, 'Zum Ausprobieren. Deine echten Daten bleiben unberührt.'),
        ]),
        schalter(beispiel, 'l-beispiel', (an) => zustand.beispielSchalten(an)),
      ]),
      beispiel ? el('div', { class: 'zeile' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel' }, 'Beispieldaten zurücksetzen'),
          el('div', { class: 'zeile-hinweis' }, 'Alle Änderungen an den Beispieldaten verwerfen.'),
        ]),
        el('button', {
          type: 'button', class: 'pille',
          onclick: async () => { await zustand.beispielZuruecksetzen(); },
        }, 'Zurücksetzen'),
      ]) : null,
      el('div', { class: 'zeile' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel' }, 'Export'),
          el('div', { class: 'zeile-hinweis zahl' }, `${austausch.dateiname()} · ${zusammenfassung(d)}`),
        ]),
        el('button', {
          type: 'button', class: 'pille haupt',
          onclick: async () => { await austausch.exportieren(); melden('Exportiert und im Browser gesichert.', 'gruen'); },
        }, 'Exportieren'),
      ]),
      el('div', { class: 'zeile ohne-linie' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel' }, 'Import'),
          el('div', { class: 'zeile-hinweis' }, 'Eine exportierte Datei wieder einlesen. Vorher wird geprüft.'),
        ]),
        el('button', { type: 'button', class: 'pille', onclick: () => datei.click() }, 'Datei wählen'),
        datei,
      ]),
    ]),
    pruefung,
    meldung,
    sicherungen,
  ]);
}

function schalter(an, beschriftungId, wechsel) {
  const knopf = el('button', {
    type: 'button', role: 'switch', class: 'schalter', 'aria-checked': String(an), 'aria-labelledby': beschriftungId,
    onclick: () => { knopf.disabled = true; wechsel(!an); },
  }, [el('span', { 'aria-hidden': 'true' })]);
  return knopf;
}

function fehlerListe(fehler) {
  const gezeigt = fehler.slice(0, 8);
  return el('ul', { class: 'fehlerliste' }, [
    ...gezeigt.map((f) => el('li', {}, f)),
    fehler.length > gezeigt.length ? el('li', {}, `… und ${fehler.length - gezeigt.length} weitere`) : null,
  ]);
}

function fehlerKasten(titel, fehler) {
  return el('div', { class: 'kachel klein' }, [
    el('div', { class: 'knopfreihe' }, [el('span', { class: 'chip rot' }, 'Fehler'), el('span', { class: 'zeile-titel' }, titel)]),
    fehlerListe(fehler),
  ]);
}

function zeitText(iso) {
  const d = new Date(iso);
  const z = (n) => String(n).padStart(2, '0');
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} · ${z(d.getHours())}:${z(d.getMinutes())}`;
}
