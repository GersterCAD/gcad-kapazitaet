// Termin vorbei → auf ein Projekt buchen? Ohne Oberfläche, ohne DOM.
// Gefragt wird nur bei Kalendern mit „nachfragen“ (Standard: der erste Kalender, Gerster CAD), bei Terminen mit Uhrzeit,
// die in den letzten 3 Tagen zu Ende gegangen sind und noch kein Projekt und kein „nicht buchen“ haben.

import { alsText } from './datum.js';
import { neueId } from './daten.js';

export const NACHFRAGEN_TAGE = 3;
const runde2 = (x) => Math.round(x * 100) / 100;
const AKTIV = ['auftrag', 'laeuft'];

/** Fragt die App bei diesem Kalender nach? */
export function kalenderFragt(daten, name) {
  const liste = daten.einstellungen.kalender ?? [];
  const k = liste.find((x) => x.name === name);
  if (k?.regel === 'ignorieren') return false;
  return k?.nachfragen ?? (liste[0]?.name === name);
}

/** Dauer eines Termins in Stunden (eigene Stunden aus der Terminregel gehen vor) */
export function terminStunden(daten, t) {
  const regel = daten.terminRegeln.find((r) => r.uid === t.uid);
  if (regel?.zaehltH != null) return regel.zaehltH;
  return runde2(Math.max(0, (new Date(t.ende ?? t.start) - new Date(t.start)) / 3600000));
}

/** Passendes Projekt zum Titel: gleiche Wörter in Name, Kunde oder Nummer. null, wenn nichts passt. */
export function projektVorschlag(daten, titel) {
  const woerter = (s) => (s ?? '').toLowerCase().split(/[^a-z0-9äöüß-]+/).filter((w) => w.length >= 4);
  const im = new Set(woerter(titel));
  let best = null, bestPunkte = 0;
  for (const p of daten.projekte.filter((x) => AKTIV.includes(x.status))) {
    const punkte = [...new Set([...woerter(p.name), ...woerter(p.kunde), ...(p.nr ? [p.nr.toLowerCase()] : [])])].filter((w) => im.has(w)).length;
    if (punkte > bestPunkte) { best = p; bestPunkte = punkte; }
  }
  return best;
}

/** Termine, nach denen gefragt wird: [{ termin, stunden, vorschlag }], neueste zuerst */
export function offeneTermine(daten, termine = [], jetzt = new Date(), tage = NACHFRAGEN_TAGE) {
  const ab = new Date(jetzt.getTime() - tage * 86400000);
  return termine
    .filter((t) => !t.ganztaegig && t.ende && new Date(t.ende) <= jetzt && new Date(t.ende) >= ab)
    .filter((t) => kalenderFragt(daten, t.kalender))
    .filter((t) => { const r = daten.terminRegeln.find((x) => x.uid === t.uid); return !r?.projektId && !r?.keinProjekt; })
    .sort((a, b) => b.ende.localeCompare(a.ende))
    .map((t) => ({ termin: t, stunden: terminStunden(daten, t), vorschlag: projektVorschlag(daten, t.titel) }));
}

/** Termin auf ein Projekt buchen (ändert daten): Terminregel mit projektId, Zeiteintrag mit terminUid (zählt als Ist) */
export function terminBuchen(daten, t, projektId, stunden = terminStunden(daten, t)) {
  const alt = daten.terminRegeln.find((r) => r.uid === t.uid);
  daten.terminRegeln = daten.terminRegeln.filter((r) => r.uid !== t.uid);
  daten.zeiteintraege = daten.zeiteintraege.filter((z) => z.terminUid !== t.uid);
  daten.terminRegeln.push({ uid: t.uid, zaehltH: alt?.zaehltH ?? null, projektId });
  const z = { id: neueId(), datum: alsText(new Date(t.start)), projektId, positionNr: null, stunden: Math.min(24, stunden), notiz: `Termin: ${t.titel}`, terminUid: t.uid };
  daten.zeiteintraege.push(z);
  return z;
}

/** Nicht nachfragen: Termin gehört zu keinem Projekt (ändert daten) */
export function terminNichtBuchen(daten, uid) {
  const r = daten.terminRegeln.find((x) => x.uid === uid);
  if (r) r.keinProjekt = true;
  else daten.terminRegeln.push({ uid, zaehltH: null, projektId: null, keinProjekt: true });
}
