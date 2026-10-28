// Kapazität von Gerster CAD – Einstieg der Oberfläche.
// Bereiche über die Adresse (#/uebersicht …), damit es auf GitHub Pages ohne Server läuft.

import { el, plusIcon } from './ui.js';
import { isoWoche, tagLang } from './kern/datum.js';
import { platzhalter } from './ansichten/platzhalter.js';
import { einstellungen } from './ansichten/einstellungen.js';
import { uebersicht } from './ansichten/uebersicht.js';
import { anfrageSeite, anfrageKopf, anfrageVergessen } from './ansichten/anfrage.js';
import { projektliste } from './ansichten/projekte.js';
import { projektseite, projektKontext } from './ansichten/projekt.js';
import { projektformular, formularKontext, formularVergessen } from './ansichten/projektformular.js';
import * as zustand from './zustand.js';

const BEREICHE = [
  { id: 'uebersicht', name: 'Übersicht' },
  { id: 'projekte', name: 'Projekte' },
  { id: 'anfragen', name: 'Anfragen' },
  { id: 'kalender', name: 'Kalender' },
  { id: 'einstellungen', name: 'Einstellungen' },
];

// Je Ansicht: Kopfzeilen-Kontext, Statustext rechts, ob die Aktionen sichtbar sind, Inhalt.
const ANSICHTEN = {
  uebersicht: () => {
    const heute = new Date();
    return {
      bereich: 'uebersicht',
      kontext: [`KW ${isoWoche(heute).woche} `, el('span', { class: 'sekundaer' }, `· ${tagLang(heute)}`)],
      kalenderStatus: true,
      aktionen: true,
      inhalt: uebersicht(),
    };
  },
  projekte: () => ({
    bereich: 'projekte',
    kontext: 'Projekte',
    inhalt: projektliste(),
  }),
  'projekte/neu': () => ({
    bereich: 'projekte',
    kontext: formularKontext(null),
    status: 'Nicht gespeichert',
    inhalt: projektformular(null),
  }),
  anfragen: () => ({ bereich: 'anfragen', ...anfrageKopf(null), voll: true, inhalt: anfrageSeite(null) }),
  kalender: () => ({
    bereich: 'kalender',
    kontext: 'Kalender',
    kalenderStatus: true,
    inhalt: platzhalter({
      label: 'Kalender',
      titel: 'Termine und Blockzeiten',
      text: 'Wochen- und Monatsansicht der Termine. Das folgt in Schritt 7.',
    }),
  }),
  einstellungen: () => ({
    bereich: 'einstellungen',
    kontext: 'Einstellungen',
    status: 'Änderungen gelten sofort für die Planung',
    schmal: true,
    inhalt: einstellungen(),
  }),
};

// Kalender ist erst ab Schritt 7 angebunden.
function kalenderStatus() {
  return el('span', { class: 'kopf-status' }, [
    el('span', { class: 'punkt', 'aria-hidden': 'true' }),
    zustand.istBeispiel() ? 'Beispieltermine' : 'Kalender nicht verbunden',
  ]);
}

function kopfzeile(a) {
  return el('header', { class: 'kopf' }, [
    el('a', { class: 'kopf-marke', href: '#/uebersicht' }, [
      el('span', { class: 'kopf-name' }, 'Kapazität'),
      el('span', { class: 'kopf-zusatz' }, 'von Gerster CAD'),
    ]),
    el('div', { class: 'kopf-trenner', 'aria-hidden': 'true' }),
    el('div', { class: 'kopf-kontext' }, a.kontext),
    zustand.istBeispiel() ? el('a', { class: 'chip', href: '#/einstellungen', title: 'Beispieldaten in den Einstellungen abschalten' }, 'Beispieldaten') : null,
    el('div', { class: 'fuellung' }),
    a.kalenderStatus ? kalenderStatus() : null,
    a.status ? el('span', { class: 'kopf-status' }, a.status) : null,
    a.aktionen
      ? el('div', { class: 'kopf-aktionen' }, [
          el('a', { class: 'pille', href: '#/anfragen' }, 'Anfrage prüfen'),
          el('a', { class: 'pille haupt', href: '#/projekte/neu' }, [plusIcon(), 'Projekt anlegen']),
        ])
      : null,
  ]);
}

function navigation(aktiv) {
  return el('nav', { class: 'bereiche', 'aria-label': 'Bereiche' },
    BEREICHE.map((b) => el('a', { href: `#/${b.id}`, 'aria-current': b.id === aktiv ? 'page' : null }, b.name)));
}

// Adressen mit Projekt-ID: #/projekte/<id> und #/projekte/<id>/bearbeiten
function ansichtFuer(pfad) {
  if (ANSICHTEN[pfad]) return ANSICHTEN[pfad]();
  const a = pfad.match(/^anfragen\/([^/]+)$/);
  if (a) return { bereich: 'anfragen', ...anfrageKopf(a[1]), voll: true, inhalt: anfrageSeite(a[1]) };
  const m = pfad.match(/^projekte\/([^/]+)(\/bearbeiten)?$/);
  if (m) {
    const p = zustand.aktuell().projekte.find((x) => x.id === m[1]);
    if (m[2]) return { bereich: 'projekte', kontext: formularKontext(m[1]), status: 'Nicht gespeichert', inhalt: projektformular(m[1]) };
    return { bereich: 'projekte', kontext: p ? projektKontext(p) : 'Projekt', status: p ? 'Gespeichert' : null, inhalt: projektseite(m[1]) };
  }
  return ANSICHTEN.uebersicht();
}

function zeigen() {
  const pfad = location.hash.replace(/^#\/?/, '') || 'uebersicht';
  const fokus = document.activeElement?.dataset?.fokus;
  const ansicht = ansichtFuer(pfad);
  const titel = BEREICHE.find((b) => b.id === ansicht.bereich)?.name;
  document.title = `${titel} · Kapazität`;

  const app = document.getElementById('app');
  const inhalt = el('main', { class: `inhalt${ansicht.schmal ? ' schmal' : ''}${ansicht.voll ? ' voll' : ''}`, id: 'inhalt', tabindex: '-1' }, ansicht.inhalt);
  app.replaceChildren(kopfzeile(ansicht), navigation(ansicht.bereich), inhalt);
  // Nach dem Neuzeichnen den Fokus zurück auf denselben Knopf (wichtig für Tastatur und Vorlesen)
  if (fokus) app.querySelector(`[data-fokus="${CSS.escape(fokus)}"]`)?.focus({ preventScroll: true });
}

window.addEventListener('hashchange', () => {
  formularVergessen();
  anfrageVergessen(location.hash.replace(/^#\/?/, ''));
  zeigen();
  window.scrollTo(0, 0);
});
zustand.abonnieren(zeigen);
zustand.starten()
  .catch((f) => console.error('Daten konnten nicht geladen werden:', f))
  .finally(zeigen);

// Offline-Start: Service Worker nur über https oder localhost.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch((f) => console.warn('Service Worker nicht registriert:', f));
}
