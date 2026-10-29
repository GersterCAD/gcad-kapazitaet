// Was wäre, wenn … (#/planspiel): Urlaub finden, Urlaub durchspielen, Anfrage zusagen. Speichert nichts,
// außer du tippst ausdrücklich auf „Urlaub eintragen“. Kein eigener Entwurf: Karten, Zeilen, Pillen, Chips, Felder.

import { el, feldGruppe } from '../ui.js';
import * as zustand from '../zustand.js';
import { neueId } from '../kern/daten.js';
import { urlaubFinden, vergleichen, arbeitstage } from '../kern/planspiel.js';
import { ausText, alsText, plusTage, tagKurz } from '../kern/datum.js';
import { planChip } from './projekt.js';

let wochenAnzahl = 2;
let probe = null;   // { art: 'urlaub', von, bis } | { art: 'zusagen', projektId }
let gefunden = null; // Cache: { schluessel, liste }

const tag = (d) => tagKurz(ausText(d));
const zeitraum = (von, bis) => `${tag(von)} – ${tag(bis)}`;

export function planspielSeite() {
  const d = zustand.aktuell();
  const opts = zustand.planOptionen();
  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf' }, [
      el('div', {}, [el('a', { class: 'zurueck-link', href: '#/uebersicht' }, '‹ Übersicht'), el('h1', {}, 'Was wäre, wenn …')]),
    ]),
    el('p', { class: 'kartentext' }, 'Hier spielst du durch, was ein Urlaub oder eine Zusage mit deinen Aufträgen macht. Gespeichert wird nichts, bis du es selbst einträgst.'),
    el('div', { class: 'raster-karten' }, [urlaubKarte(d, opts), probeKarte(d, opts)]),
    probe ? ergebnisKarte(d, opts) : null,
  ]);
}

// ---------- Urlaub finden ----------

function urlaubKarte(d, opts) {
  const schluessel = JSON.stringify([wochenAnzahl, opts.heute, d.abwesenheiten.length, d.projekte.map((p) => [p.id, p.status, p.deadline, p.schaetzungH]), d.zeiteintraege.length, opts.termine.length]);
  if (gefunden?.schluessel !== schluessel) gefunden = { schluessel, liste: urlaubFinden(d, { wochenAnzahl, heute: opts.heute, termine: opts.termine }) };
  const frei = gefunden.liste.filter((x) => x.frei);
  return el('section', { class: 'karte', 'aria-labelledby': 'h-uf' }, [
    el('h2', { id: 'h-uf' }, 'Wann kann ich Urlaub machen?'),
    el('p', { class: 'kartentext' }, 'Zeiträume in den nächsten 6 Monaten, in denen keine Deadline wackelt.'),
    el('div', { class: 'wahlreihe mit-abstand-mittel', role: 'group', 'aria-label': 'Dauer' }, [1, 2, 3].map((n) => el('button', {
      type: 'button', class: 'wahl', 'aria-pressed': String(n === wochenAnzahl), 'data-fokus': `uf-${n}`,
      onclick: () => { wochenAnzahl = n; zustand.neuZeichnen(); },
    }, n === 1 ? '1 Woche' : `${n} Wochen`))),
    el('div', { class: 'mit-abstand-mittel' }, frei.length ? frei.slice(0, 6).map((x) => el('div', { class: 'terminzeile' }, [
      el('div', { class: 'termin-wann zahl' }, `KW ${x.kw}`),
      el('div', { class: 'termin-was fuellung' }, [el('div', { class: 'zeile-text zahl' }, zeitraum(x.von, x.bis)), el('div', { class: 'termin-meta' }, `${x.arbeitstage} Arbeitstage`)]),
      el('button', { type: 'button', class: 'pille', 'data-fokus': `uf-zeigen-${x.von}`, onclick: () => { probe = { art: 'urlaub', von: x.von, bis: x.bis }; zustand.neuZeichnen(); } }, 'Durchspielen'),
    ])) : [el('p', { class: 'kartentext' }, `In den nächsten 6 Monaten passt kein Urlaub von ${wochenAnzahl === 1 ? 'einer Woche' : `${wochenAnzahl} Wochen`}, ohne dass ein Auftrag knapp wird.`)]),
    frei.length || !gefunden.liste.length ? null : (() => {
      const best = gefunden.liste.slice().sort((a, b) => a.schlechter - b.schlechter || a.betroffen.length - b.betroffen.length)[0];
      return el('div', { class: 'terminzeile' }, [
        el('div', { class: 'termin-wann zahl' }, `KW ${best.kw}`),
        el('div', { class: 'termin-was fuellung' }, [el('div', { class: 'zeile-text zahl' }, `Am wenigsten betroffen: ${zeitraum(best.von, best.bis)}`), el('div', { class: 'termin-meta' }, best.betroffen.join(', '))]),
        el('button', { type: 'button', class: 'pille', 'data-fokus': 'uf-best', onclick: () => { probe = { art: 'urlaub', von: best.von, bis: best.bis }; zustand.neuZeichnen(); } }, 'Durchspielen'),
      ]);
    })(),
  ]);
}

// ---------- Selbst durchspielen ----------

function probeKarte(d, opts) {
  const morgen = alsText(plusTage(ausText(opts.heute), 1));
  const u = probe?.art === 'urlaub' ? probe : { von: morgen, bis: morgen };
  const von = el('input', { class: 'feld', type: 'date', value: u.von, 'data-fokus': 'pp-von' });
  const bis = el('input', { class: 'feld', type: 'date', value: u.bis, 'data-fokus': 'pp-bis' });
  const anfragen = d.projekte.filter((p) => ['anfrage', 'angebot'].includes(p.status) && p.schaetzungH > 0);
  return el('section', { class: 'karte', 'aria-labelledby': 'h-pp' }, [
    el('h2', { id: 'h-pp' }, 'Selbst durchspielen'),
    el('div', { class: 'label mit-abstand-gross' }, 'Urlaub nehmen'),
    el('div', { class: 'feldpaar mit-abstand-mittel' }, [feldGruppe('Von', von), feldGruppe('Bis', bis)]),
    el('div', { class: 'knopfreihe mit-abstand-mittel' }, [el('button', {
      type: 'button', class: 'pille', 'data-fokus': 'pp-urlaub',
      onclick: () => { if (von.value && bis.value && von.value <= bis.value) { probe = { art: 'urlaub', von: von.value, bis: bis.value }; zustand.neuZeichnen(); } },
    }, 'Durchspielen')]),
    el('div', { class: 'label mit-abstand-gross' }, 'Anfrage zusagen'),
    anfragen.length ? el('div', { class: 'mit-abstand-mittel' }, anfragen.map((p) => el('div', { class: 'terminzeile' }, [
      el('div', { class: 'termin-was fuellung' }, [el('div', { class: 'zeile-text' }, p.name), el('div', { class: 'termin-meta' }, `${String(p.schaetzungH).replace('.', ',')} h${p.deadline ? ` · Wunschtermin ${tag(p.deadline)}` : ''}`)]),
      el('button', { type: 'button', class: 'pille', 'aria-pressed': String(probe?.projektId === p.id), 'data-fokus': `pp-z-${p.id}`, onclick: () => { probe = { art: 'zusagen', projektId: p.id }; zustand.neuZeichnen(); } }, 'Zusagen?'),
    ]))) : el('p', { class: 'kartentext' }, 'Keine offenen Anfragen. Gemerkte Anfragen aus „Anfrage prüfen“ erscheinen hier.'),
  ]);
}

// ---------- Ergebnis ----------

function ergebnisKarte(d, opts) {
  const v = vergleichen(d, probe, { heute: opts.heute, termine: opts.termine });
  const p = probe.art === 'zusagen' ? d.projekte.find((x) => x.id === probe.projektId) : null;
  const titel = probe.art === 'urlaub' ? `Urlaub ${zeitraum(probe.von, probe.bis)} · ${arbeitstage(probe.von, probe.bis)} Arbeitstage` : `${p?.name ?? 'Anfrage'} zusagen`;
  const fazit = v.schlechter
    ? `${v.schlechter === 1 ? 'Ein Auftrag wird' : `${v.schlechter} Aufträge werden`} knapper.`
    : v.zeilen.some((z) => z.tageSpaeter > 0) ? 'Alle Deadlines halten, manches wird später fertig.' : 'Alle Deadlines halten.';
  const ueberschneidung = probe.art === 'urlaub' && d.abwesenheiten.some((a) => a.von <= probe.bis && a.bis >= probe.von);

  return el('section', { class: 'karte', 'aria-labelledby': 'h-pe' }, [
    el('div', { class: 'knopfreihe' }, [
      el('div', { class: 'fuellung' }, [el('div', { class: 'label' }, 'Ergebnis'), el('h2', { id: 'h-pe' }, titel)]),
      el('span', { class: `chip ${v.schlechter ? 'gelb' : 'gruen'}` }, fazit),
    ]),
    v.warnungNachher.aktiv && !v.warnungVorher.aktiv ? el('p', { class: 'zeile-hinweis gelb-text' }, 'Danach gibt es zu viele lange Wochen hintereinander.') : null,
    el('div', { class: 'mit-abstand-mittel' }, v.zeilen.filter((z) => z.projekt).map((z) => el('a', { class: 'terminzeile', href: `#/projekte/${z.projekt.id}` }, [
      el('div', { class: 'termin-was fuellung' }, [
        el('div', { class: 'zeile-text' }, z.projekt.name),
        el('div', { class: 'termin-meta zahl' }, z.neu ? `fertig ${tag(z.nachher.fertig)}` : `fertig ${tag(z.vorher.fertig)}${z.tageSpaeter ? ` → ${tag(z.nachher.fertig)} (${z.tageSpaeter > 0 ? '+' : ''}${z.tageSpaeter} Tage)` : ''}${z.projekt.deadline ? ` · Deadline ${tag(z.projekt.deadline)}` : ''}${z.mehrUeberlastH >= 0.5 ? ` · ${String(z.mehrUeberlastH).replace('.', ',')} h mehr Überlast` : ''}`),
      ]),
      z.neu ? el('span', { class: 'chip' }, 'neu') : null,
      !z.neu && z.schlechter && z.vorher.status !== z.nachher.status ? planChip(z.vorher.status) : null,
      !z.neu && z.schlechter && z.vorher.status !== z.nachher.status ? el('span', { class: 'sekundaer', 'aria-hidden': 'true' }, '→') : null,
      planChip(z.nachher.status),
    ]))),
    el('div', { class: 'knopfreihe mit-abstand-mittel' }, [
      probe.art === 'urlaub' && !ueberschneidung ? el('button', {
        type: 'button', class: 'pille haupt', 'data-fokus': 'pp-eintragen',
        onclick: async () => {
          const u = probe;
          await zustand.aendern((x) => { x.abwesenheiten.push({ id: neueId(), von: u.von, bis: u.bis, art: 'urlaub' }); });
          probe = null; location.hash = '#/einstellungen';
        },
      }, 'Urlaub eintragen') : null,
      probe.art === 'zusagen' && p ? el('a', { class: 'pille haupt', href: `#/anfragen/${p.id}` }, 'Zur Anfrage') : null,
      el('button', { type: 'button', class: 'pille', 'data-fokus': 'pp-zu', onclick: () => { probe = null; zustand.neuZeichnen(); } }, 'Verwerfen'),
    ]),
  ]);
}
