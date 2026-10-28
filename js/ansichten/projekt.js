// Projektseite nach Entwurf Index A (Projekt.dc.html): Kennzahlen Soll, Ist, Rest, Prognose,
// Meilensteine und Deadlines, Soll-Ist je Position, Zeit buchen, Lernwert aus abgeschlossenen Projekten.

import { el, stepper, wahlPille, feldGruppe, zahlText, hakenIcon, glockeIcon, kreuzIcon, plusIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import { STATUS_FEST, STATUS_NAME, soll, ist, neueId } from '../kern/daten.js';
import { plane } from '../kern/planung.js';
import { lernwerte, LERNWERT_AB } from '../kern/lernwert.js';
import { ausText, alsText, plusTage, tagKurz, isoWoche } from '../kern/datum.js';
import { loeschKnopf } from './einstellungen.js';

const PLAN_CHIP = { imPlan: ['gruen', 'im Plan'], knapp: ['gelb', 'knapp'], zuSpaet: ['rot', 'zu spät'] };

export function planChip(status) {
  const [art, text] = PLAN_CHIP[status] ?? ['', status];
  return el('span', { class: `chip ${art}` }, text);
}

/** Status als Chip: feste Aufträge graphit wie im Entwurf („Auftrag · läuft“), sonst hell */
export function statusChip(p) {
  const text = p.status === 'laeuft' ? 'Auftrag · läuft' : STATUS_NAME[p.status].replace(/^./, (c) => c.toUpperCase());
  return el('span', { class: `chip${STATUS_FEST.includes(p.status) ? ' dunkel' : ''}` }, text);
}

/** „1 Woche und 2 Tage vorher“, „am Tag“, „keine Erinnerung“ */
export function erinnerungText(tage = []) {
  const vorher = [...new Set(tage)].filter((t) => t > 0).sort((a, b) => b - a).map((t) =>
    t % 7 === 0 ? `${t / 7} ${t === 7 ? 'Woche' : 'Wochen'}` : `${t} ${t === 1 ? 'Tag' : 'Tage'}`);
  const teile = [];
  if (vorher.length) teile.push(`${vorher.join(' und ')} vorher`);
  if (tage.includes(0)) teile.push('am Tag');
  return teile.length ? teile.join(' und ') : 'keine Erinnerung';
}

// Zustand der Seite, der beim Neuzeichnen erhalten bleibt
let seite = { projektId: null };
function seitenZustand(id) {
  if (seite.projektId !== id) {
    seite = { projektId: id, pos: null, stunden: 1, datum: null, datumOffen: false, meilensteinOffen: null, letzteBuchung: null };
  }
  return seite;
}

export function projektKontext(p) {
  const n = p.positionen.length;
  return [p.name, n ? el('span', { class: 'sekundaer' }, ` · ${n} ${n === 1 ? 'Position' : 'Positionen'}`) : null];
}

export function projektseite(id) {
  const d = zustand.aktuell();
  const p = d.projekte.find((x) => x.id === id);
  if (!p) {
    return el('div', { class: 'seite' }, [
      el('div', { class: 'label' }, 'Projekt'),
      el('h1', {}, 'Projekt nicht gefunden'),
      el('p', { class: 'einleitung' }, ['Vielleicht wurde es gelöscht. ', el('a', { href: '#/projekte' }, 'Zur Projektliste')]),
    ]);
  }
  const s = seitenZustand(id);
  const plan = plane(d, zustand.planOptionen());
  const info = STATUS_FEST.includes(p.status) ? plan.projekte[p.id] : null;

  const datumZeile = [p.start && `Start ${tagKurz(ausText(p.start))}`, p.deadline && `Abgabe ${tagKurz(ausText(p.deadline))}`].filter(Boolean).join(' · ');

  return el('div', { class: 'seite' }, [
    el('div', { class: 'seitenkopf' }, [
      el('div', {}, [
        el('div', { class: 'label' }, `Projekt${p.nr ? ` ${p.nr}` : ''}${p.art ? ` · ${p.art}` : ''}`),
        el('h1', {}, p.positionen.length ? `${p.name} · ${p.positionen.length} ${p.positionen.length === 1 ? 'Position' : 'Positionen'}` : p.name),
        el('div', { class: 'knopfreihe mit-abstand-mittel' }, [
          statusChip(p),
          datumZeile ? el('span', { class: 'zeile-text sekundaer zahl' }, datumZeile) : null,
          p.kunde ? el('span', { class: 'zeile-text sekundaer' }, `· ${p.kunde}`) : null,
        ]),
      ]),
      el('a', { class: 'pille hoch', href: `#/projekte/${p.id}/bearbeiten` }, 'Projekt bearbeiten'),
    ]),
    kennzahlen(d, p, plan, info),
    el('div', { class: 'zweispaltig' }, [
      el('div', { class: 'spalte-haupt' }, [meilensteine(d, p, s), sollIst(d, p)]),
      el('aside', { class: 'spalte-seite' }, [zeitBuchen(d, p, s), lernwertKarte(d, p)]),
    ]),
  ]);
}

// ---------- Kennzahlen ----------

function kachel(label, wert, unter) {
  return el('div', { class: 'kachel' }, [
    el('div', { class: 'label' }, label),
    el('div', { class: 'kennzahl zahl' }, wert),
    el('div', { class: 'kachel-unter' }, unter),
  ]);
}

function kennzahlen(d, p, plan, info) {
  const sollH = soll(p);
  const istH = ist(d, p.id);
  const restH = Math.max(0, sollH - istH);
  const pct = sollH > 0 ? Math.round((istH / sollH) * 100) : 0;

  let restText;
  if (restH <= 0.05) restText = 'alles gebucht';
  else if (info?.fertig) restText = `eingeplant bis KW ${isoWoche(ausText(info.fertig)).woche}`;
  else restText = 'zählt erst ab Auftrag';

  let prognose;
  if (!info) {
    prognose = kachel('Prognose', '–', p.status === 'abgeschlossen' ? 'abgeschlossen' : 'zählt erst ab Auftrag zur Planung');
  } else {
    let text;
    if (info.status === 'imPlan') text = p.deadline ? `hält die Deadline ${tagKurz(ausText(p.deadline))}` : 'ohne Deadline';
    else if (info.status === 'knapp') text = `nur mit Mehrarbeit ${kwSpanne(ueberlastWochen(plan, p.id, info))}`;
    else if (info.offenH) text = `${zahlText(info.offenH)} h passen gar nicht mehr`;
    else text = `${info.tageZuSpaet} ${info.tageZuSpaet === 1 ? 'Tag' : 'Tage'} nach der Deadline`;
    prognose = kachel('Prognose', restH <= 0.05 ? 'fertig' : tagKurz(ausText(info.fertig)), [planChip(info.status), el('span', {}, text)]);
  }

  return el('div', { class: 'raster-kacheln' }, [
    kachel('Soll', `${zahlText(sollH)} h`, `Schätzung ${zahlText(p.schaetzungH)} h + ${zahlText(p.puffer)} % Puffer`),
    kachel('Ist', `${zahlText(istH)} h`, `${pct} % vom Soll`),
    kachel('Rest', `${zahlText(restH)} h`, restText),
    prognose,
  ]);
}

function ueberlastWochen(plan, id, info) {
  const kw = [];
  for (let t = ausText(plan.heute); alsText(t) <= info.fertig; t = plusTage(t, 1)) {
    if ((plan.tag(alsText(t)).ueberlast[id] || 0) > 0.05) kw.push(isoWoche(t).woche);
  }
  return [...new Set(kw)];
}

function kwSpanne(kw) {
  if (!kw.length) return '';
  return kw.length === 1 ? `KW ${kw[0]}` : `KW ${kw[0]}–${kw[kw.length - 1]}`;
}

// ---------- Meilensteine ----------

function meilensteine(d, p, s) {
  const liste = d.meilensteine.filter((m) => m.projektId === p.id).sort((a, b) => a.datum.localeCompare(b.datum));
  const zeilen = liste.map((m) => (s.meilensteinOffen === m.id ? meilensteinFormular(p, s, m) : meilensteinZeile(m, s)));
  if (s.meilensteinOffen === 'neu') zeilen.push(meilensteinFormular(p, s, null));
  if (!liste.length && s.meilensteinOffen !== 'neu') zeilen.push(el('p', { class: 'zeile-hinweis' }, 'Noch keine Meilensteine.'));

  return el('section', { class: 'karte', 'aria-labelledby': 'h-ms' }, [
    el('div', { class: 'kartenkopf' }, [
      el('h2', { id: 'h-ms', class: 'fuellung' }, 'Meilensteine und Deadlines'),
      el('button', {
        type: 'button', class: 'pille', 'data-fokus': 'ms-neu',
        onclick: () => { s.meilensteinOffen = 'neu'; zustand.neuZeichnen(); },
      }, [plusIcon(), 'Meilenstein']),
    ]),
    el('div', { class: 'mit-abstand' }, zeilen),
  ]);
}

function meilensteinZeile(m, s) {
  const erledigt = !!m.erledigt;
  return el('div', { class: 'zeile meilenstein' }, [
    el('button', {
      type: 'button', role: 'checkbox', class: 'haken', 'aria-checked': String(erledigt), 'aria-label': `${m.titel} erledigt`,
      'data-fokus': `ms-${m.id}`,
      onclick: () => zustand.aendern((x) => { const y = x.meilensteine.find((z) => z.id === m.id); y.erledigt = !y.erledigt; }),
    }, [el('span', { class: 'haken-kreis' }, erledigt ? hakenIcon() : null)]),
    el('div', { class: 'spalte-datum fett zahl' }, tagKurz(ausText(m.datum))),
    el('button', {
      type: 'button', class: 'meilenstein-text', 'aria-label': `${m.titel} bearbeiten`, 'data-fokus': `ms-text-${m.id}`,
      onclick: () => { s.meilensteinOffen = m.id; zustand.neuZeichnen(); },
    }, [
      el('span', { class: 'knopfreihe eng' }, [
        el('span', { class: `meilenstein-titel${erledigt ? ' erledigt' : ''}` }, m.titel),
        m.typ === 'deadline' ? el('span', { class: 'abzeichen' }, 'Deadline') : null,
      ]),
      m.notiz ? el('span', { class: 'zeile-hinweis block' }, m.notiz) : null,
    ]),
    el('span', { class: 'erinnerung' }, [glockeIcon(), erledigt ? 'erledigt' : erinnerungText(m.erinnerungTage)]),
  ]);
}

const ERINNERUNGEN = [[7, '1 Woche vorher'], [2, '2 Tage vorher'], [0, 'am Tag']];

function meilensteinFormular(p, s, m) {
  const f = {
    datum: m?.datum ?? p.deadline ?? zustand.heute(), titel: m?.titel ?? '', typ: m?.typ ?? 'meilenstein',
    notiz: m?.notiz ?? '', erinnerungTage: [...(m?.erinnerungTage ?? [2])],
  };
  const fehler = el('div', { class: 'meldung rot', role: 'alert' });
  const datum = el('input', { class: 'feld', type: 'date', value: f.datum, oninput: () => { f.datum = datum.value; } });
  const titel = el('input', { class: 'feld', type: 'text', value: f.titel, placeholder: 'z. B. Pos. 1–3 an Kunde', oninput: () => { f.titel = titel.value; } });
  const notiz = el('input', { class: 'feld', type: 'text', value: f.notiz, placeholder: 'optional, z. B. Werkplanung als PDF', oninput: () => { f.notiz = notiz.value; } });

  const typWahl = el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Typ' });
  const zeigeTyp = () => typWahl.replaceChildren(...[['meilenstein', 'Meilenstein'], ['deadline', 'Deadline']].map(([k, n]) =>
    el('button', { type: 'button', 'aria-pressed': String(f.typ === k), onclick: () => { f.typ = k; zeigeTyp(); } }, n)));
  zeigeTyp();

  const erinnerung = el('div', { class: 'wahlreihe', role: 'group', 'aria-label': 'Erinnerung' });
  const zeigeErinnerung = () => erinnerung.replaceChildren(...ERINNERUNGEN.map(([t, n]) => wahlPille(n, f.erinnerungTage.includes(t), () => {
    f.erinnerungTage = f.erinnerungTage.includes(t) ? f.erinnerungTage.filter((x) => x !== t) : [...f.erinnerungTage, t];
    zeigeErinnerung();
  })));
  zeigeErinnerung();

  const schliessen = () => { s.meilensteinOffen = null; zustand.neuZeichnen(); };
  const speichern = () => {
    if (!f.titel.trim()) { fehler.textContent = 'Gib dem Meilenstein einen Titel.'; return; }
    if (!f.datum) { fehler.textContent = 'Wähle ein Datum.'; return; }
    s.meilensteinOffen = null;
    const neu = { datum: f.datum, titel: f.titel.trim(), typ: f.typ, notiz: f.notiz.trim(), erinnerungTage: f.erinnerungTage.sort((a, b) => b - a) };
    zustand.aendern((x) => {
      if (m) Object.assign(x.meilensteine.find((y) => y.id === m.id), neu);
      else x.meilensteine.push({ id: neueId(), projektId: p.id, erledigt: false, ...neu });
    });
  };

  return el('div', { class: 'kachel klein formular mit-abstand' }, [
    el('div', { class: 'zeile-titel' }, m ? 'Meilenstein bearbeiten' : 'Neuer Meilenstein'),
    el('div', { class: 'feldpaar' }, [feldGruppe('Datum', datum), el('div', { class: 'feldgruppe' }, [el('span', { class: 'feld-label' }, 'Typ'), typWahl])]),
    feldGruppe('Titel', titel),
    feldGruppe('Notiz', notiz),
    el('div', { class: 'feldgruppe' }, [el('span', { class: 'feld-label' }, 'Erinnerung'), erinnerung]),
    f.typ === 'deadline' && p.deadline && f.datum !== p.deadline
      ? el('div', { class: 'zeile-hinweis' }, `Geplant wird mit der Projekt-Deadline ${tagKurz(ausText(p.deadline))}. Die änderst du unter „Projekt bearbeiten“.`)
      : null,
    fehler,
    el('div', { class: 'knopfreihe' }, [
      el('button', { type: 'button', class: 'pille haupt', onclick: speichern }, 'Speichern'),
      el('button', { type: 'button', class: 'pille', onclick: schliessen }, 'Abbrechen'),
      el('div', { class: 'fuellung' }),
      m ? loeschKnopf('Löschen', () => { s.meilensteinOffen = null; zustand.aendern((x) => { x.meilensteine = x.meilensteine.filter((y) => y.id !== m.id); }); }) : null,
    ]),
  ]);
}

// ---------- Soll-Ist je Position ----------

function sollIst(d, p) {
  const zeilen = p.positionen.map((pos) => ({
    nr: pos.nr, name: pos.bezeichnung,
    soll: soll({ schaetzungH: pos.sollH || 0, puffer: p.puffer }),
    ist: ist(d, p.id, pos.nr),
  }));
  // Gebuchte Zeit ohne (oder mit gelöschter) Position
  const bekannt = new Set(p.positionen.map((x) => x.nr));
  const ohne = d.zeiteintraege.filter((z) => z.projektId === p.id && !bekannt.has(z.positionNr)).reduce((a, z) => a + z.stunden, 0);
  if (ohne > 0) zeilen.push({ nr: null, name: p.positionen.length ? 'ohne Position' : 'Projekt gesamt', soll: p.positionen.length ? 0 : soll(p), ist: ohne });

  const skala = Math.max(1, ...zeilen.map((z) => Math.max(z.soll, z.ist))) * 1.15;

  return el('section', { class: 'karte', 'aria-labelledby': 'h-pos' }, [
    el('div', { class: 'knopfreihe grundlinie' }, [
      el('h2', { id: 'h-pos' }, 'Soll-Ist je Position'),
      el('span', { class: 'zeile-text sekundaer' }, 'Balken = Ist, Strich = Soll'),
    ]),
    zeilen.length
      ? el('div', { class: 'mit-abstand-mittel' }, zeilen.map((z) => el('div', { class: 'positionszeile' }, [
          el('div', { class: 'positionsname' }, [
            z.nr != null ? el('span', { class: 'fett zahl' }, `Pos. ${z.nr} `) : null,
            el('span', { class: 'sekundaer' }, z.name),
          ]),
          el('div', { class: 'balken', role: 'img', 'aria-label': `Ist ${zahlText(z.ist)} von ${zahlText(z.soll)} Stunden` }, [
            el('div', { class: `balken-ist${z.soll > 0 && z.ist > z.soll + 0.05 ? ' ueber' : ''}`, style: `width:${Math.min(100, (z.ist / skala) * 100).toFixed(1)}%` }),
            z.soll > 0 ? el('div', { class: 'balken-soll', style: `left:${((z.soll / skala) * 100).toFixed(1)}%` }) : null,
          ]),
          el('div', { class: 'positionswert zahl' }, `${zahlText(z.ist)} / ${zahlText(z.soll)} h`),
        ])))
      : el('p', { class: 'zeile-hinweis' }, 'Noch keine Positionen. Du legst sie unter „Projekt bearbeiten“ an.'),
  ]);
}

// ---------- Zeit buchen ----------

function zeitBuchen(d, p, s) {
  const heute = zustand.heute();
  const datum = s.datum ?? heute;
  if (p.positionen.length && !p.positionen.some((x) => x.nr === s.pos)) s.pos = p.positionen[0].nr;
  if (!p.positionen.length) s.pos = null;

  const meldung = el('div', { class: 'meldung', role: 'status', 'aria-live': 'polite' });
  if (s.letzteBuchung) {
    const b = s.letzteBuchung;
    meldung.append(`Gebucht: ${zahlText(b.stunden)} h${b.positionNr ? ` auf Pos. ${b.positionNr}` : ''}. `,
      el('button', {
        type: 'button', class: 'textknopf',
        onclick: () => { s.letzteBuchung = null; zustand.aendern((x) => { x.zeiteintraege = x.zeiteintraege.filter((z) => z.id !== b.id); }); },
      }, 'Rückgängig'));
  }

  const buchen = () => {
    const schonHeute = d.zeiteintraege.filter((z) => z.datum === datum).reduce((a, z) => a + z.stunden, 0);
    if (schonHeute + s.stunden > 24) {
      s.letzteBuchung = null;
      meldung.className = 'meldung rot';
      meldung.textContent = `An diesem Tag sind schon ${zahlText(schonHeute)} h gebucht. Mehr als 24 h geht nicht.`;
      return;
    }
    const eintrag = { id: neueId(), datum, projektId: p.id, positionNr: s.pos, stunden: s.stunden, notiz: '' };
    s.letzteBuchung = eintrag;
    zustand.aendern((x) => { x.zeiteintraege.push(eintrag); });
  };

  const tagText = datum === heute ? `heute, ${tagKurz(ausText(datum))}` : tagKurz(ausText(datum));
  const datumFeld = el('input', {
    class: 'feld', type: 'date', value: datum, max: heute, 'aria-label': 'Tag der Buchung', 'data-fokus': 'buchung-datum',
    onchange: () => { s.datum = datumFeld.value || null; zustand.neuZeichnen(); },
  });

  const log = d.zeiteintraege.filter((z) => z.projektId === p.id)
    .sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 4);

  return el('section', { class: 'kachel', 'aria-labelledby': 'h-zeit' }, [
    el('h2', { id: 'h-zeit', class: 'label' }, 'Zeit buchen'),
    el('div', { class: 'stapel gross' }, [
      p.positionen.length ? el('div', { class: 'feldgruppe' }, [
        el('span', { id: 'l-pos', class: 'feld-label' }, 'Position'),
        el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-pos' }, p.positionen.map((x) =>
          wahlPille(x.nr, s.pos === x.nr, () => { s.pos = x.nr; zustand.neuZeichnen(); }, { label: `Pos. ${x.nr} ${x.bezeichnung}`, fokus: `pos-${x.nr}`, art: 'zahl' }))),
      ]) : null,
      el('div', { class: 'feldgruppe' }, [
        el('div', { class: 'knopfreihe eng zwischen' }, [
          el('span', { id: 'l-std', class: 'feld-label' }, `Stunden · ${tagText}`),
          el('button', {
            type: 'button', class: 'textknopf', 'aria-expanded': String(s.datumOffen), 'data-fokus': 'buchung-tag',
            onclick: () => { s.datumOffen = !s.datumOffen; zustand.neuZeichnen(); },
          }, s.datumOffen ? 'fertig' : 'anderer Tag'),
        ]),
        s.datumOffen ? datumFeld : null,
        el('div', { role: 'group', 'aria-labelledby': 'l-std' }, [stepper({
          wert: [zahlText(s.stunden), el('span', { class: 'einheit' }, 'h')], breit: true, fokus: 'buchung',
          minus: () => { s.stunden = Math.max(0.5, s.stunden - 0.5); zustand.neuZeichnen(); },
          plus: () => { s.stunden = Math.min(12, s.stunden + 0.5); zustand.neuZeichnen(); },
          minusLabel: 'Eine halbe Stunde weniger', plusLabel: 'Eine halbe Stunde mehr',
        })]),
      ]),
      el('button', { type: 'button', class: 'knopf-gross', onclick: buchen, 'data-fokus': 'buchen' }, 'Buchen'),
    ]),
    meldung,
    el('div', { class: 'mit-abstand-mittel' }, log.map((z) => el('div', { class: 'buchungszeile' }, [
      el('span', { class: 'spalte-kurz sekundaer zahl' }, tagKurz(ausText(z.datum))),
      el('span', { class: 'fuellung' }, z.positionNr ? `Pos. ${z.positionNr}` : 'Projekt'),
      el('span', { class: 'fett-mittel zahl' }, `${zahlText(z.stunden)} h`),
      el('button', {
        type: 'button', class: 'kreuz', 'aria-label': `Buchung ${tagKurz(ausText(z.datum))} ${zahlText(z.stunden)} h löschen`,
        onclick: () => { if (s.letzteBuchung?.id === z.id) s.letzteBuchung = null; zustand.aendern((x) => { x.zeiteintraege = x.zeiteintraege.filter((y) => y.id !== z.id); }); },
      }, [kreuzIcon()]),
    ]))),
  ]);
}

// ---------- Lernwert ----------

/** Empfohlener Puffer aus dem Lernwert: Abweichung in %, auf 0,5 gerundet, 0 bis 20 */
export function empfohlenerPuffer(lw) {
  return Math.max(0, Math.min(20, Math.round(lw.abweichung * 200) / 2));
}

function lernwertKarte(d, p) {
  if (!p.art) return null;
  const lw = lernwerte(d)[p.art];
  const kopf = el('h2', { id: 'h-lern', class: 'label' }, 'Aus abgeschlossenen Projekten');
  if (!lw?.anzeigen) {
    return el('section', { class: 'karte', 'aria-labelledby': 'h-lern' }, [
      kopf,
      el('p', { class: 'kartentext' }, `Für „${p.art}“ gibt es ${lw?.anzahl ?? 0} von ${LERNWERT_AB} abgeschlossenen Projekten. Ab ${LERNWERT_AB} zeigt das Tool hier, wie gut die Schätzungen gepasst haben.`),
    ]);
  }
  const prozent = Math.round(lw.abweichung * 100);
  const empf = empfohlenerPuffer(lw);
  const status = ['abgeschlossen', 'abgesagt'].includes(p.status);
  return el('section', { class: 'karte', 'aria-labelledby': 'h-lern' }, [
    kopf,
    el('div', { class: 'kennzahl zahl mit-abstand-mittel' }, `${prozent > 0 ? '+' : prozent < 0 ? '−' : '±'}${Math.abs(prozent)} %`),
    el('p', { class: 'kartentext dunkel' }, `Bei ${p.art} lag das Ist in ${lw.anzahl} Projekten im Schnitt ${prozent >= 0 ? 'über' : 'unter'} der Schätzung.`),
    status ? null : empf > p.puffer
      ? el('p', { class: 'kartentext' }, `Für diese Projektart ${zahlText(empf)} % Puffer verwenden statt ${zahlText(p.puffer)} %.`)
      : el('p', { class: 'kartentext' }, `Dein Puffer von ${zahlText(p.puffer)} % passt dazu.`),
    !status && empf > p.puffer
      ? el('div', { class: 'knopfreihe' }, [el('button', {
          type: 'button', class: 'pille', 'data-fokus': 'puffer-uebernehmen',
          onclick: () => zustand.aendern((x) => { x.projekte.find((y) => y.id === p.id).puffer = empf; }),
        }, `${zahlText(empf)} % übernehmen`)])
      : null,
  ]);
}
