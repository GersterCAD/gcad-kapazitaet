// Nachkalkulation nach Entwurf Index B: je Projekt (Nachkalkulation.dc.html) und Übersicht (NachkalkUebersicht.dc.html).
// Gerechnet wird wie in Joachims Werkzeug (js/kern/nachkalkulation.js). Die Ergebnisrechnung und das Kostenformular
// haben keinen eigenen Entwurf und nutzen nur Bausteine aus Index A/B.

import { el, zahlText, schalter, kreuzIcon, plusIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import { neueId, STATUS_NAME } from '../kern/daten.js';
import { euro } from '../kern/abrechnung.js';
import { KOSTEN_ART, POSITION_TYP, ERGEBNIS, nachkalkulation, nachkalkUebersicht, nachkalkEinstellungen, pufferHinweis } from '../kern/nachkalkulation.js';
import { lernwerte } from '../kern/lernwert.js';
import { empfohlenerPuffer } from './projekt.js';
import { ausText, tagKurz } from '../kern/datum.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const prozent = (x, plus = true) => (ok(x) ? `${plus && x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x))} %` : '–');
const eurOder = (x) => (ok(x) ? euro(x) : '–');
const ergebnisChip = (amp) => (amp ? el('span', { class: `chip ${amp}` }, ERGEBNIS[amp]) : el('span', { class: 'chip' }, 'offen'));
const abwFarbe = (x) => (!ok(x) ? '' : x > 10 ? 'rot-text' : x > 0 ? 'gelb-text' : 'gruen-text');

const kachel = (label, wert, unter, chip) => el('div', { class: 'kachel' }, [
  el('div', { class: 'label' }, label),
  el('div', { class: 'knopfreihe eng mit-abstand-mittel' }, [el('span', { class: 'kennzahl zahl' }, wert), chip]),
  el('div', { class: 'kachel-unter' }, unter),
]);

// ---------- Je Projekt ----------

let form = null; // offenes Kostenformular { projektId, art, bez, datum, betrag, km, positionNr, weiter }

export function nachkalkKopf(id) {
  const p = zustand.aktuell().projekte.find((x) => x.id === id);
  return { titel: 'Nachkalkulation', zurueck: `#/projekte/${id}`, kontext: [p?.name ?? 'Projekt', el('span', { class: 'sekundaer' }, ' · Nachkalkulation')] };
}

export function nachkalkSeite(id) {
  const d = zustand.aktuell();
  const p = d.projekte.find((x) => x.id === id);
  if (!p) return el('div', { class: 'seite' }, [el('h1', {}, 'Projekt nicht gefunden'), el('a', { href: '#/abrechnung/nachkalkulation' }, 'Zur Nachkalkulation')]);
  const e = nachkalkEinstellungen(d);
  const n = nachkalkulation(d, id);
  const T = n.T;
  const fertig = p.status === 'abgeschlossen';

  // Ergebnis oben rechts: „knapp · 3 % unter Zielsatz“
  let ergebnisText = '';
  if (T.ziel && ok(T.satz)) {
    const diff = ((T.satz - T.ziel) / T.ziel) * 100;
    ergebnisText = T.ampel === 'rot' ? 'unter Selbstkosten' : `${Math.abs(Math.round(diff))} % ${diff >= 0 ? 'über' : 'unter'} Zielsatz`;
  }
  const erloesUnter = T.nachStunden ? `${zahlText(T.istH)} h × ${T.satzStd ? euro(T.satzStd) : 'Satz fehlt'}${T.satzAnnahme ? ' (Ziel-Satz)' : ''}`
    : T.rechnungen ? `${T.rechnungen} ${T.rechnungen === 1 ? 'Rechnung' : 'Rechnungen'}` : p.abrechnungsart === 'pauschal' ? 'Pauschal laut Angebot' : 'Preise laut Angebot';

  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf' }, [
      el('div', {}, [
        el('a', { class: 'zurueck-link', href: '#/abrechnung/nachkalkulation' }, '‹ Nachkalkulation'),
        el('h1', { class: 'mit-abstand-mittel' }, p.name),
        el('div', { class: 'zeile-text sekundaer mit-abstand-mittel' }, [p.art, p.abrechnungsart === 'pauschal' ? 'Pauschal' : 'nach Stunden', fertig ? 'abgeschlossen' : `${STATUS_NAME[p.status]} · vorläufig`].filter(Boolean).join(' · ')),
      ]),
      T.ampel ? el('div', { class: `ergebnis-pille ${T.ampel}` }, [el('span', { class: 'fett' }, ERGEBNIS[T.ampel]), ergebnisText]) : null,
    ]),
    !T.ziel || !T.selbstkosten ? el('div', { class: 'hinweiskarte' }, [
      el('span', { class: 'chip gelb' }, 'Hinweis'),
      el('div', { class: 'fuellung' }, !T.ziel ? 'Es fehlt ein Ziel-Stundensatz. Trag ihn beim Kunden oder in den Einstellungen ein.' : 'Ohne Selbstkostensatz kann die Ampel nicht zwischen „knapp“ und „Verlust“ unterscheiden.'),
      el('a', { class: 'fett-mittel nowrap-text', href: '#/einstellungen' }, 'Einstellungen › Nachkalkulation'),
    ]) : null,
    el('div', { class: 'raster-kacheln' }, [
      kachel('Erlös netto', euro(T.erloes), erloesUnter),
      kachel('Stunden Soll / Ist', `${zahlText(T.sollH)} / ${zahlText(T.istH)} h`, `Schätzung ${zahlText(T.schaetzungH)} h${p.puffer ? ` + ${zahlText(p.puffer)} % Puffer` : ' · ohne Puffer kalkuliert'}`),
      kachel('Effektiver Stundensatz', eurOder(T.satz), `${T.ziel ? `Ziel ${euro(T.ziel)}` : 'kein Ziel'}${T.kosten ? ` · vor Kosten ${eurOder(T.satzBrutto)}` : ''}`),
      fertig || T.abwH > 0
        ? kachel('Abweichung', prozent(T.abwPct), ok(T.abwH) ? `${zahlText(Math.abs(T.abwH))} h ${T.abwH >= 0 ? 'mehr' : 'weniger'} als geplant` : '',
          ok(T.abwPct) ? el('span', { class: `chip ${T.abwPct > 10 ? 'rot' : T.abwPct > 0 ? 'gelb' : 'gruen'}` }, T.abwPct > 0 ? 'über Soll' : 'im Soll') : null)
        : kachel('Abweichung', '–', `läuft noch · ${zahlText(T.istH)} von ${zahlText(T.sollH)} h gebucht`),
    ]),
    el('div', { class: 'zweispaltig' }, [
      el('div', { class: 'spalte-haupt' }, [positionenKarte(n, fertig), ergebnisKarte(T, e)]),
      el('aside', { class: 'spalte-seite' }, [kostenKarte(d, p, T, e), lernKarte(d, p, n), stufenKarte(T)]),
    ]),
  ]);
}

function positionenKarte(n, fertig) {
  const skala = Math.max(1, ...n.positionen.map((x) => Math.max(x.sollH, x.istH))) * 1.15;
  const merk = (x) => [x.typ !== 'auftrag' ? POSITION_TYP.find((t) => t.id === x.typ)?.name : null, x.status === 'unverguetet' ? 'nicht vergütet' : null].filter(Boolean).join(' · ');
  return el('section', { class: 'karte', 'aria-labelledby': 'h-nkpos' }, [
    el('div', { class: 'knopfreihe grundlinie' }, [
      el('h2', { id: 'h-nkpos' }, 'Soll-Ist je Position'),
      el('span', { class: 'zeile-text sekundaer' }, 'Balken = Ist, Strich = Soll, rot = über Soll'),
    ]),
    el('div', { class: 'mit-abstand-mittel' }, n.positionen.map((x) => el('div', { class: 'positionszeile' }, [
      el('div', { class: 'positionsname' }, [
        x.nr != null ? el('span', { class: 'fett zahl' }, `Pos. ${x.nr} `) : null,
        el('span', { class: 'sekundaer' }, x.name),
        merk(x) ? el('span', { class: 'chip klein-chip' }, merk(x)) : null,
      ]),
      el('div', { class: 'balken', role: 'img', 'aria-label': `Ist ${zahlText(x.istH)} von ${zahlText(x.sollH)} Stunden` }, [
        el('div', { class: `balken-ist${x.sollH > 0 && x.istH > x.sollH + 0.05 ? ' rot' : ''}`, style: `width:${Math.min(100, (x.istH / skala) * 100).toFixed(1)}%` }),
        x.sollH > 0 ? el('div', { class: 'balken-soll', style: `left:${((x.sollH / skala) * 100).toFixed(1)}%` }) : null,
      ]),
      el('div', { class: 'positionswert zahl' }, `${zahlText(x.istH)} / ${zahlText(x.sollH)} h`),
      el('div', { class: `positionsabw zahl fett ${abwFarbe(x.abwPct)}` }, fertig || x.abwPct > 0 ? prozent(x.abwPct) : '–'),
    ]))),
    n.positionen.some((x) => x.verteiltH > 0)
      ? el('p', { class: 'zeile-hinweis' }, `Zeit ohne Position (${zahlText(n.positionen.reduce((s, x) => s + x.verteiltH, 0), 2)} h) ist nach Preisanteil auf die Positionen verteilt.`) : null,
  ]);
}

function ergebnisKarte(T, e) {
  const zeile = (l, w, k = '') => el('div', { class: `summenzeile ${k}`.trim() }, [el('span', { class: k.includes('fett') ? '' : 'sekundaer' }, l), el('span', { class: 'zahl' }, w)]);
  const kostenZeilen = KOSTEN_ART.filter((a) => T.kostGes[a.id]).map((a) => zeile(`− ${a.id === 'reise' ? 'Fahrten' : a.name}`, euro(T.kostGes[a.id])));
  return el('section', { class: 'karte', 'aria-labelledby': 'h-nkerg' }, [
    el('h2', { id: 'h-nkerg' }, 'Ergebnisrechnung'),
    el('div', { class: 'ergebnisrechnung mit-abstand-mittel' }, [
      el('div', {}, [
        zeile('Erlös netto', euro(T.erloes)),
        ...kostenZeilen,
        el('div', { class: 'summen-trenner' }, zeile('Deckungsbeitrag', euro(T.db), 'fett')),
        zeile('Marge', ok(T.marge) ? `${Math.round(T.marge)} %` : '–'),
        T.selbst != null ? zeile(`− eigene Kosten (${zahlText(T.istH)} h × ${euro(e.selbstkosten)})`, euro(T.selbst)) : null,
        T.gewinn != null ? el('div', { class: 'summen-trenner' }, zeile('Gewinn', `${euro(T.gewinn)}${ok(T.gewinnPct) ? ` · ${Math.round(T.gewinnPct)} %` : ''}`, 'fett')) : null,
      ]),
      el('div', {}, [
        zeile('Ist-Stundensatz (DB ÷ Ist)', eurOder(T.satz), 'fett'),
        zeile('Soll-Stundensatz (Erlös ÷ Soll)', eurOder(T.sollSatz)),
        T.mehrH > 0 ? zeile(`Nicht erlöste Mehrleistung (${zahlText(T.mehrH)} h)`, T.mehrEUR != null ? euro(T.mehrEUR) : '–') : null,
        T.breakH != null ? zeile('Break-even', `${zahlText(T.breakH)} h`) : null,
        ok(T.kapaPct) ? zeile('Kapazitätsbindung im Jahr', `${zahlText(T.kapaPct)} %`) : null,
        T.weiter ? zeile('davon Durchlaufposten', euro(T.weiter)) : null,
        T.unverguetet ? zeile('nicht vergütete Nachträge', euro(T.unverguetet)) : null,
      ]),
    ]),
  ]);
}

function kostenKarte(d, p, T, e) {
  const kosten = (d.kosten ?? []).filter((k) => k.projektId === p.id).sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? ''));
  const zeilen = kosten.map((k) => el('div', { class: 'kostenzeile zahl' }, [
    el('span', { class: 'fuellung' }, [
      `${KOSTEN_ART.find((a) => a.id === k.art)?.name ?? 'Kosten'}${k.bez ? ` · ${k.bez}` : ''}`,
      el('span', { class: 'block zeile-hinweis ohne-abstand' }, [k.datum ? tagKurz(ausText(k.datum)) : null, k.km ? `${zahlText(k.km)} km` : null, k.positionNr ? `Pos. ${k.positionNr}` : 'ganzer Auftrag', k.weiter ? 'weiterberechnet' : null].filter(Boolean).join(' · ')),
    ]),
    el('span', { class: 'fett-mittel' }, euro(k.betrag)),
    el('button', { type: 'button', class: 'kreuz', 'aria-label': `${k.bez || 'Kosten'} löschen`, onclick: () => zustand.aendern((x) => { x.kosten = x.kosten.filter((y) => y.id !== k.id); }) }, [kreuzIcon()]),
  ]));
  return el('section', { class: 'kachel', 'aria-labelledby': 'h-nkk' }, [
    el('div', { class: 'knopfreihe eng' }, [el('h2', { id: 'h-nkk', class: 'label fuellung' }, 'Weitere Kosten'), p.status !== 'abgeschlossen' ? el('span', { class: 'chip weiss-chip' }, 'vorläufig') : null]),
    el('div', { class: 'mit-abstand-mittel' }, zeilen.length ? zeilen : [el('p', { class: 'zeile-hinweis' }, 'Noch keine Kosten. Material, Fremdleistungen und Fahrten mindern den Deckungsbeitrag.')]),
    zeilen.length ? el('div', { class: 'summenzeile fett' }, [el('span', {}, 'Summe'), el('span', { class: 'zahl' }, euro(T.kosten))]) : null,
    form?.projektId === p.id ? kostenFormular(p, e) : el('button', {
      type: 'button', class: 'pille gestrichelt mit-abstand', 'data-fokus': 'nk-kosten-neu',
      onclick: () => { form = { projektId: p.id, art: 'material', bez: '', datum: zustand.heute(), betrag: '', km: '', positionNr: null, weiter: false }; zustand.neuZeichnen(); },
    }, [plusIcon(), 'Kosten eintragen']),
  ]);
}

function kostenFormular(p, e) {
  const f = form;
  const fehler = el('div', { class: 'meldung rot', role: 'alert' });
  const fahrt = f.art === 'reise';
  const feld = (key, attrs) => {
    const x = el('input', { class: 'feld', value: f[key] ?? '', oninput: () => { f[key] = x.value; if (key === 'km') betragText.textContent = kmText(); }, ...attrs });
    return x;
  };
  const kmText = () => (Number(f.km) > 0 ? `= ${euro(Math.round(Number(f.km) * e.kmSatz * 100) / 100)} (${zahlText(e.kmSatz, 2)} €/km)` : `${zahlText(e.kmSatz, 2)} €/km`);
  const betragText = el('span', { class: 'zeile-hinweis' }, kmText());
  const pos = el('select', { class: 'feld', 'aria-label': 'Position', onchange: () => { f.positionNr = pos.value || null; } }, [
    el('option', { value: '' }, 'ganzer Auftrag'),
    ...p.positionen.map((x) => { const o = el('option', { value: x.nr }, `Pos. ${x.nr} ${x.bezeichnung}`); if (x.nr === f.positionNr) o.selected = true; return o; }),
  ]);
  const speichern = () => {
    const km = Number(String(f.km).replace(',', '.'));
    const betrag = fahrt ? Math.round(km * e.kmSatz * 100) / 100 : Math.round(Number(String(f.betrag).replace(',', '.')) * 100) / 100;
    if (!(betrag > 0)) { fehler.textContent = fahrt ? 'Trag die Kilometer ein.' : 'Trag einen Betrag ein.'; return; }
    const neu = { id: neueId(), projektId: p.id, art: f.art, bez: f.bez.trim(), datum: f.datum || '', betrag, positionNr: f.positionNr, weiter: !!f.weiter, ...(fahrt ? { km } : {}) };
    form = null;
    zustand.aendern((x) => { x.kosten ??= []; x.kosten.push(neu); });
  };
  return el('div', { class: 'kachel klein formular weiss-kachel mit-abstand' }, [
    el('div', { class: 'wahlreihe', role: 'group', 'aria-label': 'Art' }, KOSTEN_ART.map((a) => el('button', {
      type: 'button', class: 'wahl', 'aria-pressed': String(f.art === a.id), 'data-fokus': `nk-art-${a.id}`, onclick: () => { f.art = a.id; zustand.neuZeichnen(); },
    }, a.name))),
    el('div', { class: 'feldgruppe' }, [el('span', { class: 'feld-label' }, 'Bezeichnung'), feld('bez', { type: 'text', placeholder: fahrt ? 'z. B. Aufmaß vor Ort' : 'z. B. Plots', 'aria-label': 'Bezeichnung' })]),
    el('div', { class: 'feldpaar' }, [
      el('div', { class: 'feldgruppe' }, [el('span', { class: 'feld-label' }, 'Datum'), feld('datum', { type: 'date', 'aria-label': 'Datum' })]),
      fahrt
        ? el('div', { class: 'feldgruppe' }, [el('span', { class: 'feld-label' }, 'Kilometer'), feld('km', { type: 'number', min: '0', step: '1', inputmode: 'decimal', 'aria-label': 'Kilometer' }), betragText])
        : el('div', { class: 'feldgruppe' }, [el('span', { class: 'feld-label' }, 'Betrag netto €'), feld('betrag', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', 'aria-label': 'Betrag netto in Euro' })]),
    ]),
    p.positionen.length ? el('div', { class: 'feldgruppe' }, [el('span', { class: 'feld-label' }, 'Position'), pos, el('span', { class: 'zeile-hinweis' }, 'Ohne Position wird nach Preisanteil umgelegt.')]) : null,
    el('div', { class: 'zeile ohne-linie' }, [
      el('div', { class: 'fuellung' }, [el('div', { class: 'zeile-titel', id: 'l-weiter' }, 'Weiterberechnet'), el('div', { class: 'zeile-hinweis' }, 'Durchlaufposten, im Angebot enthalten')]),
      schalter(!!f.weiter, '#l-weiter', (an) => { f.weiter = an; zustand.neuZeichnen(); }, 'nk-weiter'),
    ]),
    fehler,
    el('div', { class: 'knopfreihe' }, [
      el('button', { type: 'button', class: 'pille haupt', onclick: speichern }, 'Speichern'),
      el('button', { type: 'button', class: 'pille', onclick: () => { form = null; zustand.neuZeichnen(); } }, 'Abbrechen'),
    ]),
  ]);
}

function lernKarte(d, p, n) {
  const h = pufferHinweis(d, p.id, n);
  const lw = p.art ? lernwerte(d)[p.art] : null;
  let titel, text;
  if (lw?.anzeigen) {
    const empf = empfohlenerPuffer(lw);
    titel = `Für ${p.art} nächstes Mal ${zahlText(empf)} % Puffer.`;
    text = `In ${lw.anzahl} abgeschlossenen Projekten lag das Ist im Schnitt ${prozent(lw.abweichung * 100)} neben der Schätzung.`;
  } else if (h) {
    titel = `Für ${p.art || 'diese Projektart'} nächstes Mal ${h.puffer} % Puffer.`;
    text = '';
  } else {
    titel = ok(n.T.abwPct) ? 'Die Schätzung hat gepasst.' : 'Noch keine Stunden gebucht.';
    text = '';
  }
  if (h) {
    const ueber = h.ueber.filter((x) => x.nr != null);
    text = [text, ueber.length ? `${ueber.map((x) => `Pos. ${x.nr}`).join(' und ')} ${ueber.length === 1 ? 'lag' : 'lagen'} ${ueber.map((x) => prozent(x.abwPct, false)).join(' und ')} über Soll.` : '',
      h.preis ? `Mit ${h.puffer} % Puffer (${zahlText(h.stunden)} h) hätte der Preis bei ${euro(n.T.ziel)}/h ${euro(h.preis)} betragen.` : ''].filter(Boolean).join(' ');
  }
  return el('section', { class: 'karte' }, [
    el('div', { class: 'label' }, 'Lernwert'),
    el('div', { class: 'lern-titel mit-abstand-mittel' }, titel),
    text ? el('p', { class: 'kartentext' }, text) : null,
  ]);
}

function stufenKarte(T) {
  const stufe = (amp, regel) => el('div', { class: `stufe${T.ampel === amp ? ' aktiv' : ''}` }, [el('span', { class: `chip ${amp} stufen-chip` }, ERGEBNIS[amp]), el('span', {}, regel)]);
  return el('section', { class: 'karte' }, [
    el('div', { class: 'label' }, 'Ergebnis-Stufen'),
    el('div', { class: 'stapel' }, [
      stufe('gruen', `≥ Zielsatz${T.ziel ? ` (${euro(T.ziel)})` : ''}`),
      stufe('gelb', `deckt die Selbstkosten${T.selbstkosten ? ` (${euro(T.selbstkosten)})` : ''}`),
      stufe('rot', 'unter den Selbstkosten'),
    ]),
    el('p', { class: 'zeile-hinweis' }, 'Gemessen am Ist-Stundensatz nach Kosten.'),
  ]);
}

// ---------- Übersicht ----------

let gruppierung = 'art';

export function nachkalkUebersichtSeite(unterseiten) {
  const d = zustand.aktuell();
  const jahr = zustand.heute().slice(0, 4);
  const u = nachkalkUebersicht(d, { jahr });
  const e = nachkalkEinstellungen(d);
  const gruppen = gruppierung === 'art' ? u.nachArt : u.nachKunde;

  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf mitte' }, [el('h1', {}, 'Nachkalkulation'), unterseiten]),
    el('div', { class: 'raster-kacheln breit' }, [
      kachel(`Ø je Stunde · ${jahr}`, eurOder(u.schnitt.satz), `${u.schnitt.anzahl} abgeschlossene ${u.schnitt.anzahl === 1 ? 'Projekt' : 'Projekte'}${e.zielSatz ? ` · Ziel ${euro(e.zielSatz)}` : ''}`),
      el('div', { class: 'kachel dunkel-kachel' }, [
        el('div', { class: 'label' }, 'Pauschal gegen Stunden'),
        el('div', { class: 'knopfreihe mit-abstand-mittel gross-abstand' }, [
          el('div', {}, [el('div', { class: 'kennzahl zahl' }, eurOder(u.pauschal.satz)), el('div', { class: 'kachel-unter' }, `pauschal · ${u.pauschal.anzahl} ${u.pauschal.anzahl === 1 ? 'Projekt' : 'Projekte'}`)]),
          el('div', {}, [el('div', { class: 'kennzahl zahl' }, eurOder(u.stunden.satz)), el('div', { class: 'kachel-unter' }, `nach Stunden · ${u.stunden.anzahl} ${u.stunden.anzahl === 1 ? 'Projekt' : 'Projekte'}`)]),
        ]),
      ]),
      kachel('Ø Abweichung Ist zu Soll', prozent(u.abwSchnitt), u.ausreisser ? `${u.ausreisser.name} liegt mit ${prozent(u.ausreisser.abw)} am weitesten daneben` : 'noch keine Werte'),
    ]),
    el('section', { class: 'karte', 'aria-labelledby': 'h-nkg' }, [
      el('div', { class: 'kartenkopf' }, [
        el('h2', { id: 'h-nkg', class: 'fuellung' }, 'Je Gruppe'),
        el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Gruppieren' }, [['art', 'nach Projektart'], ['kunde', 'nach Kunde']].map(([k, t]) => el('button', {
          type: 'button', 'aria-pressed': String(gruppierung === k), 'data-fokus': `nkg-${k}`, onclick: () => { gruppierung = k; zustand.neuZeichnen(); },
        }, t))),
      ]),
      gruppen.length ? el('div', { class: 'gruppenraster mit-abstand' }, gruppen.map((g) => el('div', { class: 'kachel klein-kachel' }, [
        el('div', { class: 'knopfreihe eng' }, [el('span', { class: 'zeile-titel fuellung' }, g.name), g.ampel ? ergebnisChip(g.ampel) : null]),
        el('div', { class: 'knopfreihe mit-abstand-mittel zahl' }, [
          el('div', {}, [el('div', { class: 'gruppen-wert' }, eurOder(g.satz)), el('div', { class: 'zeile-hinweis ohne-abstand' }, 'je Stunde')]),
          el('div', {}, [el('div', { class: 'gruppen-wert' }, prozent(g.abw)), el('div', { class: 'zeile-hinweis ohne-abstand' }, 'Abweichung')]),
          el('div', {}, [el('div', { class: 'gruppen-wert' }, String(g.anzahl)), el('div', { class: 'zeile-hinweis ohne-abstand' }, g.anzahl === 1 ? 'Projekt' : 'Projekte')]),
        ]),
      ]))) : el('p', { class: 'zeile-hinweis' }, 'Noch keine abgeschlossenen Projekte mit gebuchter Zeit.'),
    ]),
    el('section', { class: 'tabelle-rahmen', 'aria-labelledby': 'h-nkl' }, [
      el('div', { class: 'kartenkopf innen' }, [el('h2', { id: 'h-nkl', class: 'fuellung' }, 'Abgeschlossene Projekte')]),
      el('div', { class: 'nktabelle' }, [
        el('div', { class: 'nk-zeile nk-kopf label' }, ['Projekt', 'Kunde', 'Art', 'Abrechn.', 'Erlös', 'Soll / Ist', 'Abw.', 'je Stunde', 'Ergebnis'].map((t, i) => el('span', { class: i >= 4 && i <= 7 ? 'rechts' : null }, t))),
        ...u.zeilen.map(({ projekt: p, n }) => el('a', { class: 'nk-zeile zahl', href: `#/projekte/${p.id}/nachkalkulation` }, [
          el('span', { class: 'fett-mittel' }, p.name),
          el('span', {}, p.kunde || '–'),
          el('span', { class: 'sekundaer' }, p.art || '–'),
          el('span', { class: 'sekundaer' }, p.abrechnungsart === 'pauschal' ? 'Pauschal' : 'Stunden'),
          el('span', { class: 'rechts' }, euro(n.T.erloes)),
          el('span', { class: 'rechts' }, `${zahlText(n.T.sollH)} / ${zahlText(n.T.istH)} h`),
          el('span', { class: `rechts fett ${abwFarbe(n.T.abwPct)}` }, prozent(n.T.abwPct)),
          el('span', { class: 'rechts fett' }, eurOder(n.T.satz)),
          el('span', {}, ergebnisChip(n.T.ampel)),
        ])),
        u.zeilen.length ? null : el('div', { class: 'tabelle-leer' }, 'Noch keine abgeschlossenen Projekte. Sobald du ein Projekt auf „abgeschlossen“ stellst, steht es hier.'),
      ]),
    ]),
  ]);
}
