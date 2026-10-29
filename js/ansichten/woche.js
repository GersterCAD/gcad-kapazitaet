// Karte „Deine Woche“ auf der Übersicht: Mo–Do Wochenstart, ab Freitag Wochenabschluss.
// Kein eigener Entwurf: nur Bausteine aus dem Entwurf (Karte, Label, Terminzeilen, Chips, Pillen).
// „Erledigt“ merkt sich das Gerät je Woche (meta 'woche'), danach steht nur noch eine Zeile da.

import { el, zahlText, hakenIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import * as speicher from '../speicher.js';
import { wochenKey, wochenModus, wochenStart, wochenAbschluss } from '../kern/woche.js';
import { ausText, tagKurz, isoWoche } from '../kern/datum.js';
import { euro } from '../kern/abrechnung.js';
import * as stoppuhr from '../stoppuhr.js';
import { vergessen } from '../kern/timer.js';

let erledigt = null;   // { '2026-W44': { start: true, abschluss: true } }
let geladen = false;

function laden() {
  if (geladen) return;
  geladen = true;
  speicher.metaLaden('woche').then((v) => { erledigt = v ?? {}; zustand.neuZeichnen(); }).catch(() => { erledigt = {}; });
}

async function setzen(key, modus, wert) {
  erledigt = { ...(erledigt ?? {}), [key]: { ...(erledigt?.[key] ?? {}), [modus]: wert } };
  // nur die letzten 8 Wochen behalten
  const schluessel = Object.keys(erledigt).sort().slice(-8);
  erledigt = Object.fromEntries(schluessel.map((k) => [k, erledigt[k]]));
  await speicher.metaSpeichern('woche', erledigt);
  zustand.neuZeichnen();
}

const tag = (d) => tagKurz(ausText(d));
const zeile = (wann, titel, meta, href) => el(href ? 'a' : 'div', { class: 'terminzeile', href }, [
  el('div', { class: 'termin-wann zahl' }, wann),
  el('div', { class: 'termin-was' }, [el('div', { class: 'zeile-text' }, titel), meta ? el('div', { class: 'termin-meta' }, meta) : null]),
]);
const block = (titel, inhalt, leer) => el('div', { class: 'woche-block' }, [
  el('h3', { class: 'label' }, titel),
  el('div', { class: 'mit-abstand-mittel' }, inhalt.length ? inhalt : [el('p', { class: 'kartentext' }, leer)]),
]);

/** Karte für die Übersicht. plan aus plane(). */
export function wochenKarte(d, plan) {
  laden();
  const heute = plan.heute;
  const key = wochenKey(heute);
  const modus = wochenModus(heute);
  const kw = isoWoche(ausText(heute)).woche;
  const titel = modus === 'start' ? `Wochenstart · KW ${kw}` : `Wochenabschluss · KW ${kw}`;

  if (erledigt === null) return null;
  if (erledigt[key]?.[modus]) {
    return el('section', { class: 'kachel reihe woche-zu', 'aria-labelledby': 'h-woche' }, [
      el('span', { class: 'chip gruen' }, [hakenIcon(10), 'erledigt']),
      el('h2', { id: 'h-woche', class: 'zeile-text fuellung' }, titel),
      el('button', { type: 'button', class: 'pille', 'data-fokus': 'woche-oeffnen', onclick: () => setzen(key, modus, false) }, 'Öffnen'),
    ]);
  }

  const inhalt = modus === 'start' ? startInhalt(d, plan, heute) : abschlussInhalt(d, plan, heute);
  return el('section', { class: 'karte woche-karte', 'aria-labelledby': 'h-woche' }, [
    el('div', { class: 'knopfreihe' }, [
      el('div', { class: 'fuellung' }, [
        el('div', { class: 'label' }, titel),
        el('h2', { id: 'h-woche' }, inhalt.ueberschrift),
      ]),
      el('button', { type: 'button', class: 'pille', 'data-fokus': 'woche-erledigt', onclick: () => setzen(key, modus, true) }, [hakenIcon(10), 'Erledigt']),
    ]),
    el('div', { class: 'woche-raster' }, inhalt.bloecke),
  ]);
}

function startInhalt(d, plan, heute) {
  const w = wochenStart(d, plan, heute);
  const typ = (t) => (t.typ === 'deadline' ? 'Deadline' : 'Meilenstein');
  return {
    ueberschrift: w.freiH >= 0.5 ? `${zahlText(w.freiH)} h frei für Projekte bis Sonntag` : 'Diese Woche ist voll',
    bloecke: [
      block('Termine diese Woche', w.termine.map((t) => zeile(tag(t.datum), `${t.projekt.name} · ${t.titel}`, typ(t), `#/projekte/${t.projekt.id}`)), 'Keine Deadlines oder Meilensteine.'),
      block('Engpässe', w.engpaesse.map((x) => el('a', { class: 'terminzeile', href: `#/projekte/${x.projekt.id}` }, [
        el('span', { class: `chip ${x.status === 'zuSpaet' ? 'rot' : 'gelb'}` }, x.status === 'zuSpaet' ? 'zu spät' : 'knapp'),
        el('div', { class: 'termin-was' }, [el('div', { class: 'zeile-text' }, x.projekt.name), x.deadline ? el('div', { class: 'termin-meta' }, `Deadline ${tag(x.deadline)}`) : null]),
      ])), 'Alles im Plan.'),
      block('Offene Rechnungen', w.rechnungenAlt.map((z) => zeile(
        z.abgeschlossen ? 'fertig' : `${z.seitTagen} T.`, z.projekt.name,
        `${z.offenBetrag != null ? euro(z.offenBetrag) : `${zahlText(z.offenH, 2)} h`} · ${z.abgeschlossen ? 'Projekt abgeschlossen' : 'länger als 30 Tage offen'}`,
        `#/projekte/${z.projekt.id}/rechnung`)), 'Nichts liegt zu lange.'),
      block('Angebote nachfassen', w.nachfassen.map((x) => zeile(
        `${x.seitTagen} T.`, `${x.angebot.nummer} · ${x.angebot.kunde || x.angebot.projektname || 'Angebot'}`,
        x.abgelaufen ? 'versendet, keine Antwort · abgelaufen' : 'versendet, keine Antwort', `#/angebote/${x.angebot.id}`)), 'Keine Angebote ohne Antwort.'),
    ],
  };
}

function abschlussInhalt(d, plan, heute) {
  const w = wochenAbschluss(d, plan, heute);
  const t = stoppuhr.laeuft();
  const p = t && d.projekte.find((x) => x.id === t.projektId);
  return {
    ueberschrift: `${zahlText(w.gebuchtH, 2)} h gebucht${w.lueckeH ? ` · ${zahlText(w.lueckeH, 2)} h Lücken` : ''}`,
    bloecke: [
      block('Gebucht je Tag', w.tage.map((x) => el('div', { class: 'terminzeile' }, [
        el('div', { class: 'termin-wann zahl' }, tag(x.datum)),
        el('div', { class: 'termin-was' }, [
          el('div', { class: 'zeile-text zahl' }, `${zahlText(x.gebuchtH, 2)} h von ${zahlText(x.freiH, 2)} h frei`),
        ]),
        x.lueckeH > 1 ? el('span', { class: 'chip gelb' }, `Lücke ${zahlText(x.lueckeH, 2)} h`) : el('span', { class: 'chip gruen' }, [hakenIcon(10), 'passt']),
      ])), 'Diese Woche noch keine Arbeitstage.'),
      block('Prüfen', [
        t ? zeile('Timer', p?.name ?? 'Projekt', vergessen(t) ? 'läuft seit über 10 Stunden' : 'läuft noch', `#/projekte/${t.projektId}`) : null,
        w.lueckeH ? zeile('Lücken', 'Zeit nachtragen', 'Auf der Projektseite unter „Von Hand buchen“', null) : null,
        w.nachtragH ? zeile('Nachtrag', `${zahlText(w.nachtragH, 2)} h auf Nachträgen`, 'Mit dem Kunden abstimmen', null) : null,
        w.offenNeuH ? zeile('Offen', `${zahlText(w.offenNeuH, 2)} h noch nicht abgerechnet`, 'Abrechnung → Offen', '#/abrechnung') : null,
      ].filter(Boolean), 'Alles gebucht, nichts offen.'),
      block('Nächste Woche', w.naechste.map((x) => zeile(tag(x.datum), `${x.projekt.name} · ${x.titel}`, x.typ === 'deadline' ? 'Deadline' : 'Meilenstein', `#/projekte/${x.projekt.id}`)), 'Keine Deadlines oder Meilensteine.'),
    ],
  };
}
