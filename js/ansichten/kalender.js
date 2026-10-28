// Kalender: Wochen- und Monatsansicht der gelesenen Termine, Blockzeiten und Meilensteine.
// Termin antippen → Stunden ändern, die er zählt, oder einem Projekt zuordnen (zählt dann als Ist).
// Für diese Ansicht gibt es keinen eigenen Entwurf – sie nutzt Seitenkopf, Umschalter, Karten, Zeilen und Chips aus dem Entwurf.

import { el, stepper, zahlText, kreuzIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import * as kalender from '../kalender.js';
import { neueId } from '../kern/daten.js';
import { plane } from '../kern/planung.js';
import { freiH } from '../kern/kapazitaet.js';
import { meilensteineAlsIcs, meilensteinUid } from '../kern/ics.js';
import { ausText, alsText, plusTage, tagKurz, isoWoche, montag } from '../kern/datum.js';

const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const KALENDER_FARBE = ['var(--stahl)', 'var(--termin)', 'var(--greige)'];
const AKTIV = ['anfrage', 'angebot', 'auftrag', 'laeuft', 'pausiert'];

let ansicht = 'woche';
let bezug = null;        // ein Tag in der gezeigten Woche / im gezeigten Monat
let offen = null;        // uid des Termins im Editor
let editor = null;       // { uid, zaehltH, projektId }
let meldung = null;

// ---------- Meilensteine als .ics ----------

/** Meilensteine als .ics herunterladen und als „im Kalender“ markieren */
export async function meilensteineExportieren(liste, dateiname = 'kapazitaet-meilensteine.ics') {
  const d = zustand.aktuell();
  const text = meilensteineAlsIcs(liste, d.projekte);
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = el('a', { href: url, download: dateiname });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  const ids = new Set(liste.map((m) => m.id));
  await zustand.aendern((x) => x.meilensteine.forEach((m) => { if (ids.has(m.id)) { m.kalenderId = meilensteinUid(m); m.kalenderStand = new Date().toISOString(); } }));
}

/** Offene Meilensteine aktiver Projekte ab heute */
export function offeneMeilensteine(d) {
  const heute = zustand.heute();
  const aktiv = new Set(d.projekte.filter((p) => AKTIV.includes(p.status)).map((p) => p.id));
  return d.meilensteine.filter((m) => !m.erledigt && m.datum >= heute && aktiv.has(m.projektId)).sort((a, b) => a.datum.localeCompare(b.datum));
}

// ---------- Hilfen ----------

const tagVon = (t) => (t.ganztaegig ? t.start.slice(0, 10) : alsText(new Date(t.start)));
const bisTag = (t) => (t.ganztaegig ? alsText(plusTage(ausText(t.ende ?? t.start), -1)) : alsText(new Date(t.ende ?? t.start)));

function zeitText(t) {
  if (t.ganztaegig) {
    const letzter = bisTag(t);
    return letzter === t.start ? 'ganztägig' : `ganztägig bis ${tagKurz(ausText(letzter))}`;
  }
  return `${kalender.uhrzeit(t.start)}–${kalender.uhrzeit(t.ende ?? t.start)}`;
}

/** Stunden, die ein Termin ohne eigene Regel zählt */
function standardH(d, t) {
  if (t.ganztaegig) {
    let n = 0;
    for (let x = ausText(t.start); alsText(x) < (t.ende ?? alsText(plusTage(ausText(t.start), 1))); x = plusTage(x, 1)) n++;
    return n * d.einstellungen.regeltagH;
  }
  return Math.round(((new Date(t.ende ?? t.start) - new Date(t.start)) / 3600000) * 10) / 10;
}

function kalenderRegel(d, name) { return d.einstellungen.kalender.find((k) => k.name === name)?.regel ?? 'alle'; }
function zaehlt(d, t) {
  const r = kalenderRegel(d, t.kalender);
  return r !== 'ignorieren' && !(r === 'ganztaegig' && !t.ganztaegig);
}
function farbe(d, name) {
  const i = d.einstellungen.kalender.findIndex((k) => k.name === name);
  return KALENDER_FARBE[(i < 0 ? 0 : i) % KALENDER_FARBE.length];
}

// ---------- Seite ----------

export function kalenderSeite() {
  const d = zustand.aktuell();
  const opts = zustand.planOptionen();
  const heute = opts.heute;
  bezug ??= heute;
  const plan = plane(d, opts);
  const termine = opts.termine;
  const offene = offeneMeilensteine(d);

  const schritt = (n) => {
    const b = ausText(bezug);
    bezug = ansicht === 'woche' ? alsText(plusTage(b, 7 * n)) : alsText(new Date(b.getFullYear(), b.getMonth() + n, 1));
    zustand.neuZeichnen();
  };
  const b = ausText(bezug);
  const titel = ansicht === 'woche'
    ? (() => { const mo = montag(b); return `KW ${isoWoche(mo).woche} · ${tagKurz(mo)} – ${tagKurz(plusTage(mo, 6))}${mo.getFullYear()}`; })()
    : `${MONATE[b.getMonth()]} ${b.getFullYear()}`;

  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf' }, [
      el('div', {}, [el('div', { class: 'label' }, 'Kalender'), el('h1', {}, 'Termine und Blockzeiten')]),
      el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Ansicht' }, [['woche', 'Woche'], ['monat', 'Monat']].map(([k, n]) =>
        el('button', { type: 'button', 'aria-pressed': String(ansicht === k), 'data-fokus': `ansicht-${k}`, onclick: () => { ansicht = k; zustand.neuZeichnen(); } }, n))),
    ]),
    quelleHinweis(termine),
    el('div', { class: 'kartenkopf' }, [
      el('div', { class: 'knopfreihe eng' }, [
        el('button', { type: 'button', class: 'rund', 'aria-label': ansicht === 'woche' ? 'Woche zurück' : 'Monat zurück', 'data-fokus': 'zurueck', onclick: () => schritt(-1) }, el('span', { class: 'icon', 'aria-hidden': 'true', html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>' })),
        el('button', { type: 'button', class: 'pille', 'data-fokus': 'heute', onclick: () => { bezug = heute; zustand.neuZeichnen(); } }, 'Heute'),
        el('button', { type: 'button', class: 'rund', 'aria-label': ansicht === 'woche' ? 'Woche vor' : 'Monat vor', 'data-fokus': 'vor', onclick: () => schritt(1) }, el('span', { class: 'icon', 'aria-hidden': 'true', html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>' })),
      ]),
      el('h2', { class: 'fuellung zahl', 'aria-live': 'polite' }, titel),
      el('button', {
        type: 'button', class: 'pille', disabled: !offene.length, 'data-fokus': 'export-alle',
        onclick: async () => { await meilensteineExportieren(offene); meldung = `${offene.length} Meilensteine exportiert. Öffne die Datei und wähle den Kalender „Kapazität · Gerster CAD“.`; zustand.neuZeichnen(); },
      }, `Offene Meilensteine als .ics (${offene.length})`),
    ]),
    meldung ? el('div', { class: 'meldung gruen', role: 'status' }, meldung) : null,
    offen ? terminEditor(d, termine.find((t) => t.uid === offen)) : null,
    ansicht === 'woche' ? woche(d, plan, termine, heute) : monat(d, termine, heute),
  ]);
}

function quelleHinweis(termine) {
  if (zustand.istBeispiel()) return el('p', { class: 'kartentext' }, 'Beispieltermine zum Ausprobieren. Deine echten Termine kommen aus dem Kalender, sobald er verbunden ist.');
  const i = kalender.info();
  if (i.fehler) return el('div', { class: 'hinweisband', role: 'status' }, [el('span', { class: 'chip gelb' }, 'Achtung'), el('div', { class: 'hinweisband-text' }, [`Abgleich fehlgeschlagen: ${i.fehler} `, el('a', { href: '#/einstellungen' }, 'Einstellungen')])]);
  if (!termine.length && !i.abgeglichen) return el('p', { class: 'kartentext' }, ['Noch keine Termine. Verbinde den Kalender in den ', el('a', { href: '#/einstellungen' }, 'Einstellungen'), '.']);
  return null;
}

// ---------- Woche ----------

function tagesEintraege(d, termine, tag) {
  const wt = ausText(tag).getDay();
  const liste = [];
  for (const t of termine) {
    if (tagVon(t) > tag || bisTag(t) < tag) continue;
    liste.push({ art: 'termin', t, sort: t.ganztaegig ? '00:00' : kalender.uhrzeit(t.start) });
  }
  if (wt >= 1 && wt <= 5) {
    for (const b of d.blockzeiten) {
      if (![].concat(b.wochentag).includes(wt)) continue;
      liste.push({ art: 'block', b, sort: b.von ?? '99:99' });
    }
  }
  for (const m of d.meilensteine) if (m.datum === tag) liste.push({ art: 'meilenstein', m, sort: '00:01' });
  return liste.sort((a, b) => a.sort.localeCompare(b.sort));
}

function woche(d, plan, termine, heute) {
  const mo = montag(ausText(bezug));
  const spalten = [];
  for (let i = 0; i < 7; i++) {
    const tag = alsText(plusTage(mo, i));
    const t = plan.tag(tag);
    const eintraege = tagesEintraege(d, termine, tag);
    const kopfInfo = t.feiertag ? t.feiertag : t.abwesend ? (t.abwesend === 'krank' ? 'krank' : 'Urlaub') : t.regelH > 0 && tag >= heute ? `frei ${zahlText(freiH(t))} von ${zahlText(t.regelH)} h` : '';
    spalten.push(el('section', { class: `kalendertag${tag === heute ? ' heute' : ''}${t.regelH > 0 ? '' : ' frei'}`, 'aria-label': tagKurz(ausText(tag)) }, [
      el('div', { class: 'kalendertag-kopf' }, [
        el('span', { class: 'fett zahl' }, `${TAGE[i]} ${tag.slice(8, 10)}.${tag.slice(5, 7)}.`),
        tag === heute ? el('span', { class: 'chip stahl klein' }, 'heute') : null,
      ]),
      kopfInfo ? el('div', { class: 'termin-meta zahl' }, kopfInfo) : null,
      el('div', { class: 'kalendertag-liste' }, eintraege.length
        ? eintraege.map((x) => eintrag(d, x))
        : [el('div', { class: 'termin-meta' }, '–')]),
    ]));
  }
  return el('div', { class: 'wochenraster' }, spalten);
}

function eintrag(d, x) {
  if (x.art === 'block') {
    const h = x.b.stundenProWoche / [].concat(x.b.wochentag).length;
    return el('div', { class: 'k-eintrag block' }, [
      el('span', { class: `legende-farbe seg-${x.b.art === 'buero' ? 'buero' : 'entwicklung'}`, 'aria-hidden': 'true' }),
      el('div', {}, [el('div', { class: 'zeile-text' }, x.b.titel), el('div', { class: 'termin-meta zahl' }, `${x.b.von && x.b.bis ? `${x.b.von}–${x.b.bis} · ` : ''}Blockzeit ${zahlText(h)} h`)]),
    ]);
  }
  if (x.art === 'meilenstein') {
    const p = d.projekte.find((y) => y.id === x.m.projektId);
    return el('a', { class: 'k-eintrag meilenstein', href: `#/projekte/${x.m.projektId}` }, [
      el('span', { class: 'icon', 'aria-hidden': 'true', html: x.m.typ === 'deadline'
        ? '<svg width="12" height="14" viewBox="0 0 16 20"><path d="M2 1v18" stroke="#1D1D1F" stroke-width="1.5"/><path d="M2 2h11l-3 4 3 4H2z" fill="#1D1D1F"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 14 14"><rect x="3" y="3" width="8" height="8" transform="rotate(45 7 7)" fill="#FFFFFF" stroke="#1D1D1F" stroke-width="1.5"/></svg>' }),
      el('div', {}, [
        el('div', { class: `zeile-text${x.m.erledigt ? ' sekundaer' : ''}` }, x.m.titel),
        el('div', { class: 'termin-meta' }, `${x.m.typ === 'deadline' ? 'Deadline' : 'Meilenstein'}${p ? ` · ${p.name}` : ''}`),
      ]),
    ]);
  }
  const t = x.t;
  const regel = d.terminRegeln.find((r) => r.uid === t.uid);
  const zaehltH = zaehlt(d, t) ? (regel?.zaehltH ?? standardH(d, t)) : 0;
  const projekt = regel?.projektId && d.projekte.find((p) => p.id === regel.projektId);
  const meta = [zeitText(t), zaehlt(d, t) ? `zählt ${zahlText(zaehltH)} h` : 'zählt nicht', projekt ? projekt.name : null].filter(Boolean).join(' · ');
  return el('button', {
    type: 'button', class: `k-eintrag termin${zaehlt(d, t) ? '' : ' leise'}${offen === t.uid ? ' gewaehlt' : ''}`, 'data-fokus': `termin-${t.uid}`,
    'aria-label': `${t.titel}, ${meta}. Bearbeiten`,
    onclick: () => { offen = t.uid; editor = null; meldung = null; zustand.neuZeichnen(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  }, [
    el('span', { class: 'kalenderpunkt', style: `background:${farbe(d, t.kalender)}`, 'aria-hidden': 'true' }),
    el('div', {}, [el('div', { class: 'zeile-text' }, t.titel), el('div', { class: 'termin-meta zahl' }, meta)]),
  ]);
}

// ---------- Termin bearbeiten ----------

function terminEditor(d, t) {
  if (!t) { offen = null; return null; }
  const regel = d.terminRegeln.find((r) => r.uid === t.uid);
  const std = standardH(d, t);
  editor ??= { uid: t.uid, zaehltH: regel?.zaehltH ?? std, projektId: regel?.projektId ?? '' };
  const e = editor;
  const kannZaehlen = zaehlt(d, t);
  const schliessen = () => { offen = null; editor = null; zustand.neuZeichnen(); };

  const projekte = d.projekte.filter((p) => AKTIV.includes(p.status) || p.id === e.projektId).sort((a, b) => a.name.localeCompare(b.name));
  const auswahl = el('select', {
    class: 'feld', id: 'termin-projekt', 'data-fokus': 'termin-projekt',
    onchange: () => { e.projektId = auswahl.value; },
  }, [el('option', { value: '' }, 'kein Projekt'), ...projekte.map((p) => el('option', { value: p.id, selected: p.id === e.projektId }, p.name))]);

  const speichern = () => {
    const uid = t.uid;
    zustand.aendern((x) => {
      x.terminRegeln = x.terminRegeln.filter((r) => r.uid !== uid);
      x.zeiteintraege = x.zeiteintraege.filter((z) => z.terminUid !== uid);
      const eigeneH = kannZaehlen && Math.abs(e.zaehltH - std) > 0.01 ? e.zaehltH : null;
      if (eigeneH != null || e.projektId) x.terminRegeln.push({ uid, zaehltH: eigeneH, projektId: e.projektId || null });
      if (e.projektId) {
        // Zugeordnet: die Zeit zählt als Ist für das Projekt
        x.zeiteintraege.push({ id: neueId(), datum: tagVon(t), projektId: e.projektId, positionNr: null, stunden: Math.min(24, kannZaehlen ? e.zaehltH : std), notiz: `Termin: ${t.titel}`, terminUid: uid });
      }
    });
    meldung = e.projektId ? 'Gespeichert. Die Zeit zählt jetzt als Ist für das Projekt.' : 'Gespeichert.';
    offen = null; editor = null;
  };

  return el('section', { class: 'kachel formular', 'aria-labelledby': 'h-termin' }, [
    el('div', { class: 'kartenkopf' }, [
      el('span', { class: 'kalenderpunkt', style: `background:${farbe(d, t.kalender)}`, 'aria-hidden': 'true' }),
      el('h2', { id: 'h-termin', class: 'fuellung titel-klein' }, t.titel),
      el('button', { type: 'button', class: 'kreuz', 'aria-label': 'Schließen', onclick: schliessen }, kreuzIcon()),
    ]),
    el('div', { class: 'zeile-hinweis zahl' }, `${tagKurz(ausText(tagVon(t)))} · ${zeitText(t)} · Kalender ${t.kalender}`),
    kannZaehlen
      ? el('div', { class: 'feldgruppe' }, [
          el('span', { class: 'feld-label', id: 'l-zaehlt' }, 'Zählt zur Kapazität'),
          el('div', { role: 'group', 'aria-labelledby': 'l-zaehlt', class: 'stepper-schmal' }, [stepper({
            wert: [zahlText(e.zaehltH), el('span', { class: 'einheit' }, 'h')], breit: true, fokus: 'termin-h',
            minus: () => { e.zaehltH = Math.max(0, e.zaehltH - 0.5); zustand.neuZeichnen(); },
            plus: () => { e.zaehltH = Math.min(24, e.zaehltH + 0.5); zustand.neuZeichnen(); },
            minusLabel: 'Eine halbe Stunde weniger', plusLabel: 'Eine halbe Stunde mehr',
          })]),
          el('div', { class: 'zeile-hinweis' }, `Laut Kalender ${zahlText(std)} h. Mehr eintragen, wenn Fahrzeit dazukommt.`),
        ])
      : el('p', { class: 'kartentext' }, ['Dieser Kalender zählt nicht zur Kapazität. Das stellst du in den ', el('a', { href: '#/einstellungen' }, 'Einstellungen'), ' ein.']),
    el('div', { class: 'feldgruppe' }, [
      el('label', { class: 'feld-label', for: 'termin-projekt' }, 'Projekt'),
      auswahl,
      el('div', { class: 'zeile-hinweis' }, 'Mit Projekt zählt die Zeit als Ist für dieses Projekt.'),
    ]),
    el('div', { class: 'knopfreihe' }, [
      el('button', { type: 'button', class: 'pille haupt', 'data-fokus': 'termin-speichern', onclick: speichern }, 'Speichern'),
      el('button', { type: 'button', class: 'pille', onclick: schliessen }, 'Abbrechen'),
      regel ? el('button', {
        type: 'button', class: 'pille leise',
        onclick: () => { e.zaehltH = std; e.projektId = ''; speichern(); },
      }, 'Zurücksetzen') : null,
    ]),
  ]);
}

// ---------- Monat ----------

function monat(d, termine, heute) {
  const b = ausText(bezug);
  const erster = new Date(b.getFullYear(), b.getMonth(), 1);
  const start = montag(erster);
  const zellen = [];
  for (let i = 0; i < 42; i++) {
    const x = plusTage(start, i);
    if (i >= 35 && x.getMonth() !== b.getMonth()) break;
    const tag = alsText(x);
    const eintraege = tagesEintraege(d, termine, tag).filter((e) => e.art !== 'block');
    const gezeigt = eintraege.slice(0, 3);
    zellen.push(el('button', {
      type: 'button', class: `monatstag${x.getMonth() === b.getMonth() ? '' : ' anderer'}${tag === heute ? ' heute' : ''}`,
      'aria-label': `${tagKurz(x)}: ${eintraege.length ? `${eintraege.length} Einträge` : 'keine Einträge'}. Woche zeigen`,
      'data-fokus': `monat-${tag}`,
      onclick: () => { bezug = tag; ansicht = 'woche'; zustand.neuZeichnen(); },
    }, [
      el('span', { class: 'monatstag-zahl zahl' }, String(x.getDate())),
      ...gezeigt.map((e) => el('span', { class: 'monatstag-eintrag' }, [
        e.art === 'termin'
          ? el('span', { class: 'kalenderpunkt klein', style: `background:${farbe(d, e.t.kalender)}`, 'aria-hidden': 'true' })
          : el('span', { class: 'raute-klein', 'aria-hidden': 'true' }),
        el('span', { class: 'monatstag-text' }, e.art === 'termin' ? e.t.titel : e.m.titel),
      ])),
      eintraege.length > gezeigt.length ? el('span', { class: 'termin-meta' }, `+${eintraege.length - gezeigt.length} weitere`) : null,
    ]));
  }
  return el('div', { class: 'karte' }, [
    el('div', { class: 'scrollkasten' }, [
      el('div', { class: 'monatsraster' }, [
        ...TAGE.map((t) => el('div', { class: 'monatskopf label' }, t)),
        ...zellen,
      ]),
    ]),
  ]);
}

export function kalenderVergessen() { offen = null; editor = null; meldung = null; }
