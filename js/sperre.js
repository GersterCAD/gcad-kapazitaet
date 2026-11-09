// App-Sperre mit PIN, je Gerät. Ist sie an, liegt der GitHub-Token nur verschlüsselt auf dem Gerät (meta.sperre);
// ohne PIN ist er wertlos. Die App sperrt sich nach der eingestellten Zeit ohne Nutzung und spätestens einmal am Tag,
// nicht bei jedem Start: Dafür bleibt der nicht auslesbare Schlüssel so lange in meta.sperreSitzung.

import * as speicher from './speicher.js';
import * as github from './github.js';
import { alsText } from './kern/datum.js';
import {
  STANDARD_MINUTEN, neuerTresor, schluesselAus, tresorOeffnen, tresorSchreiben, sperreFaellig, wartezeitSek,
} from './kern/pin.js';

const PRUEFEN_MS = 15000;
const MERKEN_MS = 60000;

let stand = null;          // { tresor, minuten, fehlversuche, warteBis }
let schluessel = null;     // nur im Speicher, solange entsperrt (und in der Sitzung)
let gesperrtJetzt = false;
let letzteNutzung = 0, tag = '', gemerkt = 0;
const hoerer = new Set();

export const aktiv = () => !!stand;
export const gesperrt = () => gesperrtJetzt;
export const minuten = () => stand?.minuten ?? STANDARD_MINUTEN;
export function abonnieren(f) { hoerer.add(f); return () => hoerer.delete(f); }
const melden = () => hoerer.forEach((f) => f());

const heute = () => alsText(new Date());
const standMerken = () => speicher.metaSpeichern('sperre', stand);
const sitzungVergessen = () => speicher.metaSpeichern('sperreSitzung', null);
const inhalt = (token) => JSON.stringify({ token: token ?? null });

function sitzungMerken() {
  gemerkt = Date.now();
  return speicher.metaSpeichern('sperreSitzung', { schluessel, letzteNutzung, tag }).catch(() => {}); // geht es nicht, fragt die App beim nächsten Start
}

/** Wird von github.js aufgerufen, wenn sich der Token ändert */
async function tokenAblegen(token) {
  stand = { ...stand, tresor: await tresorSchreiben(schluessel, stand.tresor, inhalt(token)) };
  await standMerken();
}

function aufschliessen(k, token, tagWert = heute()) {
  schluessel = k;
  letzteNutzung = Date.now();
  tag = tagWert;
  gesperrtJetzt = false;
  github.tokenSetzen(token);
  return sitzungMerken();
}

/** Beim Start, nach github.starten() */
export async function starten() {
  stand = (await speicher.metaLaden('sperre')) ?? null;
  if (!stand) return;
  github.schutzSetzen(tokenAblegen);
  gesperrtJetzt = true;
  const s = await speicher.metaLaden('sperreSitzung');
  if (s?.schluessel && !sperreFaellig({ jetzt: Date.now(), letzteNutzung: s.letzteNutzung, minuten: minuten(), tag: s.tag, heute: heute() })) {
    try {
      const { token } = JSON.parse(await tresorOeffnen(s.schluessel, stand.tresor));
      await aufschliessen(s.schluessel, token, s.tag);
      return;
    } catch { /* passt nicht mehr, also PIN abfragen */ }
  }
  await sitzungVergessen();
}

export function sperren() {
  if (!stand || gesperrtJetzt) return;
  schluessel = null;
  gesperrtJetzt = true;
  github.tokenSetzen(null);
  sitzungVergessen().catch(() => {});
  melden();
}

/** Sekunden, die noch gewartet werden muss */
export const wartenSek = () => (stand?.warteBis ? Math.max(0, Math.ceil((stand.warteBis - Date.now()) / 1000)) : 0);

async function pruefen(pin) {
  const k = await schluesselAus(pin, stand.tresor);
  const { token } = JSON.parse(await tresorOeffnen(k, stand.tresor));
  return { k, token };
}

/** PIN eingeben. Gibt { ok } oder { ok: false, warte, gesperrt } zurück (gesperrt: gar nicht geprüft, weil noch Wartezeit läuft). */
export async function entsperren(pin) {
  const warte = wartenSek();
  if (warte > 0) return { ok: false, warte, gesperrt: true };
  let r;
  try { r = await pruefen(pin); } catch {
    const fehlversuche = (stand.fehlversuche ?? 0) + 1;
    const sek = wartezeitSek(fehlversuche);
    stand = { ...stand, fehlversuche, warteBis: sek ? Date.now() + sek * 1000 : 0 };
    await standMerken();
    return { ok: false, warte: sek };
  }
  stand = { ...stand, fehlversuche: 0, warteBis: 0 };
  await standMerken();
  await aufschliessen(r.k, r.token);
  melden();
  return { ok: true };
}

/** PIN festlegen: der Token wandert in den Tresor */
export async function pinFestlegen(pin) {
  const n = await neuerTresor(pin, inhalt(github.token()));
  stand = { tresor: n.tresor, minuten: minuten(), fehlversuche: 0, warteBis: 0 };
  await standMerken();
  schluessel = n.schluessel;
  github.schutzSetzen(tokenAblegen);
  await github.neuAblegen();
  await aufschliessen(n.schluessel, github.token());
}

/** PIN ändern. Gibt false zurück, wenn die alte PIN nicht stimmt. */
export async function pinAendern(alt, neu) {
  try { await pruefen(alt); } catch { return false; }
  await pinFestlegen(neu);
  return true;
}

/** Sperre entfernen: der Token liegt danach wieder unverschlüsselt auf dem Gerät. */
export async function pinEntfernen(pin) {
  try { await pruefen(pin); } catch { return false; }
  github.schutzSetzen(null);
  await github.neuAblegen();
  stand = null;
  schluessel = null;
  await speicher.metaSpeichern('sperre', null);
  await sitzungVergessen();
  return true;
}

export async function minutenSetzen(m) {
  stand = { ...stand, minuten: m };
  await standMerken();
}

/** PIN vergessen: Zugang und alle Daten auf diesem Gerät löschen. Das private Repo bleibt unberührt. */
export async function geraetZuruecksetzen() {
  for (const k of ['sperre', 'sperreSitzung', 'github', 'abgleich', 'abgleichKonflikt', 'kalender', 'lexware', 'woche', 'aktiverSatz']) await speicher.metaSpeichern(k, null);
  await speicher.satzLoeschen('echt');
  await speicher.satzLoeschen('beispiel');
  await speicher.sicherungenLoeschen();
}

function nutzung() {
  if (!stand || gesperrtJetzt) return;
  letzteNutzung = Date.now();
  if (letzteNutzung - gemerkt >= MERKEN_MS) sitzungMerken();
}

function pruefeSperre() {
  if (!stand || gesperrtJetzt) return;
  if (sperreFaellig({ jetzt: Date.now(), letzteNutzung, minuten: minuten(), tag, heute: heute() })) sperren();
}

/** Nutzung beobachten und rechtzeitig sperren. Einmal beim Start. */
export function beobachten() {
  for (const art of ['pointerdown', 'keydown', 'wheel', 'touchmove']) document.addEventListener(art, nutzung, { capture: true, passive: true });
  setInterval(pruefeSperre, PRUEFEN_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pruefeSperre();
    else if (stand && !gesperrtJetzt) sitzungMerken();
  });
  window.addEventListener('pageshow', pruefeSperre);
}
