// Angebote nach Entwurf Index B: Liste (Angebote.dc.html), bearbeiten (Angebot.dc.html),
// angenommen → Auftrag einplanen (Auftrag.dc.html). Rechnung in js/kern/angebot.js.
// Änderungen werden sofort gespeichert, wie überall in der App.

import { el, zahlText, schalter, hakenIcon, kreuzIcon, plusIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import { euro } from '../kern/abrechnung.js';
import {
  ANGEBOT_STATUS, ANGEBOT_STATUS_NAME, PROJEKTARTEN, neuesAngebot, neuePosition, pufferH, geplantH, positionsBetrag, zulagenListe, neueZulagen,
  summen, angebotsKennzahlen, abgelaufen, angebotAnnehmen, annahmeZuruecknehmen,
} from '../kern/angebot.js';
import { anfragePruefen } from '../kern/anfrage.js';
import { lernwerte, LERNWERT_AB } from '../kern/lernwert.js';
import { ausText, alsText, plusTage, tagKurz, isoWoche, montag } from '../kern/datum.js';
import { loeschKnopf } from './einstellungen.js';
import * as lexware from '../lexware.js';
import { lexwareHinweis } from './abrechnung.js';
import { feiertag } from '../kern/feiertage.js';
import { nachfassen, NACHFASSEN_TAGE } from '../kern/woche.js';

const tm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : '–');
const zahlEin = (v) => { const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) && x >= 0 ? x : 0; };
const finde = (id) => (zustand.aktuell().angebote ?? []).find((a) => a.id === id);
const aendereAngebot = (id, fn) => zustand.aendern((d) => { const a = d.angebote.find((x) => x.id === id); if (a) fn(a, d); });

const STATUS_CHIP = { entwurf: 'chip', versendet: 'chip rand-stahl', angenommen: 'chip gruen', abgelehnt: 'chip rot' };
const statusChip = (a) => el('span', { class: STATUS_CHIP[a.status] }, ANGEBOT_STATUS_NAME[a.status]);
const lexwareStatus = (a) => el('span', { class: 'lexware-status' }, [
  el('span', { class: `punkt${a.lexwareId ? ' gruen' : a.lexwareFehler ? ' rot' : ' leer'}`, 'aria-hidden': 'true' }),
  lexware.laeuft('angebot', a.id) ? 'wird übertragen' : a.lexwareId ? 'übertragen' : a.lexwareFehler ? 'Fehler' : 'nicht übertragen',
]);

/** Umschalter „Anfragen · Angebote“ rechts neben dem Seitentitel (Navigation.dc.html) */
export function angeboteUmschalter(aktiv) {
  return el('nav', { class: 'umschalter', 'aria-label': 'Unterseite' }, [
    el('a', { href: '#/anfragen', 'aria-current': aktiv === 'anfragen' ? 'page' : null }, 'Anfragen'),
    el('a', { href: '#/angebote', 'aria-current': aktiv === 'angebote' ? 'page' : null }, 'Angebote'),
  ]);
}

export async function angebotAnlegen() {
  let id;
  await zustand.aendern((d) => { const a = neuesAngebot(d, zustand.heute()); id = a.id; d.angebote.push(a); });
  location.hash = `#/angebote/${id}`;
}

// ---------- Liste ----------

let filter = 'alle';

export function angeboteListe() {
  const d = zustand.aktuell();
  const heute = zustand.heute();
  const alle = [...(d.angebote ?? [])].sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? '') || (b.nummer ?? '').localeCompare(a.nummer ?? ''));
  const liste = alle.filter((a) => filter === 'alle' || a.status === filter);
  const kz = angebotsKennzahlen(d, heute);
  const anzahl = (h) => `${kz[h].anzahl} ${kz[h].anzahl === 1 ? 'Angebot' : 'Angebote'} · ${zahlText(kz[h].h)} h`;
  const nf = nachfassen(d, heute);
  const nfIds = new Set(nf.map((x) => x.angebot.id));

  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf mitte' }, [
      el('h1', { class: 'ohne-abstand' }, 'Angebote'),
      angeboteUmschalter('angebote'),
      el('button', { type: 'button', class: 'pille haupt gross', 'data-fokus': 'angebot-neu', onclick: angebotAnlegen }, [plusIcon(), 'Angebot anlegen']),
    ]),
    el('div', { class: 'raster-kacheln' }, [
      kachel('Offen versendet', euro(kz.versendet.netto), anzahl('versendet')),
      kachel(`Angenommen ${kz.jahr}`, euro(kz.angenommen.netto), anzahl('angenommen')),
      kachel('Annahmequote', kz.quote == null ? '–' : `${kz.quote} %`, kz.entschieden ? `${kz.angenommenAnzahl} von ${kz.entschieden} entschiedenen` : 'noch nichts entschieden'),
    ]),
    nf.length ? el('div', { class: 'hinweiskarte' }, [
      el('span', { class: 'chip gelb' }, 'Nachfassen'),
      el('div', { class: 'fuellung' }, [
        `${nf.length === 1 ? 'Ein Angebot wartet' : `${nf.length} Angebote warten`} seit über ${NACHFASSEN_TAGE} Tagen auf Antwort: `,
        ...nf.flatMap((x, i) => [i ? ', ' : '', el('a', { href: `#/angebote/${x.angebot.id}` }, x.angebot.nummer), ` (${x.angebot.kunde || 'ohne Kunde'}, ${x.seitTagen} Tage)`]),
      ]),
    ]) : null,
    el('div', { class: 'wahlreihe', role: 'group', 'aria-label': 'Filter' }, [...ANGEBOT_STATUS, 'alle'].map((k) => el('button', {
      type: 'button', class: 'wahl', 'aria-pressed': String(k === filter), 'data-fokus': `afilter-${k}`,
      onclick: () => { filter = k; zustand.neuZeichnen(); },
    }, [k === 'alle' ? 'alle' : ANGEBOT_STATUS_NAME[k], el('span', { class: 'wahl-zahl zahl' }, ` ${k === 'alle' ? alle.length : alle.filter((a) => a.status === k).length}`)]))),
    el('section', { class: 'tabelle-rahmen', 'aria-label': 'Angebotsliste' }, [
      el('div', { class: 'angebotstabelle' }, [
        el('div', { class: 'at-zeile at-kopf label' }, ['Nr.', 'Kunde', 'Projekt', 'Datum', 'gültig bis', 'netto', 'Std.', 'Status', 'Lexware']
          .map((t, i) => el('span', { class: [5, 6].includes(i) ? 'rechts' : null }, t))),
        ...liste.map((a) => {
          const s = summen(d, a);
          return el('a', { class: 'at-zeile zahl', href: `#/angebote/${a.id}` }, [
            el('span', { class: 'fett' }, a.nummer),
            el('span', {}, a.kunde || '–'),
            el('span', { class: 'sekundaer' }, a.projektname || '–'),
            el('span', {}, tm(a.datum)),
            el('span', { class: abgelaufen(a, heute) ? 'gelb-text fett-mittel' : null, title: abgelaufen(a, heute) ? 'Abgelaufen' : null }, tm(a.gueltigBis)),
            el('span', { class: 'rechts fett-mittel' }, euro(s.netto)),
            el('span', { class: 'rechts' }, zahlText(s.geplantH)),
            el('span', { class: 'knopfreihe eng' }, [statusChip(a), nfIds.has(a.id) ? el('span', { class: 'chip gelb' }, 'nachfassen') : null]),
            lexwareStatus(a),
          ]);
        }),
        liste.length ? null : el('div', { class: 'tabelle-leer' }, alle.length ? 'Keine Angebote mit diesem Status.' : 'Noch keine Angebote. Leg das erste an.'),
      ]),
    ]),
  ]);
}

function kachel(label, wert, unter) {
  return el('div', { class: 'kachel' }, [
    el('div', { class: 'label' }, label),
    el('div', { class: 'kennzahl zahl' }, wert),
    el('div', { class: 'kachel-unter' }, unter),
  ]);
}

// ---------- Angebot bearbeiten ----------

let satzOffen = false;

/** Versendet und seit 14 Tagen keine Antwort: Hinweis mit „Nachgefasst“ (setzt die 14 Tage neu) */
function nachfassenHinweis(d, a) {
  const x = nachfassen(d, zustand.heute()).find((y) => y.angebot.id === a.id);
  if (!x) return null;
  return el('div', { class: 'hinweiskarte' }, [
    el('span', { class: 'chip gelb' }, 'Nachfassen'),
    el('div', { class: 'fuellung' }, `${x.nachgefasst ? `Zuletzt nachgefasst am ${tm(a.nachgefasstAm)}` : `Versendet am ${tm(a.versendetAm ?? a.datum)}`}, seit ${x.seitTagen} Tagen keine Antwort.${x.abgelaufen ? ' Das Angebot ist abgelaufen – beim Nachfassen gleich verlängern.' : ''}`),
    el('button', {
      type: 'button', class: 'pille', 'data-fokus': 'a-nachgefasst', title: `Erinnert in ${NACHFASSEN_TAGE} Tagen wieder`,
      onclick: () => aendereAngebot(a.id, (y) => { y.nachgefasstAm = zustand.heute(); }),
    }, 'Nachgefasst'),
  ]);
}

export function angebotKopf(id) {
  const a = finde(id);
  return { titel: a ? a.nummer : 'Angebot', zurueck: '#/angebote', kontext: a ? [a.nummer, el('span', { class: 'sekundaer' }, a.kunde ? ` · ${a.kunde}` : '')] : 'Angebot', status: a ? 'Gespeichert' : null };
}

export function angebotSeite(id) {
  const d = zustand.aktuell();
  const a = finde(id);
  if (!a) {
    return el('div', { class: 'seite' }, [
      el('h1', {}, 'Angebot nicht gefunden'),
      el('a', { href: '#/angebote' }, 'Zu den Angeboten'),
    ]);
  }
  const s = summen(d, a);
  const fest = a.status === 'angenommen';

  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf' }, [
      el('div', {}, [
        el('a', { class: 'zurueck-link', href: '#/angebote' }, '‹ Angebote'),
        el('h1', {}, `${a.nummer}${a.kunde ? ` · ${a.kunde}` : ''}`),
        el('div', { class: 'knopfreihe eng mit-abstand-mittel' }, [statusKette(a), el('span', { class: 'abstand-16' }), lexwareZeile(a)]),
      ]),
      el('div', { class: 'knopfreihe eng' }, [
        a.status === 'versendet' ? el('button', { type: 'button', class: 'pille gross leise gefahr', 'data-fokus': 'a-abgelehnt', onclick: () => aendereAngebot(id, (x) => { x.status = 'abgelehnt'; }) }, 'Abgelehnt') : null,
        a.projektId
          ? el('a', { class: 'pille gross', href: `#/projekte/${a.projektId}` }, 'Zum Projekt')
          : el('a', { class: 'pille gross dunkel-rand nur-gross', href: `#/angebote/${id}/auftrag` }, 'Als angenommen markieren'),
        lexwareKnopf(a),
      ]),
    ]),
    lexwareZustand(a),
    nachfassenHinweis(d, a),
    el('div', { class: 'angebot-flaeche' }, [
      el('div', { class: 'angebot-haupt' }, [kopfKarte(d, a), positionenKarte(d, a, s), fussKarte(a), fest ? null : el('div', { class: 'knopfreihe' }, [loeschKnopf('Angebot löschen', async () => {
        await zustand.sichern('Angebot gelöscht');
        await zustand.aendern((x) => { x.angebote = x.angebote.filter((y) => y.id !== id); });
        location.hash = '#/angebote';
      })])]),
      el('aside', { class: 'angebot-seite' }, [zulagenKarte(d, a), summenKarte(d, a, s), kapazitaetKarte(d, a, s), lernwertKarte(d, a, s)]),
    ]),
    mobilLeiste(d, a, s),
  ]);
}

// ---------- Lexware Office ----------

async function anLexware(a) {
  try { await lexware.angebotSenden(a.id); } catch (f) { await aendereAngebot(a.id, (x) => { x.lexwareFehler = f.message; }); }
}

function lexwareKnopf(a) {
  const laeuft = lexware.laeuft('angebot', a.id);
  if (!lexware.verbunden()) return el('button', { type: 'button', class: 'pille gross haupt nur-gross', disabled: true, title: 'Erst nach dem Verbinden möglich' }, 'An Lexware Office übertragen');
  return el('button', {
    type: 'button', class: 'pille gross haupt nur-gross', disabled: !!laeuft, 'data-fokus': 'a-lexware', onclick: () => anLexware(a),
  }, laeuft ? 'Wird übertragen …' : a.lexwareId ? 'Erneut übertragen' : 'An Lexware Office übertragen');
}

/** Zustand der Übertragung unter dem Kopf (Zustaende.dc.html) */
function lexwareZustand(a) {
  if (!lexware.verbunden()) return lexwareHinweis();
  const laeuft = lexware.laeuft('angebot', a.id);
  if (laeuft) {
    return el('div', { class: 'zustand grau', role: 'status' }, [
      el('div', { class: 'knopfreihe eng' }, [el('span', { class: 'kreisel', 'aria-hidden': 'true' }), el('span', { class: 'zustand-titel' }, 'Wird übertragen …')]),
      el('div', { class: 'zeile-hinweis ohne-abstand' }, lexware.dauertLange(laeuft)
        ? ['Das dauert ungewöhnlich lange. Läuft die GitHub Action „Lexware Office“? ', el('button', { type: 'button', class: 'textknopf', onclick: () => lexware.aufgeben('angebot', a.id) }, 'Abbrechen')]
        : 'Angebotsentwurf. Das dauert etwa eine Minute. Du kannst weiterarbeiten.'),
    ]);
  }
  if (a.lexwareFehler) {
    return el('div', { class: 'zustand rot', role: 'alert' }, [
      el('div', { class: 'zustand-titel rot-text' }, 'Nicht übertragen'),
      el('div', { class: 'zeile-hinweis ohne-abstand rot-dunkel' }, a.lexwareFehler),
      el('div', { class: 'knopfreihe eng' }, [
        el('button', { type: 'button', class: 'pille rot-pille', onclick: () => anLexware(a) }, 'Erneut versuchen'),
        a.lexwareFehlerDetails ? el('details', { class: 'details' }, [el('summary', {}, 'Details'), el('pre', {}, a.lexwareFehlerDetails)]) : null,
      ]),
    ]);
  }
  if (a.lexwareId) {
    return el('div', { class: 'zustand gruen', role: 'status' }, [
      el('div', { class: 'knopfreihe eng zustand-titel gruen-text' }, [hakenIcon(14), 'Übertragen · Entwurf in Lexware Office']),
      el('div', { class: 'zeile-hinweis ohne-abstand gruen-dunkel' }, 'Prüfe es dort, schreib es fest und versende es aus Lexware. Danach hier auf „versendet“ stellen.'),
      el('div', { class: 'knopfreihe eng' }, [el('a', { class: 'pille weiss-pille', href: lexware.link('angebot', a.lexwareId), target: '_blank', rel: 'noopener' }, 'In Lexware öffnen')]),
    ]);
  }
  return null;
}

function statusKette(a) {
  const schritt = (status, text) => {
    const aktiv = a.status === status || (status === 'ende' && ['angenommen', 'abgelehnt'].includes(a.status));
    const setzbar = ['entwurf', 'versendet'].includes(status) && !a.projektId && a.status !== status;
    return el(setzbar ? 'button' : 'span', {
      type: setzbar ? 'button' : null, class: `kettenglied${aktiv ? ' aktiv' : ''}`, 'data-fokus': setzbar ? `kette-${status}` : null,
      title: setzbar ? `Als ${text} markieren` : null,
      onclick: setzbar ? () => aendereAngebot(a.id, (x) => { x.status = status; if (status === 'versendet') x.versendetAm = zustand.heute(); }) : null,
    }, text);
  };
  const pfeil = () => el('span', { class: 'kettenpfeil', 'aria-hidden': 'true' }, '›');
  return el('div', { class: 'kette', role: 'group', 'aria-label': 'Status' }, [
    schritt('entwurf', 'Entwurf'), pfeil(), schritt('versendet', 'versendet'), pfeil(),
    schritt('ende', a.status === 'abgelehnt' ? 'abgelehnt' : a.status === 'angenommen' ? 'angenommen' : 'angenommen / abgelehnt'),
  ]);
}

const lexwareZeile = (a) => el('span', { class: 'lexware-status' }, [
  el('span', { class: `punkt${a.lexwareId ? ' gruen' : ' leer'}`, 'aria-hidden': 'true' }), `Lexware: ${a.lexwareId ? 'übertragen' : 'nicht übertragen'}`,
]);

function feld(label, eingabe, { breit = false, hinweis } = {}) {
  return el('div', { class: `feldgruppe${breit ? ' spanne-2' : ''}` }, [
    el('label', { class: 'feld-label', for: eingabe.id }, [label, hinweis ? el('span', { class: 'sekundaer normal' }, ` · ${hinweis}`) : null]),
    eingabe,
  ]);
}

function textFeld(a, key, { id, typ = 'text', liste, grau } = {}) {
  const f = el('input', {
    id, class: `feld hoch${grau ? ' grau' : ''}`, type: typ, value: a[key] ?? '', list: liste, 'data-fokus': id,
    onchange: () => aendereAngebot(a.id, (x) => { x[key] = f.value.trim(); }),
  });
  return f;
}

function kopfKarte(d, a) {
  const namen = [...new Set([...(d.kunden ?? []).map((k) => k.name), ...d.projekte.map((p) => p.kunde)].filter(Boolean))].sort();
  const bekannt = (d.kunden ?? []).some((k) => k.name === a.kunde);
  const arten = [...new Set([...PROJEKTARTEN, ...d.projekte.map((p) => p.art).filter(Boolean)])];
  const kopftext = el('textarea', {
    id: 'a-kt', class: 'feld text platzhalter-rand', rows: '2', placeholder: 'Kopftext, zum Beispiel Anrede und Bezug auf die Anfrage',
    onchange: () => aendereAngebot(a.id, (x) => { x.kopftext = kopftext.value; }),
  }, a.kopftext ?? '');

  return el('section', { class: 'karte', 'aria-labelledby': 'h-akopf' }, [
    el('h2', { id: 'h-akopf', class: 'label' }, 'Kopf'),
    el('div', { class: 'feldraster mit-abstand' }, [
      feld('Kunde', el('div', { class: 'knopfreihe eng nowrap' }, [
        textFeld(a, 'kunde', { id: 'a-k', liste: 'a-kunden' }),
        el('datalist', { id: 'a-kunden' }, namen.map((n) => el('option', { value: n }))),
        a.kunde && !bekannt ? el('button', {
          type: 'button', class: 'pille hoch', title: 'Als Kunde anlegen, den Stundensatz trägst du in den Einstellungen ein', 'data-fokus': 'a-kunde-neu',
          onclick: () => zustand.aendern((x) => { x.kunden.push({ id: globalThis.crypto.randomUUID(), name: a.kunde, stundensatz: null }); }),
        }, 'Neu') : null,
      ]), { breit: true, hinweis: 'später aus Lexware-Kontakten' }),
      feld('Angebotsnummer', textFeld(a, 'nummer', { id: 'a-n', grau: true })),
      feld('Projektname', textFeld(a, 'projektname', { id: 'a-p' }), { breit: true }),
      el('div', { class: 'feldgruppe' }, [
        el('label', { class: 'feld-label', for: 'a-d' }, 'Datum · gültig bis'),
        el('div', { class: 'knopfreihe eng nowrap' }, [textFeld(a, 'datum', { id: 'a-d', typ: 'date' }), (() => {
          const g = textFeld(a, 'gueltigBis', { id: 'a-g', typ: 'date' }); g.setAttribute('aria-label', 'gültig bis'); return g;
        })()]),
      ]),
    ]),
    el('div', { class: 'knopfreihe mit-abstand' }, [
      el('span', { class: 'feld-label', id: 'l-aart' }, 'Projektart'),
      el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-aart' }, arten.map((n) => el('button', {
        type: 'button', class: 'wahl', 'aria-pressed': String(a.art === n), 'data-fokus': `aart-${n}`,
        onclick: () => aendereAngebot(a.id, (x) => { x.art = x.art === n ? '' : n; }),
      }, n))),
    ]),
    el('div', { class: 'feldgruppe mit-abstand' }, [el('label', { class: 'feld-label', for: 'a-kt' }, 'Kopftext'), kopftext]),
  ]);
}

function positionenKarte(d, a, s) {
  const aendernPos = (pid, fn) => aendereAngebot(a.id, (x) => { const p = x.positionen.find((y) => y.id === pid); if (p) fn(p, x); });
  const schieben = (i, um) => aendereAngebot(a.id, (x) => {
    const j = i + um;
    if (j < 0 || j >= x.positionen.length) return;
    [x.positionen[i], x.positionen[j]] = [x.positionen[j], x.positionen[i]];
  });

  const zeile = (p, i) => {
    const zahlFeld = (key, label, extra = {}) => {
      const f = el('input', {
        class: 'feld hoch rechts zahl', type: 'number', step: '0.5', min: '0', value: String(p[key] ?? 0), 'aria-label': label,
        'data-fokus': `${key}-${p.id}`, ...extra,
        onchange: () => aendernPos(p.id, (q) => { q[key] = zahlEin(f.value); }),
      });
      return f;
    };
    const bez = el('input', {
      class: 'feld hoch fett-mittel', type: 'text', value: p.bezeichnung, placeholder: 'Bezeichnung', 'aria-label': 'Bezeichnung', 'data-fokus': `bez-${p.id}`,
      onchange: () => aendernPos(p.id, (q) => { q.bezeichnung = bez.value.trim(); }),
    });
    const besch = el('textarea', {
      class: 'feld text klein', rows: '2', placeholder: 'Beschreibung', 'aria-label': 'Beschreibung',
      onchange: () => aendernPos(p.id, (q) => { q.beschreibung = besch.value; }),
    }, p.beschreibung ?? '');
    const pauschal = p.abrechnung === 'pauschal';
    return el('div', { class: 'ap-zeile' }, [
      el('div', { class: 'ap-nr' }, [
        el('span', { class: 'fett zahl ap-nummer' }, String(i + 1)),
        el('div', { class: 'ap-schieben' }, [
          el('button', { type: 'button', class: 'pfeilknopf', 'aria-label': 'nach oben', disabled: i === 0, 'data-fokus': `hoch-${p.id}`, onclick: () => schieben(i, -1) }, '↑'),
          el('button', { type: 'button', class: 'pfeilknopf', 'aria-label': 'nach unten', disabled: i === a.positionen.length - 1, 'data-fokus': `runter-${p.id}`, onclick: () => schieben(i, 1) }, '↓'),
        ]),
      ]),
      el('div', { class: 'ap-text', 'data-label': 'Bezeichnung' }, [bez, besch]),
      el('div', { 'data-label': 'Grund h' }, zahlFeld('grundH', 'Grundstunden')),
      el('div', { class: 'ap-geplant ap-zulage zahl', 'data-label': 'Zulagen' }, `+ ${zahlText(pufferH(p, a), 2)} h`),
      el('div', { class: 'ap-geplant zahl', 'data-label': 'geplant' }, zahlText(geplantH(p, a))),
      el('div', { 'data-label': 'Abrechnung' }, el('div', { class: 'umschalter hoch', role: 'group', 'aria-label': 'Abrechnung' }, [['stunden', 'Stunden'], ['pauschal', 'Pauschal']].map(([k, n]) => el('button', {
        type: 'button', 'aria-pressed': String(p.abrechnung === k), 'data-fokus': `abr-${k}-${p.id}`,
        onclick: () => aendernPos(p.id, (q, x) => {
          if (k === 'pauschal' && q.pauschalpreis == null) q.pauschalpreis = Math.round(geplantH(q, x) * (summen(zustand.aktuell(), x).satz ?? 0));
          q.abrechnung = k;
        }),
      }, n)))),
      el('div', { 'data-label': 'Satz / Preis' }, pauschal
        ? zahlFeld('pauschalpreis', 'Pauschalpreis', { step: '10' })
        : el('div', { class: 'ap-satz zahl' }, s.satz ? `${euro(s.satz)}/h` : '– €/h')),
      el('div', { class: 'ap-betrag fett zahl', 'data-label': 'Betrag' }, euro(positionsBetrag(p, s.satz, a))),
      el('button', {
        type: 'button', class: 'kreuz gross', 'aria-label': `Position ${i + 1} löschen`,
        onclick: () => aendereAngebot(a.id, (x) => { x.positionen = x.positionen.filter((y) => y.id !== p.id); }),
      }, [kreuzIcon()]),
    ]);
  };

  return el('section', { class: 'karte ohne-innenabstand', 'aria-labelledby': 'h-apos' }, [
    el('div', { class: 'kartenkopf innen' }, [
      el('h2', { id: 'h-apos', class: 'fuellung' }, 'Positionen'),
      el('span', { id: 'l-pip', class: 'zeile-text' }, 'Zulagen im Preis'),
      schalter(a.pufferImPreis !== false, '#l-pip', (an) => aendereAngebot(a.id, (x) => { x.pufferImPreis = an; }), 'a-pip'),
    ]),
    el('div', { class: 'scrollkasten' }, el('div', { class: 'ap-tabelle' }, [
      el('div', { class: 'ap-zeile ap-kopf label' }, ['Nr.', 'Bezeichnung', 'Grund h', 'Zulagen', 'geplant', 'Abrechnung', 'Satz / Preis', 'Betrag', ''].map((t, i) => el('span', { class: i === 7 ? 'rechts' : null }, t))),
      ...a.positionen.map(zeile),
    ])),
    el('div', { class: 'innen' }, [
      a.positionen.length ? null : el('p', { class: 'zeile-hinweis' }, 'Noch keine Positionen.'),
      el('button', {
        type: 'button', class: 'pille gross gestrichelt', 'data-fokus': 'a-pos-neu',
        onclick: () => aendereAngebot(a.id, (x) => { x.positionen.push(neuePosition()); }),
      }, 'Position hinzufügen'),
      el('p', { class: 'zeile-hinweis' }, 'Die Zulagen stellst du rechts unter „Zulagen“ ein. Sie werden nach dem Stundenanteil auf die Positionen verteilt. Den Planungspuffer wählst du beim Einplanen.'),
    ]),
  ]);
}

function fussKarte(a) {
  const ta = (key, id, placeholder) => {
    const t = el('textarea', { id, class: 'feld text platzhalter-rand', rows: '3', placeholder, onchange: () => aendereAngebot(a.id, (x) => { x[key] = t.value; }) }, a[key] ?? '');
    return t;
  };
  return el('section', { class: 'karte feldraster', 'aria-label': 'Fußtext und Zahlungsbedingungen' }, [
    el('div', { class: 'feldgruppe' }, [el('label', { class: 'feld-label', for: 'a-ft' }, 'Fußtext'), ta('fusstext', 'a-ft', 'Fußtext, zum Beispiel Gruß und Hinweise')]),
    el('div', { class: 'feldgruppe' }, [el('label', { class: 'feld-label', for: 'a-zb' }, 'Zahlungsbedingungen'), ta('zahlungsbedingungen', 'a-zb', 'Später aus Lexware Office übernommen')]),
  ]);
}

// ---------- Zulagen (wie im Kalkulator, am Rand) ----------

/**
 * Editor für Zulagen: Schalter, Name, Wert in h oder %, Ergebnis in h, löschen, hinzufügen.
 * liste = Zulagen mit h (zulagenListe) oder ohne; aendern(fn) ändert die gespeicherte Liste.
 */
export function zulagenEditor(liste, aendern, { prefix = 'zl', mitErgebnis = true } = {}) {
  const setze = (i, fn) => aendern((l) => { fn(l[i]); });
  return el('div', { class: 'zulagen' }, [
    ...liste.map((z, i) => {
      const name = el('input', {
        class: 'feld zulage-name', type: 'text', value: z.name, 'aria-label': 'Name der Zulage', disabled: !z.an, 'data-fokus': `${prefix}-name-${i}`,
        onchange: () => setze(i, (x) => { x.name = name.value.trim() || 'Zulage'; }),
      });
      const wert = el('input', {
        class: 'feld zahl rechts zulage-wert', type: 'number', min: '0', step: z.art === 'fest' ? '0.25' : '1', value: String(z.wert ?? 0),
        'aria-label': `${z.name} in ${z.art === 'fest' ? 'Stunden' : 'Prozent'}`, disabled: !z.an, 'data-fokus': `${prefix}-wert-${i}`,
        onchange: () => setze(i, (x) => { x.wert = zahlEin(wert.value); }),
      });
      return el('div', { class: `zulage${z.an ? '' : ' aus'}` }, [
        schalter(!!z.an, `${z.name} ein oder aus`, (an) => setze(i, (x) => { x.an = an; }), `${prefix}-an-${i}`),
        name,
        el('div', { class: 'zulage-eingabe' }, [
          wert,
          el('button', {
            type: 'button', class: 'einheitknopf klein', disabled: !z.an, 'data-fokus': `${prefix}-art-${i}`,
            'aria-label': z.art === 'fest' ? 'Auf Prozent umstellen' : 'Auf feste Stunden umstellen',
            onclick: () => setze(i, (x) => { x.art = x.art === 'fest' ? 'prozent' : 'fest'; }),
          }, z.art === 'fest' ? 'h' : '%'),
        ]),
        mitErgebnis ? el('span', { class: 'zulage-h zahl' }, z.an ? `${zahlText(z.h ?? 0, 2)} h` : '–') : null,
        el('button', { type: 'button', class: 'kreuz', 'aria-label': `${z.name} entfernen`, onclick: () => aendern((l) => { l.splice(i, 1); }) }, [kreuzIcon()]),
      ]);
    }),
    el('button', {
      type: 'button', class: 'pille gestrichelt', 'data-fokus': `${prefix}-neu`,
      onclick: () => aendern((l) => { l.push({ id: globalThis.crypto.randomUUID(), name: 'Neue Zulage', art: 'prozent', wert: 5, an: true }); }),
    }, 'Zulage hinzufügen'),
  ]);
}

function zulagenKarte(d, a) {
  const liste = zulagenListe(a);
  const vorlage = JSON.stringify((d.einstellungen.angebotZulagen ?? []).map(({ name, art, wert, an }) => [name, art, wert, an]));
  const hier = JSON.stringify((a.zulagen ?? []).map(({ name, art, wert, an }) => [name, art, wert, an]));
  return el('section', { class: 'kachel zulagen-karte', 'aria-labelledby': 'h-azul' }, [
    el('h2', { id: 'h-azul', class: 'label' }, 'Zulagen'),
    el('p', { class: 'kartentext ohne-abstand' }, 'Feste Stunden je Auftrag und Prozent auf die Grundstunden. Antippen schaltet eine Zulage ein oder aus.'),
    el('div', { class: 'mit-abstand-mittel' }, zulagenEditor(liste, (fn) => aendereAngebot(a.id, (x) => { x.zulagen ??= []; fn(x.zulagen); }), { prefix: 'azl' })),
    el('div', { class: 'knopfreihe eng mit-abstand-mittel' }, vorlage === hier
      ? [el('span', { class: 'zeile-hinweis ohne-abstand' }, 'Wie die Vorlage in den Einstellungen.')]
      : [
          el('button', { type: 'button', class: 'textknopf', 'data-fokus': 'azl-vorlage-speichern', onclick: () => zustand.aendern((x) => { x.einstellungen.angebotZulagen = (a.zulagen ?? []).map(({ name, art, wert, an }) => ({ name, art, wert, an })); }) }, 'Als Vorlage speichern'),
          el('button', { type: 'button', class: 'textknopf', 'data-fokus': 'azl-vorlage-laden', onclick: () => aendereAngebot(a.id, (x, dd) => { x.zulagen = neueZulagen(dd.einstellungen.angebotZulagen); }) }, 'Vorlage übernehmen'),
        ]),
  ]);
}

function summenKarte(d, a, s) {
  const satzFeld = el('input', {
    class: 'feld hoch rechts zahl', type: 'number', step: '0.5', min: '0', value: a.stundensatz ?? '', placeholder: s.quelle === 'kunde' ? String(s.satz) : '', 'aria-label': 'Stundensatz für dieses Angebot', 'data-fokus': 'a-satz',
    onchange: () => aendereAngebot(a.id, (x) => { x.stundensatz = satzFeld.value === '' ? null : zahlEin(satzFeld.value); }),
  });
  const herkunft = s.quelle === 'kunde' ? 'vom Kunden' : s.quelle === 'angebot' ? 'für dieses Angebot' : '';
  const zeile = (l, w, klasse = '') => el('div', { class: `summenzeile ${klasse}`.trim() }, [el('span', { class: 'sekundaer' }, l), el('span', { class: 'zahl' }, w)]);
  return el('section', { class: 'kachel', 'aria-labelledby': 'h-asum' }, [
    el('h2', { id: 'h-asum', class: 'label' }, 'Summen'),
    el('div', { class: 'mit-abstand-mittel' }, [
      zeile('Grundstunden', `${zahlText(s.grundH)} h`),
      zeile('Zulagen', `+ ${zahlText(s.pufferH, 2)} h (${s.pufferProzent} %)`),
      zeile('geplant', `${zahlText(s.geplantH)} h`, 'stahl'),
    ]),
    el('div', { class: 'summen-trenner' }, [
      zeile('netto', euro(s.netto)),
      zeile('MwSt 19 %', euro(s.mwst)),
      el('div', { class: 'summenzeile brutto' }, [el('span', {}, 'brutto'), el('span', { class: 'zahl' }, euro(s.brutto))]),
    ]),
    el('div', { class: 'zeile-hinweis' }, s.satz
      ? [`Stundensatz ${euro(s.satz)}/h ${herkunft}${s.jeStunde ? ` · im Schnitt ${euro(s.jeStunde)} je geplante Stunde` : ''} · `,
          el('button', { type: 'button', class: 'textknopf', 'data-fokus': 'a-satz-auf', onclick: () => { satzOffen = !satzOffen; zustand.neuZeichnen(); } }, satzOffen ? 'fertig' : 'ändern')]
      : ['Noch kein Stundensatz. Trag ihn hier ein oder beim Kunden in den Einstellungen.']),
    satzOffen || !s.satz ? el('div', { class: 'knopfreihe eng nowrap mit-abstand-mittel' }, [satzFeld, el('span', { class: 'zeile-text' }, '€/h')]) : null,
  ]);
}

/** Planungspuffer für die Kapazität: Vorgabe aus den Einstellungen (beim Einplanen wählbar) */
function pruefung(d, a, s, { puffer, start, wunsch } = {}) {
  return anfragePruefen(d, { schaetzungH: s.geplantH, puffer: puffer ?? d.einstellungen.standardPuffer, start, wunschtermin: wunsch }, zustand.planOptionen());
}

function kapazitaetKarte(d, a, s) {
  if (!(s.geplantH > 0)) {
    return el('section', { class: 'karte', 'aria-labelledby': 'h-akap' }, [
      el('h2', { id: 'h-akap', class: 'label' }, 'Kapazität'),
      el('p', { class: 'kartentext' }, 'Trag Grundstunden ein, dann siehst du hier, wann es realistisch fertig ist.'),
    ]);
  }
  const e = d.einstellungen;
  const r = pruefung(d, a, s);
  const varianten = r.varianten.filter((v) => v.art !== 'samstag' || e.samstagErlaubt !== 'nie');
  const ab = r.varianten[0].wochen[0]?.montag ?? r.start;
  const datum = (v) => (v.fertig ? tagKurz(ausText(v.fertig)) : 'nicht im Plan');
  return el('section', { class: 'karte', 'aria-labelledby': 'h-akap' }, [
    el('h2', { id: 'h-akap', class: 'label' }, `Kapazität · ab KW ${isoWoche(ausText(ab)).woche}`),
    el('div', { class: 'titel-kapazitaet zahl' }, `Realistisch fertig: ${datum(varianten[0])}`),
    el('div', { class: 'mit-abstand-mittel' }, varianten.map((v, i) => el('div', { class: 'variantenzeile' }, [
      el('span', { class: 'fuellung' }, v.art === 'regulaer' ? `Regulär · ${zahlText(e.regeltagH)} h` : v.name),
      el('span', { class: 'fett zahl' }, datum(v)),
      i === 0 ? el('span', { class: 'chip stahl' }, 'Empfohlen') : null,
    ]))),
    el('p', { class: 'zeile-hinweis' }, `Mit ${zahlText(e.standardPuffer)} % Planungspuffer, nur freie Stunden. Bestehende Projekte bleiben, wie sie sind.`),
  ]);
}

function lernwertKarte(d, a, s) {
  if (!a.art) return null;
  const lw = lernwerte(d)[a.art];
  const kopf = el('div', { class: 'label' }, `Lernwert · ${a.art}`);
  if (!lw?.anzeigen) {
    return el('section', { class: 'karte' }, [kopf, el('p', { class: 'kartentext' }, `Für „${a.art}“ gibt es ${lw?.anzahl ?? 0} von ${LERNWERT_AB} abgeschlossenen Projekten. Ab ${LERNWERT_AB} siehst du hier, wie gut die Schätzungen gepasst haben.`)]);
  }
  const pr = Math.round(lw.abweichung * 100);
  return el('section', { class: 'karte' }, [
    kopf,
    el('div', { class: 'kennzahl zahl mit-abstand-mittel' }, `${pr > 0 ? '+' : pr < 0 ? '−' : '±'}${Math.abs(pr)} %`),
    el('p', { class: 'kartentext dunkel' }, `Bei ${a.art} lag das Ist im Schnitt so weit ${pr >= 0 ? 'über' : 'unter'} der Schätzung. Dein Puffer: ${s.pufferProzent} %.`),
  ]);
}

/** Am iPhone: Summe und nächster Schritt unten fest (iPhone.dc.html) */
function mobilLeiste(d, a, s) {
  const r = s.geplantH > 0 ? pruefung(d, a, s) : null;
  const fertig = r?.varianten[0].fertig;
  return el('div', { class: 'mobil-aktion' }, [
    el('div', { class: 'mobil-aktion-info zahl' }, [
      el('span', { class: 'fuellung' }, `${zahlText(s.geplantH)} h${fertig ? ` · fertig ${tagKurz(ausText(fertig))}` : ''}`),
      el('span', { class: 'fett' }, `${euro(s.netto)} netto`),
    ]),
    lexware.verbunden() && !a.lexwareId && !a.projektId
      ? el('button', { type: 'button', class: 'pille gross haupt breit', disabled: !!lexware.laeuft('angebot', a.id), onclick: () => anLexware(a) }, 'An Lexware Office übertragen')
      : a.projektId
        ? el('a', { class: 'pille gross haupt breit', href: `#/projekte/${a.projektId}` }, 'Zum Projekt')
        : el('a', { class: 'pille gross haupt breit', href: `#/angebote/${a.id}/auftrag` }, 'Als angenommen markieren'),
  ]);
}

// ---------- Angenommen → Auftrag einplanen ----------

let auftrag = { id: null };
export const auftragVergessen = () => { auftrag = { id: null }; };

export function auftragSeite(id) {
  const d = zustand.aktuell();
  const a = finde(id);
  if (!a) return el('div', { class: 'seite' }, [el('h1', {}, 'Angebot nicht gefunden'), el('a', { href: '#/angebote' }, 'Zu den Angeboten')]);
  const heute = zustand.heute();
  if (auftrag.id !== id) {
    const mo = montag(ausText(heute));
    auftrag = { id, aus: new Set(), start: heute, deadline: null, puffer: d.einstellungen.standardPuffer, fertig: null };
    auftrag.starts = [heute, alsText(plusTage(mo, 7)), alsText(plusTage(mo, 14))];
  }
  const f = auftrag;

  if (a.projektId) {
    const p = d.projekte.find((x) => x.id === a.projektId);
    return el('div', { class: 'seite auftrag-seite' }, [
      kopfAuftrag(a),
      el('section', { class: 'karte weiss reihe-umbruch' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'titel-kapazitaet' }, `Eingeplant: ${zahlText(p ? Math.round(p.schaetzungH * (1 + p.puffer / 100) * 10) / 10 : 0)} h${p?.start ? ` ab KW ${isoWoche(ausText(p.start)).woche}` : ''}`),
          el('p', { class: 'kartentext' }, `Projekt „${p?.name ?? ''}“ ist angelegt.${p?.deadline ? ` Deadline ${tagKurz(ausText(p.deadline))} steht als Meilenstein im Projekt.` : ''}`),
        ]),
        el('a', { class: 'pille gross haupt', href: '#/uebersicht' }, 'Zur Übersicht'),
        el('a', { class: 'pille gross', href: `#/projekte/${a.projektId}` }, 'Zum Projekt'),
        el('button', {
          type: 'button', class: 'pille gross leise', 'data-fokus': 'auftrag-zurueck',
          onclick: async () => {
            let ok = false;
            await zustand.aendern((x) => { ok = annahmeZuruecknehmen(x, id); });
            if (!ok) alert('Auf dem Projekt ist schon Zeit gebucht. Lösch es bei Bedarf in der Projektseite.');
          },
        }, 'Rückgängig'),
      ]),
    ]);
  }

  const gewaehlt = a.positionen.filter((p) => !f.aus.has(p.id));
  const planH = gewaehlt.reduce((s, p) => s + geplantH(p, a), 0);
  const r = planH > 0 ? anfragePruefen(d, { schaetzungH: planH, puffer: f.puffer, start: f.start, wunschtermin: f.deadline }, zustand.planOptionen()) : null;
  const fertig = r?.varianten[0].fertig ?? null;
  const sollH = r?.sollH ?? 0;

  // Deadline-Auswahl: der Freitag nach „realistisch fertig“ (mindestens 2 Tage Luft), eine Woche später, ohne Deadline
  const freitag = (t) => { let x = plusTage(ausText(t), 2); while (x.getDay() !== 5 || feiertag(alsText(x))) x = plusTage(x, 1); return x; };
  const erster = fertig ? alsText(freitag(fertig)) : null;
  const vorschlaege = fertig ? [erster, alsText(freitag(erster))] : [];
  if (f.deadline && !vorschlaege.includes(f.deadline)) vorschlaege.unshift(f.deadline);
  const deadlineFeld = el('input', {
    class: 'feld uhrzeit', type: 'date', min: heute, value: f.deadline && !vorschlaege.includes(f.deadline) ? f.deadline : '', 'aria-label': 'Andere Deadline',
    onchange: () => { f.deadline = deadlineFeld.value || null; zustand.neuZeichnen(); },
  });

  let ergebnis;
  if (!fertig) ergebnis = { art: 'rot', label: 'zu spät', text: planH > 0 ? 'In den nächsten drei Jahren ist nicht genug frei.' : 'Wähl mindestens eine Position.' };
  else if (!f.deadline) ergebnis = { art: 'gruen', label: 'passt', text: 'Ohne Deadline. Geplant wird so früh wie möglich.' };
  else {
    const luft = Math.round((ausText(f.deadline) - ausText(fertig)) / 86400000);
    if (luft < 0) ergebnis = { art: 'rot', label: 'zu spät', text: `Deadline ${tagKurz(ausText(f.deadline))} hält nicht. Positionen reduzieren, Termin verschieben oder Mehrarbeit in der Übersicht prüfen.` };
    else if (luft < 3) ergebnis = { art: 'gelb', label: 'knapp', text: `Nur ${luft} ${luft === 1 ? 'Tag' : 'Tage'} Luft bis ${tagKurz(ausText(f.deadline))}. Der Puffer ist dabei schon eingerechnet.` };
    else ergebnis = { art: 'gruen', label: 'passt', text: `${luft} Tage Luft bis zur Deadline ${tagKurz(ausText(f.deadline))}` };
  }

  const pill = (text, an, onclick, fokus) => el('button', { type: 'button', class: 'wahl', 'aria-pressed': String(an), onclick, 'data-fokus': fokus }, text);

  return el('div', { class: 'seite auftrag-seite' }, [
    kopfAuftrag(a),
    el('section', { class: 'karte weiss', 'aria-labelledby': 'h-aufpos' }, [
      el('h2', { id: 'h-aufpos', class: 'label' }, 'Positionen'),
      el('div', { class: 'mit-abstand-mittel' }, a.positionen.map((p, i) => {
        const an = !f.aus.has(p.id);
        return el('div', { class: 'auswahlzeile' }, [
          el('button', {
            type: 'button', role: 'checkbox', class: 'kaestchen', 'aria-checked': String(an), 'aria-label': `${p.bezeichnung || `Position ${i + 1}`} einplanen`, 'data-fokus': `aw-${p.id}`,
            onclick: () => { if (an) f.aus.add(p.id); else f.aus.delete(p.id); zustand.neuZeichnen(); },
          }, el('span', { class: 'kaestchen-feld', 'aria-hidden': 'true' }, an ? hakenIcon(12) : null)),
          el('span', { class: 'auswahl-nr fett sekundaer zahl' }, String(i + 1)),
          el('span', { class: `fuellung${an ? '' : ' blass'}` }, p.bezeichnung || `Position ${i + 1}`),
          el('span', { class: 'zeile-text sekundaer zahl' }, `${zahlText(p.grundH)} h + ${zahlText(pufferH(p, a), 2)} h Zulagen`),
          el('span', { class: 'auswahl-h fett zahl' }, `${zahlText(geplantH(p, a))} h`),
        ]);
      })),
      el('div', { class: 'summenzeile brutto klein' }, [el('span', {}, 'Aus dem Angebot'), el('span', { class: 'zahl stahl-text' }, `${zahlText(planH)} h`)]),
    ]),
    el('section', { class: 'karte weiss feldraster breit' }, [
      el('div', { class: 'feldgruppe' }, [
        el('span', { class: 'feld-label', id: 'l-astart' }, 'Frühester Start'),
        el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-astart' }, f.starts.map((t, i) => pill(
          i === 0 ? `KW ${isoWoche(ausText(t)).woche} · ab heute` : `KW ${isoWoche(ausText(t)).woche} · ${tm(t)}`, f.start === t, () => { f.start = t; zustand.neuZeichnen(); }, `astart-${i}`))),
      ]),
      el('div', { class: 'feldgruppe' }, [
        el('span', { class: 'feld-label', id: 'l-adl' }, 'Deadline'),
        el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-adl' }, [
          ...vorschlaege.map((t, i) => pill(tagKurz(ausText(t)), f.deadline === t, () => { f.deadline = t; zustand.neuZeichnen(); }, `adl-${i}`)),
          pill('ohne', !f.deadline, () => { f.deadline = null; zustand.neuZeichnen(); }, 'adl-ohne'),
          deadlineFeld,
        ]),
      ]),
      el('div', { class: 'feldgruppe spanne-2' }, [
        el('label', { class: 'feld-label', for: 'a-ppuf' }, ['Planungspuffer ', el('span', { class: 'sekundaer normal' }, '· zusätzlich zu den Zulagen im Angebot, 0 % ist in Ordnung')]),
        el('div', { class: 'reglerzeile' }, [
          (() => {
            const rg = el('input', {
              id: 'a-ppuf', type: 'range', min: '0', max: '20', step: '0.5', value: String(f.puffer), class: 'regler breit', 'data-fokus': 'a-ppuf',
              oninput: () => { wert.textContent = `${zahlText(Number(rg.value))} %`; },
              onchange: () => { f.puffer = Number(rg.value); zustand.neuZeichnen(); },
            });
            return rg;
          })(),
          (() => { const w = el('span', { class: 'reglerwert zahl' }, `${zahlText(f.puffer)} %`); wert = w; return w; })(),
        ]),
      ]),
    ]),
    el('section', { class: 'karte weiss reihe-umbruch' }, [
      el('div', { class: 'fuellung' }, [
        el('div', { class: 'label' }, 'Ergebnis'),
        el('div', { class: 'knopfreihe mit-abstand-mittel' }, [
          el('span', { class: 'titel-kapazitaet zahl' }, fertig ? `fertig ${tagKurz(ausText(fertig))}` : 'nicht im Plan'),
          el('span', { class: `chip ${ergebnis.art}` }, ergebnis.label),
        ]),
        el('p', { class: 'kartentext' }, `${ergebnis.text}${ergebnis.text.endsWith('.') ? '' : '.'} Eingeplant werden ${zahlText(sollH)} h (${zahlText(planH)} h + ${zahlText(f.puffer)} %).`),
      ]),
      el('button', {
        type: 'button', class: 'knopf-timer haupt', disabled: !gewaehlt.length, 'data-fokus': 'auftrag-einplanen',
        onclick: async () => {
          await zustand.sichern('Vor dem Einplanen eines Angebots');
          await zustand.aendern((x) => { angebotAnnehmen(x, id, { positionIds: gewaehlt.map((p) => p.id), start: f.start, deadline: f.deadline ?? '', puffer: f.puffer, heute }); });
          window.scrollTo(0, 0);
        },
      }, 'Auftrag einplanen'),
    ]),
    el('p', { class: 'zeile-hinweis' }, 'Samstage oder lange Tage werden nicht eingeplant. Reicht die Zeit nicht, zeigt die Übersicht Vorschläge.'),
  ]);
}
let wert = null;

function kopfAuftrag(a) {
  return el('div', {}, [
    el('a', { class: 'zurueck-link', href: `#/angebote/${a.id}` }, `‹ ${a.nummer}`),
    el('div', { class: 'mit-abstand-mittel' }, el('span', { class: 'chip gruen gross' }, [hakenIcon(12), `Angebot angenommen · ${tagKurz(ausText(a.angenommenAm ?? zustand.heute()))}`])),
    el('h1', { class: 'display' }, 'Auftrag einplanen'),
    el('p', { class: 'einleitung' }, 'Prüfe, was eingeplant wird. Danach steht der Auftrag in Übersicht und Projektplan.'),
  ]);
}
