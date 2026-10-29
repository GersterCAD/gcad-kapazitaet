// Übersicht nach Entwurf Index A (Main.dc.html): Kennzahlen, Warnung, Stunden je Woche,
// Vorschläge, diese Woche aus dem Kalender, Projektplan.

import { el, zahlText, hakenIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import { STATUS_FEST, soll, ist } from '../kern/daten.js';
import { plane, wochen, kennzahlen } from '../kern/planung.js';
import { vorschlaege, uebernehmen, rueckgaengig } from '../kern/vorschlaege.js';
import { anfragePruefen } from '../kern/anfrage.js';
import { termineNachTag } from '../kern/kapazitaet.js';
import { ausText, alsText, plusTage, tagKurz, isoWoche, montag } from '../kern/datum.js';
import { planChip } from './projekt.js';
import { uhrzeit } from '../kalender.js';
import { startKnopf, zuletztText } from './zeitstopper.js';
import * as stoppuhr from '../stoppuhr.js';
import { wochenKarte } from './woche.js';
import { terminFrageKarte } from './terminfrage.js';
import { jahreszielLeiste } from './jahresziel.js';

const ZEITRAUM = [
  { wochen: 4, name: '4 Wochen' },
  { wochen: 12, name: '12 Wochen' },
  { wochen: 26, name: '6 Monate' },
];
const FARBEN = ['#445F6E', '#7C93A0', '#B4C3CC'];
let zeitraum = 12;

const PX_JE_H = 4;          // 240 px Höhe = 60 h, wie im Entwurf
const HOEHE = 240;
const tagMonat = (d) => d.slice(8, 10) + '.' + d.slice(5, 7) + '.';
const OFFEN = ['anfrage', 'angebot'];
const kurzname = (p) => p.name.split(' · ')[0];

export function uebersicht() {
  const d = zustand.aktuell();
  const opts = zustand.planOptionen();
  const plan = plane(d, opts);
  const heute = plan.heute;
  const alleWochen = wochen(plan, heute, 26);
  const kz = kennzahlen(plan, { wochenListe: alleWochen });
  const liste = alleWochen.slice(0, zeitraum);

  const fest = plan.reihenfolge.map((id) => d.projekte.find((p) => p.id === id));
  const farbe = (p, i) => p.farbe || FARBEN[i % FARBEN.length];
  const anfragen = d.projekte
    .filter((p) => OFFEN.includes(p.status) && p.schaetzungH > 0)
    .map((p) => ({ p, ergebnis: anfragePruefen(d, { schaetzungH: p.schaetzungH, puffer: p.puffer, start: p.start, wunschtermin: p.deadline }, opts) }));

  const zeitraumName = ZEITRAUM.find((z) => z.wochen === zeitraum).name;

  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf' }, [
      el('div', {}, [
        el('div', { class: 'label' }, 'Übersicht'),
        el('h1', {}, `Auslastung der nächsten ${zeitraumName}`),
      ]),
      el('div', { class: 'knopfreihe eng' }, [
        el('a', { class: 'pille', href: '#/planspiel' }, 'Was wäre, wenn …'),
        el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Zeitraum' }, ZEITRAUM.map((z) =>
          el('button', {
            type: 'button', 'aria-pressed': String(z.wochen === zeitraum), 'data-fokus': `zeitraum-${z.wochen}`,
            onclick: () => { zeitraum = z.wochen; zustand.neuZeichnen(); },
          }, z.name))),
      ]),
    ]),
    kennzahlKacheln(d, kz),
    kz.warnung.aktiv ? warnHinweis(d, kz.warnung) : null,
    terminFrageKarte(d, opts.termine),
    wochenKarte(d, plan),
    jahreszielLeiste(d, heute),
    el('div', { class: 'zweispaltig' }, [
      diagramm(d, liste, fest, farbe, anfragen),
      el('aside', { class: 'spalte-seite', 'aria-labelledby': 'h-vor' }, [
        vorschlagKarte(d, opts, anfragen),
        dieseWoche(d, opts),
      ]),
    ]),
    weiterarbeiten(d),
    projektplan(d, plan, liste, fest, farbe, anfragen),
  ]);
}

// ---------- Kennzahlen und Warnung ----------

function kachel(label, wert, unter) {
  return el('div', { class: 'kachel' }, [
    el('div', { class: 'label' }, label),
    wert,
    el('div', { class: 'kachel-unter' }, unter),
  ]);
}

function kennzahlKacheln(d, kz) {
  const e = d.einstellungen;
  const last = kz.auslastung4W;
  const dl = kz.naechsteDeadline;
  const dlProjekt = dl && d.projekte.find((p) => p.id === dl.projektId);
  const w = kz.warnung;
  return el('div', { class: 'raster-kacheln breit' }, [
    kachel('Auslastung · 4 Wochen', el('div', { class: 'kennzahl zahl' }, `${last} %`),
      last > 100 ? `${last - 100} % über Regelkapazität` : 'innerhalb der Regelkapazität'),
    kachel('Frei bis 31.12.', el('div', { class: 'kennzahl zahl' }, `${zahlText(kz.freiBisJahresende, 0)} h`), 'Projektstunden nach Blockzeiten'),
    kachel('Nächste Deadline', el('div', { class: 'kennzahl zahl' }, dl ? tagKurz(ausText(dl.datum)) : '–'),
      dlProjekt ? [dlProjekt.name, dlProjekt.art].filter(Boolean).join(' · ') : 'keine offene Deadline'),
    kachel(`Über ${zahlText(e.regeltagH)} h in Folge`, el('div', { class: 'knopfreihe eng kennzahl-zeile' }, [
      el('span', { class: 'kennzahl zahl ohne-abstand' }, String(w.anzahl)),
      el('span', { class: 'zeile-text sekundaer' }, w.anzahl === 1 ? 'Woche' : 'Wochen'),
      w.aktiv ? el('span', { class: 'chip gelb' }, 'Grenze erreicht') : el('span', { class: 'chip gruen' }, 'im Rahmen'),
    ]), `Warngrenze: ${w.grenze} ${w.grenze === 1 ? 'Woche' : 'Wochen'}`),
  ]);
}

function warnHinweis(d, w) {
  const kw = w.kwVon === w.kwBis ? `KW ${w.kwVon}` : `KW ${w.kwVon}–${w.kwBis}`;
  return el('div', { class: 'hinweisband', role: 'status' }, [
    el('span', { class: 'chip gelb' }, 'Achtung'),
    el('div', { class: 'hinweisband-text' }, [
      `${kw}: ${w.anzahl} Wochen in Folge über ${zahlText(d.einstellungen.regeltagH)} h pro Werktag (Ø bis ${zahlText(w.tagDurchschnittMax)} h). `,
      el('span', { class: 'sekundaer' }, 'Vorschläge übernehmen oder Projekte verschieben.'),
    ]),
  ]);
}

// ---------- Stunden je Woche ----------

function diagramm(d, liste, fest, farbe, anfragen) {
  const e = d.einstellungen;
  const arten = [
    { name: 'Termine (Kalender)', klasse: 'seg-termin', h: (w) => w.termineH },
    { name: 'Büro, Rechnungen', klasse: 'seg-buero', h: (w) => w.bueroH },
    { name: 'Entwicklung', klasse: 'seg-entwicklung', h: (w) => w.entwicklungH },
    ...fest.map((p, i) => ({
      name: p.name, stil: `background:${farbe(p, i)}`,
      h: (w) => (w.projekte[p.id] || 0) + (w.ueberlast[p.id] || 0),
    })),
    ...anfragen.map(({ p, ergebnis }) => {
      const regulaer = ergebnis.varianten[0];
      return { name: `Anfrage ${kurzname(p)}`, klasse: 'seg-anfrage', anfrage: true, h: (w) => regulaer.wochen.find((x) => x.schluessel === w.schluessel)?.stunden || 0 };
    }),
  ];

  // Maßstab: 4 px je Stunde; wird eine Woche höher als 60 h, schrumpft alles mit
  const hoechste = Math.max(...liste.map((w) => arten.reduce((s, a) => s + a.h(w), 0)), 0);
  const px = Math.min(PX_JE_H, HOEHE / Math.max(1, hoechste * 1.05));

  const spalten = liste.map((w) => {
    const segs = arten.map((a) => ({ a, h: a.h(w) })).filter((x) => x.h > 0.05);
    const summe = segs.filter((x) => !x.a.anfrage).reduce((s, x) => s + x.h, 0);
    const frei = w.regelKap === 0;
    const urlaub = frei && w.abwesendTage > 0;
    const notiz = frei
      ? (urlaub ? 'Urlaub' : w.feiertage.length ? 'Feiertage' : 'frei')
      : w.feiertage.filter((f) => ausText(f.datum).getDay() >= 1 && ausText(f.datum).getDay() <= 5).map((f) => `${tagMonat(f.datum)} Feiertag`).join(' · ');
    const beschreibung = `KW ${w.kw}: ${zahlText(summe)} von ${zahlText(w.regelKap)} Stunden. ${segs.map((x) => `${x.a.name} ${zahlText(x.h)} h`).join(', ')}`;
    return el('div', { class: 'woche' }, [
      el('div', { class: 'woche-chips' }, [
        w.ueber ? el('span', { class: 'chip gelb klein zahl' }, `+${zahlText(w.ueberH)} h`) : null,
        w.samstagZugeschaltet ? el('span', { class: 'chip rahmen klein' }, 'Sa') : null,
      ]),
      el('div', { class: 'woche-saeule', role: 'img', 'aria-label': beschreibung, style: `--linien:${10 * px}px` }, [
        ...segs.map((x) => el('div', {
          class: `seg ${x.a.klasse ?? ''}`, title: `${x.a.name}: ${zahlText(x.h)} h`,
          style: `height:${Math.max(1, x.h * px - 1)}px;${x.a.stil ?? ''}`,
        })),
        w.regelKap > 0 ? el('div', { class: 'kap-linie', style: `bottom:${w.regelKap * px}px`, 'aria-hidden': 'true' }) : null,
        frei ? el('div', { class: 'woche-frei' }, el('span', {}, notiz)) : null,
      ]),
      el('div', { class: 'woche-kw' }, `KW ${w.kw}`),
      el('div', { class: 'woche-klein zahl' }, tagMonat(w.montag)),
      el('div', { class: 'woche-klein zahl' }, `${zahlText(summe, 0)} / ${zahlText(w.regelKap)} h`),
      !frei && notiz ? el('div', { class: 'woche-notiz' }, notiz) : null,
    ]);
  });

  return el('section', { class: 'karte spalte-haupt-flach', 'aria-labelledby': 'h-chart' }, [
    el('div', { class: 'knopfreihe grundlinie' }, [
      el('h2', { id: 'h-chart' }, 'Stunden je Woche'),
      el('span', { class: 'zeile-text sekundaer' }, `Linie = Regelkapazität (${zahlText(e.regeltagH)} h × Arbeitstage, ohne Feiertage und Urlaub)`),
    ]),
    el('div', { class: 'legende' }, arten.map((a) => el('span', { class: 'legende-eintrag' }, [
      el('span', { class: `legende-farbe ${a.klasse ?? ''}`, style: a.stil, 'aria-hidden': 'true' }), a.name,
    ]))),
    el('div', { class: 'scrollkasten mit-abstand-gross' }, [
      el('div', { class: 'wochen', style: `min-width:${Math.max(720, liste.length * 60)}px` }, spalten),
    ]),
  ]);
}

// ---------- Vorschläge ----------

/** Je Projekt höchstens ein Vorschlag pro Art, in der festen Reihenfolge. Beim Verschieben der kleinste, der reicht. */
function auswahl(gruppe) {
  const jeTyp = new Map();
  for (const v of gruppe.vorschlaege) {
    const bisher = jeTyp.get(v.typ);
    if (!bisher) { jeTyp.set(v.typ, v); continue; }
    if (v.typ === 'verschieben') {
      const h = (x) => Number(x.titel.match(/: ([\d,]+) h/)?.[1].replace(',', '.') ?? 0);
      if (v.loest && (!bisher.loest || h(v) < h(bisher))) jeTyp.set(v.typ, v);
    }
  }
  return [...jeTyp.values()];
}

function vorschlagKarte(d, opts, anfragen) {
  const karten = [];

  // Übernommene zuerst, mit Rückgängig
  for (const v of d.vorschlaegeUebernommen) {
    karten.push(vorschlagKachel(v.titel, v.text, [
      el('span', { class: 'chip gruen' }, [hakenIcon(10), 'übernommen']),
      el('button', {
        type: 'button', class: 'pille leise', 'data-fokus': `rueck-${v.id}`,
        onclick: () => zustand.aendern((x) => rueckgaengig(x, v.id)),
      }, 'Rückgängig'),
    ]));
  }

  // Offene Vorschläge je Projekt mit Engpass
  for (const gruppe of vorschlaege(d, opts)) {
    for (const v of auswahl(gruppe)) {
      karten.push(vorschlagKachel(v.titel, v.text, [
        el('button', {
          type: 'button', class: 'pille haupt', 'data-fokus': `vor-${v.schluessel}`,
          onclick: () => zustand.aendern((x) => { uebernehmen(x, v); }),
        }, v.aktion),
        v.loest ? null : el('span', { class: 'zeile-hinweis' }, 'löst es allein nicht'),
      ]));
    }
  }

  // Anfragen: frühester Start und realistisches Datum
  for (const { p, ergebnis } of anfragen) {
    const [reg, , lang] = ergebnis.varianten;
    if (!reg.fertig) continue;
    const startKw = reg.wochen[0] ? isoWoche(ausText(reg.wochen[0].montag)).woche : null;
    // tagKurz endet schon mit Punkt („Do 17.12.“), daher kein weiterer Satzpunkt
    let text = `Mit ${zahlText(p.puffer)} % Puffer realistisch fertig am ${tagKurz(ausText(reg.fertig))}`;
    if (lang.fertig && lang.fertig < reg.fertig) text += ` Mit längeren Tagen ab ${tagKurz(ausText(lang.fertig))}`;
    karten.push(vorschlagKachel(`Anfrage ${kurzname(p)}: frühester Start KW ${startKw}`, text, [
      el('a', { class: 'pille', href: `#/anfragen/${p.id}` }, 'Anfrage öffnen'),
    ]));
  }

  return el('section', { class: 'kachel' }, [
    el('h2', { id: 'h-vor', class: 'label' }, 'Vorschläge'),
    el('div', { class: 'stapel' }, karten.length
      ? karten
      : [el('p', { class: 'kartentext' }, 'Alles im Plan. Gerade gibt es nichts vorzuschlagen.')]),
  ]);
}

function vorschlagKachel(titel, text, knoepfe) {
  return el('div', { class: 'vorschlag' }, [
    el('div', { class: 'vorschlag-titel' }, titel),
    text ? el('div', { class: 'vorschlag-text' }, text) : null,
    el('div', { class: 'knopfreihe vorschlag-knoepfe' }, knoepfe),
  ]);
}

// ---------- Diese Woche aus dem Kalender ----------

function dieseWoche(d, opts) {
  const heute = opts.heute;
  const sonntag = alsText(plusTage(montag(ausText(heute)), 6));
  const proTag = termineNachTag(d, opts.termine);
  const zeilen = [];
  for (let t = ausText(heute); alsText(t) <= sonntag; t = plusTage(t, 1)) {
    const tag = alsText(t);
    for (const { termin, h } of proTag.get(tag) ?? []) {
      const zeit = termin.ganztaegig ? 'ganztägig' : `${uhrzeit(termin.start)}–${uhrzeit(termin.ende)}`;
      zeilen.push({ tag, sort: termin.ganztaegig ? '00:00' : uhrzeit(termin.start), titel: termin.titel, meta: `${zeit} · zählt ${zahlText(h)} h` });
    }
    const wt = t.getDay();
    for (const b of d.blockzeiten) {
      if (![].concat(b.wochentag).includes(wt) || wt === 0 || wt === 6) continue;
      const h = b.stundenProWoche / [].concat(b.wochentag).length;
      zeilen.push({ tag, sort: b.von ?? '99', titel: b.art === 'buero' ? `Bürozeit · ${b.titel}` : b.titel, meta: `Blockzeit · ${zahlText(h)} h` });
    }
  }
  zeilen.sort((a, b) => a.tag.localeCompare(b.tag) || a.sort.localeCompare(b.sort));

  return el('section', { class: 'karte', 'aria-labelledby': 'h-next' }, [
    el('h2', { id: 'h-next', class: 'label' }, 'Diese Woche · aus dem Kalender'),
    el('div', { class: 'mit-abstand' }, zeilen.length
      ? zeilen.map((z) => el('div', { class: 'terminzeile' }, [
          el('div', { class: 'termin-wann zahl' }, tagKurz(ausText(z.tag))),
          el('div', { class: 'termin-was' }, [el('div', { class: 'zeile-text' }, z.titel), el('div', { class: 'termin-meta' }, z.meta)]),
        ]))
      : [el('p', { class: 'kartentext' }, opts.termine.length ? 'Diese Woche keine Termine mehr.' : 'Noch kein Kalender verbunden.')]),
  ]);
}

// ---------- Weiterarbeiten (nur am iPhone, iPhone.dc.html) ----------

function weiterarbeiten(d) {
  const t = stoppuhr.laeuft();
  const zeilen = stoppuhr.zuletzt().filter((z) => z.projektId !== t?.projektId).slice(0, 2);
  if (!zeilen.length) return null;
  return el('section', { class: 'weiterarbeiten', 'aria-labelledby': 'h-weiter' }, [
    el('h2', { id: 'h-weiter', class: 'label' }, 'Weiterarbeiten'),
    ...zeilen.map((z, i) => {
      const p = d.projekte.find((x) => x.id === z.projektId);
      return el('div', { class: 'schnellstart' }, [
        el('span', { class: 'farbstreifen', 'aria-hidden': 'true', style: p.farbe ? `background:${p.farbe}` : null }),
        el('a', { class: 'fuellung schnellstart-text', href: `#/projekte/${p.id}` }, [
          el('div', { class: 'zeile-titel' }, p.name),
          el('div', { class: 'zeile-hinweis' }, zuletztText(z)),
        ]),
        startKnopf(p, { hervor: i === 0 && !t }),
      ]);
    }),
  ]);
}

// ---------- Projektplan ----------

function projektplan(d, plan, liste, fest, farbe, anfragen) {
  const von = liste[0].montag;
  const tage = liste.length * 7;
  const pos = (datum) => Math.max(0, Math.min(100, ((ausText(datum) - ausText(von)) / 86400000 / tage) * 100));
  const bis = alsText(plusTage(ausText(von), tage - 1));
  const imZeitraum = (datum) => datum >= von && datum <= bis;

  const zeilen = [];
  fest.forEach((p, i) => {
    const info = plan.projekte[p.id];
    const anfang = p.start && p.start > von ? p.start : von;
    const ende = info.fertig ?? anfang;
    zeilen.push({
      p, stunden: `Soll ${zahlText(soll(p))} h · Ist ${zahlText(ist(d, p.id))} h`, chip: planChip(info.status),
      links: pos(anfang), breite: Math.max(1, pos(alsText(plusTage(ausText(ende), 1))) - pos(anfang)), stil: `background:${farbe(p, i)}`,
      marken: d.meilensteine.filter((m) => m.projektId === p.id && imZeitraum(m.datum)).map((m) => ({ datum: m.datum, titel: m.titel, deadline: m.typ === 'deadline' })),
    });
  });
  for (const { p, ergebnis } of anfragen) {
    const reg = ergebnis.varianten[0];
    if (!reg.fertig || !reg.wochen.length) continue;
    const anfang = reg.wochen[0].montag > (p.start || '') ? reg.wochen[0].montag : p.start;
    zeilen.push({
      p, anfrage: true, stunden: `Schätzung ${zahlText(p.schaetzungH)} h + ${zahlText(p.puffer)} %`, chip: el('span', { class: 'chip' }, p.status === 'angebot' ? 'Angebot' : 'Anfrage'),
      links: pos(anfang), breite: Math.max(1, pos(alsText(plusTage(ausText(reg.fertig), 1))) - pos(anfang)),
      marken: imZeitraum(reg.fertig) ? [{ datum: reg.fertig, titel: 'Realistisches Lieferdatum', deadline: true }] : [],
    });
  }

  const zuletztId = stoppuhr.zuletzt()[0]?.projektId;
  const heuteX = pos(plan.heute);
  const minBreite = 240 + liste.length * 55;

  return el('section', { class: 'karte', 'aria-labelledby': 'h-plan' }, [
    el('div', { class: 'knopfreihe grundlinie' }, [
      el('h2', { id: 'h-plan' }, 'Projektplan'),
      el('span', { class: 'zeile-text sekundaer' }, 'Raute = Meilenstein · Fahne = Deadline · gestrichelt = Anfrage, noch nicht fest'),
    ]),
    el('div', { class: 'scrollkasten mit-abstand-gross' }, [
      el('div', { class: 'plan', style: `min-width:${Math.max(900, minBreite)}px;--wochen:${liste.length}` }, [
        el('div', { class: 'plan-zeile plan-kopf' }, [
          el('div', { class: 'plan-name' }),
          el('div', { class: 'plan-kw' }, liste.map((w) => el('div', {}, `KW ${w.kw}`))),
        ]),
        ...(zeilen.length ? zeilen.map((z) => el('div', { class: 'plan-zeile' }, [
          el('div', { class: 'plan-name' }, [
            el('div', { class: 'fuellung' }, [
              el('a', { class: 'plan-titel', href: `#/projekte/${z.p.id}` }, z.p.name),
              el('div', { class: 'knopfreihe eng plan-info' }, [el('span', { class: 'zahl' }, z.stunden), z.chip]),
            ]),
            !z.anfrage && ['auftrag', 'laeuft'].includes(z.p.status) ? startKnopf(z.p, { hervor: z.p.id === zuletztId }) : null,
          ]),
          el('div', { class: 'plan-bahn' }, [
            el('div', { class: `plan-balken${z.anfrage ? ' anfrage' : ''}`, style: `left:${z.links.toFixed(2)}%;width:${z.breite.toFixed(2)}%;${z.stil ?? ''}` }),
            ...z.marken.map((m) => el('div', { class: 'plan-marke', title: `${m.titel} · ${tagKurz(ausText(m.datum))}`, style: `left:${pos(m.datum).toFixed(2)}%` }, [
              m.deadline
                ? el('span', { class: 'fahne', 'aria-hidden': 'true', html: '<svg width="16" height="20" viewBox="0 0 16 20"><path d="M2 1v18" stroke="#1D1D1F" stroke-width="1.5"/><path d="M2 2h11l-3 4 3 4H2z" fill="#1D1D1F"/></svg>' })
                : el('span', { class: 'raute', 'aria-hidden': 'true', html: '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="3" width="8" height="8" transform="rotate(45 7 7)" fill="#FFFFFF" stroke="#1D1D1F" stroke-width="1.5"/></svg>' }),
              el('span', { class: 'plan-datum zahl' }, tagMonat(m.datum)),
              el('span', { class: 'nur-vorleser' }, `${m.titel} ${tagKurz(ausText(m.datum))}`),
            ])),
            el('div', { class: 'heute-linie', style: `left:${heuteX.toFixed(2)}%`, 'aria-hidden': 'true' }),
          ]),
        ])) : [el('p', { class: 'kartentext' }, 'Noch keine Aufträge. Leg ein Projekt an.')]),
        el('div', { class: 'plan-zeile fuss' }, [
          el('div', { class: 'plan-name' }),
          el('div', { class: 'plan-bahn' }, el('span', { class: 'heute-text', style: `left:${heuteX.toFixed(2)}%` }, 'heute')),
        ]),
      ]),
    ]),
  ]);
}
