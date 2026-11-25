// Kunden nach Kunden.dc.html (Index B, A8). Lexware Office ist der Kundenstamm: Name und Kundennummer kommen von
// dort, hier wird nur der Stundensatz gepflegt. Statt der Anschrift steht ein Verweis auf den Lexware-Kontakt
// (Abweichung vom Board, Joachims Entscheidung vom 22.11.2026). Unklare Zuordnungen werden nur vorgeschlagen.

import { el, zahlText, hakenIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import * as lexware from '../lexware.js';
import { neueId, ist } from '../kern/daten.js';
import { euro } from '../kern/abrechnung.js';
import { ANGEBOT_STATUS_NAME } from '../kern/angebot.js';
import { RECHNUNG_STATUS_NAME, ZAHLUNG_NAME, ZAHLUNG_CHIP } from '../kern/rechnung.js';
import { kundenListe, belegeVon, zuordnungPruefen, bestaetigen } from '../kern/kunden.js';
import { statusChip } from './projekt.js';

let gewaehlt = null;     // Name des gewählten Kunden
let reiter = 0;          // 0 Angebote · 1 Aufträge · 2 Rechnungen
let auswahlOffen = null; // Name, für den die Kontaktauswahl offen ist
let meldung = '';

const tm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : '–');
const monat = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');
const prozent = (x) => (x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x))} %`);

/** Umschalter Projekte · Kunden (Kunden.dc.html) */
export function projekteUnterseiten(aktiv) {
  return el('nav', { class: 'umschalter', 'aria-label': 'Unterseite' }, [
    el('a', { href: '#/projekte', 'aria-current': aktiv === 'projekte' ? 'page' : null }, 'Projekte'),
    el('a', { href: '#/kunden', 'aria-current': aktiv === 'kunden' ? 'page' : null }, 'Kunden'),
  ]);
}

export function kundenSeite() {
  const d = zustand.aktuell();
  const heute = zustand.heute();
  const liste = kundenListe(d, heute, lexware.zahlungen());
  const kontakte = lexware.kontakte();
  const pruefung = new Map(zuordnungPruefen(d, kontakte).map((z) => [z.name, z]));
  if (!liste.some((z) => z.name === gewaehlt)) gewaehlt = liste[0]?.name ?? null;
  const z = liste.find((x) => x.name === gewaehlt);
  const offenZuBestaetigen = liste.filter((x) => !x.verknuepft && pruefung.get(x.name)?.vorschlaege.length).length;

  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf mitte' }, [
      el('h1', {}, 'Kunden'),
      projekteUnterseiten('kunden'),
      uebernehmenKnopf(),
    ]),
    meldung ? el('p', { class: 'zeile-hinweis', role: 'status' }, meldung) : null,
    offenZuBestaetigen ? el('div', { class: 'hinweiskarte' }, [
      el('span', { class: 'chip gelb' }, 'Bestätigen'),
      el('div', { class: 'fuellung' }, offenZuBestaetigen === 1
        ? '1 Kunde ist nicht eindeutig zuzuordnen. Prüf den Vorschlag und bestätige ihn.'
        : `${offenZuBestaetigen} Kunden sind nicht eindeutig zuzuordnen. Prüf die Vorschläge und bestätige sie.`),
    ]) : null,
    liste.length ? el('div', { class: 'kunden-raster' }, [
      el('section', { class: 'kunden-liste', 'aria-label': 'Kundenliste' }, liste.map((x, i) => kundenKnopf(x, i))),
      el('section', { class: 'kunden-detail', 'aria-labelledby': 'h-kd' }, [
        kopfKarte(d, z, pruefung.get(z.name), kontakte),
        belegKarte(d, z),
      ]),
    ]) : el('section', { class: 'karte' }, [el('p', { class: 'zeile-hinweis' }, 'Noch keine Kunden. Sie erscheinen hier, sobald ein Projekt oder Angebot einen Kunden hat.')]),
  ]);
}

function uebernehmenKnopf() {
  const laeuft = lexware.laeuft('kontakte', 'kontakte');
  const geht = zustand.istBeispiel() || lexware.verbunden();
  return el('button', {
    type: 'button', class: 'pille', disabled: !geht || !!laeuft, 'data-fokus': 'kd-uebernehmen',
    title: geht ? 'Kontakte aus Lexware Office holen und eindeutige Kunden verknüpfen' : 'Lexware Office ist nicht verbunden.',
    onclick: async () => {
      try {
        if (!zustand.istBeispiel()) await lexware.pruefen(); // holt die Kontakte neu, danach wird zugeordnet
        const erg = await lexware.kundenZuordnen();
        const n = erg.filter((x) => x.zustand === 'gesetzt').length;
        const offen = erg.filter((x) => x.zustand === 'unklar' || x.zustand === 'nichts').length;
        meldung = zustand.istBeispiel() || !laeuft
          ? `${n} ${n === 1 ? 'Kunde' : 'Kunden'} eindeutig verknüpft${offen ? `, ${offen} nicht eindeutig` : ''}.${zustand.istBeispiel() ? ' (Beispielkontakte)' : ' Neue Kontakte aus Lexware kommen in etwa einer Minute.'}`
          : '';
      } catch (f) { meldung = f.message; }
      zustand.neuZeichnen();
    },
  }, laeuft ? 'Wird geholt …' : 'Aus Lexware übernehmen');
}

function kundenKnopf(x, i) {
  return el('button', {
    type: 'button', class: 'kunden-knopf', 'aria-pressed': String(x.name === gewaehlt), 'data-fokus': `kd-${i}`,
    onclick: () => { gewaehlt = x.name; auswahlOffen = null; zustand.neuZeichnen(); },
  }, [
    el('div', { class: 'fuellung' }, [
      el('div', { class: 'zeile-titel' }, x.name),
      el('div', { class: 'zeile-hinweis' }, `${x.auftraege} ${x.auftraege === 1 ? 'Auftrag' : 'Aufträge'} · ${x.stundensatz ? `${euro(x.stundensatz)}/h` : 'kein Satz'}`),
    ]),
    el('div', { class: 'rechts zahl' }, [
      el('div', { class: 'fett' }, euro(x.offen)),
      el('div', { class: 'kunden-klein' }, 'offen'),
    ]),
    x.verknuepft ? null : el('span', { class: 'punkt leer', title: 'nicht mit Lexware verknüpft' }),
  ]);
}

function kopfKarte(d, z, pruefung, kontakte) {
  const satz = el('input', {
    id: 'kd-satz', class: 'feld zahl kunden-satz', type: 'number', min: '0', step: '0.01', inputmode: 'decimal',
    value: z.stundensatz ?? '', placeholder: '€/h', 'data-fokus': 'kd-satz',
    onchange: () => zustand.aendern((x) => {
      const v = satz.value === '' ? null : Math.round(Number(satz.value) * 100) / 100;
      x.kunden ??= [];
      let e = x.kunden.find((k) => k.name === z.name);
      if (!e) { e = { id: neueId(), name: z.name, stundensatz: null }; x.kunden.push(e); }
      e.stundensatz = v > 0 ? v : null;
    }),
  });
  const kennzahl = (label, wert) => el('div', {}, [el('div', { class: 'kunden-klein' }, label), el('div', { class: 'kunden-wert zahl' }, wert)]);

  return el('div', { class: 'karte' }, [
    el('div', { class: 'knopfreihe oben' }, [
      el('div', { class: 'fuellung kunden-name' }, [
        el('h2', { id: 'h-kd', class: 'kunden-titel' }, z.name),
        el('div', { class: 'kunden-unter' }, z.verknuepft
          ? el('a', { href: lexware.link('kontakt', z.kunde.lexwareKontaktId), target: '_blank', rel: 'noopener' }, 'Anschrift und E-Mail in Lexware Office')
          : 'nur in der App angelegt'),
      ]),
      z.verknuepft
        ? el('span', { class: 'chip gruen chip-mit-haken' }, [hakenIcon(10), `mit Lexware verknüpft · Kd.-Nr. ${z.nummer}`])
        : el('div', { class: 'knopfreihe eng' }, [
          el('span', { class: 'chip gelb' }, 'nicht verknüpft'),
          kontakte.length ? el('button', {
            type: 'button', class: 'pille haupt klein-pille', 'data-fokus': 'kd-verknuepfen',
            onclick: () => { auswahlOffen = auswahlOffen === z.name ? null : z.name; zustand.neuZeichnen(); },
          }, 'Mit Lexware-Kontakt verknüpfen') : null,
        ]),
    ]),
    z.verknuepft ? null : vorschlag(z, pruefung, kontakte),
    !z.verknuepft && auswahlOffen === z.name ? kontaktAuswahl(z, pruefung, kontakte) : null,
    el('div', { class: 'kunden-kennzahlen' }, [
      el('div', { class: 'stapel eng' }, [el('label', { for: 'kd-satz', class: 'feld-label' }, 'Stundensatz netto'), satz]),
      kennzahl(`Umsatz ${zustand.heute().slice(0, 4)}`, euro(z.umsatz)),
      kennzahl('Ø Abweichung', prozent(z.abweichung)),
      kennzahl('Effektiv je Stunde', z.effektiv == null ? '–' : euro(z.effektiv)),
    ]),
    el('p', { class: 'zeile-hinweis mit-abstand-mittel' }, 'Anschrift, E-Mail und Zahlungsziel kommen aus Lexware Office und werden dort gepflegt.'),
  ]);
}

const verknuepfe = (name, nummer) => {
  try {
    zustand.aendern((x) => { bestaetigen(x, name, nummer, lexware.kontakte()); });
    gewaehlt = lexware.kontakte().find((c) => String(c.nummer) === String(nummer))?.name ?? gewaehlt;
    auswahlOffen = null; meldung = '';
  } catch (f) { meldung = f.message; zustand.neuZeichnen(); }
};

/** Vorschlag aus der Suche – nie automatisch verknüpft, Joachim bestätigt */
function vorschlag(z, pruefung, kontakte) {
  if (!kontakte.length) {
    return el('p', { class: 'zeile-hinweis mit-abstand-mittel' }, zustand.istBeispiel() ? '' : 'Noch keine Kontakte aus Lexware gelesen. Verbinde Lexware Office in den Einstellungen.');
  }
  const v = pruefung?.vorschlaege ?? [];
  if (!v.length) return el('p', { class: 'zeile-hinweis mit-abstand-mittel' }, pruefung?.text ?? '');
  return el('div', { class: 'stapel eng mit-abstand-mittel' }, [
    el('div', { class: 'zeile-hinweis' }, pruefung.zustand === 'gesetzt' ? 'Eindeutig gefunden – wird beim nächsten Laden verknüpft:' : `${pruefung.text.replace(/\.$/, '')}. Vorschlag:`),
    ...v.map((c) => el('div', { class: 'knopfreihe eng' }, [
      el('span', { class: 'fuellung' }, [el('span', { class: 'fett-mittel' }, c.name), el('span', { class: 'sekundaer zahl' }, ` · Kd.-Nr. ${c.nummer}`)]),
      el('button', { type: 'button', class: 'pille', 'data-fokus': `kd-ja-${c.nummer}`, onclick: () => verknuepfe(z.name, c.nummer) }, 'Bestätigen'),
    ])),
  ]);
}

/** Alle Kontakte zur Auswahl, Vorschläge zuerst */
function kontaktAuswahl(z, pruefung, kontakte) {
  const vor = new Set((pruefung?.vorschlaege ?? []).map((c) => c.id));
  const sortiert = [...kontakte].sort((a, b) => (vor.has(b.id) - vor.has(a.id)) || a.name.localeCompare(b.name, 'de'));
  const vergeben = new Map((zustand.aktuell().kunden ?? []).filter((k) => k.lexwareKontaktId).map((k) => [k.lexwareKontaktId, k.name]));
  // Nichts vorausgewählt: ein schneller Klick darf keinen falschen Kunden eintragen
  const wahl = el('select', { class: 'feld', id: 'kd-kontakt', 'aria-label': 'Lexware-Kontakt', onchange: () => { knopf.disabled = !wahl.value; } }, [
    el('option', { value: '' }, 'Kontakt wählen …'),
    ...sortiert.map((c) => el('option', { value: String(c.nummer) },
      `${c.name} · Kd.-Nr. ${c.nummer}${vor.has(c.id) ? ' · Vorschlag' : ''}${vergeben.has(c.id) ? ' · schon verknüpft, wird zusammengelegt' : ''}`)),
  ]);
  const knopf = el('button', { type: 'button', class: 'pille haupt', disabled: true, onclick: () => verknuepfe(z.name, wahl.value) }, 'Verknüpfen');
  return el('div', { class: 'stapel eng mit-abstand-mittel' }, [
    el('label', { for: 'kd-kontakt', class: 'feld-label' }, `Lexware-Kontakt für „${z.name}“`),
    wahl,
    el('div', { class: 'knopfreihe eng' }, [
      knopf,
      el('button', { type: 'button', class: 'pille', onclick: () => { auswahlOffen = null; zustand.neuZeichnen(); } }, 'Abbrechen'),
    ]),
    el('p', { class: 'zeile-hinweis' }, 'Der Name kommt danach aus Lexware und wird in Projekten und Angeboten mitgeführt.'),
  ]);
}

const ANGEBOT_CHIP = { entwurf: 'chip', versendet: 'chip rand-stahl', angenommen: 'chip gruen', abgelehnt: 'chip rot' };
const RECHNUNG_CHIP = { entwurf: 'chip gelb', sendet: 'chip', uebertragen: 'chip gelb', fehler: 'chip rot', erledigt: 'chip gruen' };

function belegKarte(d, z) {
  const b = belegeVon(d, z.name);
  const zeile = (nr, titel, datum, betrag, chip) => el('div', { class: 'beleg-zeile zahl' }, [
    el('span', { class: 'beleg-nr fett' }, nr), el('span', { class: 'beleg-titel' }, titel),
    el('span', { class: 'beleg-datum sekundaer' }, datum), el('span', { class: 'beleg-betrag fett-mittel' }, betrag),
    el('span', { class: 'beleg-status' }, chip),
  ]);
  const zeilen = [
    () => b.angebote.map(({ angebot: a, netto }) => zeile(
      el('a', { href: `#/angebote/${a.id}` }, a.nummer || 'Angebot'), a.projektname || '–', tm(a.datum), euro(netto),
      el('span', { class: ANGEBOT_CHIP[a.status] }, ANGEBOT_STATUS_NAME[a.status]))),
    () => b.auftraege.map((p) => zeile(
      p.nr || '–', el('a', { href: `#/projekte/${p.id}` }, p.name),
      p.status === 'abgeschlossen' ? monat(p.deadline || p.start) : p.start ? `seit ${monat(p.start)}` : '–',
      p.abrechnungsart === 'pauschal' && p.pauschalpreis ? euro(p.pauschalpreis) : `${zahlText(ist(d, p.id))} h`,
      statusChip(p))),
    () => b.rechnungen.map((r) => {
      const p = d.projekte.find((x) => x.id === r.projektId);
      const chip = r.lexware
        ? el('span', { class: `chip ${ZAHLUNG_CHIP[r.lexware.status] ?? ''}`.trim() }, ZAHLUNG_NAME[r.lexware.status] ?? r.lexware.status)
        : el('span', { class: RECHNUNG_CHIP[r.status] ?? 'chip' }, r.status === 'entwurf' ? 'Entwurf' : RECHNUNG_STATUS_NAME[r.status]);
      return zeile(r.lexware?.nummer ?? (r.status === 'erledigt' ? '–' : 'Entwurf'),
        el('a', { href: `#/projekte/${r.projektId}/rechnung` }, `${p?.name ?? 'Projekt'} · ${r.titel}`), tm(r.erstellt), euro(r.netto), chip);
    }),
  ][reiter]();

  return el('div', { class: 'karte' }, [
    el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Belege' }, ['Angebote', 'Aufträge', 'Rechnungen'].map((t, i) =>
      el('button', { type: 'button', 'aria-pressed': String(i === reiter), 'data-fokus': `kd-reiter-${i}`, onclick: () => { reiter = i; zustand.neuZeichnen(); } }, t))),
    el('div', { class: 'mit-abstand-mittel' }, zeilen.length ? zeilen : [el('p', { class: 'beleg-leer' }, 'Noch nichts vorhanden.')]),
  ]);
}
