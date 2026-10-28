// Projekt anlegen und bearbeiten. Für das Formular gibt es keinen eigenen Entwurf –
// es nutzt Karten, Felder, Auswahlpillen und den Puffer-Regler aus dem Entwurf Index A.

import { el, wahlPille, feldGruppe, zahlText, kreuzIcon, plusIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import { STATUS, STATUS_NAME, STATUS_FEST, soll, neueId } from '../kern/daten.js';
import { lernwert } from '../kern/lernwert.js';
import { empfohlenerPuffer } from './projekt.js';
import { loeschKnopf } from './einstellungen.js';

const FARBEN = ['#445F6E', '#7C93A0', '#B4C3CC'];
const PRIO = [[1, 'hoch'], [2, 'normal'], [3, 'niedrig']];

let entwurf = null; // bleibt beim Neuzeichnen erhalten, wird beim Seitenwechsel verworfen

export function formularVergessen() { entwurf = null; }

function neuerEntwurf(d, p) {
  return {
    projektId: p?.id ?? null,
    nr: p?.nr ?? '', name: p?.name ?? '', kunde: p?.kunde ?? '', art: p?.art ?? '',
    status: p?.status ?? 'anfrage', start: p?.start ?? zustand.heute(), deadline: p?.deadline ?? '',
    prioritaet: p?.prioritaet ?? 2, schaetzungH: p?.schaetzungH ?? 0,
    puffer: p?.puffer ?? d.einstellungen.standardPuffer,
    positionen: (p?.positionen ?? []).map((x) => ({ ...x, alt: x.nr, sollH: x.sollH ?? 0 })),
    fehler: [],
  };
}

export function formularKontext(id) {
  const p = id && zustand.aktuell().projekte.find((x) => x.id === id);
  return p ? [p.name, el('span', { class: 'sekundaer' }, ' · bearbeiten')] : ['Neues Projekt ', el('span', { class: 'sekundaer' }, '· noch nicht gespeichert')];
}

export function projektformular(id = null) {
  const d = zustand.aktuell();
  const p = id ? d.projekte.find((x) => x.id === id) : null;
  if (id && !p) return el('div', { class: 'seite' }, [el('h1', {}, 'Projekt nicht gefunden'), el('a', { href: '#/projekte' }, 'Zur Projektliste')]);
  if (!entwurf || entwurf.projektId !== (p?.id ?? null)) entwurf = neuerEntwurf(d, p);
  const f = entwurf;
  const neu = () => zustand.neuZeichnen();

  const text = (feld, attrs = {}) => {
    const i = el('input', { class: 'feld', type: 'text', value: f[feld], oninput: () => { f[feld] = i.value; }, ...attrs });
    return i;
  };
  const datum = (feld) => {
    const i = el('input', { class: 'feld', type: 'date', value: f[feld], oninput: () => { f[feld] = i.value; } });
    return i;
  };

  const arten = [...new Set(d.projekte.map((x) => x.art).filter(Boolean))].sort();
  const artListe = el('datalist', { id: 'arten' }, arten.map((a) => el('option', { value: a })));

  // ----- Karte Projekt
  const karteProjekt = el('section', { class: 'karte', 'aria-labelledby': 'h-pf' }, [
    el('h2', { id: 'h-pf' }, 'Projekt'),
    el('div', { class: 'stapel gross' }, [
      feldGruppe('Name', text('name', { placeholder: 'z. B. Projekt Frankfurt', 'data-fokus': 'pf-name' })),
      el('div', { class: 'feldpaar' }, [
        feldGruppe('Nummer', text('nr', { placeholder: 'z. B. 26-048' })),
        feldGruppe('Projektart', text('art', { list: 'arten', placeholder: 'z. B. Werkplanung' }), 'Fürs Lernen aus abgeschlossenen Projekten'),
      ]),
      feldGruppe('Kunde', text('kunde')),
      artListe,
      el('div', { class: 'feldgruppe' }, [
        el('span', { class: 'feld-label', id: 'l-status' }, 'Status'),
        el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-status' }, STATUS.map((st) =>
          wahlPille(STATUS_NAME[st], f.status === st, () => { f.status = st; neu(); }, { fokus: `pf-status-${st}` }))),
        el('div', { class: 'zeile-hinweis' }, STATUS_FEST.includes(f.status)
          ? 'Zählt zur Auslastung und wird eingeplant.'
          : ['anfrage', 'angebot'].includes(f.status) ? 'Zählt noch nicht zur Auslastung.' : 'Wird nicht eingeplant.'),
      ]),
    ]),
  ]);

  // ----- Karte Zeitraum und Aufwand
  const summePos = f.positionen.reduce((a, x) => a + (Number(x.sollH) || 0), 0);
  const mitPositionen = f.positionen.length > 0;
  const sollWert = el('div', { class: 'zeile-hinweis zahl' });
  const zeigeSoll = () => {
    const s = mitPositionen ? f.positionen.reduce((a, x) => a + (Number(x.sollH) || 0), 0) : Number(f.schaetzungH) || 0;
    sollWert.textContent = `Soll = ${zahlText(s)} h + ${zahlText(f.puffer)} % = ${zahlText(soll({ schaetzungH: s, puffer: f.puffer }))} h`;
  };
  const schaetzung = el('input', {
    class: 'feld zahl', type: 'number', min: '0', step: '0.5', inputmode: 'decimal',
    value: mitPositionen ? String(summePos) : String(f.schaetzungH), disabled: mitPositionen,
    oninput: () => { f.schaetzungH = schaetzung.value; zeigeSoll(); },
  });
  const pufferWert = el('div', { class: 'stepper-wert zahl' }, `${zahlText(f.puffer)} %`);
  const regler = el('input', {
    id: 'pf-puffer', type: 'range', min: '0', max: '20', step: '0.5', value: String(f.puffer), class: 'regler',
    oninput: () => { f.puffer = Number(regler.value); pufferWert.textContent = `${zahlText(f.puffer)} %`; zeigeSoll(); },
  });
  zeigeSoll();

  const lw = f.art ? lernwert(d, f.art.trim()) : null;
  const empf = lw ? empfohlenerPuffer(lw) : null;

  const karteAufwand = el('section', { class: 'karte', 'aria-labelledby': 'h-pa' }, [
    el('h2', { id: 'h-pa' }, 'Zeitraum und Aufwand'),
    el('div', { class: 'stapel gross' }, [
      el('div', { class: 'feldpaar' }, [
        feldGruppe('Frühester Start', datum('start')),
        feldGruppe('Deadline', datum('deadline'), 'Fester Termin, nach dem geplant wird'),
      ]),
      el('div', { class: 'feldgruppe' }, [
        el('span', { class: 'feld-label', id: 'l-prio' }, 'Priorität'),
        el('div', { class: 'umschalter', role: 'group', 'aria-labelledby': 'l-prio' }, PRIO.map(([k, n]) =>
          el('button', { type: 'button', 'aria-pressed': String(f.prioritaet === k), 'data-fokus': `pf-prio-${k}`, onclick: () => { f.prioritaet = k; neu(); } }, n))),
        el('div', { class: 'zeile-hinweis' }, 'Zählt bei gleicher Deadline.'),
      ]),
      feldGruppe('Schätzung in Stunden', schaetzung, mitPositionen ? 'Summe der Positionen' : null),
      el('div', { class: 'feldgruppe' }, [
        el('label', { class: 'feld-label', for: 'pf-puffer' }, 'Puffer'),
        el('div', { class: 'reglerzeile' }, [regler, pufferWert]),
        sollWert,
        lw ? el('div', { class: 'zeile-hinweis' }, [
          `Lernwert ${f.art}: ${lw.abweichung >= 0 ? '+' : '−'}${Math.abs(Math.round(lw.abweichung * 100))} % aus ${lw.anzahl} Projekten. `,
          empf > f.puffer
            ? el('button', { type: 'button', class: 'textknopf', onclick: () => { f.puffer = empf; neu(); } }, `${zahlText(empf)} % übernehmen`)
            : 'Dein Puffer passt dazu.',
        ]) : null,
      ]),
    ]),
  ]);

  // ----- Karte Positionen
  const neuePosition = () => {
    const nrs = f.positionen.map((x) => Number(x.nr)).filter(Number.isFinite);
    // Die erste Position übernimmt die bisherige Schätzung, damit nichts verloren geht
    const sollH = f.positionen.length ? 0 : Number(f.schaetzungH) || 0;
    f.positionen.push({ nr: String((nrs.length ? Math.max(...nrs) : 0) + 1), bezeichnung: '', sollH, alt: null });
    neu();
  };
  const kartePositionen = el('section', { class: 'karte ganze-breite', 'aria-labelledby': 'h-pp' }, [
    el('div', { class: 'kartenkopf' }, [
      el('h2', { id: 'h-pp', class: 'fuellung' }, 'Positionen'),
      el('button', { type: 'button', class: 'pille', 'data-fokus': 'pf-pos-neu', onclick: neuePosition }, [plusIcon(), 'Position']),
    ]),
    f.positionen.length
      ? el('div', { class: 'mit-abstand' }, [
          el('div', { class: 'positionsform kopfzeile', 'aria-hidden': 'true' }, [
            el('span', { class: 'feld-label' }, 'Nr.'), el('span', { class: 'feld-label' }, 'Bezeichnung'), el('span', { class: 'feld-label' }, 'Soll h'), el('span'),
          ]),
          ...f.positionen.map((x, i) => {
            const nr = el('input', { class: 'feld zahl', type: 'text', value: x.nr, 'aria-label': `Nummer Position ${i + 1}`, oninput: () => { x.nr = nr.value.trim(); } });
            const bez = el('input', { class: 'feld', type: 'text', value: x.bezeichnung, 'aria-label': `Bezeichnung Position ${i + 1}`, placeholder: 'z. B. Verkleidung IT', oninput: () => { x.bezeichnung = bez.value; } });
            const h = el('input', {
              class: 'feld zahl', type: 'number', min: '0', step: '0.5', inputmode: 'decimal', value: String(x.sollH), 'aria-label': `Soll-Stunden Position ${i + 1}`,
              oninput: () => {
                x.sollH = h.value;
                const sum = f.positionen.reduce((a, y) => a + (Number(y.sollH) || 0), 0);
                schaetzung.value = String(sum); zeigeSoll();
              },
            });
            return el('div', { class: 'positionsform' }, [nr, bez, h, el('button', {
              type: 'button', class: 'kreuz', 'aria-label': `Position ${x.nr || i + 1} entfernen`,
              onclick: () => { f.positionen.splice(i, 1); neu(); },
            }, [kreuzIcon()])]);
          }),
        ])
      : el('p', { class: 'zeile-hinweis' }, 'Optional. Mit Positionen siehst du Soll-Ist je Position und buchst Zeit darauf.'),
  ]);

  // ----- Fehler und Knöpfe
  const fehler = f.fehler.length
    ? el('div', { class: 'kachel klein', role: 'alert' }, [
        el('div', { class: 'knopfreihe' }, [el('span', { class: 'chip rot' }, 'Fehlt noch'), el('span', { class: 'zeile-titel' }, 'Bitte prüfen')]),
        el('ul', { class: 'fehlerliste' }, f.fehler.map((x) => el('li', {}, x))),
      ])
    : null;

  const knoepfe = el('div', { class: 'knopfreihe' }, [
    el('button', { type: 'button', class: 'pille haupt', 'data-fokus': 'pf-speichern', onclick: () => speichern(p) }, p ? 'Speichern' : 'Projekt anlegen'),
    el('a', { class: 'pille', href: p ? `#/projekte/${p.id}` : '#/projekte' }, 'Abbrechen'),
    el('div', { class: 'fuellung' }),
    p ? loeschKnopf('Projekt löschen', () => loeschen(p)) : null,
  ]);

  return el('div', { class: 'seite' }, [
    el('div', {}, [
      el('div', { class: 'label' }, p ? 'Projekt bearbeiten' : 'Projekt anlegen'),
      el('h1', { class: 'mit-abstand' }, p ? p.name : 'Neues Projekt'),
    ]),
    el('div', { class: 'raster-karten' }, [karteProjekt, karteAufwand, kartePositionen]),
    fehler,
    knoepfe,
  ]);
}

function pruefen(f) {
  const fehler = [];
  if (!f.name.trim()) fehler.push('Name fehlt.');
  if (f.start && f.deadline && f.deadline < f.start) fehler.push('Die Deadline liegt vor dem Start.');
  const s = Number(f.schaetzungH);
  if (!f.positionen.length && (!Number.isFinite(s) || s < 0)) fehler.push('Die Schätzung ist keine gültige Stundenzahl.');
  const nrs = f.positionen.map((x) => x.nr);
  if (nrs.some((x) => !x)) fehler.push('Jede Position braucht eine Nummer.');
  if (new Set(nrs).size !== nrs.length) fehler.push('Positionsnummern doppelt.');
  if (f.positionen.some((x) => !(Number(x.sollH) >= 0))) fehler.push('Soll-Stunden einer Position sind ungültig.');
  return fehler;
}

async function speichern(p) {
  const f = entwurf;
  f.fehler = pruefen(f);
  if (f.fehler.length) { zustand.neuZeichnen(); return; }

  const positionen = f.positionen.map((x) => ({ nr: x.nr, bezeichnung: x.bezeichnung.trim(), sollH: Math.round(Number(x.sollH) * 10) / 10 }));
  const schaetzungH = positionen.length ? Math.round(positionen.reduce((a, x) => a + x.sollH, 0) * 10) / 10 : Math.round(Number(f.schaetzungH) * 10) / 10;
  const werte = {
    nr: f.nr.trim(), name: f.name.trim(), kunde: f.kunde.trim(), art: f.art.trim(), status: f.status,
    start: f.start || '', deadline: f.deadline || '', prioritaet: f.prioritaet, schaetzungH, puffer: f.puffer, positionen,
  };
  const id = p?.id ?? neueId();

  await zustand.aendern((d) => {
    if (p) {
      const alt = d.projekte.find((x) => x.id === p.id);
      // Deadline-Meilenstein mitziehen, wenn er auf der alten Deadline lag
      if (alt.deadline && werte.deadline && alt.deadline !== werte.deadline) {
        d.meilensteine.forEach((m) => { if (m.projektId === p.id && m.typ === 'deadline' && m.datum === alt.deadline) m.datum = werte.deadline; });
      }
      // Umbenannte Positionsnummern in den Zeiteinträgen nachführen
      for (const x of f.positionen) {
        if (x.alt && x.alt !== x.nr) d.zeiteintraege.forEach((z) => { if (z.projektId === p.id && z.positionNr === x.alt) z.positionNr = x.nr; });
      }
      Object.assign(alt, werte);
    } else {
      const fest = d.projekte.filter((x) => STATUS_FEST.includes(x.status)).length;
      d.projekte.push({ id, farbe: FARBEN[fest % FARBEN.length], ...werte });
      if (werte.deadline) {
        d.meilensteine.push({ id: neueId(), projektId: id, datum: werte.deadline, titel: 'Abgabe', typ: 'deadline', notiz: '', erledigt: false, erinnerungTage: [7, 2] });
      }
    }
  });
  entwurf = null;
  location.hash = `#/projekte/${id}`;
}

async function loeschen(p) {
  await zustand.sichern('loeschen');
  await zustand.aendern((d) => {
    d.projekte = d.projekte.filter((x) => x.id !== p.id);
    for (const k of ['meilensteine', 'zeiteintraege', 'einplanungen']) d[k] = d[k].filter((x) => x.projektId !== p.id);
    d.vorschlaegeUebernommen = d.vorschlaegeUebernommen.filter((x) => x.projektId !== p.id);
  });
  entwurf = null;
  location.hash = '#/projekte';
}
