// Kapazität von Gerster CAD – Einstieg der Oberfläche.
// Bereiche über die Adresse (#/uebersicht …), damit es auf GitHub Pages ohne Server läuft.

import { el, plusIcon } from './ui.js';
import { isoWoche, tagLang } from './kern/datum.js';
import { platzhalter } from './ansichten/platzhalter.js';

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
      inhalt: platzhalter({
        label: 'Übersicht',
        titel: 'Auslastung der nächsten 12 Wochen',
        text: 'Hier kommen Kennzahlen, Wochendiagramm, Vorschläge und Projektplan hin. Das folgt in Schritt 5.',
      }),
    };
  },
  projekte: () => ({
    bereich: 'projekte',
    kontext: 'Projekte',
    inhalt: platzhalter({
      label: 'Projekte',
      titel: 'Alle Projekte',
      text: 'Projekte anlegen, Positionen, Meilensteine und Zeit buchen. Das folgt in Schritt 4.',
    }),
  }),
  'projekte/neu': () => ({
    bereich: 'projekte',
    kontext: ['Neues Projekt ', el('span', { class: 'sekundaer' }, '· noch nicht gespeichert')],
    inhalt: platzhalter({
      label: 'Projekt anlegen',
      titel: 'Neues Projekt',
      text: 'Das Formular zum Anlegen folgt in Schritt 4.',
    }),
  }),
  anfragen: () => ({
    bereich: 'anfragen',
    kontext: ['Anfrage prüfen ', el('span', { class: 'sekundaer' }, '· noch nicht eingeplant')],
    status: 'Entwurf · nicht gespeichert',
    inhalt: platzhalter({
      label: 'Anfrage prüfen',
      titel: 'Passt das rein?',
      text: 'Stunden schätzen, Puffer wählen, Wunschtermin prüfen. Das folgt in Schritt 6.',
    }),
  }),
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
    inhalt: platzhalter({
      label: 'Einstellungen',
      titel: 'Kapazität und Regeln',
      text: 'Regeltag, Blockzeiten, Urlaub, Kalender und Datenabgleich. Das folgt in Schritt 4.',
    }),
  }),
};

// Kalender ist erst ab Schritt 7 angebunden.
function kalenderStatus() {
  return el('span', { class: 'kopf-status' }, [
    el('span', { class: 'punkt', 'aria-hidden': 'true' }),
    'Kalender nicht verbunden',
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

function zeigen() {
  const pfad = location.hash.replace(/^#\/?/, '') || 'uebersicht';
  const ansicht = (ANSICHTEN[pfad] || ANSICHTEN.uebersicht)();
  const titel = BEREICHE.find((b) => b.id === ansicht.bereich)?.name;
  document.title = `${titel} · Kapazität`;

  const app = document.getElementById('app');
  const inhalt = el('main', { class: 'inhalt', id: 'inhalt', tabindex: '-1' }, ansicht.inhalt);
  app.replaceChildren(kopfzeile(ansicht), navigation(ansicht.bereich), inhalt);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', zeigen);
zeigen();

// Offline-Start: Service Worker nur über https oder localhost.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch((f) => console.warn('Service Worker nicht registriert:', f));
}
