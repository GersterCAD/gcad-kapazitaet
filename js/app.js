// Kapazität von Gerster CAD – Einstieg der Oberfläche.
// Bereiche über die Adresse (#/uebersicht …), damit es auf GitHub Pages ohne Server läuft.

import { el, plusIcon } from './ui.js';
import { isoWoche, tagLang } from './kern/datum.js';
import { einstellungen } from './ansichten/einstellungen.js';
import { uebersicht } from './ansichten/uebersicht.js';
import { kalenderSeite, kalenderVergessen } from './ansichten/kalender.js';
import { anfrageSeite, anfrageKopf, anfrageVergessen } from './ansichten/anfrage.js';
import { projektliste } from './ansichten/projekte.js';
import { abrechnungOffen, rechnungenListe, rechnungSeite, rechnungKopf, rechnungVergessen, unterseiten } from './ansichten/abrechnung.js';
import { nachkalkSeite, nachkalkKopf, nachkalkUebersichtSeite } from './ansichten/nachkalkulation.js';
import * as lexware from './lexware.js';
import { angeboteListe, angebotSeite, angebotKopf, auftragSeite, auftragVergessen } from './ansichten/angebote.js';
import { projektseite, projektKontext } from './ansichten/projekt.js';
import { projektformular, formularKontext, formularVergessen } from './ansichten/projektformular.js';
import * as zustand from './zustand.js';
import * as kalender from './kalender.js';
import * as github from './github.js';
import * as abgleich from './abgleich.js';
import * as stoppuhr from './stoppuhr.js';
import { kopfTimer, mobilTimer } from './ansichten/zeitstopper.js';

// Fünf Bereiche nach Entwurf Index B (Navigation.dc.html), Einstellungen als Zahnrad in der Kopfzeile.
// Angebote enthält „Anfragen“ (Anfrage prüfen) und „Angebote“.
const BEREICHE = [
  { id: 'uebersicht', name: 'Übersicht', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { id: 'projekte', name: 'Projekte', icon: 'M3 7h18v13H3zM8 7V4h8v3' },
  { id: 'angebote', name: 'Angebote', icon: 'M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h6' },
  { id: 'abrechnung', name: 'Abrechnung', icon: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h4' },
  { id: 'kalender', name: 'Kalender', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
];
const ZAHNRAD = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>';

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
    titel: 'Neues Projekt', zurueck: '#/projekte',
    kontext: formularKontext(null),
    status: 'Nicht gespeichert',
    inhalt: projektformular(null),
  }),
  anfragen: () => ({ bereich: 'angebote', titel: 'Anfrage prüfen', ...anfrageKopf(null), voll: true, inhalt: anfrageSeite(null) }),
  angebote: () => ({ bereich: 'angebote', kontext: 'Angebote', inhalt: angeboteListe() }),
  abrechnung: () => ({ bereich: 'abrechnung', kontext: 'Abrechnung', inhalt: abrechnungOffen() }),
  'abrechnung/nachkalkulation': () => ({ bereich: 'abrechnung', titel: 'Nachkalkulation', kontext: 'Nachkalkulation', inhalt: nachkalkUebersichtSeite(unterseiten('nachkalkulation')) }),
  'abrechnung/rechnungen': () => ({ bereich: 'abrechnung', titel: 'Rechnungen', kontext: 'Rechnungen', inhalt: rechnungenListe() }),
  kalender: () => ({
    bereich: 'kalender',
    kontext: 'Kalender',
    kalenderStatus: true,
    inhalt: kalenderSeite(),
  }),
  einstellungen: () => ({
    bereich: 'einstellungen',
    titel: 'Einstellungen',
    kontext: 'Einstellungen',
    status: 'Änderungen gelten sofort für die Planung',
    schmal: true,
    inhalt: einstellungen(),
  }),
};

// Kalenderstatus in der Kopfzeile: grün = abgeglichen (weniger als eine Stunde alt), gelb = alt oder Fehler
function kalenderStatus() {
  const i = kalender.info();
  let farbe = '', text = 'Kalender nicht verbunden';
  if (zustand.istBeispiel()) text = 'Beispieltermine';
  else if (i.fehler) { farbe = 'gelb'; text = 'Kalender: Abgleich fehlgeschlagen'; }
  else if (i.abgeglichen) {
    const frisch = Date.now() - new Date(i.abgeglichen) < 60 * 60 * 1000;
    farbe = frisch ? 'gruen' : 'gelb';
    text = `Kalender ${i.quelle === 'datei' ? 'aus Datei' : 'abgeglichen'} · ${kalender.vorText(i.abgeglichen)}`;
  }
  // Kurz wie im Entwurf („Kalender · Lexware“, ein Punkt für alle Verbindungen), Einzelheiten als Hinweis.
  // Grün = alles abgeglichen, Gelb = Hinweis, Rot = Fehler.
  const lx = lexware.info();
  const lxAn = lexware.verbunden();
  const lxFehler = github.verbunden() && !zustand.istBeispiel() && lx.status && !lx.status.verbunden && lx.status.fehler && !/fehlt noch/.test(lx.status.fehler);
  if (lxFehler) farbe = 'rot';
  else if (lxAn && farbe === 'gruen' && lx.fehler) farbe = 'gelb';
  const teile = [text, lxAn ? `Lexware Office verbunden${lx.status.organisation ? ` (${lx.status.organisation})` : ''}` : lxFehler ? `Lexware: ${lx.status.fehler}` : null].filter(Boolean);
  return el('a', { class: 'kopf-status verbindungen', href: lxFehler ? '#/einstellungen' : '#/kalender', title: i.fehler ? `${teile.join(' · ')}: ${i.fehler}` : teile.join(' · '), 'aria-label': teile.join(' · ') }, [
    el('span', { class: `punkt ${farbe}`.trim(), 'aria-hidden': 'true' }),
    el('span', { class: 'verbindungen-text' }, lxAn || lxFehler ? 'Kalender · Lexware' : 'Kalender'),
  ]);
}

function kopfzeile(a) {
  return el('header', { class: 'kopf' }, [
    // Am iPhone steht statt der Marke der Seitentitel (iPhone.dc.html)
    el('div', { class: 'kopf-titel-mobil' }, [
      a.zurueck ? el('a', { class: 'kopf-zurueck', href: a.zurueck, 'aria-label': 'Zurück' }, '‹') : null,
      el('span', {}, a.titel ?? BEREICHE.find((b) => b.id === a.bereich)?.name ?? 'Kapazität'),
    ]),
    el('a', { class: 'kopf-marke', href: '#/uebersicht' }, [
      el('span', { class: 'kopf-name' }, 'Kapazität'),
      el('span', { class: 'kopf-zusatz' }, 'von Gerster CAD'),
    ]),
    el('div', { class: 'kopf-trenner', 'aria-hidden': 'true' }),
    el('div', { class: 'kopf-kontext' }, a.kontext),
    zustand.istBeispiel() ? el('a', { class: 'chip', href: '#/einstellungen', title: 'Beispieldaten in den Einstellungen abschalten' }, 'Beispieldaten') : null,
    el('div', { class: 'fuellung' }),
    a.status ? el('span', { class: 'kopf-status kopf-speicher' }, a.status) : null,
    el('div', { class: 'kopf-timer-platz' }, kopfTimer()),
    kalenderStatus(),
    el('a', {
      class: 'kopf-zahnrad', href: '#/einstellungen', 'aria-label': 'Einstellungen', title: 'Einstellungen',
      'aria-current': a.bereich === 'einstellungen' ? 'page' : null, html: ZAHNRAD,
    }),
    a.aktionen
      ? el('div', { class: 'kopf-aktionen' }, [
          el('a', { class: 'pille', href: '#/anfragen' }, 'Anfrage prüfen'),
          el('a', { class: 'pille haupt', href: '#/projekte/neu' }, [plusIcon(), 'Projekt anlegen']),
        ])
      : null,
  ]);
}

// Oben als Pillen, am iPhone als Tab-Leiste unten (mit Bildzeichen aus dem Entwurf)
function navigation(aktiv) {
  return el('nav', { class: 'bereiche', 'aria-label': 'Bereiche' },
    BEREICHE.map((b) => el('a', { href: b.href ?? `#/${b.id}`, 'aria-current': b.id === aktiv ? 'page' : null }, [
      el('span', {
        class: 'bereich-icon', 'aria-hidden': 'true',
        html: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${b.icon}"/></svg>`,
      }),
      el('span', { class: 'bereich-name' }, b.name),
    ])));
}

// Adressen mit Projekt-ID: #/projekte/<id> und #/projekte/<id>/bearbeiten
function ansichtFuer(pfad) {
  if (ANSICHTEN[pfad]) return ANSICHTEN[pfad]();
  const a = pfad.match(/^anfragen\/([^/]+)$/);
  if (a) return { bereich: 'angebote', titel: 'Anfrage', zurueck: '#/projekte', ...anfrageKopf(a[1]), voll: true, inhalt: anfrageSeite(a[1]) };
  const an = pfad.match(/^angebote\/([^/]+)(\/auftrag)?$/);
  if (an) {
    if (an[2]) return { bereich: 'angebote', titel: 'Auftrag einplanen', zurueck: `#/angebote/${an[1]}`, kontext: 'Auftrag einplanen', grau: true, schmal: true, inhalt: auftragSeite(an[1]) };
    return { bereich: 'angebote', ...angebotKopf(an[1]), inhalt: angebotSeite(an[1]) };
  }
  const nk = pfad.match(/^projekte\/([^/]+)\/nachkalkulation$/);
  if (nk) return { bereich: 'abrechnung', ...nachkalkKopf(nk[1]), inhalt: nachkalkSeite(nk[1]) };
  const r = pfad.match(/^projekte\/([^/]+)\/rechnung$/);
  if (r) return { bereich: 'abrechnung', ...rechnungKopf(r[1]), inhalt: rechnungSeite(r[1]) };
  const m = pfad.match(/^projekte\/([^/]+)(\/bearbeiten)?$/);
  if (m) {
    const p = zustand.aktuell().projekte.find((x) => x.id === m[1]);
    if (m[2]) return { bereich: 'projekte', titel: 'Projekt bearbeiten', zurueck: `#/projekte/${m[1]}`, kontext: formularKontext(m[1]), status: 'Nicht gespeichert', inhalt: projektformular(m[1]) };
    return { bereich: 'projekte', titel: p?.name ?? 'Projekt', zurueck: '#/projekte', kontext: p ? projektKontext(p) : 'Projekt', status: p ? 'Gespeichert' : null, inhalt: projektseite(m[1]) };
  }
  return ANSICHTEN.uebersicht();
}

function zeigen() {
  const pfad = location.hash.replace(/^#\/?/, '') || 'uebersicht';
  const fokus = document.activeElement?.dataset?.fokus;
  const ansicht = ansichtFuer(pfad);
  const titel = ansicht.titel ?? BEREICHE.find((b) => b.id === ansicht.bereich)?.name;
  document.title = `${titel} · Kapazität`;

  const app = document.getElementById('app');
  const k = abgleich.info();
  const band = k.aktiv && k.konflikt && pfad !== 'einstellungen'
    ? el('div', { class: 'hinweisband', role: 'status' }, [
        el('span', { class: 'chip gelb' }, 'Abgleich'),
        el('div', { class: 'hinweisband-text' }, ['Auf einem anderen Gerät wurde dasselbe geändert. ', el('a', { href: '#/einstellungen' }, 'Bitte entscheiden, welcher Stand gilt.')]),
      ])
    : null;
  document.body.classList.toggle('grau', !!ansicht.grau);
  const inhalt = el('main', { class: `inhalt${ansicht.schmal ? ' schmal' : ''}${ansicht.voll ? ' voll' : ''}${ansicht.grau ? ' auftrag' : ''}`, id: 'inhalt', tabindex: '-1' }, [band, ansicht.inhalt]);
  app.replaceChildren(kopfzeile(ansicht), navigation(ansicht.bereich), inhalt, mobilTimer(pfad) ?? '');
  app.classList.toggle('mit-mobil-timer', !!app.querySelector('.mobil-timer'));
  // Nach dem Neuzeichnen den Fokus zurück auf denselben Knopf (wichtig für Tastatur und Vorlesen)
  if (fokus) app.querySelector(`[data-fokus="${CSS.escape(fokus)}"]`)?.focus({ preventScroll: true });
}

window.addEventListener('hashchange', () => {
  formularVergessen();
  anfrageVergessen(location.hash.replace(/^#\/?/, ''));
  kalenderVergessen();
  auftragVergessen();
  rechnungVergessen(location.hash.replace(/^#\/?/, ''));
  zeigen();
  window.scrollTo(0, 0);
});
zustand.abonnieren(zeigen);
kalender.abonnieren(zeigen);
abgleich.abonnieren(zeigen);
lexware.abonnieren(zeigen);
Promise.all([zustand.starten(), github.starten(), kalender.starten(), abgleich.starten(), lexware.starten()])
  .then(() => { kalender.automatisch(); abgleich.automatisch(); stoppuhr.ticken(); lexware.abgleichen(); lexware.beobachten(); })
  .catch((f) => console.error('Daten konnten nicht geladen werden:', f))
  .finally(zeigen);

// Offline-Start: Service Worker nur über https oder localhost.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch((f) => console.warn('Service Worker nicht registriert:', f));
}
