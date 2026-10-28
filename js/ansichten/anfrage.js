// Anfrage prüfen nach Entwurf Index A (Anfrage.dc.html): links die Eingaben, rechts das Ergebnis
// mit drei Varianten, Wochenbild „So würde die Anfrage eingeplant“ und den Knöpfen zum Merken oder Einplanen.
// Rechnet nur mit den freien Stunden, bestehende Projekte bleiben unverändert. Nie automatisch Samstage oder lange Tage.

import { el, stepper, wahlPille, zahlText, hakenIcon } from '../ui.js';
import * as zustand from '../zustand.js';
import { soll, neueId, STATUS_FEST } from '../kern/daten.js';
import { plane, wochen } from '../kern/planung.js';
import { anfragePruefen } from '../kern/anfrage.js';
import { lernwerte, lernwert } from '../kern/lernwert.js';
import { ausText, alsText, plusTage, tagKurz, isoWoche, montag } from '../kern/datum.js';

const FARBEN = ['#445F6E', '#7C93A0', '#B4C3CC'];
const PX = 3; // 3 px je Stunde, wie im Entwurf
const tagMonat = (d) => d.slice(8, 10) + '.' + d.slice(5, 7) + '.';

let entwurf = null; // bleibt beim Neuzeichnen erhalten, wird beim Seitenwechsel verworfen
/** Beim Seitenwechsel: Entwurf verwerfen – außer nach „Als Anfrage merken“ auf die Seite der neuen Anfrage */
export function anfrageVergessen(pfad) {
  if (entwurf?.projektId && pfad === `anfragen/${entwurf.projektId}`) return;
  entwurf = null;
}

function neuerEntwurf(d, p) {
  return {
    projektId: p?.id ?? null,
    name: p?.name ?? '',
    stunden: p?.schaetzungH || 40,
    puffer: p?.puffer ?? d.einstellungen.standardPuffer,
    start: p?.start && p.start > zustand.heute() ? p.start : zustand.heute(),
    wunsch: p?.deadline || null,
    startWahl: false, wunschWahl: false, geaendert: false, meldung: null,
  };
}

function aktuellerEntwurf(id) {
  const d = zustand.aktuell();
  const p = id ? d.projekte.find((x) => x.id === id) : null;
  if (!entwurf || entwurf.projektId !== (p?.id ?? null)) entwurf = neuerEntwurf(d, p);
  return { d, p, f: entwurf };
}

/** Kopfzeile: Kontext und Status */
export function anfrageKopf(id) {
  const { p, f } = aktuellerEntwurf(id);
  return {
    kontext: p
      ? [p.name, el('span', { class: 'sekundaer' }, ` · ${p.status === 'angebot' ? 'Angebot' : 'Anfrage'}, noch nicht eingeplant`)]
      : ['Anfrage prüfen ', el('span', { class: 'sekundaer' }, '· noch nicht eingeplant')],
    status: p && !f.geaendert ? 'Gespeichert als Anfrage' : 'Entwurf · nicht gespeichert',
  };
}

export function anfrageSeite(id = null) {
  const { d, p, f } = aktuellerEntwurf(id);
  if (id && !p) {
    return el('div', { class: 'seite anfrage-fehlt' }, [
      el('h1', {}, 'Anfrage nicht gefunden'),
      el('a', { href: '#/anfragen' }, 'Neue Anfrage prüfen'),
    ]);
  }
  const opts = zustand.planOptionen();
  const e = d.einstellungen;
  const ergebnis = anfragePruefen(d, { schaetzungH: f.stunden, puffer: f.puffer, start: f.start, wunschtermin: f.wunsch }, opts);
  return el('div', { class: 'anfrage-flaeche' }, [
    eingaben(d, p, f, ergebnis),
    ergebnisSeite(d, p, f, e, opts, ergebnis),
  ]);
}

const neu = (f) => { f.geaendert = true; f.meldung = null; zustand.neuZeichnen(); };

// ---------- Links: Eingaben ----------

function eingaben(d, p, f, ergebnis) {
  const name = el('input', {
    id: 'f-name', class: 'feld', type: 'text', value: f.name, placeholder: 'z. B. Café Rösterei · Entwurfsplanung',
    oninput: () => { f.name = name.value; f.geaendert = true; },
  });

  // Stunden: Stepper in 4er-Schritten, der Wert lässt sich auch eintippen
  const wert = el('input', {
    class: 'stepper-eingabe zahl', type: 'number', min: '1', max: '2000', step: '0.5', inputmode: 'decimal',
    value: String(f.stunden), 'aria-label': 'Geschätzte Stunden', 'data-fokus': 'anfrage-stunden',
    onchange: () => { const v = parseFloat(wert.value); if (v > 0) { f.stunden = Math.round(v * 2) / 2; neu(f); } },
  });

  const vergleich = vergleichswert(d, p);
  const pufferWert = el('div', { class: 'wertbox zahl' }, `${zahlText(f.puffer)} %`);
  const geplant = el('strong', { class: 'fett zahl' }, `${zahlText(ergebnis.sollH)} h`);
  const regler = el('input', {
    id: 'f-buf', type: 'range', min: '0', max: '20', step: '0.5', value: String(f.puffer), class: 'regler breit', 'data-fokus': 'anfrage-puffer',
    oninput: () => {
      f.puffer = Number(regler.value);
      pufferWert.textContent = `${zahlText(f.puffer)} %`;
      geplant.textContent = `${zahlText(soll({ schaetzungH: f.stunden, puffer: f.puffer }))} h`;
    },
    onchange: () => neu(f),
  });

  return el('section', { class: 'anfrage-eingaben', 'aria-labelledby': 'h-in' }, [
    el('div', {}, [
      el('div', { class: 'label' }, p ? (p.status === 'angebot' ? 'Gemerktes Angebot' : 'Gemerkte Anfrage') : 'Neue Anfrage'),
      el('h1', { id: 'h-in', class: 'titel-anfrage mit-abstand' }, 'Passt das rein?'),
    ]),
    el('div', { class: 'feldgruppe' }, [el('label', { for: 'f-name', class: 'feld-label' }, 'Kunde · Projekt'), name]),
    el('div', { class: 'feldgruppe' }, [
      el('span', { id: 'l-h', class: 'feld-label' }, 'Geschätzte Stunden'),
      el('div', { role: 'group', 'aria-labelledby': 'l-h' }, [stepper({
        wert: [wert, el('span', { class: 'einheit' }, 'h')], breit: true, fokus: 'anfrage-h',
        minus: () => { f.stunden = Math.max(4, f.stunden - 4); neu(f); },
        plus: () => { f.stunden = Math.min(2000, f.stunden + 4); neu(f); },
        minusLabel: '4 Stunden weniger', plusLabel: '4 Stunden mehr',
      })]),
      el('div', { class: 'zeile-hinweis' }, vergleich),
    ]),
    el('div', { class: 'feldgruppe' }, [
      el('label', { for: 'f-buf', class: 'feld-label' }, 'Zeitpuffer · 0 bis 20 %'),
      el('div', { class: 'reglerzeile' }, [regler, pufferWert]),
      el('div', { class: 'zeile-text' }, ['Geplant werden ', geplant]),
    ]),
    startAuswahl(f),
    wunschAuswahl(f),
    el('div', { class: 'feldgruppe' }, [
      el('span', { class: 'feld-label' }, 'Status'),
      el('div', { class: 'statuskette', 'aria-label': `Status: ${p?.status === 'angebot' ? 'Angebot' : 'Anfrage'}` }, ['Anfrage', 'Angebot', 'Auftrag', 'Abgeschlossen'].flatMap((s, i) => {
        const aktiv = (p?.status === 'angebot' ? 'Angebot' : 'Anfrage') === s;
        return [i ? el('span', { class: 'statuskette-pfeil', 'aria-hidden': 'true' }, '›') : null, el('span', { class: `statuskette-schritt${aktiv ? ' aktiv' : ''}` }, s)];
      })),
    ]),
  ]);
}

/** „Schätzung lag im Schnitt 12 % unter Ist“ – aus abgeschlossenen Projekten der Art, sonst aus allen Arten mit genug Projekten */
function vergleichswert(d, p) {
  let lw = p?.art ? lernwert(d, p.art) : null;
  if (!lw) {
    const alle = Object.values(lernwerte(d)).filter((x) => x.anzeigen);
    const n = alle.reduce((s, x) => s + x.anzahl, 0);
    if (n) lw = { abweichung: alle.reduce((s, x) => s + x.abweichung * x.anzahl, 0) / n };
  }
  if (!lw) return 'Noch kein Vergleichswert. Dafür braucht es 3 abgeschlossene Projekte einer Art.';
  const pct = Math.abs(Math.round(lw.abweichung * 100));
  if (pct === 0) return 'Vergleichswert aus ähnlichen Projekten: Schätzung und Ist lagen im Schnitt gleichauf.';
  return `Vergleichswert aus ähnlichen Projekten: Schätzung lag im Schnitt ${pct} % ${lw.abweichung > 0 ? 'unter' : 'über'} Ist.`;
}

function montagText(d) { return alsText(montag(ausText(d))); }

function startAuswahl(f) {
  const heute = zustand.heute();
  const mo = montag(ausText(heute));
  const optionen = [{ datum: heute, text: 'sofort' }];
  for (const w of [1, 4, 10]) {
    const d = alsText(plusTage(mo, 7 * w));
    optionen.push({ datum: d, text: `KW ${isoWoche(ausText(d)).woche} · ${tagMonat(d)}` });
  }
  if (!optionen.some((o) => o.datum === f.start)) optionen.push({ datum: f.start, text: `${tagKurz(ausText(f.start))}` });
  const feld = el('input', {
    class: 'feld', type: 'date', value: f.start, min: heute, 'aria-label': 'Frühester Start', 'data-fokus': 'anfrage-start-datum',
    onchange: () => { if (feld.value) { f.start = feld.value; f.startWahl = false; neu(f); } },
  });
  return el('div', { class: 'feldgruppe' }, [
    el('span', { id: 'l-s', class: 'feld-label' }, 'Frühester Start'),
    el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-s' }, [
      ...optionen.map((o) => wahlPille(o.text, o.datum === f.start, () => { f.start = o.datum; neu(f); }, { art: 'breit', fokus: `start-${o.datum}` })),
      wahlPille('Datum …', f.startWahl, () => { f.startWahl = !f.startWahl; zustand.neuZeichnen(); }, { art: 'breit', fokus: 'start-wahl' }),
    ]),
    f.startWahl ? feld : null,
  ]);
}

function wunschAuswahl(f) {
  // Freitage eine, zwei und sechs Wochen nach dem Start
  const fr = plusTage(montag(ausText(f.start)), 4);
  const optionen = [1, 2, 6].map((w) => alsText(plusTage(fr, 7 * w)));
  if (f.wunsch && !optionen.includes(f.wunsch)) optionen.push(f.wunsch);
  optionen.sort();
  const feld = el('input', {
    class: 'feld', type: 'date', value: f.wunsch ?? '', min: f.start, 'aria-label': 'Wunschtermin', 'data-fokus': 'anfrage-wunsch-datum',
    onchange: () => { if (feld.value) { f.wunsch = feld.value; f.wunschWahl = false; neu(f); } },
  });
  return el('div', { class: 'feldgruppe' }, [
    el('span', { id: 'l-w', class: 'feld-label' }, 'Wunschtermin des Kunden'),
    el('div', { class: 'wahlreihe', role: 'group', 'aria-labelledby': 'l-w' }, [
      ...optionen.map((d) => wahlPille(tagKurz(ausText(d)), d === f.wunsch, () => { f.wunsch = d; neu(f); }, { art: 'breit zahl', fokus: `wunsch-${d}` })),
      wahlPille('offen', !f.wunsch, () => { f.wunsch = null; neu(f); }, { art: 'breit', fokus: 'wunsch-offen' }),
      wahlPille('Datum …', f.wunschWahl, () => { f.wunschWahl = !f.wunschWahl; zustand.neuZeichnen(); }, { art: 'breit', fokus: 'wunsch-wahl' }),
    ]),
    f.wunschWahl ? feld : null,
  ]);
}

// ---------- Rechts: Ergebnis ----------

function variantenInfo(e) {
  return {
    regulaer: { name: `Regulär · ${zahlText(e.regeltagH)} h`, wie: `Nur freie Stunden im ${zahlText(e.regeltagH)}-Stunden-Tag, Mo–Fr.` },
    samstag: { name: 'Samstage', wie: `Zusätzlich je Woche ein Samstag mit ${zahlText(e.samstagH)} h.` },
    langerTag: { name: 'Längere Tage', wie: `Mo–Fr bis ${zahlText(e.maxTagH)} h. Zählt zur Warnung „über ${zahlText(e.regeltagH)} h in Folge“.` },
  };
}

function ergebnisSeite(d, p, f, e, opts, ergebnis) {
  const info = variantenInfo(e);
  const samstagAus = e.samstagErlaubt === 'nie';
  const varianten = ergebnis.varianten.map((v) => ({ ...v, ...info[v.art], gesperrt: v.art === 'samstag' && samstagAus }));
  const halten = varianten.filter((v) => v.haeltWunsch && !v.gesperrt);
  const empfohlen = (f.wunsch ? halten[0] : null) ?? varianten[0];
  const datum = (v) => (v.fertig ? tagKurz(ausText(v.fertig)) : 'nicht im Plan');

  let text;
  const geplant = `${zahlText(ergebnis.sollH)} h`;
  if (!f.wunsch) text = `${geplant} passen ab ${tagKurz(ausText(ergebnis.start))} in die freie Zeit – ohne Mehrarbeit.`;
  else if (halten.length) text = `${geplant} passen bis zum Wunschtermin ${tagKurz(ausText(f.wunsch))}${empfohlen.art === 'regulaer' ? ' – ohne Mehrarbeit.' : ' – aber nur mit Mehrarbeit.'}`;
  else text = `Der Wunschtermin ${tagKurz(ausText(f.wunsch))} ist mit keiner Variante zu halten. Termin mit dem Kunden neu abstimmen.`;

  const karten = varianten.map((v) => {
    const empf = v === empfohlen;
    let chip = null;
    if (v.gesperrt) chip = el('span', { class: 'chip' }, 'in den Einstellungen aus');
    else if (f.wunsch && v.haeltWunsch) chip = el('span', { class: 'chip gruen' }, [hakenIcon(10), 'hält Wunschtermin']);
    else if (f.wunsch && v.fertig) chip = el('span', { class: 'chip rot' }, `${v.tageZuSpaet} ${v.tageZuSpaet === 1 ? 'Tag' : 'Tage'} nach Wunschtermin`);
    else if (f.wunsch) chip = el('span', { class: 'chip rot' }, 'außerhalb des Plans');
    return el('div', { class: `kachel variante${empf ? ' empfohlen' : ''}` }, [
      el('div', { class: 'knopfreihe eng variante-kopf' }, [
        el('span', { class: 'label' }, v.name),
        empf ? el('span', { class: 'chip stahl' }, 'Empfohlen') : null,
      ]),
      el('div', { class: 'kennzahl klein zahl' }, datum(v)),
      el('div', { class: 'kartentext ohne-abstand' }, v.wie),
      chip ? el('div', { class: 'mit-abstand-12' }, chip) : null,
    ]);
  });

  return el('div', { class: 'anfrage-ergebnis' }, [
    el('div', {}, [
      el('div', { class: 'label' }, 'Ergebnis'),
      el('h2', { class: 'titel-1 mit-abstand' }, `Realistisch fertig: ${datum(empfohlen)}`),
      el('p', { class: 'einleitung' }, text),
    ]),
    el('div', { class: 'raster-kacheln breit' }, karten),
    einplanBild(d, opts, ergebnis, empfohlen, e),
    abschluss(d, p, f, ergebnis, empfohlen),
  ]);
}

function einplanBild(d, opts, ergebnis, v, e) {
  const plan = plane(d, opts);
  const liste = wochen(plan, plan.heute, 12);
  // so viele Wochen zeigen, dass das Ende der Anfrage drin ist (höchstens 26)
  const ende = v.fertig ? montagText(v.fertig) : null;
  const anzahl = ende && ende > liste[liste.length - 1].montag
    ? Math.min(26, Math.ceil((ausText(ende) - ausText(liste[0].montag)) / (7 * 86400000)) + 2)
    : 12;
  const alle = anzahl > 12 ? wochen(plan, plan.heute, anzahl) : liste;

  const spalten = alle.map((w) => {
    const dazu = v.wochen.find((x) => x.schluessel === w.schluessel)?.stunden || 0;
    const arbeitstage = w.regelKap / e.regeltagH;
    let kap = w.regelKap;
    if (v.art === 'langerTag') kap += arbeitstage * (e.maxTagH - e.regeltagH);
    if (v.art === 'samstag' && kap > 0) kap += e.samstagH;
    const frei = w.regelKap === 0;
    return el('div', { class: 'woche schmal' }, [
      el('div', {
        class: 'woche-saeule niedrig', role: 'img',
        'aria-label': `KW ${w.kw}: ${zahlText(w.summeH)} h verplant${dazu ? `, ${zahlText(dazu)} h für diese Anfrage` : ''}`,
      }, [
        el('div', { class: 'seg seg-verplant', style: `height:${Math.min(w.summeH, 64) * PX}px` }),
        dazu > 0.05 ? el('div', { class: 'seg seg-anfrage seg-zahl zahl', style: `height:${Math.max(12, dazu * PX)}px` }, zahlText(dazu, 0)) : null,
        kap > 0 ? el('div', { class: 'kap-linie', style: `bottom:${kap * PX}px`, 'aria-hidden': 'true' }) : null,
        frei ? el('div', { class: 'woche-frei' }) : null,
      ]),
      el('div', { class: 'woche-kw' }, `KW ${w.kw}`),
      el('div', { class: 'woche-klein zahl' }, tagMonat(w.montag)),
    ]);
  });

  return el('section', { class: 'karte', 'aria-labelledby': 'h-fit' }, [
    el('div', { class: 'knopfreihe grundlinie' }, [
      el('h3', { id: 'h-fit', class: 'titel-2' }, 'So würde die Anfrage eingeplant'),
      el('span', { class: 'zeile-text sekundaer' }, `Variante „${v.name}“ · nur freie Stunden, bestehende Projekte bleiben unverändert`),
    ]),
    el('div', { class: 'legende' }, [
      el('span', { class: 'legende-eintrag' }, [el('span', { class: 'legende-farbe seg-verplant', 'aria-hidden': 'true' }), 'bereits verplant']),
      el('span', { class: 'legende-eintrag' }, [el('span', { class: 'legende-farbe seg-anfrage', 'aria-hidden': 'true' }), 'diese Anfrage']),
      el('span', { class: 'legende-eintrag' }, [el('span', { class: 'legende-linie', 'aria-hidden': 'true' }), 'Kapazität der Variante']),
    ]),
    el('div', { class: 'scrollkasten mit-abstand-gross' }, [
      el('div', { class: 'wochen', style: `min-width:${Math.max(640, alle.length * 52)}px` }, spalten),
    ]),
  ]);
}

function abschluss(d, p, f, ergebnis, empfohlen) {
  const meldung = f.meldung ? el('div', { class: `meldung ${f.meldung.art}`, role: 'status' }, f.meldung.text) : null;
  return el('div', {}, [
    el('div', { class: 'knopfreihe abschluss' }, [
      el('span', { class: 'zeile-text sekundaer fuellung abschluss-text' }, 'Gespeichert als Anfrage wird das Projekt gestrichelt im Plan gezeigt, zählt aber nicht zur Auslastung.'),
      el('button', { type: 'button', class: 'pille gross', 'data-fokus': 'anfrage-merken', onclick: () => speichern(p, f, ergebnis, empfohlen, false) }, 'Als Anfrage merken'),
      el('button', { type: 'button', class: 'pille haupt gross', 'data-fokus': 'anfrage-einplanen', onclick: () => speichern(p, f, ergebnis, empfohlen, true) }, [
        'Als Auftrag einplanen',
        el('span', { 'aria-hidden': 'true', class: 'icon', html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' }),
      ]),
    ]),
    meldung,
  ]);
}

async function speichern(p, f, ergebnis, empfohlen, alsAuftrag) {
  if (!f.name.trim()) {
    f.meldung = { art: 'rot', text: 'Gib der Anfrage einen Namen (Kunde · Projekt).' };
    zustand.neuZeichnen();
    document.getElementById('f-name')?.focus();
    return;
  }
  // Deadline: der Wunschtermin. Ohne Wunschtermin beim Einplanen das realistische Datum der regulären Variante.
  const deadline = f.wunsch || (alsAuftrag ? ergebnis.varianten[0].fertig : '') || '';
  const [kunde] = f.name.split(' · ');
  const werte = {
    name: f.name.trim(), schaetzungH: f.stunden, puffer: f.puffer, start: f.start, deadline,
    status: alsAuftrag ? 'auftrag' : (p?.status === 'angebot' ? 'angebot' : 'anfrage'),
  };
  const id = p?.id ?? neueId();
  await zustand.aendern((d) => {
    const alt = d.projekte.find((x) => x.id === id);
    if (alt) {
      if (alt.deadline && deadline && alt.deadline !== deadline) {
        d.meilensteine.forEach((m) => { if (m.projektId === id && m.typ === 'deadline' && m.datum === alt.deadline) m.datum = deadline; });
      }
      Object.assign(alt, werte);
    } else {
      d.projekte.push({ id, nr: '', kunde: kunde.trim(), art: '', prioritaet: 2, positionen: [], farbe: '', ...werte });
    }
    const projekt = d.projekte.find((x) => x.id === id);
    if (alsAuftrag) {
      if (!projekt.farbe) projekt.farbe = FARBEN[d.projekte.filter((x) => STATUS_FEST.includes(x.status)).length % FARBEN.length];
      if (deadline && !d.meilensteine.some((m) => m.projektId === id && m.typ === 'deadline')) {
        d.meilensteine.push({ id: neueId(), projektId: id, datum: deadline, titel: 'Abgabe', typ: 'deadline', notiz: '', erledigt: false, erinnerungTage: [7, 2] });
      }
    }
  });
  if (alsAuftrag) {
    entwurf = null;
    location.hash = `#/projekte/${id}`;
  } else {
    f.geaendert = false;
    f.meldung = { art: 'gruen', text: 'Als Anfrage gemerkt. Du findest sie unter Projekte → Anfragen und gestrichelt in der Übersicht.' };
    if (!p) { entwurf.projektId = id; location.hash = `#/anfragen/${id}`; } else zustand.neuZeichnen();
  }
}

