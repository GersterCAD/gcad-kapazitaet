// Zeitstopper nach Entwurf Index B (Timer.dc.html, Projektseite.dc.html, Navigation.dc.html, iPhone.dc.html):
// Pille in der Kopfzeile, Leiste am iPhone, Startknopf für den Schnellstart, Karte auf der Projektseite.

import { el, zahlText, hakenIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import * as stoppuhr from '../stoppuhr.js';
import { laufzeit, dauerText, dauerKurz, dauerLang, vergessen, endeVorschlag, stundenBis, minutenAus, dauerWorte } from '../kern/timer.js';
import { alsText, ausText, plusTage, tagKurz } from '../kern/datum.js';
import { abrechnungUeberblick } from '../kern/abrechnung.js';
import { nachtraege } from '../kern/nachtrag.js';

const zwei = (n) => String(n).padStart(2, '0');
const uhr = (d) => `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;

export const playIcon = (groesse = 14) => el('span', {
  class: 'icon', 'aria-hidden': 'true',
  html: `<svg width="${groesse}" height="${groesse}" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>`,
});
const stoppQuadrat = (klasse = '') => el('span', { class: `stopp-quadrat ${klasse}`.trim(), 'aria-hidden': 'true' });
const laufPunkt = () => el('span', { class: 'punkt laeuft', 'aria-hidden': 'true' });

const projekt = (id) => zustand.aktuell().projekte.find((x) => x.id === id);
const posText = (t) => (t.positionNr ? ` · Pos. ${t.positionNr}` : '');

/** „seit 08:52“, „seit gestern 08:52“, „seit Mo 26.10. 08:52“ */
function seitText(start) {
  const heute = zustand.heute();
  const tag = alsText(start);
  if (tag === heute) return `seit ${uhr(start)}`;
  if (tag === alsText(plusTage(ausText(heute), -1))) return `seit gestern ${uhr(start)}`;
  return `seit ${tagKurz(start)} ${uhr(start)}`;
}

// ---------- Kopfzeile ----------

/** Pille in der Kopfzeile: läuft (dunkel, mit Stopp), vergessen (gelb), sonst „weiter“ mit dem zuletzt benutzten Projekt */
export function kopfTimer() {
  const t = stoppuhr.laeuft();
  if (t) {
    const p = projekt(t.projektId);
    if (vergessen(t)) {
      return el('a', { class: 'kopf-timer spaet', href: `#/projekte/${t.projektId}`, title: 'Der Timer läuft seit über 10 Stunden' }, [
        el('span', { class: 'zahl fett', 'data-timer-lauf': 'kurz' }, dauerKurz(laufzeit(t))), 'Timer prüfen',
      ]);
    }
    return el('div', { class: 'kopf-timer laeuft' }, [
      el('a', { href: `#/projekte/${t.projektId}`, class: 'kopf-timer-link', title: 'Zur Projektseite' }, [
        laufPunkt(),
        el('span', { class: 'zahl fett', 'data-timer-lauf': 'kurz' }, dauerKurz(laufzeit(t))),
        el('span', { class: 'kopf-timer-name' }, `${p?.name ?? 'Projekt'}${posText(t)}`),
      ]),
      el('button', {
        type: 'button', class: 'kopf-timer-stopp', 'data-fokus': 'kopf-timer-stopp', 'aria-label': 'Timer stoppen und Zeit buchen',
        onclick: async () => { await stoppuhr.stoppen(); location.hash = `#/projekte/${t.projektId}`; },
      }, stoppQuadrat()),
    ]);
  }
  const z = stoppuhr.zuletzt()[0];
  const p = z && projekt(z.projektId);
  if (!p) return null;
  return el('button', {
    type: 'button', class: 'kopf-timer weiter', 'data-fokus': 'kopf-timer-weiter',
    title: 'Timer mit dem zuletzt benutzten Projekt starten',
    onclick: () => stoppuhr.schnellstart(p.id),
  }, [playIcon(10), el('span', { class: 'kopf-timer-name' }, `${p.name}${z.positionNr ? ` · Pos. ${z.positionNr}` : ''} weiter`)]);
}

/** Leiste über der Tab-Leiste am iPhone (nicht auf der Projektseite des laufenden Projekts) */
export function mobilTimer(pfad) {
  const t = stoppuhr.laeuft();
  if (!t || pfad === `projekte/${t.projektId}`) return null;
  const p = projekt(t.projektId);
  const pos = p?.positionen.find((x) => x.nr === t.positionNr);
  if (vergessen(t)) {
    return el('a', { class: 'mobil-timer spaet', href: `#/projekte/${t.projektId}` }, [
      el('span', { class: 'zahl fett', 'data-timer-lauf': 'kurz' }, dauerKurz(laufzeit(t))),
      el('span', { class: 'fuellung' }, 'Timer prüfen'),
    ]);
  }
  return el('div', { class: 'mobil-timer' }, [
    el('a', { class: 'mobil-timer-link', href: `#/projekte/${t.projektId}` }, [
      laufPunkt(),
      el('span', { class: 'fuellung' }, [
        el('span', { class: 'mobil-timer-zeit zahl', 'data-timer-lauf': '' }, dauerText(laufzeit(t))),
        el('span', { class: 'mobil-timer-name' }, `${p?.name ?? 'Projekt'}${posText(t)}${pos ? ` ${pos.bezeichnung}` : ''}`),
      ]),
    ]),
    el('button', {
      type: 'button', class: 'mobil-timer-stopp', 'aria-label': 'Timer stoppen und Zeit buchen',
      onclick: async () => { await stoppuhr.stoppen(); location.hash = `#/projekte/${t.projektId}`; },
    }, stoppQuadrat('gross')),
  ]);
}

// ---------- Schnellstart ----------

/** Runder Startknopf für eine Projektzeile. hervor = zuletzt benutzt (gefüllt). Läuft der Timer hier: Stopp. */
export function startKnopf(p, { hervor = false } = {}) {
  const t = stoppuhr.laeuft();
  if (t?.projektId === p.id) {
    return el('button', {
      type: 'button', class: 'startknopf laeuft', 'data-fokus': `start-${p.id}`, 'aria-label': `Timer für ${p.name} stoppen`,
      onclick: (e) => { e.preventDefault(); stoppuhr.stoppen(); },
    }, stoppQuadrat());
  }
  return el('button', {
    type: 'button', class: `startknopf${hervor ? ' hervor' : ''}`, 'data-fokus': `start-${p.id}`, 'aria-label': `Timer für ${p.name} starten`,
    onclick: (e) => { e.preventDefault(); stoppuhr.schnellstart(p.id); },
  }, playIcon());
}

/** Text unter dem Projektnamen: „zuletzt Pos. 2 · heute 1,5 h“ */
export function zuletztText(z) {
  if (!z) return null;
  const heute = zustand.heute();
  const wann = z.datum === heute ? (z.stundenHeute ? `heute ${zahlText(z.stundenHeute, 2)} h` : 'heute')
    : z.datum === alsText(plusTage(ausText(heute), -1)) ? 'gestern' : tagKurz(ausText(z.datum));
  return `zuletzt ${z.positionNr ? `Pos. ${z.positionNr} · ` : ''}${wann}`;
}

// ---------- Karte auf der Projektseite ----------

// Zustand, der beim Neuzeichnen erhalten bleibt
let karte = { projektId: null, wechseln: false, ende: null, nachtrag: false, ntNr: null, ntText: '', notiz: '', bearbeiten: false, fehler: '' };
const ntZu = () => { karte.nachtrag = false; karte.ntNr = null; karte.ntText = ''; };

/** s.pos = gewählte Position der Projektseite (wird mit der manuellen Buchung geteilt) */
export function timerKarte(d, p, s) {
  if (karte.projektId !== p.id) karte = { projektId: p.id, wechseln: false, ende: null, nachtrag: false, ntNr: null, ntText: '', notiz: '', bearbeiten: false, fehler: '' };
  const t = d.timer;
  const hier = t && t.projektId === p.id;
  const pos = (nr) => p.positionen.find((x) => x.nr === nr);
  const kopf = (zusatz) => el('div', { class: 'knopfreihe eng' }, [
    hier && !vergessen(t) ? laufPunkt() : null,
    el('h2', { id: 'h-timer', class: 'label' }, 'Zeitstopper'),
    zusatz,
  ]);

  if (hier && vergessen(t)) return vergessenKarte(d, p, t, kopf);

  if (hier) {
    const notiz = el('input', {
      id: 't-notiz', class: 'feld dunkel', type: 'text', value: t.notiz ?? '', placeholder: 'Was machst du gerade? (optional)', 'data-fokus': 'timer-notiz',
      onchange: () => stoppuhr.notizSetzen(notiz.value),
    });
    const p0 = pos(t.positionNr);
    return el('section', { class: 'timerkarte laeuft', 'aria-labelledby': 'h-timer' }, [
      kopf(),
      el('div', { class: 'timerkarte-reihe' }, [
        el('div', { class: 'timerkarte-links' }, [
          el('div', { class: 'timerkarte-zeit zahl', 'data-timer-lauf': 'lang', 'aria-live': 'off' }, dauerLang(laufzeit(t))),
          el('div', { class: 'timerkarte-unter' }, `${seitText(new Date(t.start))}${t.positionNr ? ` · Pos. ${t.positionNr}${p0 ? ` · ${p0.bezeichnung}` : ''}` : ''}`),
        ]),
        el('div', { class: 'knopfreihe eng' }, [
          el('button', {
            type: 'button', class: 'knopf-timer hell', 'data-fokus': 'timer-stopp',
            onclick: () => stoppuhr.stoppen(),
          }, [stoppQuadrat(), 'Stoppen']),
          p.positionen.length > 1 ? el('button', {
            type: 'button', class: 'knopf-timer rand', 'aria-expanded': String(karte.wechseln), 'data-fokus': 'timer-wechseln',
            onclick: () => { karte.wechseln = !karte.wechseln; karte.nachtrag = false; zustand.neuZeichnen(); },
          }, 'Position wechseln') : null,
          p0?.typ === 'nachtrag' ? null : el('button', {
            type: 'button', class: 'knopf-timer rand', 'aria-expanded': String(karte.nachtrag), 'data-fokus': 'timer-nachtrag',
            onclick: () => { karte.nachtrag = !karte.nachtrag; karte.wechseln = false; zustand.neuZeichnen(); },
          }, 'Nachtrag'),
        ]),
      ]),
      karte.nachtrag ? nachtragBereich(p, {
        dunkel: true,
        frage: 'Der Kunde hat etwas geändert? Dann läuft die Zeit auf einen Nachtrag. Ohne Preis wird er nach Stunden abgerechnet.',
        knoepfe: (wahl) => [
          el('button', { type: 'button', class: 'knopf-timer hell', 'data-fokus': 'nt-ab-jetzt', onclick: async () => { const nr = await stoppuhr.nachtragLaufend(wahl()); ntZu(); s.pos = nr; zustand.neuZeichnen(); } }, 'Ab jetzt'),
          el('button', { type: 'button', class: 'knopf-timer rand', 'data-fokus': 'nt-seit-start', onclick: async () => { const nr = await stoppuhr.nachtragLaufend(wahl(), { seitStart: true }); ntZu(); s.pos = nr; zustand.neuZeichnen(); } }, `Seit ${uhr(new Date(t.start))}`),
        ],
      }) : null,
      karte.wechseln ? el('div', { class: 'feldgruppe' }, [
        el('span', { class: 'feld-label', id: 'l-twechsel' }, 'Die Zeit bis jetzt wird gebucht, dann läuft der Timer auf der neuen Position weiter.'),
        el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-twechsel' }, p.positionen.map((x) => el('button', {
          type: 'button', class: 'pospille dunkel', 'aria-pressed': String(x.nr === t.positionNr), 'aria-label': `Pos. ${x.nr} ${x.bezeichnung}`,
          'data-fokus': `twechsel-${x.nr}`,
          onclick: () => { karte.wechseln = false; s.pos = x.nr; if (x.nr !== t.positionNr) stoppuhr.starten(p.id, x.nr, notiz.value); else zustand.neuZeichnen(); },
        }, x.nr))),
      ]) : null,
      el('div', { class: 'feldgruppe' }, [el('label', { class: 'feld-label', for: 't-notiz' }, 'Notiz'), notiz]),
    ]);
  }

  // Gerade gestoppt (Timer.dc.html: gemessen und gerundet, Rückgängig, Bearbeiten; dazu „Neu starten“ aus Projektseite.dc.html)
  const l = stoppuhr.letzteBuchung();
  if (l && (l.eintraege.some((z) => z.projektId === p.id) || (!l.eintraege.length && l.timer?.projektId === p.id))) {
    const e = l.eintraege;
    const summe = e.reduce((a, z) => a + z.stunden, 0);
    const gemessen = e.reduce((a, z) => a + (minutenAus(z.bis) ?? 0) - (minutenAus(z.von) ?? 0), 0);
    const pauschal = abrechnungUeberblick(d, p).art === 'pauschal';
    return el('section', { class: 'timerkarte', 'aria-labelledby': 'h-timer' }, [
      kopf(),
      el('div', { class: 'timerkarte-reihe' }, [
        el('div', { class: 'timerkarte-links', role: 'status' }, e.length ? [
          el('span', { class: 'chip gruen gross' }, [hakenIcon(12), `Gebucht: ${zahlText(summe, 2)} h`]),
          el('div', { class: 'timer-spanne zahl' }, `${e[0].von}–${e[e.length - 1].bis}`),
          el('div', { class: 'zeile-hinweis' }, `Gemessen ${dauerWorte(gemessen)}, gerundet auf ${zahlText(summe, 2)} h${e[0].positionNr ? ` · Pos. ${e[0].positionNr}` : ''} · ${pauschal && pos(e[0].positionNr)?.typ !== 'nachtrag' ? 'zählt zum Ist' : 'offen zur Abrechnung'}`),
        ] : [el('div', { class: 'zeile-text' }, 'Unter einer Minute, nichts gebucht.')]),
        el('div', { class: 'knopfreihe eng' }, [
          e.length && pos(e[0].positionNr)?.typ !== 'nachtrag' ? el('button', {
            type: 'button', class: 'pille gross', 'aria-expanded': String(karte.nachtrag), 'data-fokus': 'timer-war-nachtrag',
            onclick: () => { karte.nachtrag = !karte.nachtrag; zustand.neuZeichnen(); },
          }, 'War Nachtrag') : null,
          el('button', { type: 'button', class: 'pille gross', 'data-fokus': 'timer-zurueck', onclick: () => stoppuhr.rueckgaengig() }, e.length ? 'Rückgängig' : 'Weiterlaufen lassen'),
          e.length === 1 ? el('button', {
            type: 'button', class: 'textknopf', 'aria-expanded': String(karte.bearbeiten), 'data-fokus': 'timer-bearbeiten',
            onclick: () => { karte.bearbeiten = !karte.bearbeiten; karte.fehler = ''; zustand.neuZeichnen(); },
          }, 'Bearbeiten') : null,
          el('button', {
            type: 'button', class: 'pille gross haupt', 'data-fokus': 'timer-neu',
            onclick: () => { stoppuhr.vergessen(); stoppuhr.starten(p.id, s.pos); },
          }, 'Neu starten'),
        ]),
      ]),
      karte.bearbeiten && e.length === 1 ? bearbeitenBereich(p, e[0]) : null,
      karte.nachtrag && e.length ? nachtragBereich(p, {
        frage: `Die ${zahlText(summe, 2)} h auf einen Nachtrag umbuchen. Ohne Preis wird er nach Stunden abgerechnet.`,
        knoepfe: (wahl) => [el('button', {
          type: 'button', class: 'pille gross haupt', 'data-fokus': 'nt-umbuchen',
          onclick: async () => { const nr = await stoppuhr.nachtragUmbuchen(p.id, wahl()); ntZu(); s.pos = nr; zustand.neuZeichnen(); },
        }, 'Umbuchen')],
      }) : null,
    ]);
  }

  // Bereit
  const anderes = t && projekt(t.projektId);
  const p0 = pos(s.pos);
  return el('section', { class: 'timerkarte', 'aria-labelledby': 'h-timer' }, [
    kopf(),
    el('div', { class: 'timerkarte-reihe' }, [
      el('div', { class: 'timerkarte-links' }, [
        p.positionen.length ? el('div', { class: 'wahlreihe', role: 'group', 'aria-label': 'Position' }, p.positionen.map((x) => el('button', {
          type: 'button', class: 'pospille', 'aria-pressed': String(x.nr === s.pos), 'aria-label': `Pos. ${x.nr} ${x.bezeichnung}`, 'data-fokus': `tpos-${x.nr}`,
          onclick: () => { s.pos = x.nr; ntZu(); zustand.neuZeichnen(); },
        }, x.nr)).concat(el('button', {
          type: 'button', class: 'pospille', 'aria-pressed': String(karte.nachtrag), 'data-fokus': 'tpos-nachtrag', 'aria-label': 'Nachtrag starten',
          onclick: () => { karte.nachtrag = !karte.nachtrag; zustand.neuZeichnen(); },
        }, '+ Nachtrag'))) : null,
        p0 ? el('div', { class: 'zeile-text' }, `Pos. ${p0.nr} · ${p0.bezeichnung}`) : el('div', { class: 'zeile-text' }, 'Projekt ohne Positionen'),
        karte.nachtrag ? null : (() => {
          const notiz = el('input', {
            class: 'feld', type: 'text', value: karte.notiz, placeholder: 'Notiz (optional)', 'aria-label': 'Notiz', 'data-fokus': 'timer-notiz',
            oninput: () => { karte.notiz = notiz.value; },
          });
          return notiz;
        })(),
        anderes ? el('div', { class: 'zeile-hinweis' }, [
          'Gerade läuft ', el('a', { href: `#/projekte/${anderes.id}` }, anderes.name), ' (', el('span', { class: 'zahl', 'data-timer-lauf': 'kurz' }, dauerKurz(laufzeit(t))), '). Starten bucht die Zeit dort.',
        ]) : null,
      ]),
      karte.nachtrag ? null : el('button', {
        type: 'button', class: 'knopf-timer haupt', 'data-fokus': 'timer-start',
        onclick: () => { const n = karte.notiz.trim(); karte.notiz = ''; stoppuhr.starten(p.id, s.pos, n); },
      }, [playIcon(), 'Timer starten']),
    ]),
    karte.nachtrag ? nachtragBereich(p, {
      frage: 'Der Kunde hat etwas geändert? Starte den Timer direkt auf einem Nachtrag. Ohne Preis wird er nach Stunden abgerechnet.',
      knoepfe: (wahl) => [
        el('button', { type: 'button', class: 'knopf-timer haupt', 'data-fokus': 'nt-starten', onclick: async () => { const nr = await stoppuhr.nachtragStarten(p.id, wahl()); ntZu(); s.pos = nr; zustand.neuZeichnen(); } }, [playIcon(), 'Nachtrag starten']),
        el('button', { type: 'button', class: 'pille gross', 'data-fokus': 'nt-abbrechen', onclick: () => { ntZu(); zustand.neuZeichnen(); } }, 'Abbrechen'),
      ],
    }) : null,
  ]);
}

// Gerade gebuchten Eintrag ändern: von–bis, Position, Notiz. Die Stunden rundet der Kern neu.
function bearbeitenBereich(p, z) {
  const von = el('input', { class: 'feld zahl', type: 'time', value: z.von, 'aria-label': 'von', 'data-fokus': 'tb-von' });
  const bis = el('input', { class: 'feld zahl', type: 'time', value: z.bis === '24:00' ? '23:59' : z.bis, 'aria-label': 'bis', 'data-fokus': 'tb-bis' });
  const pos = el('select', { class: 'feld', 'aria-label': 'Position', 'data-fokus': 'tb-pos' }, [
    el('option', { value: '', selected: !z.positionNr }, 'ohne Position'),
    ...p.positionen.map((x) => el('option', { value: x.nr, selected: x.nr === z.positionNr }, `Pos. ${x.nr} · ${x.bezeichnung}`)),
  ]);
  const notiz = el('input', { class: 'feld', type: 'text', value: z.notiz ?? '', placeholder: 'Notiz (optional)', 'aria-label': 'Notiz', 'data-fokus': 'tb-notiz' });
  return el('div', { class: 'kachel klein formular mit-abstand-mittel' }, [
    el('div', { class: 'feldpaar' }, [feld('von', von), feld('bis', bis)]),
    feld('Position', pos),
    feld('Notiz', notiz),
    karte.fehler ? el('div', { class: 'meldung rot', role: 'alert' }, karte.fehler) : null,
    el('div', { class: 'knopfreihe' }, [
      el('button', {
        type: 'button', class: 'pille haupt', 'data-fokus': 'tb-speichern',
        onclick: async () => {
          const f = await stoppuhr.bearbeiten(z.id, { von: von.value, bis: bis.value, positionNr: pos.value, notiz: notiz.value });
          karte.fehler = f ?? '';
          if (!f) karte.bearbeiten = false;
          zustand.neuZeichnen();
        },
      }, 'Speichern'),
      el('button', { type: 'button', class: 'pille leise', 'data-fokus': 'tb-abbrechen', onclick: () => { karte.bearbeiten = false; karte.fehler = ''; zustand.neuZeichnen(); } }, 'Abbrechen'),
    ]),
  ]);
}
const feld = (label, eingabe) => el('label', { class: 'feldgruppe' }, [el('span', { class: 'feld-label' }, label), eingabe]);

// Nachtrag wählen: vorhandenen antippen oder neuen beschreiben. knoepfe(wahl) bekommt eine Funktion, die die Wahl liefert.
function nachtragBereich(p, { frage, knoepfe, dunkel = false }) {
  const liste = nachtraege(p);
  const text = el('input', {
    id: 't-nt', class: `feld${dunkel ? ' dunkel' : ''}`, type: 'text', value: karte.ntText, placeholder: 'Was hat der Kunde geändert?', 'data-fokus': 'nt-text',
    oninput: () => { karte.ntText = text.value; if (karte.ntNr) { karte.ntNr = null; zustand.neuZeichnen(); } },
  });
  const wahl = () => (karte.ntNr ? { nr: karte.ntNr } : { text: text.value });
  return el('div', { class: 'feldgruppe nachtrag-wahl' }, [
    el('span', { class: 'feld-label', id: 'l-nt' }, frage),
    liste.length ? el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-nt' }, liste.map((x) => el('button', {
      type: 'button', class: `pospille${dunkel ? ' dunkel' : ''}`, 'aria-pressed': String(karte.ntNr === x.nr), 'aria-label': `${x.nr} ${x.bezeichnung}`, 'data-fokus': `nt-${x.nr}`,
      title: x.bezeichnung,
      onclick: () => { karte.ntNr = karte.ntNr === x.nr ? null : x.nr; zustand.neuZeichnen(); },
    }, x.nr))) : null,
    karte.ntNr
      ? el('div', { class: 'zeile-text' }, `${karte.ntNr} · ${liste.find((x) => x.nr === karte.ntNr)?.bezeichnung ?? ''}`)
      : el('div', {}, [el('label', { class: 'feld-label', for: 't-nt' }, liste.length ? 'oder neuer Nachtrag' : 'Neuer Nachtrag'), text]),
    el('div', { class: 'knopfreihe eng' }, knoepfe(wahl)),
  ]);
}

// Vergessen: „Timer läuft seit gestern 08:52. Wann hast du aufgehört?“
function vergessenKarte(d, p, t, kopf) {
  const start = new Date(t.start);
  const jetzt = new Date();
  const v = endeVorschlag(d, zustand.planOptionen().termine, jetzt);
  const grenze = new Date(Math.min(jetzt, plusTage(ausText(alsText(start)), 1)));
  if (!karte.ende || karte.ende <= start || karte.ende > grenze) karte.ende = v.ende;

  const zeitAm = (h, m = 0) => { const x = new Date(start); x.setHours(h, m, 0, 0); return x; };
  const wahl = [zeitAm(12), v.ende, new Date(v.ende.getTime() + 3600000)]
    .filter((x, i, a) => x > start && x <= grenze && a.findIndex((y) => +y === +x) === i)
    .sort((a, b) => a - b);
  const eigen = !wahl.some((x) => +x === +karte.ende);
  const zeitFeld = el('input', {
    class: `feld uhrzeit${eigen ? ' gewaehlt' : ''}`, type: 'time', 'aria-label': 'Andere Uhrzeit', value: eigen ? uhr(karte.ende) : '',
    onchange: () => {
      const [h, m] = (zeitFeld.value || '').split(':').map(Number);
      if (Number.isFinite(h)) { const x = zeitAm(h, m); if (x > start && x <= grenze) { karte.ende = x; zustand.neuZeichnen(); } }
    },
  });
  const stunden = stundenBis(d, karte.ende);

  return el('section', { class: 'timerkarte vergessen', 'aria-labelledby': 'h-timer' }, [
    kopf(el('span', { class: 'chip gelb' }, 'über 10 h')),
    el('div', { class: 'timerkarte-frage' }, `Timer läuft ${seitText(start)}. Wann hast du aufgehört?`),
    el('div', { class: 'wahlreihe', role: 'group', 'aria-label': 'Ende' }, [
      ...wahl.map((x) => el('button', {
        type: 'button', class: 'wahl zahl', 'aria-pressed': String(+x === +karte.ende), 'data-fokus': `tende-${uhr(x)}`,
        onclick: () => { karte.ende = x; zustand.neuZeichnen(); },
      }, uhr(x))),
      zeitFeld,
    ]),
    el('div', { class: 'zeile-hinweis' }, v.grund === 'termin'
      ? `Vorschlag ${uhr(v.ende)}: letzter Termin endete ${uhr(v.terminEnde)}.`
      : `Vorschlag ${uhr(v.ende)}: Beginn plus dein Regeltag von ${zahlText(d.einstellungen.regeltagH)} h.`),
    el('div', { class: 'knopfreihe eng' }, [
      el('button', {
        type: 'button', class: 'knopf-timer haupt breit', 'data-fokus': 'timer-buchen',
        onclick: () => { const e = karte.ende; karte.ende = null; stoppuhr.stoppen(e); },
      }, `${zahlText(stunden, 2)} h buchen`),
      verwerfenKnopf(),
    ]),
  ]);
}

function verwerfenKnopf() {
  let gefragt = false;
  const k = el('button', {
    type: 'button', class: 'pille leise gefahr', 'data-fokus': 'timer-verwerfen',
    onclick: () => {
      if (gefragt) { stoppuhr.verwerfen(); return; }
      gefragt = true; k.textContent = 'Wirklich verwerfen?';
      setTimeout(() => { gefragt = false; k.textContent = 'Verwerfen'; }, 4000);
    },
  }, 'Verwerfen');
  return k;
}
