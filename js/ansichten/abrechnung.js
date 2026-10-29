// Abrechnung nach Entwurf Index B: Übersicht „Offen“ (Abrechnung.dc.html), Liste „Rechnungen“,
// Rechnung erstellen aus einem Projekt (Rechnung.dc.html), Übertragungs-Zustände (Zustaende.dc.html).
// Die App legt in Lexware Office nur Entwürfe an. Festschreiben und Versenden machst du dort.

import { el, zahlText, hakenIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import * as lexware from '../lexware.js';
import { euro, ZUSAMMENFASSEN, STANDARD_ZUSAMMENFASSEN, offen, kundeVon } from '../kern/abrechnung.js';
import {
  RECHNUNG_ART, RECHNUNG_STATUS_NAME, rechnungBerechnen, rechnungAnlegen, rechnungStatus, rechnungLoeschen,
  rechnungenVon, offenUebersicht, pauschalBerechnet,
} from '../kern/rechnung.js';
import { ausText, tagKurz } from '../kern/datum.js';
import { loeschKnopf } from './einstellungen.js';

const tm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : '–');
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Umschalter „Offen · Rechnungen · Nachkalkulation“ */
export function unterseiten(aktiv) {
  return el('nav', { class: 'umschalter', 'aria-label': 'Unterseite' }, [
    el('a', { href: '#/abrechnung', 'aria-current': aktiv === 'offen' ? 'page' : null }, 'Offen'),
    el('a', { href: '#/abrechnung/rechnungen', 'aria-current': aktiv === 'rechnungen' ? 'page' : null }, 'Rechnungen'),
    el('a', { href: '#/abrechnung/nachkalkulation', 'aria-current': aktiv === 'nachkalkulation' ? 'page' : null }, 'Nachkalkulation'),
  ]);
}

const kachel = (label, wert, unter, chip) => el('div', { class: 'kachel' }, [
  el('div', { class: 'label' }, label),
  el('div', { class: 'knopfreihe eng mit-abstand-mittel' }, [el('span', { class: 'kennzahl zahl' }, wert), chip]),
  el('div', { class: 'kachel-unter' }, unter),
]);

/** Hinweis, wenn Lexware Office nicht verbunden ist (Zustaende.dc.html) */
export function lexwareHinweis() {
  if (lexware.verbunden()) return null;
  return el('div', { class: 'hinweiskarte' }, [
    el('span', { class: 'chip gelb' }, 'Hinweis'),
    el('div', { class: 'fuellung' }, zustand.istBeispiel()
      ? 'Mit Beispieldaten wird nichts an Lexware Office übertragen. Rechnungen bleiben als Entwurf in der App.'
      : 'Lexware Office ist nicht verbunden. Angebote und Rechnungen bleiben als Entwurf in der App.'),
    zustand.istBeispiel() ? null : el('a', { class: 'fett-mittel nowrap-text', href: '#/einstellungen' }, 'Einstellungen › Verbinden'),
  ]);
}

const statusPunkt = (r) => ({ uebertragen: 'gelb', erledigt: 'gruen', fehler: 'rot', sendet: 'stahl', entwurf: '' }[r.status] ?? '');

function rechnungZeile(d, r, { mitProjekt = true } = {}) {
  const p = d.projekte.find((x) => x.id === r.projektId);
  return el('div', { class: 'rechnungszeile zahl' }, [
    el('span', { class: 'spalte-kurz sekundaer' }, tm(r.erstellt)),
    el('span', { class: 'fuellung' }, mitProjekt
      ? [el('a', { href: `#/projekte/${r.projektId}/rechnung` }, p?.name ?? 'Projekt'), ` · ${r.titel}`]
      : r.titel),
    el('span', { class: 'rechnung-betrag fett-mittel' }, euro(r.netto)),
    el('span', { class: 'lexware-status rechnung-status' }, [el('span', { class: `punkt ${statusPunkt(r)}`.trim(), 'aria-hidden': 'true' }),
      r.status === 'uebertragen' && r.lexwareId ? el('a', { href: lexware.link('rechnung', r.lexwareId), target: '_blank', rel: 'noopener' }, RECHNUNG_STATUS_NAME[r.status]) : RECHNUNG_STATUS_NAME[r.status]]),
  ]);
}

// ---------- Offen ----------

let filterOffen = 'alle';

export function abrechnungOffen() {
  const d = zustand.aktuell();
  const heute = zustand.heute();
  const alle = offenUebersicht(d, heute);
  const zeilen = alle.filter((z) => filterOffen === 'alle' || z.art === filterOffen);
  const summe = alle.reduce((s, z) => s + (z.offenBetrag ?? 0), 0);
  const alt = alle.filter((z) => z.aelter > 0).sort((a, b) => b.aelter - a.aelter);
  const entwuerfe = (d.rechnungen ?? []).filter((r) => r.status === 'uebertragen');
  const inApp = (d.rechnungen ?? []).filter((r) => ['entwurf', 'fehler', 'sendet'].includes(r.status));
  const zuletzt = [...(d.rechnungen ?? [])].sort((a, b) => (b.erstellt ?? '').localeCompare(a.erstellt ?? '')).slice(0, 5);

  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf mitte' }, [el('h1', {}, 'Abrechnung'), unterseiten('offen')]),
    lexwareHinweis(),
    el('div', { class: 'raster-kacheln' }, [
      kachel('Offen gesamt', euro(summe), `netto · ${alle.length} ${alle.length === 1 ? 'Projekt' : 'Projekte'}`),
      kachel(`Länger als 30 Tage`, euro(alt.reduce((s, z) => s + z.aelter, 0)), alt.length ? alt.map((z) => z.projekt.name).join(', ') : 'nichts', alt.length ? el('span', { class: 'chip gelb' }, 'prüfen') : null),
      kachel('Entwürfe in Lexware', String(entwuerfe.length), 'noch in Lexware festschreiben'),
      kachel('In der App', String(inApp.length), inApp.length ? 'noch nicht übertragen' : 'nichts liegen geblieben'),
    ]),
    el('section', { class: 'tabelle-rahmen', 'aria-labelledby': 'h-offen' }, [
      el('div', { class: 'kartenkopf innen' }, [
        el('h2', { id: 'h-offen', class: 'fuellung' }, 'Offen zur Abrechnung'),
        el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Filter' }, [['alle', 'alle'], ['stunden', 'nach Stunden'], ['pauschal', 'pauschal']].map(([k, n]) => el('button', {
          type: 'button', 'aria-pressed': String(filterOffen === k), 'data-fokus': `ofilter-${k}`, onclick: () => { filterOffen = k; zustand.neuZeichnen(); },
        }, n))),
      ]),
      el('div', { class: 'offentabelle' }, [
        el('div', { class: 'ot-zeile ot-kopf label' }, ['', 'Projekt', 'Kunde', 'Art', 'Stunden', 'offen netto', 'seit', ''].map((t, i) => el('span', { class: [4, 5].includes(i) ? 'rechts' : null }, t))),
        ...zeilen.map((z) => {
          const p = z.projekt;
          const seit = z.abgeschlossen ? ['gruen', 'abgeschlossen'] : z.seitTagen == null ? ['', '–'] : [z.seitTagen > 30 ? 'gelb' : '', `seit ${z.seitTagen} ${z.seitTagen === 1 ? 'Tag' : 'Tagen'}`];
          return el('div', { class: 'ot-zeile zahl' }, [
            el('span', { class: 'farbstreifen schmal', 'aria-hidden': 'true', style: p.farbe ? `background:${p.farbe}` : null }),
            el('div', {}, [el('a', { class: 'zeile-titel', href: `#/projekte/${p.id}` }, p.name), el('div', { class: 'zeile-hinweis' }, [p.nr, p.art].filter(Boolean).join(' · ') || ' ')]),
            el('span', {}, p.kunde || '–'),
            el('span', { class: 'sekundaer' }, z.art === 'pauschal' ? (z.nachtragH ? 'Pauschal + Nachtrag' : 'Pauschal') : 'Stunden'),
            el('span', { class: 'rechts' }, z.offenH != null ? `${zahlText(z.offenH, 2)} h` : '–'),
            el('span', { class: 'rechts fett' }, z.offenBetrag != null ? euro(z.offenBetrag) : 'kein Satz'),
            el('span', {}, el('span', { class: `chip ${seit[0]}`.trim() }, seit[1])),
            el('a', { class: 'pille haupt klein-pille rechts-buendig', href: `#/projekte/${p.id}/rechnung` }, 'Rechnung erstellen'),
          ]);
        }),
        zeilen.length ? null : el('div', { class: 'tabelle-leer' }, [el('span', { class: 'chip gruen gross mittig' }, [hakenIcon(10), 'alles abgerechnet']), el('div', { class: 'mit-abstand-mittel' }, 'Nichts offen. Sobald Zeit gebucht ist, steht sie hier.')]),
      ]),
    ]),
    el('section', { class: 'kachel', 'aria-labelledby': 'h-zuletzt' }, [
      el('h2', { id: 'h-zuletzt', class: 'label' }, 'Zuletzt erstellt'),
      el('div', { class: 'mit-abstand-mittel' }, zuletzt.length ? zuletzt.map((r) => rechnungZeile(d, r)) : el('p', { class: 'zeile-hinweis' }, 'Noch keine Rechnungen.')),
    ]),
  ]);
}

// ---------- Rechnungen (alle) ----------

export function rechnungenListe() {
  const d = zustand.aktuell();
  const liste = [...(d.rechnungen ?? [])].sort((a, b) => (b.erstellt ?? '').localeCompare(a.erstellt ?? ''));
  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf mitte' }, [el('h1', {}, 'Rechnungen'), unterseiten('rechnungen')]),
    lexwareHinweis(),
    el('section', { class: 'karte', 'aria-label': 'Alle Rechnungen' }, liste.length
      ? liste.map((r) => el('div', { class: 'rechnung-block' }, [rechnungZeile(d, r), aktionen(d, r)]))
      : [el('p', { class: 'zeile-hinweis' }, 'Noch keine Rechnungen. Du erstellst sie unter „Offen“ oder auf der Projektseite.')]),
  ]);
}

// Aktionen je Rechnung: übertragen, erneut, von Hand erledigt, löschen
function aktionen(d, r) {
  const knoepfe = [];
  if (['entwurf', 'fehler'].includes(r.status) && lexware.verbunden()) {
    knoepfe.push(el('button', { type: 'button', class: 'pille', 'data-fokus': `rs-${r.id}`, onclick: () => senden(r.id) }, r.status === 'fehler' ? 'Erneut versuchen' : 'An Lexware Office'));
  }
  if (['entwurf', 'fehler'].includes(r.status)) {
    knoepfe.push(el('button', {
      type: 'button', class: 'pille', title: 'Wenn du die Rechnung selbst in Lexware geschrieben hast', 'data-fokus': `re-${r.id}`,
      onclick: () => zustand.aendern((x) => { rechnungStatus(x, r.id, 'erledigt', { heute: zustand.heute() }); }),
    }, 'Von Hand abgerechnet'));
  }
  const l = lexware.laeuft('rechnung', r.id);
  if (r.status === 'sendet' && lexware.dauertLange(l)) {
    knoepfe.push(el('button', { type: 'button', class: 'pille', onclick: () => lexware.aufgeben('rechnung', r.id) }, 'Übertragung abbrechen'));
  }
  if (r.status !== 'sendet') {
    knoepfe.push(loeschKnopf(r.status === 'uebertragen' || r.status === 'erledigt' ? 'Rückgängig' : 'Löschen', async () => {
      await zustand.sichern('Rechnung gelöscht');
      await zustand.aendern((x) => { rechnungLoeschen(x, r.id); });
    }));
  }
  return el('div', {}, [
    r.status === 'fehler' ? el('div', { class: 'zeile-hinweis rot' }, r.fehler) : null,
    r.status === 'uebertragen' ? el('div', { class: 'zeile-hinweis' }, 'Rückgängig gibt die Stunden wieder frei. Den Entwurf in Lexware löschst du dort.') : null,
    el('div', { class: 'knopfreihe eng' }, knoepfe),
  ]);
}

async function senden(id) {
  try { await lexware.rechnungSenden(id); } catch (f) { await zustand.aendern((x) => { rechnungStatus(x, id, 'fehler', { fehler: f.message }); }); }
}

// ---------- Rechnung erstellen (aus einem Projekt) ----------

let s = { projektId: null };
export const rechnungVergessen = (pfad) => { if (!pfad.endsWith('/rechnung')) s = { projektId: null }; };

export function rechnungKopf(id) {
  const p = zustand.aktuell().projekte.find((x) => x.id === id);
  return { titel: 'Rechnung erstellen', zurueck: `#/projekte/${id}`, kontext: [p?.name ?? 'Projekt', el('span', { class: 'sekundaer' }, ' · Rechnung erstellen')] };
}

export function rechnungSeite(id) {
  const d = zustand.aktuell();
  const p = d.projekte.find((x) => x.id === id);
  if (!p) return el('div', { class: 'seite' }, [el('h1', {}, 'Projekt nicht gefunden'), el('a', { href: '#/abrechnung' }, 'Zur Abrechnung')]);
  const heute = zustand.heute();
  if (s.projektId !== id) {
    s = { projektId: id, art: p.abrechnungsart === 'pauschal' ? 'pauschal' : 'stunden', zeitraum: 'alles', von: '', bis: '', aus: new Set(),
      zusammenfassen: d.einstellungen.abrechnungZusammenfassen ?? STANDARD_ZUSAMMENFASSEN, abschlag: 30, teil: new Set(), zuletzt: null };
  }
  const monat = heute.slice(0, 7);
  const zr = s.zeitraum === 'monat' ? { von: `${monat}-01`, bis: `${monat}-31` } : s.zeitraum === 'eigen' ? { von: s.von || undefined, bis: s.bis || undefined } : {};
  const offeneEintraege = d.zeiteintraege
    .filter((z) => z.projektId === id && offen(z) && z.stunden > 0 && (!zr.von || z.datum >= zr.von) && (!zr.bis || z.datum <= zr.bis))
    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.von ?? '').localeCompare(b.von ?? ''));
  const nur = new Set(offeneEintraege.filter((z) => !s.aus.has(z.id)).map((z) => z.id));
  const entwurf = rechnungBerechnen(d, id, { art: s.art, ...zr, zusammenfassen: s.zusammenfassen, nur, abschlagProzent: s.abschlag, positionNrs: [...s.teil] });
  const k = kundeVon(d, p);
  const posMitPreis = p.positionen.filter((x) => x.preis > 0);

  const pill = (text, an, onclick, fokus) => el('button', { type: 'button', class: 'wahl', 'aria-pressed': String(an), onclick, 'data-fokus': fokus }, text);
  const datumFeld = (key, label) => {
    const f = el('input', { class: 'feld uhrzeit', type: 'date', value: s[key], 'aria-label': label, onchange: () => { s[key] = f.value; s.zeitraum = 'eigen'; zustand.neuZeichnen(); } });
    return f;
  };

  const einstellungen = el('section', { class: 'kachel stapel gross', 'aria-label': 'Rechnung einstellen' }, [
    el('div', { class: 'feldgruppe' }, [
      el('span', { class: 'feld-label', id: 'l-rart' }, 'Abrechnungsart'),
      el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-rart' }, RECHNUNG_ART.map((a) => pill(a.name, s.art === a.id, () => { s.art = a.id; zustand.neuZeichnen(); }, `rart-${a.id}`))),
    ]),
    s.art === 'stunden' ? el('div', { class: 'feldgruppe' }, [
      el('span', { class: 'feld-label', id: 'l-rz' }, 'Zeitraum'),
      el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-rz' }, [
        pill('alles Offene', s.zeitraum === 'alles', () => { s.zeitraum = 'alles'; zustand.neuZeichnen(); }, 'rz-alles'),
        pill(`${MONATE[Number(monat.slice(5)) - 1]} ${monat.slice(0, 4)}`, s.zeitraum === 'monat', () => { s.zeitraum = 'monat'; zustand.neuZeichnen(); }, 'rz-monat'),
        datumFeld('von', 'von'), datumFeld('bis', 'bis'),
      ]),
    ]) : null,
    s.art === 'stunden' ? el('div', { class: 'feldgruppe' }, [
      el('span', { class: 'feld-label', id: 'l-rg' }, 'Stunden zusammenfassen'),
      el('div', { class: 'umschalter weiss', role: 'group', 'aria-labelledby': 'l-rg' }, ZUSAMMENFASSEN.map((x) => el('button', {
        type: 'button', 'aria-pressed': String(s.zusammenfassen === x.id), 'data-fokus': `rg-${x.id}`, onclick: () => { s.zusammenfassen = x.id; zustand.neuZeichnen(); },
      }, x.id === 'tag' ? 'je Tag · Standard' : x.name))),
    ]) : null,
    s.art === 'abschlag' ? el('div', { class: 'feldgruppe' }, [
      el('span', { class: 'feld-label', id: 'l-rab' }, `Abschlag auf ${euro(p.pauschalpreis ?? posMitPreis.reduce((a, x) => a + x.preis, 0))}`),
      el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-rab' }, [20, 30, 40, 50].map((x) => pill(`${x} %`, s.abschlag === x, () => { s.abschlag = x; zustand.neuZeichnen(); }, `rab-${x}`))),
    ]) : null,
    s.art === 'teil' ? el('div', { class: 'feldgruppe' }, [
      el('span', { class: 'feld-label', id: 'l-rteil' }, 'Welche Positionen?'),
      posMitPreis.length
        ? el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-rteil' }, posMitPreis.map((x) => pill(`Pos. ${x.nr} · ${euro(x.preis)}`, s.teil.has(x.nr), () => { if (s.teil.has(x.nr)) s.teil.delete(x.nr); else s.teil.add(x.nr); zustand.neuZeichnen(); }, `rteil-${x.nr}`)))
        : el('p', { class: 'zeile-hinweis' }, 'Die Positionen haben keine Preise. Preise kommen aus einem angenommenen Angebot.'),
    ]) : null,
    ['pauschal', 'abschlag', 'teil'].includes(s.art) && pauschalBerechnet(d, id) > 0
      ? el('p', { class: 'zeile-hinweis' }, `Schon berechnet: ${euro(pauschalBerechnet(d, id))}. Die Schlussrechnung zieht Abschläge und Teilrechnungen ab.`) : null,
    s.art === 'stunden' ? el('div', { class: 'satzkasten' }, [
      el('div', { class: 'fuellung' }, [el('div', { class: 'zeile-hinweis ohne-abstand' }, 'Stundensatz'), el('div', { class: 'satz-gross zahl' }, entwurf.satz ? `${euro(entwurf.satz)}/h` : 'kein Satz')]),
      el('div', { class: 'zeile-hinweis rechts' }, [entwurf.quelle === 'kunde' ? `vom Kunden ${k?.name ?? ''}` : entwurf.quelle === 'auftrag' ? 'eigener Satz dieses Auftrags' : 'noch nicht eingetragen',
        el('br'), el('a', { class: 'fett-mittel', href: entwurf.quelle === 'auftrag' || !k ? `#/projekte/${id}/bearbeiten` : '#/einstellungen' }, 'ändern')]),
    ]) : null,
  ]);

  const eintraegeKarte = s.art === 'stunden' ? el('section', { class: 'karte ohne-innenabstand', 'aria-labelledby': 'h-roffen' }, [
    el('div', { class: 'kartenkopf innen grundlinie' }, [
      el('h2', { id: 'h-roffen', class: 'fuellung' }, 'Offene Zeiteinträge'),
      el('span', { class: 'zeile-text sekundaer zahl' }, `${zahlText(offeneEintraege.filter((z) => nur.has(z.id)).reduce((a, z) => a + z.stunden, 0), 2)} h gewählt`),
    ]),
    ...offeneEintraege.map((z) => {
      const an = nur.has(z.id);
      return el('div', { class: 'eintragszeile zahl' }, [
        el('button', {
          type: 'button', role: 'checkbox', class: 'kaestchen', 'aria-checked': String(an), 'aria-label': `${tagKurz(ausText(z.datum))} ${z.notiz || ''} abrechnen`, 'data-fokus': `re-${z.id}`,
          onclick: () => { if (an) s.aus.add(z.id); else s.aus.delete(z.id); zustand.neuZeichnen(); },
        }, el('span', { class: 'kaestchen-feld', 'aria-hidden': 'true' }, an ? hakenIcon(12) : null)),
        el('span', { class: 'ez-datum' }, tagKurz(ausText(z.datum))),
        el('span', { class: 'ez-zeit sekundaer' }, z.von && z.bis ? `${z.von}–${z.bis}` : ''),
        el('span', { class: 'ez-pos fett-mittel' }, z.positionNr ? `Pos. ${z.positionNr}` : ''),
        el('span', { class: 'fuellung sekundaer' }, z.notiz || ''),
        el('span', { class: 'ez-h fett' }, zahlText(z.stunden, 2)),
      ]);
    }),
    offeneEintraege.length ? null : el('p', { class: 'zeile-hinweis innen' }, 'Keine offenen Zeiteinträge in diesem Zeitraum.'),
  ]) : null;

  const vorschau = el('section', { class: 'karte vorschau', 'aria-labelledby': 'h-rv' }, [
    el('div', { class: 'knopfreihe' }, [el('h2', { id: 'h-rv', class: 'label fuellung' }, 'Vorschau Rechnungsentwurf'), el('span', { class: 'zeile-hinweis ohne-abstand' }, 'Layout und Nummer von Lexware Office')]),
    el('div', { class: 'vorschau-kopf' }, [
      el('div', { class: 'fett' }, p.kunde || 'Kunde fehlt'),
      el('div', { class: 'sekundaer' }, `${p.name}${entwurf.leistungVon ? ` · Leistungszeitraum ${tm(entwurf.leistungVon)}–${tm(entwurf.leistungBis)}${entwurf.leistungBis.slice(0, 4)}` : ''}`),
    ]),
    el('div', { class: 'vorschau-tabelle' }, [
      el('div', { class: 'vt-zeile vt-kopf label' }, [el('span', {}, 'Leistung'), el('span', { class: 'rechts' }, 'Menge'), el('span', { class: 'rechts' }, 'Preis'), el('span', { class: 'rechts' }, 'Betrag')]),
      ...entwurf.zeilen.map((z) => el('div', { class: 'vt-zeile zahl' }, [
        el('div', {}, [el('div', {}, z.titel), z.beschreibung ? el('div', { class: 'zeile-hinweis ohne-abstand' }, z.beschreibung) : null]),
        el('span', { class: 'rechts' }, z.einheit === 'Stunden' ? `${zahlText(z.menge, 2)} h` : '1'),
        el('span', { class: 'rechts' }, euro(z.preis)),
        el('span', { class: 'rechts fett-mittel' }, euro(z.betrag)),
      ])),
      entwurf.zeilen.length ? null : el('div', { class: 'tabelle-leer' }, 'Keine Zeilen gewählt.'),
    ]),
    el('div', { class: 'vorschau-summe zahl' }, [
      el('div', { class: 'summenzeile' }, [el('span', { class: 'sekundaer' }, 'netto'), el('span', {}, euro(entwurf.netto))]),
      el('div', { class: 'summenzeile' }, [el('span', { class: 'sekundaer' }, 'MwSt 19 %'), el('span', {}, euro(entwurf.mwst))]),
      el('div', { class: 'summenzeile brutto linie' }, [el('span', {}, 'brutto'), el('span', {}, euro(entwurf.brutto))]),
    ]),
  ]);

  const bisher = rechnungenVon(d, id);
  return el('div', { class: 'seite' }, [
    el('div', {}, [el('a', { class: 'zurueck-link', href: `#/projekte/${id}` }, `‹ ${p.name}`), el('h1', { class: 'mit-abstand-mittel' }, 'Rechnung erstellen')]),
    el('div', { class: 'rechnung-flaeche' }, [
      el('div', { class: 'rechnung-links' }, [einstellungen, eintraegeKarte]),
      el('aside', { class: 'rechnung-rechts' }, [
        vorschau,
        abschluss(d, p, entwurf, heute),
        el('section', { class: 'kachel' }, [
          el('div', { class: 'label' }, `Bisherige Rechnungen · ${p.name}`),
          el('div', { class: 'mit-abstand-mittel' }, bisher.length ? bisher.map((r) => el('div', { class: 'rechnung-block' }, [rechnungZeile(d, r, { mitProjekt: false }), aktionen(d, r)])) : el('p', { class: 'zeile-hinweis' }, 'Noch keine Rechnung für dieses Projekt.')),
        ]),
      ]),
    ]),
  ]);
}

// Senden / speichern und der Zustand der gerade erstellten Rechnung (Zustaende.dc.html)
function abschluss(d, p, entwurf, heute) {
  const r = s.zuletzt && (d.rechnungen ?? []).find((x) => x.id === s.zuletzt);
  if (r) {
    if (r.status === 'sendet') {
      const l = lexware.laeuft('rechnung', r.id);
      return el('div', { class: 'zustand grau', role: 'status' }, [
        el('div', { class: 'knopfreihe eng' }, [el('span', { class: 'kreisel', 'aria-hidden': 'true' }), el('span', { class: 'zustand-titel' }, 'Wird übertragen …')]),
        el('div', { class: 'zeile-hinweis ohne-abstand' }, lexware.dauertLange(l)
          ? 'Das dauert ungewöhnlich lange. Läuft die GitHub Action „Lexware Office“? Du kannst die Übertragung unter „Rechnungen“ abbrechen.'
          : `${r.titel} · ${euro(r.netto)}. Das dauert etwa eine Minute. Du kannst weiterarbeiten.`),
      ]);
    }
    if (r.status === 'uebertragen' || r.status === 'erledigt') {
      const h = d.zeiteintraege.filter((z) => z.rechnungId === r.id).reduce((a, z) => a + z.stunden, 0);
      return el('div', { class: 'zustand gruen', role: 'status' }, [
        el('div', { class: 'knopfreihe eng zustand-titel gruen-text' }, [hakenIcon(14), r.status === 'uebertragen' ? 'Übertragen · Entwurf in Lexware Office' : 'Als abgerechnet markiert']),
        el('div', { class: 'zeile-hinweis ohne-abstand gruen-dunkel' }, `${h ? `${zahlText(h, 2)} h als abgerechnet markiert · ` : ''}${tagKurz(ausText(r.uebertragen ?? heute))}`),
        el('div', { class: 'knopfreihe eng' }, [
          r.lexwareId ? el('a', { class: 'pille weiss-pille', href: lexware.link('rechnung', r.lexwareId), target: '_blank', rel: 'noopener' }, 'In Lexware öffnen') : null,
          el('button', { type: 'button', class: 'pille leise', onclick: async () => { s.zuletzt = null; await zustand.aendern((x) => { rechnungLoeschen(x, r.id); }); } }, 'Rückgängig'),
        ]),
      ]);
    }
    if (r.status === 'fehler') {
      return el('div', { class: 'zustand rot', role: 'alert' }, [
        el('div', { class: 'zustand-titel rot-text' }, 'Nicht übertragen'),
        el('div', { class: 'zeile-hinweis ohne-abstand rot-dunkel' }, r.fehler),
        el('div', { class: 'knopfreihe eng' }, [
          lexware.verbunden() ? el('button', { type: 'button', class: 'pille rot-pille', onclick: () => senden(r.id) }, 'Erneut versuchen') : null,
          r.fehlerDetails ? el('details', { class: 'details' }, [el('summary', {}, 'Details'), el('pre', {}, r.fehlerDetails)]) : null,
        ]),
      ]);
    }
    // Entwurf in der App (nicht verbunden)
    return el('div', { class: 'zustand grau', role: 'status' }, [
      el('div', { class: 'zustand-titel' }, 'Gespeichert als Entwurf in der App'),
      el('div', { class: 'zeile-hinweis ohne-abstand' }, 'Die Stunden sind dieser Rechnung zugeordnet. Hast du die Rechnung selbst in Lexware geschrieben, markier sie als abgerechnet.'),
      aktionen(d, r),
    ]);
  }

  const leer = !entwurf.zeilen.length || entwurf.netto === 0 && s.art !== 'pauschal';
  const ohneSatz = s.art === 'stunden' && !entwurf.satz;
  const anlegen = async (senden) => {
    let neu;
    await zustand.aendern((x) => { neu = rechnungAnlegen(x, p.id, rechnungBerechnen(x, p.id, { art: s.art, ...(s.zeitraum === 'monat' ? { von: `${heute.slice(0, 7)}-01`, bis: `${heute.slice(0, 7)}-31` } : s.zeitraum === 'eigen' ? { von: s.von || undefined, bis: s.bis || undefined } : {}), zusammenfassen: s.zusammenfassen, nur: new Set(entwurf.eintraege), abschlagProzent: s.abschlag, positionNrs: [...s.teil] }), heute); });
    s.zuletzt = neu.id;
    s.aus = new Set();
    if (senden) {
      try { await lexware.rechnungSenden(neu.id); } catch (f) { await zustand.aendern((x) => { rechnungStatus(x, neu.id, 'fehler', { fehler: f.message }); }); }
    } else zustand.neuZeichnen();
  };
  return el('div', { class: 'stapel' }, [
    lexware.verbunden()
      ? el('button', { type: 'button', class: 'knopf-timer haupt voll', disabled: leer || ohneSatz, 'data-fokus': 'r-senden', onclick: () => anlegen(true) }, 'Als Entwurf an Lexware Office')
      : el('button', { type: 'button', class: 'knopf-timer haupt voll', disabled: leer || ohneSatz, 'data-fokus': 'r-speichern', onclick: () => anlegen(false) }, 'Als Entwurf in der App speichern'),
    el('div', { class: 'zeile-hinweis mittig' }, ohneSatz ? 'Trag zuerst einen Stundensatz ein.'
      : lexware.verbunden() ? 'Du prüfst und schreibst die Rechnung in Lexware Office fest. Danach gelten die Zeilen als abgerechnet.'
        : 'Lexware Office ist nicht verbunden. Die Rechnung bleibt als Entwurf in der App. Übertragen geht später unter „Rechnungen“.'),
  ]);
}
