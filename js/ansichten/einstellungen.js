// Einstellungen nach Entwurf Index A: Arbeitszeit, geblockte Zeiten, Urlaub und Feiertage, Kalender.
// Dazu der Bereich „Daten“ (Beispieldaten, Export, Import, Sicherungen) – dafür gibt es keinen Entwurf,
// er nutzt Zeilen und Schalter aus dem Entwurf.
// Jede Änderung geht sofort über zustand.aendern() in die Planung.

import { el, schalter, stepper, wahlPille, feldGruppe, zahlText, hakenIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import * as speicher from '../speicher.js';
import * as austausch from '../austausch.js';
import { zusammenfassung, neueId } from '../kern/daten.js';
import * as kalender from '../kalender.js';
import * as github from '../github.js';
import * as lexware from '../lexware.js';
import { zulagenEditor } from './angebote.js';
import * as abgleich from '../abgleich.js';
import { unterschiede } from '../kern/abgleich.js';
import { ZUSAMMENFASSEN, STANDARD_ZUSAMMENFASSEN, euro } from '../kern/abrechnung.js';
import { meilensteineExportieren, offeneMeilensteine } from './kalender.js';
import { feiertageBW, feiertag } from '../kern/feiertage.js';
import { abwesenheit } from '../kern/kapazitaet.js';
import { ZAHLUNGSZIEL_TAGE, zahlungsziel } from '../kern/einnahmen.js';
import { ausText, alsText, plusTage, tagKurz, tagLang } from '../kern/datum.js';

const ANLASS = { export: 'beim Export', import: 'vor dem Import', wiederherstellen: 'vor dem Wiederherstellen', loeschen: 'vor dem Löschen', abgleich: 'vor dem Abgleich' };
const TAG_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const TAG_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// Was gerade bearbeitet wird (bleibt beim Neuzeichnen erhalten)
let blockOffen = null;   // null | 'neu' | id
let urlaubOffen = null;  // null | 'neu' | id

const setze = (fn) => zustand.aendern((d) => fn(d.einstellungen, d));

export function einstellungen() {
  const d = zustand.aktuell();
  return el('div', { class: 'seite' }, [
    el('div', {}, [
      el('div', { class: 'label' }, 'Einstellungen'),
      el('h1', { class: 'mit-abstand' }, 'Kapazität, Blockzeiten, Kalender'),
      el('p', { class: 'einleitung' }, 'Wochenkapazität = Arbeitstage × Regeltag − Feiertage − Urlaub − Blockzeiten − Termine.'),
    ]),
    el('div', { class: 'raster-karten' }, [
      arbeitszeitKarte(d),
      blockzeitenKarte(d),
      urlaubKarte(d),
      kalenderKarte(d),
      abrechnungKarte(d),
      lexwareKarte(d),
      nachkalkKarte(d),
      datenKarte(),
    ]),
  ]);
}

// ---------- Arbeitszeit ----------

function arbeitszeitKarte(d) {
  const e = d.einstellungen;
  const zeilen = [
    {
      label: 'Regeltag', hint: 'Grundlage für die Planung, Mo–Fr', wert: `${zahlText(e.regeltagH)} h`, fokus: 'regeltag',
      minus: () => setze((x) => { x.regeltagH = Math.max(4, x.regeltagH - 1); }),
      plus: () => setze((x) => { x.regeltagH = Math.min(x.maxTagH, x.regeltagH + 1); }),
      minusLabel: 'Regeltag kürzer', plusLabel: 'Regeltag länger',
    },
    {
      label: 'Längster Tag bei Engpass', hint: 'Obergrenze für Vorschläge mit längeren Tagen', wert: `${zahlText(e.maxTagH)} h`, fokus: 'maxtag',
      minus: () => setze((x) => { x.maxTagH = Math.max(x.regeltagH, x.maxTagH - 1); }),
      plus: () => setze((x) => { x.maxTagH = Math.min(12, x.maxTagH + 1); }),
      minusLabel: 'Obergrenze senken', plusLabel: 'Obergrenze anheben',
    },
    {
      label: `Warnung über ${zahlText(e.regeltagH)} h`, hint: 'nach so vielen Wochen am Stück', wert: `${e.warnWochen} Wo.`, fokus: 'warnung',
      minus: () => setze((x) => { x.warnWochen = Math.max(1, x.warnWochen - 1); }),
      plus: () => setze((x) => { x.warnWochen = Math.min(8, x.warnWochen + 1); }),
      minusLabel: 'früher warnen', plusLabel: 'später warnen',
    },
  ];

  const samstag = e.samstagErlaubt !== 'nie';
  const tage = ['Mo', 'Di', 'Mi', 'Do', 'Fr'].map((l) =>
    el('button', { type: 'button', class: 'wahl tag', 'aria-pressed': 'true', 'aria-disabled': 'true', title: 'Mo–Fr sind immer Arbeitstage' }, l));
  tage.push(wahlPille('Sa', samstag, () => setze((x) => { x.samstagErlaubt = samstag ? 'nie' : 'vorschlag'; }), {
    art: 'tag stahl', fokus: 'samstag', label: samstag ? 'Samstag: nur auf Vorschlag. Antippen, um Samstage nie vorzuschlagen.' : 'Samstag: nie. Antippen, um Samstage wieder vorschlagen zu lassen.',
  }));

  const pufferWert = el('div', { class: 'stepper-wert zahl' }, `${zahlText(e.standardPuffer)} %`);
  const regler = el('input', {
    id: 's-buf', type: 'range', min: '0', max: '20', step: '0.5', value: String(e.standardPuffer), class: 'regler', 'data-fokus': 'puffer',
    oninput: () => { pufferWert.textContent = `${zahlText(Number(regler.value))} %`; },
    onchange: () => setze((x) => { x.standardPuffer = Math.max(0, Math.min(20, parseFloat(regler.value) || 0)); }),
  });

  return el('section', { class: 'karte', 'aria-labelledby': 'h-az' }, [
    el('h2', { id: 'h-az' }, 'Arbeitszeit'),
    el('div', { class: 'mit-abstand' }, [
      ...zeilen.map((z) => el('div', { class: 'zeile' }, [
        el('div', { class: 'fuellung' }, [el('div', { class: 'zeile-titel' }, z.label), el('div', { class: 'zeile-hinweis' }, z.hint)]),
        stepper(z),
      ])),
      el('div', { class: 'zeile' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel' }, 'Arbeitstage'),
          el('div', { class: 'zeile-hinweis' }, samstag ? 'Samstag nur auf Vorschlag, nie automatisch' : 'Samstag wird nie vorgeschlagen'),
        ]),
        el('div', { class: 'wahlreihe eng' }, tage),
      ]),
      el('div', { class: 'zeile' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel', id: 'l-rundung' }, 'Timer runden'),
          el('div', { class: 'zeile-hinweis' }, 'Gestoppte Zeit auf die nächste Stufe, mindestens eine Stufe'),
        ]),
        el('div', { class: 'wahlreihe eng', role: 'group', 'aria-labelledby': 'l-rundung' }, [6, 15, 30].map((m) =>
          wahlPille(`${m} Min.`, (e.timerRundung ?? 15) === m, () => setze((x) => { x.timerRundung = m; }), { art: 'breit', fokus: `rundung-${m}` }))),
      ]),
      el('div', { class: 'zeile ohne-linie' }, [
        el('div', { class: 'fuellung' }, [
          el('label', { for: 's-buf', class: 'zeile-titel' }, 'Standard-Puffer'),
          el('div', { class: 'zeile-hinweis' }, '0 bis 20 %, stufenlos · Vorgabe für jede neue Schätzung'),
        ]),
        regler,
        pufferWert,
      ]),
    ]),
  ]);
}

// ---------- Geblockte Zeiten ----------

export function tageText(liste, lang = true) {
  const t = [].concat(liste).sort();
  if (t.length === 1) return lang ? TAG_LANG[t[0]] : TAG_KURZ[t[0]];
  const k = t.map((x) => TAG_KURZ[x]);
  return `${k.slice(0, -1).join(', ')} und ${k[k.length - 1]}`;
}

function blockzeitenKarte(d) {
  const bloecke = d.blockzeiten;
  const hatArt = (art) => bloecke.some((b) => b.art === art);
  const schalterZeilen = [
    {
      label: 'Entwicklung darf bei Engpass gekürzt werden (Vorschlag, nie automatisch)', fokus: 'kuerzbar', art: 'entwicklung',
      an: bloecke.some((b) => b.art === 'entwicklung' && b.kuerzbar), feld: 'kuerzbar',
    },
    {
      label: 'Bürozeit darf innerhalb der Woche verschoben werden', fokus: 'verschiebbar', art: 'buero',
      an: bloecke.some((b) => b.art === 'buero' && b.verschiebbar), feld: 'verschiebbar',
    },
  ];

  const liste = bloecke.map((b) => (blockOffen === b.id ? blockFormular(b) : el('button', {
    type: 'button', class: 'kachel klein reihe knopf-kachel', 'data-fokus': `block-${b.id}`,
    'aria-label': `${b.titel} bearbeiten`, onclick: () => { blockOffen = b.id; urlaubOffen = null; zustand.neuZeichnen(); },
  }, [
    el('span', { class: `farbstreifen ${b.art === 'buero' ? 'buero' : 'entwicklung'}`, 'aria-hidden': 'true' }),
    el('div', { class: 'fuellung' }, [
      el('div', { class: 'zeile-titel' }, b.titel),
      el('div', { class: 'zeile-hinweis' }, `${tageText(b.wochentag)}${b.von && b.bis ? ` ${b.von}–${b.bis}` : ''} · ${b.kuerzbar ? 'flexibel' : 'fest'}`),
    ]),
    el('div', { class: 'wert-mittel zahl' }, `${zahlText(b.stundenProWoche)} h`),
  ])));
  if (blockOffen === 'neu') liste.push(blockFormular(null));
  if (!bloecke.length && blockOffen !== 'neu') liste.push(el('p', { class: 'zeile-hinweis' }, 'Noch keine Blockzeiten. Zum Beispiel Büro am Freitagvormittag.'));

  return el('section', { class: 'karte', 'aria-labelledby': 'h-bl' }, [
    el('div', { class: 'kartenkopf' }, [
      el('h2', { id: 'h-bl', class: 'fuellung' }, 'Geblockte Zeiten'),
      el('button', { type: 'button', class: 'pille', 'data-fokus': 'block-neu', onclick: () => { blockOffen = 'neu'; urlaubOffen = null; zustand.neuZeichnen(); } }, 'Blockzeit hinzufügen'),
    ]),
    el('div', { class: 'stapel' }, liste),
    el('div', { class: 'mit-abstand' }, schalterZeilen.map((z) => el('div', { class: 'zeile schmal' }, [
      el('div', { class: 'fuellung zeile-text', id: `l-${z.fokus}` }, z.label),
      schalter(z.an, `#l-${z.fokus}`, (an) => setze((_, x) => {
        x.blockzeiten.forEach((b) => { if (b.art === z.art) b[z.feld] = an; });
      }), z.fokus),
    ]))),
    !hatArt('entwicklung') || !hatArt('buero')
      ? el('p', { class: 'zeile-hinweis' }, 'Die Schalter wirken auf alle Blockzeiten der jeweiligen Art.')
      : null,
  ]);
}

function stundenAusZeit(von, bis) {
  if (!von || !bis) return 0;
  const m = (t) => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi; };
  return Math.max(0, (m(bis) - m(von)) / 60);
}

function blockFormular(b) {
  const f = {
    titel: b?.titel ?? '', art: b?.art ?? 'buero', tage: [...[].concat(b?.wochentag ?? [5])],
    von: b?.von ?? '08:00', bis: b?.bis ?? '12:00',
  };
  const fehler = el('div', { class: 'meldung rot', role: 'alert' });
  const summe = el('div', { class: 'zeile-hinweis zahl' });
  const zeigeSumme = () => {
    const h = stundenAusZeit(f.von, f.bis) * f.tage.length;
    summe.textContent = `= ${zahlText(h)} h pro Woche`;
  };

  const titel = el('input', { class: 'feld', type: 'text', value: f.titel, placeholder: 'z. B. Büro, Rechnungen', oninput: () => { f.titel = titel.value; } });
  const artWahl = el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Art' });
  const zeigeArt = () => artWahl.replaceChildren(...[['buero', 'Büro'], ['entwicklung', 'Entwicklung']].map(([k, n]) =>
    el('button', { type: 'button', 'aria-pressed': String(f.art === k), onclick: () => { f.art = k; zeigeArt(); } }, n)));
  zeigeArt();

  const tagWahl = el('div', { class: 'wahlreihe eng', role: 'group', 'aria-label': 'Wochentage' });
  const zeigeTage = () => tagWahl.replaceChildren(...[1, 2, 3, 4, 5].map((t) => wahlPille(TAG_KURZ[t], f.tage.includes(t), () => {
    f.tage = f.tage.includes(t) ? f.tage.filter((x) => x !== t) : [...f.tage, t].sort();
    zeigeTage(); zeigeSumme();
  }, { art: 'tag', label: TAG_LANG[t] })));
  zeigeTage();

  const von = el('input', { class: 'feld', type: 'time', value: f.von, step: '900', oninput: () => { f.von = von.value; zeigeSumme(); } });
  const bis = el('input', { class: 'feld', type: 'time', value: f.bis, step: '900', oninput: () => { f.bis = bis.value; zeigeSumme(); } });
  zeigeSumme();

  const schliessen = () => { blockOffen = null; zustand.neuZeichnen(); };
  const speichern = () => {
    const h = stundenAusZeit(f.von, f.bis) * f.tage.length;
    const probleme = [];
    if (!f.titel.trim()) probleme.push('Gib der Blockzeit einen Namen.');
    if (!f.tage.length) probleme.push('Wähle mindestens einen Tag.');
    if (!(h > 0)) probleme.push('„Bis“ muss nach „von“ liegen.');
    if (probleme.length) { fehler.textContent = probleme.join(' '); return; }
    blockOffen = null;
    zustand.aendern((d) => {
      const neu = { titel: f.titel.trim(), art: f.art, stundenProWoche: Math.round(h * 100) / 100, wochentag: f.tage, von: f.von, bis: f.bis };
      if (b) Object.assign(d.blockzeiten.find((x) => x.id === b.id), neu);
      else {
        const gleich = d.blockzeiten.find((x) => x.art === f.art);
        d.blockzeiten.push({ id: neueId(), kuerzbar: gleich?.kuerzbar ?? f.art === 'entwicklung', verschiebbar: gleich?.verschiebbar ?? false, ...neu });
      }
    });
  };

  return el('div', { class: 'kachel klein formular' }, [
    el('div', { class: 'zeile-titel' }, b ? 'Blockzeit bearbeiten' : 'Neue Blockzeit'),
    feldGruppe('Name', titel),
    el('div', { class: 'feldgruppe' }, [el('span', { class: 'feld-label' }, 'Art'), artWahl]),
    el('div', { class: 'feldgruppe' }, [el('span', { class: 'feld-label' }, 'Tage'), tagWahl]),
    el('div', { class: 'feldpaar' }, [feldGruppe('von', von), feldGruppe('bis', bis)]),
    summe,
    fehler,
    el('div', { class: 'knopfreihe' }, [
      el('button', { type: 'button', class: 'pille haupt', onclick: speichern }, 'Speichern'),
      el('button', { type: 'button', class: 'pille', onclick: schliessen }, 'Abbrechen'),
      el('div', { class: 'fuellung' }),
      b ? loeschKnopf('Blockzeit löschen', () => { blockOffen = null; zustand.aendern((d) => { d.blockzeiten = d.blockzeiten.filter((x) => x.id !== b.id); }); }) : null,
    ]),
  ]);
}

/** Löschen mit Rückfrage: erster Tipp fragt, zweiter löscht */
export function loeschKnopf(text, loeschen) {
  let gefragt = false;
  const k = el('button', {
    type: 'button', class: 'pille gefahr',
    onclick: () => {
      if (gefragt) { loeschen(); return; }
      gefragt = true; k.textContent = 'Wirklich löschen?';
      setTimeout(() => { gefragt = false; k.textContent = text; }, 4000);
    },
  }, text);
  return k;
}

// ---------- Urlaub und Feiertage ----------

function arbeitstage(von, bis) {
  let n = 0;
  for (let d = ausText(von); alsText(d) <= bis; d = plusTage(d, 1)) {
    const wt = d.getDay();
    if (wt >= 1 && wt <= 5 && !feiertag(alsText(d))) n++;
  }
  return n;
}

function urlaubKarte(d) {
  const heute = zustand.heute();
  const e = d.einstellungen;
  const eintraege = d.abwesenheiten.filter((a) => a.bis >= heute).sort((a, b) => a.von.localeCompare(b.von));

  const liste = eintraege.map((a) => {
    if (urlaubOffen === a.id) return urlaubFormular(a);
    const n = arbeitstage(a.von, a.bis);
    return el('button', {
      type: 'button', class: 'kachel klein reihe knopf-kachel', 'data-fokus': `urlaub-${a.id}`,
      'aria-label': `${a.art === 'krank' ? 'Krank' : 'Urlaub'} ${tagLang(ausText(a.von))} bis ${tagLang(ausText(a.bis))} bearbeiten`,
      onclick: () => { urlaubOffen = a.id; blockOffen = null; zustand.neuZeichnen(); },
    }, [
      el('div', { class: 'fuellung' }, [
        el('div', { class: 'zeile-titel' }, a.art === 'krank' ? 'Krank' : 'Urlaub'),
        el('div', { class: 'zeile-hinweis zahl' }, a.von === a.bis ? tagLang(ausText(a.von)) : `${tagLang(ausText(a.von))} – ${tagLang(ausText(a.bis))}`),
      ]),
      el('span', { class: 'zeile-text zahl' }, `${n} ${n === 1 ? 'Arbeitstag' : 'Arbeitstage'}`),
    ]);
  });
  if (urlaubOffen === 'neu') liste.push(urlaubFormular(null));
  if (!eintraege.length && urlaubOffen !== 'neu') liste.push(el('p', { class: 'zeile-hinweis' }, 'Kein Urlaub eingetragen.'));

  // nächste Feiertage ab heute
  const jahr = Number(heute.slice(0, 4));
  const naechste = [...feiertageBW(jahr), ...feiertageBW(jahr + 1)].filter((f) => f.datum >= heute).slice(0, 6);

  return el('section', { class: 'karte', 'aria-labelledby': 'h-ab' }, [
    el('div', { class: 'kartenkopf' }, [
      el('h2', { id: 'h-ab', class: 'fuellung' }, 'Urlaub und Feiertage'),
      el('button', { type: 'button', class: 'pille', 'data-fokus': 'urlaub-neu', onclick: () => { urlaubOffen = 'neu'; blockOffen = null; zustand.neuZeichnen(); } }, 'Urlaub eintragen'),
    ]),
    el('div', { class: 'stapel' }, liste),
    el('div', { class: 'kartenkopf mit-abstand-gross' }, [
      el('span', { class: 'label fuellung' }, 'Feiertage Baden-Württemberg · automatisch'),
      el('span', { class: 'chip gruen' }, [hakenIcon(10), 'aktiv']),
    ]),
    el('div', { class: 'mit-abstand' }, naechste.map((f) => {
      const t = ausText(f.datum);
      const wt = t.getDay();
      const ab = abwesenheit(d, f.datum);
      const wirkung = wt === 0 ? 'fällt auf Sonntag' : wt === 6 ? 'fällt auf Samstag' : ab ? (ab === 'krank' ? 'krank' : 'im Urlaub') : `−${zahlText(e.regeltagH)} h`;
      return el('div', { class: 'listenzeile' }, [
        el('span', { class: 'spalte-datum zahl' }, tagKurz(t)),
        el('span', { class: 'fuellung' }, f.name),
        el('span', { class: 'zeile-hinweis' }, wirkung),
      ]);
    })),
  ]);
}

function urlaubFormular(a) {
  const heute = zustand.heute();
  const f = { art: a?.art ?? 'urlaub', von: a?.von ?? heute, bis: a?.bis ?? heute };
  const fehler = el('div', { class: 'meldung rot', role: 'alert' });
  const artWahl = el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Art' });
  const zeigeArt = () => artWahl.replaceChildren(...[['urlaub', 'Urlaub'], ['krank', 'Krank']].map(([k, n]) =>
    el('button', { type: 'button', 'aria-pressed': String(f.art === k), onclick: () => { f.art = k; zeigeArt(); } }, n)));
  zeigeArt();
  const von = el('input', { class: 'feld', type: 'date', value: f.von, oninput: () => { f.von = von.value; if (f.bis < f.von) { f.bis = f.von; bis.value = f.von; } } });
  const bis = el('input', { class: 'feld', type: 'date', value: f.bis, oninput: () => { f.bis = bis.value; } });

  const speichern = () => {
    if (!f.von || !f.bis) { fehler.textContent = 'Gib beide Tage an.'; return; }
    if (f.bis < f.von) { fehler.textContent = '„Bis“ liegt vor „von“.'; return; }
    urlaubOffen = null;
    zustand.aendern((d) => {
      if (a) Object.assign(d.abwesenheiten.find((x) => x.id === a.id), f);
      else d.abwesenheiten.push({ id: neueId(), ...f });
    });
  };
  return el('div', { class: 'kachel klein formular' }, [
    el('div', { class: 'zeile-titel' }, a ? 'Abwesenheit bearbeiten' : 'Urlaub eintragen'),
    el('div', { class: 'feldgruppe' }, [el('span', { class: 'feld-label' }, 'Art'), artWahl]),
    el('div', { class: 'feldpaar' }, [feldGruppe('von', von), feldGruppe('bis', bis)]),
    fehler,
    el('div', { class: 'knopfreihe' }, [
      el('button', { type: 'button', class: 'pille haupt', onclick: speichern }, 'Speichern'),
      el('button', { type: 'button', class: 'pille', onclick: () => { urlaubOffen = null; zustand.neuZeichnen(); } }, 'Abbrechen'),
      el('div', { class: 'fuellung' }),
      a ? loeschKnopf('Löschen', () => { urlaubOffen = null; zustand.aendern((d) => { d.abwesenheiten = d.abwesenheiten.filter((x) => x.id !== a.id); }); }) : null,
    ]),
  ]);
}

// ---------- Abrechnung (Vorbereitung Lexware Office, kein eigener Entwurf) ----------

function abrechnungKarte(d) {
  const art = d.einstellungen.abrechnungZusammenfassen ?? STANDARD_ZUSAMMENFASSEN;
  const gewaehlt = ZUSAMMENFASSEN.find((x) => x.id === art);
  return el('section', { class: 'karte', 'aria-labelledby': 'h-abr' }, [
    el('h2', { id: 'h-abr' }, 'Abrechnung'),
    el('p', { class: 'kartentext' }, 'So werden deine Stunden später als Rechnungszeilen an Lexware Office übergeben.'),
    el('div', { class: 'mit-abstand' }, [
      el('div', { class: 'zeile ohne-linie umbruch' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel', id: 'l-zusammen' }, 'Stunden zusammenfassen'),
          el('div', { class: 'zeile-hinweis' }, `${gewaehlt.text}${art === 'tag' ? ' · Standard' : ''}`),
        ]),
        el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-zusammen' }, ZUSAMMENFASSEN.map((x) =>
          wahlPille(x.name, x.id === art, () => setze((e) => { e.abrechnungZusammenfassen = x.id; }), { art: 'breit', fokus: `zusammen-${x.id}` }))),
      ]),
      el('div', { class: 'zeile ohne-linie umbruch' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel', id: 'l-ziel' }, 'Zahlungsziel'),
          el('div', { class: 'zeile-hinweis' }, 'Für die Einnahmen-Vorschau: so lange dauert es, bis eine Rechnung bezahlt ist'),
        ]),
        el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-ziel' }, ZAHLUNGSZIEL_TAGE.map((t) =>
          wahlPille(`${t} Tage`, t === zahlungsziel(d), () => setze((e) => { e.zahlungszielTage = t; }), { fokus: `ziel-${t}` }))),
      ]),
    ]),
    kundenSaetze(d),
    el('div', { class: 'label mit-abstand-gross', id: 'l-zulagen' }, 'Zulagen für neue Angebote'),
    el('p', { class: 'zeile-hinweis' }, 'Wie im Kalkulator. Jedes neue Angebot startet damit, im Angebot änderst du sie einzeln.'),
    el('div', { class: 'mit-abstand-mittel', role: 'group', 'aria-labelledby': 'l-zulagen' }, zulagenEditor(d.einstellungen.angebotZulagen ?? [], (fn) => setze((e) => { e.angebotZulagen ??= []; fn(e.angebotZulagen); }), { prefix: 'ezl', mitErgebnis: false })),
  ]);
}

// ---------- Nachkalkulation (wie im Werkzeug „Nachkalk“, ohne eigenen Entwurf) ----------

let fixkosten = '';

function nachkalkKarte(d) {
  const n = { zielSatz: null, selbstkosten: null, jahresstunden: null, kmSatz: 0.3, ...(d.einstellungen.nachkalk ?? {}) };
  const zahlFeld = (key, label, hinweis, step = '0.01') => {
    const f = el('input', {
      class: 'feld zahl satzfeld', type: 'number', min: '0', step, inputmode: 'decimal', value: n[key] ?? '', 'aria-label': label, 'data-fokus': `nk-${key}`,
      onchange: () => setze((e) => { e.nachkalk = { ...n, [key]: f.value === '' ? null : Math.round(Number(f.value) * 100) / 100 }; }),
    });
    return el('div', { class: 'zeile schmal' }, [el('div', { class: 'fuellung' }, [el('div', { class: 'zeile-titel' }, label), el('div', { class: 'zeile-hinweis' }, hinweis)]), f]);
  };
  const fix = el('input', { class: 'feld zahl satzfeld', type: 'number', min: '0', step: '100', inputmode: 'decimal', value: fixkosten, placeholder: '€ im Jahr', 'aria-label': 'Fixkosten im Jahr', oninput: () => { fixkosten = fix.value; ergebnis.textContent = rechne(); } });
  const rechne = () => (!(n.jahresstunden > 0) ? 'Erst die produktiven Stunden eintragen.' : Number(fixkosten) > 0 ? `= ${euro(Math.round(Number(fixkosten) / n.jahresstunden * 100) / 100)} je Stunde` : `÷ ${zahlText(n.jahresstunden)} h`);
  const ergebnis = el('span', { class: 'zeile-hinweis' }, rechne());
  return el('section', { class: 'karte', 'aria-labelledby': 'h-nk' }, [
    el('h2', { id: 'h-nk' }, 'Nachkalkulation'),
    el('p', { class: 'kartentext' }, 'Grundlage für Ist-Stundensatz, Gewinn und Ampel. Grün ab Ziel-Satz, gelb deckt die Selbstkosten, rot darunter.'),
    el('div', { class: 'mit-abstand' }, [
      zahlFeld('zielSatz', 'Ziel-Stundensatz', 'Wenn Kunde und Auftrag keinen eigenen Satz haben'),
      zahlFeld('selbstkosten', 'Selbstkostensatz', 'Fixkosten im Jahr ÷ produktive Stunden, ohne Unternehmerlohn'),
      zahlFeld('jahresstunden', 'Produktive Stunden im Jahr', 'Was du wirklich verrechnen kannst', '10'),
      zahlFeld('kmSatz', 'km-Satz', 'Für Fahrten (km × Satz)'),
    ]),
    el('div', { class: 'kachel klein mit-abstand' }, [
      el('div', { class: 'zeile-titel' }, 'Rechenhilfe Selbstkostensatz'),
      el('div', { class: 'zeile-hinweis' }, 'Büro, Software-Abos, Hardware, Versicherungen, Fahrzeug, Steuerberater, Fortbildung, Beiträge.'),
      el('div', { class: 'knopfreihe eng mit-abstand-mittel' }, [fix, ergebnis,
        el('button', {
          type: 'button', class: 'pille', disabled: !(n.jahresstunden > 0), 'data-fokus': 'nk-fix-uebernehmen',
          onclick: () => { if (Number(fixkosten) > 0 && n.jahresstunden > 0) setze((e) => { e.nachkalk = { ...n, selbstkosten: Math.round(Number(fixkosten) / n.jahresstunden * 100) / 100 }; }); },
        }, 'Übernehmen')]),
    ]),
  ]);
}

// ---------- Lexware Office (über GitHub, Einstellungen.dc.html) ----------

function lexwareKarte(d) {
  const lx = lexware.info();
  const an = lexware.verbunden();
  const fehler = lx.status && !lx.status.verbunden && lx.status.fehler && !/fehlt noch/.test(lx.status.fehler) ? lx.status.fehler : null;
  const prueft = lexware.laeuft('kontakte', 'kontakte');
  const chip = an ? el('span', { class: 'chip gruen' }, 'verbunden') : fehler ? el('span', { class: 'chip rot' }, 'Fehler') : el('span', { class: 'chip' }, 'nicht verbunden');
  const meldung = el('div', { class: 'meldung rot', role: 'alert' });
  const pruefKnopf = el('button', {
    type: 'button', class: 'pille', disabled: !github.verbunden() || zustand.istBeispiel() || !!prueft, 'data-fokus': 'lx-pruefen',
    onclick: async () => { try { await lexware.pruefen(); } catch (f) { meldung.textContent = f.message; } },
  }, prueft ? 'Wird geprüft …' : 'Verbindung prüfen');
  const verknuepft = (d.kunden ?? []).filter((k) => k.lexwareKontaktId || lx.kontakte.some((c) => c.name.trim().toLowerCase() === k.name.trim().toLowerCase())).length;
  const zeile = (l, w) => el('div', { class: 'summenzeile linie-unten' }, [el('span', { class: 'sekundaer' }, l), el('span', { class: 'zahl' }, w)]);
  const zuletzt = lx.zuletzt ? `${zeitText(lx.zuletzt.zeit)} · ${lx.zuletzt.art === 'rechnung' ? 'Rechnung' : lx.zuletzt.art === 'angebot' ? 'Angebot' : 'Prüfung'}${lx.zuletzt.ok ? '' : ' (Fehler)'}` : '–';

  return el('section', { class: `karte${an ? ' grau-karte' : ''}`, 'aria-labelledby': 'h-lx' }, [
    el('div', { class: 'knopfreihe' }, [el('h2', { id: 'h-lx', class: 'fuellung' }, 'Lexware Office verbinden'), chip]),
    an ? el('div', { class: 'mit-abstand-mittel' }, [
      zeile('Konto', lx.status.organisation ?? '–'),
      zeile('Geprüft', zeitText(lx.status.geprueft)),
      zeile('Zuletzt übertragen', zuletzt),
      zeile('Kontakte', `${lx.kontakte.length} gelesen · ${verknuepft} verknüpft`),
    ]) : el('div', { class: 'stapel mit-abstand-mittel' }, [
      el('p', { class: 'kartentext' }, 'Damit überträgst du Angebote und Rechnungsentwürfe und liest Kontakte. Der API-Schlüssel liegt nur als Secret in deinem privaten GitHub-Repo, nie in der App.'),
      el('ol', { class: 'schritte' }, [
        el('li', {}, 'In Lexware Office unter Erweiterungen → Public API einen Schlüssel erzeugen.'),
        el('li', {}, ['Im Repo ', el('span', { class: 'fett-mittel' }, github.repo()), ' unter Settings → Secrets and variables → Actions als ', el('code', {}, 'LEXWARE_API_KEY'), ' eintragen.']),
        el('li', {}, '„Verbindung prüfen“ tippen. Nach etwa einer Minute steht hier „verbunden“.'),
      ]),
      fehler ? el('p', { class: 'zeile-hinweis rot' }, fehler) : null,
      !github.verbunden() ? el('p', { class: 'zeile-hinweis' }, 'Zuerst unten unter „Daten“ mit GitHub verbinden.') : null,
      zustand.istBeispiel() ? el('p', { class: 'zeile-hinweis' }, 'Mit Beispieldaten ist Lexware Office aus.') : null,
    ]),
    el('div', { class: 'knopfreihe eng mit-abstand' }, [pruefKnopf]),
    meldung,
    an ? el('p', { class: 'zeile-hinweis' }, 'Trennen: das Secret LEXWARE_API_KEY bei GitHub löschen. Angelegt werden in Lexware immer nur Entwürfe.') : null,
  ]);
}

/** Stundensatz je Kunde: alle Kunden aus den Projekten, Satz direkt eintragen */
function kundenSaetze(d) {
  const namen = [...new Set([...d.projekte.map((p) => p.kunde?.trim()).filter(Boolean), ...(d.kunden ?? []).map((k) => k.name)])].sort((a, b) => a.localeCompare(b, 'de'));
  return el('div', {}, [
    el('div', { class: 'label mit-abstand-gross' }, 'Stundensatz je Kunde · netto'),
    namen.length ? el('div', { class: 'mit-abstand' }, namen.map((name, i) => {
      const k = (d.kunden ?? []).find((x) => x.name === name);
      const auftraege = d.projekte.filter((p) => p.kunde?.trim() === name);
      const eigene = auftraege.filter((p) => p.abrechnungsart === 'pauschal' || p.stundensatz > 0).length;
      const feld = el('input', {
        class: 'feld zahl satzfeld', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', value: k?.stundensatz ?? '',
        placeholder: '€/h', 'aria-label': `Stundensatz ${name} in Euro`, 'data-fokus': `satz-${i}`,
        onchange: () => zustand.aendern((x) => {
          x.kunden ??= [];
          const v = feld.value === '' ? null : Math.round(Number(feld.value) * 100) / 100;
          let e = x.kunden.find((y) => y.name === name);
          if (!e) { e = { id: neueId(), name, stundensatz: null }; x.kunden.push(e); }
          e.stundensatz = v > 0 ? v : null;
        }),
      });
      return el('div', { class: 'zeile schmal' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel' }, name),
          el('div', { class: 'zeile-hinweis' }, `${auftraege.length} ${auftraege.length === 1 ? 'Auftrag' : 'Aufträge'}${eigene ? ` · ${eigene} mit eigenem Satz oder pauschal` : ''}${k?.stundensatz ? ` · ${euro(k.stundensatz)}/h` : ''}`),
        ]),
        feld,
      ]);
    })) : el('p', { class: 'zeile-hinweis' }, 'Noch keine Kunden. Sie erscheinen hier, sobald ein Projekt einen Kunden hat.'),
  ]);
}

// ---------- Kalender ----------

const REGEL_TEXT = {
  alle: 'alle Termine zählen zur Kapazität',
  ganztaegig: 'nur ganztägige Termine = nicht verfügbar',
  ignorieren: 'wird ignoriert',
};
const KALENDER_FARBE = ['var(--stahl)', 'var(--termin)', 'var(--greige)'];

function kalenderKarte(d) {
  const info = kalender.info();
  // Kalender aus den Einstellungen und aus der gelesenen Datei zusammen zeigen
  const namen = [...d.einstellungen.kalender.map((k) => k.name)];
  for (const k of info.kalender ?? []) if (!namen.includes(k.name)) namen.push(k.name);
  const lesen = zustand.istBeispiel() ? 'Beispieltermine' : github.verbunden() ? 'über GitHub' : info.quelle === 'datei' ? 'aus Datei' : 'noch nicht verbunden';

  const datei = el('input', {
    type: 'file', accept: '.json,application/json', class: 'nur-vorleser', tabindex: '-1', 'aria-hidden': 'true',
    onchange: async () => {
      const f = datei.files[0]; datei.value = '';
      if (!f) return;
      try { await kalender.dateiLaden(f); } catch (fehler) { alert(fehler.message); }
    },
  });
  const offene = offeneMeilensteine(d);

  return el('section', { class: 'karte', 'aria-labelledby': 'h-kal' }, [
    el('h2', { id: 'h-kal' }, 'Kalender'),
    el('p', { class: 'kartentext' }, 'Termine werden gelesen und von der Tageskapazität abgezogen. Meilensteine und Deadlines werden als Erinnerung zurückgeschrieben.'),
    el('div', { class: 'label mit-abstand-gross' }, `Lesen · ${lesen}`),
    el('div', { class: 'mit-abstand' }, namen.map((name, i) => {
      const k = d.einstellungen.kalender.find((x) => x.name === name) ?? { name, regel: 'alle' };
      const gelesen = (info.kalender ?? []).find((x) => x.name === name);
      const an = k.regel !== 'ignorieren';
      const zusatz = gelesen ? (gelesen.ok === false ? ' · Abruf fehlgeschlagen' : ` · ${gelesen.anzahl} ${gelesen.anzahl === 1 ? "Termin" : "Termine"}`) : '';
      return el('div', { class: 'zeile schmal' }, [
        el('span', { class: 'kalenderpunkt', style: `background:${KALENDER_FARBE[i % KALENDER_FARBE.length]}`, 'aria-hidden': 'true' }),
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel' }, name),
          el('div', { class: 'zeile-hinweis' }, `${REGEL_TEXT[k.regel] ?? k.regel}${zusatz}`),
        ]),
        schalter(an, `${name} berücksichtigen`, (neu) => setze((e) => {
          let x = e.kalender.find((y) => y.name === name);
          if (!x) { x = { name, regel: 'alle' }; e.kalender.push(x); }
          if (neu) { x.regel = x.regelAn ?? 'alle'; delete x.regelAn; } else { x.regelAn = x.regel; x.regel = 'ignorieren'; }
        }), `kal-${i}`),
      ]);
    })),
    zustand.istBeispiel() ? null : el('div', { class: 'zeile ohne-linie' }, [
      el('div', { class: 'fuellung' }, [
        el('div', { class: 'zeile-titel' }, 'Abgleich'),
        el('div', { class: `zeile-hinweis${info.fehler ? ' rot' : ''}` }, info.fehler
          ? info.fehler
          : info.abgeglichen ? `Zuletzt ${kalender.vorText(info.abgeglichen)}${info.stand ? ` · Kalenderstand ${kalender.vorText(info.stand)}` : ''}` : github.verbunden() ? 'Noch nicht abgeglichen.' : 'Verbinde GitHub unter „Daten“, oder lade eine kalender.json.'),
      ]),
      github.verbunden()
        ? el('button', { type: 'button', class: 'pille', 'data-fokus': 'kal-abgleich', onclick: () => kalender.abgleichen() }, 'Jetzt abgleichen')
        : el('button', { type: 'button', class: 'pille', onclick: () => datei.click() }, 'kalender.json laden'),
      datei,
    ]),
    el('div', { class: 'label mit-abstand-gross' }, 'Schreiben'),
    el('div', { class: 'kachel klein mit-abstand' }, [
      el('div', { class: 'zeile-titel' }, 'Kalender „Kapazität · Gerster CAD“'),
      el('div', { class: 'zeile-hinweis' }, 'Meilensteine und Deadlines als ganztägige Termine · Erinnerung 2 Tage vorher'),
      el('div', { class: 'knopfreihe' }, [el('button', {
        type: 'button', class: 'pille', disabled: !offene.length, 'data-fokus': 'kal-export',
        onclick: () => meilensteineExportieren(offene),
      }, `Offene Meilensteine exportieren (${offene.length})`)]),
      el('div', { class: 'zeile-hinweis' }, 'Die Datei öffnen und den Kalender wählen. Ein erneuter Import aktualisiert die Termine, statt sie zu verdoppeln.'),
    ]),
  ]);
}

// ---------- Abgleich über GitHub ----------

function githubBereich() {
  const fehler = el('div', { class: 'meldung rot', role: 'alert' });
  if (github.verbunden()) {
    const i = abgleich.info();
    const zustandText = i.konflikt ? 'Angehalten: bitte unten entscheiden.'
      : i.laeuft ? 'Gleicht gerade ab …'
      : i.fehler ? i.fehler
      : i.zuletzt ? `Zuletzt abgeglichen ${kalender.vorText(i.zuletzt)}.` : 'Noch nicht abgeglichen.';
    return el('div', {}, [
      el('div', { class: 'zeile' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel' }, 'Abgleich über GitHub'),
          el('div', { class: 'zeile-hinweis' }, `Verbunden mit ${github.repo()} (privat). Der Token liegt nur auf diesem Gerät.`),
          el('div', { class: `zeile-hinweis${i.fehler || i.konflikt ? ' rot' : ''}`, role: 'status' }, zustandText),
        ]),
        el('div', { class: 'knopfreihe eng' }, [
          el('button', { type: 'button', class: 'pille', disabled: i.laeuft || !!i.konflikt, 'data-fokus': 'gh-abgleich', onclick: () => { abgleich.abgleichen(); kalender.abgleichen(); } }, 'Jetzt abgleichen'),
          el('button', { type: 'button', class: 'pille leise', 'data-fokus': 'gh-trennen', onclick: async () => { await github.trennen(); await abgleich.vergessen(); zustand.neuZeichnen(); } }, 'Trennen'),
        ]),
      ]),
      i.konflikt ? konfliktBereich(i.konflikt) : null,
    ]);
  }
  const repo = el('input', { class: 'feld', type: 'text', value: github.repo(), autocomplete: 'off', spellcheck: 'false' });
  const token = el('input', { class: 'feld', type: 'password', autocomplete: 'off', placeholder: 'github_pat_…', spellcheck: 'false' });
  return el('div', { class: 'kachel klein formular mit-abstand' }, [
    el('div', { class: 'zeile-titel' }, 'Abgleich über GitHub'),
    el('div', { class: 'zeile-hinweis' }, 'Für den Kalender und den Abgleich zwischen deinen Geräten. Nur ein privates Repo. Der Token braucht nur Lese- und Schreibrecht auf dieses eine Repo und bleibt auf diesem Gerät.'),
    feldGruppe('Privates Repo', repo),
    feldGruppe('Token', token),
    fehler,
    el('div', { class: 'knopfreihe' }, [el('button', {
      type: 'button', class: 'pille haupt',
      onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        const knopf = ev.currentTarget;
        try { await github.verbinden(repo.value, token.value); token.value = ''; await abgleich.vergessen(); zustand.neuZeichnen(); abgleich.abgleichen(); kalender.abgleichen(); } catch (f) { fehler.textContent = f.message; knopf.disabled = false; }
      },
    }, 'Verbinden')]),
  ]);
}

// Konflikt: je Eintrag wählen, welcher Stand gilt
let wahl = {};
function konfliktBereich(k) {
  const liste = k.ergebnis.konflikte;
  const alle = (seite) => { wahl = Object.fromEntries(liste.map((x) => [x.schluessel, seite])); zustand.neuZeichnen(); };
  return el('div', { class: 'kachel klein formular mit-abstand', role: 'region', 'aria-labelledby': 'h-konflikt' }, [
    el('div', { class: 'knopfreihe' }, [el('span', { class: 'chip gelb' }, 'Konflikt'), el('span', { class: 'zeile-titel', id: 'h-konflikt' }, `${liste.length} ${liste.length === 1 ? 'Eintrag wurde' : 'Einträge wurden'} auf zwei Geräten verschieden geändert`)]),
    el('div', { class: 'zeile-hinweis' }, 'Wähle je Eintrag, welcher Stand gilt. Alles andere ist schon zusammengeführt. Vorher wird eine Sicherung angelegt.'),
    ...liste.map((x) => {
      const seite = wahl[x.schluessel] ?? 'lokal';
      return el('div', { class: 'konflikt' }, [
        el('div', { class: 'zeile-titel' }, `${x.name} · ${x.titel}`),
        el('div', { class: 'konflikt-tabelle' }, [
          el('span', { class: 'feld-label' }, ''), el('span', { class: 'feld-label' }, 'Dieses Gerät'), el('span', { class: 'feld-label' }, 'Anderes Gerät'),
          ...unterschiede(x).slice(0, 5).flatMap((u) => [el('span', { class: 'zeile-hinweis' }, u.feld), el('span', { class: 'zeile-text zahl' }, u.lokal), el('span', { class: 'zeile-text zahl' }, u.entfernt)]),
        ]),
        el('div', { class: 'wahlreihe', role: 'group', 'aria-label': `${x.name} ${x.titel}: welcher Stand gilt` }, [
          wahlPille('Dieses Gerät', seite === 'lokal', () => { wahl[x.schluessel] = 'lokal'; zustand.neuZeichnen(); }, { art: 'breit', fokus: `k-l-${x.schluessel}` }),
          wahlPille('Anderes Gerät', seite === 'entfernt', () => { wahl[x.schluessel] = 'entfernt'; zustand.neuZeichnen(); }, { art: 'breit', fokus: `k-r-${x.schluessel}` }),
        ]),
      ]);
    }),
    el('div', { class: 'knopfreihe' }, [
      el('button', { type: 'button', class: 'pille haupt', 'data-fokus': 'k-uebernehmen', onclick: async () => { const w = wahl; wahl = {}; await abgleich.loesen(w); } }, 'Übernehmen'),
      el('button', { type: 'button', class: 'pille leise', onclick: () => alle('lokal') }, 'Alle von diesem Gerät'),
      el('button', { type: 'button', class: 'pille leise', onclick: () => alle('entfernt') }, 'Alle vom anderen Gerät'),
    ]),
  ]);
}

// ---------- Daten ----------

function datenKarte() {
  const meldung = el('div', { class: 'meldung', role: 'status', 'aria-live': 'polite' });
  const pruefung = el('div');
  const sicherungen = el('div');
  const melden = (text, art = '') => { meldung.className = `meldung ${art}`; meldung.textContent = text; };

  const d = zustand.aktuell();
  const beispiel = zustand.istBeispiel();

  const datei = el('input', {
    type: 'file', accept: '.json,application/json', class: 'nur-vorleser', tabindex: '-1', 'aria-hidden': 'true',
    onchange: async () => {
      const f = datei.files[0];
      datei.value = '';
      if (!f) return;
      zeigePruefung(await austausch.dateiPruefen(f), f.name);
    },
  });

  function zeigePruefung(p, name) {
    melden('');
    if (!p.ok) {
      pruefung.replaceChildren(fehlerKasten(`„${name}“ kann nicht importiert werden.`, p.fehler));
      return;
    }
    const knoepfe = el('div', { class: 'knopfreihe' }, [
      el('button', {
        type: 'button', class: 'pille haupt',
        onclick: async () => {
          await austausch.importieren(p.daten);
          pruefung.replaceChildren();
          melden(`Importiert: ${zusammenfassung(p.daten)}.`, 'gruen');
        },
      }, 'Daten ersetzen'),
      el('button', { type: 'button', class: 'pille', onclick: () => pruefung.replaceChildren() }, 'Abbrechen'),
    ]);
    pruefung.replaceChildren(el('div', { class: 'kachel klein' }, [
      el('div', { class: 'zeile-titel' }, `„${name}“ geprüft`),
      el('div', { class: 'zeile-hinweis zahl' }, zusammenfassung(p.daten)),
      el('p', { class: 'zeile-hinweis' }, `Ersetzt ${beispiel ? 'die Beispieldaten' : 'deine Daten in diesem Browser'}. Der jetzige Stand wird vorher gesichert.`),
      knoepfe,
    ]));
  }

  speicher.sicherungenListe().then((alle) => {
    const eigene = alle.filter((s) => s.satz === zustand.aktiverSatz()).slice(0, 5);
    if (!eigene.length) return;
    sicherungen.replaceChildren(
      el('div', { class: 'label mit-abstand-gross' }, 'Sicherungen in diesem Browser'),
      el('div', { class: 'mit-abstand' }, eigene.map((s) => el('div', { class: 'zeile schmal' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-text zahl' }, zeitText(s.zeit)),
          el('div', { class: 'zeile-hinweis' }, `${ANLASS[s.anlass] ?? s.anlass} · ${zusammenfassung(s.daten)}`),
        ]),
        el('button', {
          type: 'button', class: 'pille leise',
          onclick: async () => {
            await austausch.wiederherstellen(s.nr);
            melden(`Stand vom ${zeitText(s.zeit)} wiederhergestellt.`, 'gruen');
          },
        }, 'Wiederherstellen'),
      ]))),
    );
  });

  return el('section', { class: 'karte', 'aria-labelledby': 'h-daten' }, [
    el('h2', { id: 'h-daten' }, 'Daten'),
    el('p', { class: 'zeile-hinweis mit-abstand' }, github.verbunden() && !beispiel
      ? 'Deine Daten liegen in diesem Browser und werden über dein privates Repo mit deinen anderen Geräten abgeglichen.'
      : 'Deine Daten liegen nur in diesem Browser. Exportiere regelmäßig, dann hast du eine Sicherung als Datei.'),
    el('div', { class: 'mit-abstand' }, [
      el('div', { class: 'zeile' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel', id: 'l-beispiel' }, 'Beispieldaten'),
          el('div', { class: 'zeile-hinweis' }, 'Zum Ausprobieren. Deine echten Daten bleiben unberührt.'),
        ]),
        schalter(beispiel, '#l-beispiel', (an) => zustand.beispielSchalten(an), 'beispiel'),
      ]),
      beispiel ? el('div', { class: 'zeile' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel' }, 'Beispieldaten zurücksetzen'),
          el('div', { class: 'zeile-hinweis' }, 'Alle Änderungen an den Beispieldaten verwerfen.'),
        ]),
        el('button', {
          type: 'button', class: 'pille',
          onclick: async () => { await zustand.beispielZuruecksetzen(); },
        }, 'Zurücksetzen'),
      ]) : null,
      el('div', { class: 'zeile' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel' }, 'Export'),
          el('div', { class: 'zeile-hinweis zahl' }, `${austausch.dateiname()} · ${zusammenfassung(d)}`),
        ]),
        el('button', {
          type: 'button', class: 'pille haupt',
          onclick: async () => { await austausch.exportieren(); melden('Exportiert und im Browser gesichert.', 'gruen'); },
        }, 'Exportieren'),
      ]),
      el('div', { class: 'zeile ohne-linie' }, [
        el('div', { class: 'fuellung' }, [
          el('div', { class: 'zeile-titel' }, 'Import'),
          el('div', { class: 'zeile-hinweis' }, 'Eine exportierte Datei wieder einlesen. Vorher wird geprüft.'),
        ]),
        el('button', { type: 'button', class: 'pille', onclick: () => datei.click() }, 'Datei wählen'),
        datei,
      ]),
    ]),
    pruefung,
    meldung,
    zustand.istBeispiel() ? null : githubBereich(),
    sicherungen,
  ]);
}

function fehlerListe(fehler) {
  const gezeigt = fehler.slice(0, 8);
  return el('ul', { class: 'fehlerliste' }, [
    ...gezeigt.map((f) => el('li', {}, f)),
    fehler.length > gezeigt.length ? el('li', {}, `… und ${fehler.length - gezeigt.length} weitere`) : null,
  ]);
}

function fehlerKasten(titel, fehler) {
  return el('div', { class: 'kachel klein' }, [
    el('div', { class: 'knopfreihe' }, [el('span', { class: 'chip rot' }, 'Fehler'), el('span', { class: 'zeile-titel' }, titel)]),
    fehlerListe(fehler),
  ]);
}

function zeitText(iso) {
  const d = new Date(iso);
  const z = (n) => String(n).padStart(2, '0');
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} · ${z(d.getHours())}:${z(d.getMinutes())}`;
}
