// App-Sperre: Sperrbildschirm und Karte in den Einstellungen. Kein eigener Entwurf: Karten, Felder, Pillen.

import { el, feldGruppe } from '../ui.js';
import * as zustand from '../zustand.js';
import * as sperre from '../sperre.js';
import { pinGueltig, SPERR_MINUTEN } from '../kern/pin.js';
import { loeschKnopf } from './einstellungen.js';

const pinFeld = (attr = {}) => el('input', { class: 'feld hoch zahl', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '12', ...attr });
const FORM_PIN = 'Die PIN braucht 6 bis 12 Ziffern.';

// ---------- Sperrbildschirm ----------

export function sperrSeite() {
  const pin = pinFeld({ id: 'sperre-pin', 'aria-label': 'PIN' });
  const meldung = el('div', { class: 'meldung rot', role: 'alert' });
  const knopf = el('button', { type: 'submit', class: 'pille gross haupt breit' }, 'Entsperren');
  const zuruecksetzen = el('div');
  const form = el('form', {
    class: 'formular mit-abstand',
    onsubmit: async (ev) => {
      ev.preventDefault();
      knopf.disabled = true;
      const r = await sperre.entsperren(pin.value);
      if (r.ok) return;
      pin.value = '';
      knopf.disabled = false;
      meldung.textContent = r.gesperrt ? `Zu viele Versuche. Noch ${r.warte} Sekunden warten.`
        : r.warte ? `Falsche PIN. Du kannst es in ${r.warte} Sekunden wieder versuchen.` : 'Falsche PIN.';
      pin.focus();
    },
  }, [pin, meldung, knopf]);
  const frage = el('button', {
    type: 'button', class: 'textknopf mit-abstand-mittel',
    onclick: () => {
      frage.remove();
      zuruecksetzen.replaceChildren(
        el('p', { class: 'zeile-hinweis' }, 'Dann löschst du den GitHub-Zugang und alle Daten auf diesem Gerät. Deine Daten im privaten Repo bleiben. Was noch nicht abgeglichen ist, geht verloren. Danach trägst du einen neuen Token ein.'),
        el('div', { class: 'knopfreihe mit-abstand-mittel' }, [loeschKnopf('Dieses Gerät zurücksetzen', async () => { await sperre.geraetZuruecksetzen(); location.reload(); })]),
      );
    },
  }, 'PIN vergessen?');
  return el('main', { class: 'sperre' }, el('section', { class: 'karte sperre-karte', 'aria-labelledby': 'h-sperre' }, [
    el('div', { class: 'label' }, 'Kapazität von Gerster CAD'),
    el('h1', { id: 'h-sperre' }, 'Gesperrt'),
    el('p', { class: 'kartentext' }, 'Gib deine PIN ein.'),
    form, frage, zuruecksetzen,
  ]));
}

// ---------- Einstellungen ----------

let modus = null;   // null | 'aendern' | 'entfernen'

function neuFormular() {
  const eins = pinFeld({ 'data-fokus': 'pin-neu' });
  const zwei = pinFeld({ 'data-fokus': 'pin-wdh' });
  const pruefen = () => {
    if (!pinGueltig(eins.value)) return FORM_PIN;
    if (eins.value !== zwei.value) return 'Die beiden PINs sind nicht gleich.';
    return null;
  };
  return { felder: [feldGruppe('PIN', eins), feldGruppe('PIN wiederholen', zwei)], pruefen, wert: () => eins.value };
}

export function sperreKarte() {
  const fehler = el('div', { class: 'meldung rot', role: 'alert' });
  const kopf = [el('h2', { id: 'h-pin' }, 'App-Sperre')];
  if (!sperre.aktiv()) {
    const f = neuFormular();
    return el('section', { class: 'karte', 'aria-labelledby': 'h-pin' }, [
      ...kopf,
      el('p', { class: 'kartentext' }, 'Mit einer PIN liegt dein GitHub-Token verschlüsselt auf diesem Gerät. Ohne PIN ist er wertlos. Die App sperrt sich nach 30 Minuten ohne Nutzung und spätestens einmal am Tag. Die PIN gilt nur für dieses Gerät.'),
      el('div', { class: 'feldpaar mit-abstand-mittel' }, f.felder),
      fehler,
      el('div', { class: 'knopfreihe mit-abstand-mittel' }, [el('button', {
        type: 'button', class: 'pille haupt', 'data-fokus': 'pin-festlegen',
        onclick: async () => {
          const t = f.pruefen();
          if (t) { fehler.textContent = t; return; }
          await sperre.pinFestlegen(f.wert());
          zustand.neuZeichnen();
        },
      }, 'PIN festlegen')]),
    ]);
  }

  let formular = null;
  if (modus) {
    const alt = pinFeld({ 'data-fokus': 'pin-alt' });
    const neu = modus === 'aendern' ? neuFormular() : null;
    formular = el('div', { class: 'kachel klein formular mit-abstand' }, [
      el('div', { class: 'feldpaar' }, [feldGruppe(modus === 'aendern' ? 'Bisherige PIN' : 'PIN', alt), ...(neu ? neu.felder : [])]),
      fehler,
      el('div', { class: 'knopfreihe' }, [
        el('button', {
          type: 'button', class: `pille ${modus === 'aendern' ? 'haupt' : 'gefahr'}`, 'data-fokus': 'pin-ok',
          onclick: async () => {
            const t = neu?.pruefen();
            if (t) { fehler.textContent = t; return; }
            const ok = modus === 'aendern' ? await sperre.pinAendern(alt.value, neu.wert()) : await sperre.pinEntfernen(alt.value);
            if (!ok) { fehler.textContent = 'Die PIN stimmt nicht.'; return; }
            modus = null;
            zustand.neuZeichnen();
          },
        }, modus === 'aendern' ? 'PIN ändern' : 'Sperre entfernen'),
        el('button', { type: 'button', class: 'pille leise', 'data-fokus': 'pin-zu', onclick: () => { modus = null; zustand.neuZeichnen(); } }, 'Abbrechen'),
      ]),
    ]);
  }
  return el('section', { class: 'karte', 'aria-labelledby': 'h-pin' }, [
    el('div', { class: 'knopfreihe' }, [el('div', { class: 'fuellung' }, kopf), el('span', { class: 'chip gruen' }, 'an')]),
    el('p', { class: 'kartentext' }, 'Dein GitHub-Token liegt verschlüsselt auf diesem Gerät. Die Planungsdaten im Browser verschlüsselt die PIN nicht, sie sind nur hinter der Sperre.'),
    el('div', { class: 'zeile ohne-linie umbruch' }, [
      el('div', { class: 'fuellung' }, [el('div', { class: 'zeile-titel', id: 'l-sperrzeit' }, 'Sperren nach'), el('div', { class: 'zeile-hinweis' }, 'ohne Nutzung, spätestens einmal am Tag')]),
      el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-sperrzeit' }, SPERR_MINUTEN.map((m) => el('button', {
        type: 'button', class: 'wahl', 'aria-pressed': String(m === sperre.minuten()), 'data-fokus': `sperr-${m}`,
        onclick: async () => { await sperre.minutenSetzen(m); zustand.neuZeichnen(); },
      }, `${m} Min.`))),
    ]),
    el('div', { class: 'knopfreihe mit-abstand-mittel' }, [
      el('button', { type: 'button', class: 'pille', 'data-fokus': 'pin-jetzt', onclick: () => sperre.sperren() }, 'Jetzt sperren'),
      el('button', { type: 'button', class: 'pille', 'data-fokus': 'pin-m-aendern', onclick: () => { modus = 'aendern'; zustand.neuZeichnen(); } }, 'PIN ändern'),
      el('button', { type: 'button', class: 'pille leise', 'data-fokus': 'pin-m-entfernen', onclick: () => { modus = 'entfernen'; zustand.neuZeichnen(); } }, 'Sperre entfernen'),
    ]),
    formular,
  ]);
}
