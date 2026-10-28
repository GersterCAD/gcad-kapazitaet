// Abgleich der Kapazitätsdaten zwischen Geräten über das private Repo (Datei kapazitaet-daten.json).
// Nur der echte Datensatz, nie die Beispieldaten. Drei-Wege-Zusammenführung mit dem Stand des letzten Abgleichs:
// Wurde derselbe Eintrag auf zwei Geräten verschieden geändert, hält der Abgleich an und fragt nach.

import * as speicher from './speicher.js';
import * as github from './github.js';
import * as zustand from './zustand.js';
import { pruefeDaten } from './kern/daten.js';
import { zusammenfuehren, konflikteLoesen, datenGleich } from './kern/abgleich.js';

const DATEI = 'kapazitaet-daten.json';

let basis = { daten: null, sha: null, zuletzt: null }; // Stand beim letzten Abgleich (meta 'abgleich')
let lage = { laeuft: false, fehler: null, konflikt: null, wartet: false };
const hoerer = new Set();
const melden = () => hoerer.forEach((f) => f());

export const abonnieren = (f) => { hoerer.add(f); return () => hoerer.delete(f); };
export const info = () => ({ ...lage, zuletzt: basis.zuletzt, aktiv: github.verbunden() && !zustand.istBeispiel() });

export async function starten() {
  basis = (await speicher.metaLaden('abgleich')) ?? basis;
  lage.konflikt = (await speicher.metaLaden('abgleichKonflikt')) ?? null;
}

const merken = () => speicher.metaSpeichern('abgleich', basis);
const konfliktMerken = () => speicher.metaSpeichern('abgleichKonflikt', lage.konflikt);

function geraet() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Gerät';
}

/** Ein Abgleich: holen, zusammenführen, lokal übernehmen, zurückschreiben. */
export async function abgleichen() {
  if (!github.verbunden() || zustand.istBeispiel()) return;
  if (lage.konflikt) { melden(); return; }
  if (lage.laeuft) { lage.wartet = true; return; }
  lage = { ...lage, laeuft: true, fehler: null, wartet: false };
  melden();
  try {
    for (let versuch = 0; versuch < 4; versuch++) {
      if (zustand.istBeispiel()) return;
      const lokal = zustand.aktuell();
      const r = await github.dateiMitVersion(DATEI);
      let entfernt = null;
      if (r) {
        let roh;
        try { roh = JSON.parse(r.text); } catch { throw new Error('Die Datei im Repo ist beschädigt (kein JSON).'); }
        const p = pruefeDaten(roh);
        if (!p.daten) throw new Error(`Die Datei im Repo passt nicht: ${p.fehler[0]}`);
        entfernt = p.daten;
      }

      let ziel;
      if (!entfernt || r.sha === basis.sha || datenGleich(entfernt, basis.daten)) {
        ziel = lokal; // im Repo hat sich seit dem letzten Abgleich nichts geändert
      } else {
        const erg = zusammenfuehren(basis.daten, lokal, entfernt);
        if (erg.konflikte.length) {
          if (zustand.aktuell() !== lokal) continue; // inzwischen hier geändert: neu rechnen
          lage.konflikt = { ergebnis: erg, sha: r.sha, entfernt, zeit: new Date().toISOString() };
          await konfliktMerken();
          return;
        }
        ziel = erg.daten;
      }

      if (zustand.aktuell() !== lokal) continue; // während des Ladens geändert: noch einmal
      if (!datenGleich(ziel, lokal)) await zustand.ersetzen(ziel, 'abgleich');

      let sha = r?.sha ?? null;
      if (!entfernt || !datenGleich(ziel, entfernt)) {
        const w = await github.dateiSchreiben(DATEI, JSON.stringify(ziel, null, 1) + '\n', sha, `Abgleich vom ${geraet()}`);
        if (w.veraltet) continue; // ein anderes Gerät war schneller
        sha = w.sha;
      }
      basis = { daten: ziel, sha, zuletzt: new Date().toISOString() };
      await merken();
      return;
    }
    throw new Error('Die Daten im Repo ändern sich gerade laufend. Gleich noch einmal versuchen.');
  } catch (f) {
    lage.fehler = f.message;
  } finally {
    lage.laeuft = false;
    melden();
    if (lage.wartet && !lage.konflikt) abgleichen();
  }
}

/** Konflikte entscheiden: wahl = { [schluessel]: 'lokal' | 'entfernt' } */
export async function loesen(wahl) {
  const k = lage.konflikt;
  if (!k) return;
  const daten = konflikteLoesen(k.ergebnis, wahl);
  await zustand.ersetzen(daten, 'abgleich');
  lage.konflikt = null;
  await konfliktMerken();
  // Der entschiedene Stand beruht auf dem Repo-Stand k.sha – so wird er dort direkt gespeichert
  basis = { daten: k.entfernt, sha: k.sha, zuletzt: basis.zuletzt };
  await merken();
  await abgleichen();
}

/** Verbindung getrennt oder anderes Repo: Abgleichstand vergessen */
export async function vergessen() {
  basis = { daten: null, sha: null, zuletzt: null };
  lage = { laeuft: false, fehler: null, konflikt: null, wartet: false };
  await merken(); await konfliktMerken();
  melden();
}

/** Automatisch: beim Start, kurz nach jeder Änderung, alle 5 Minuten, beim Zurückkehren und wenn das Netz wieder da ist */
export function automatisch() {
  let zeitgeber = null;
  const bald = (ms = 2000) => { clearTimeout(zeitgeber); zeitgeber = setTimeout(abgleichen, ms); };
  zustand.beiAenderung((anlass) => { if (anlass !== 'abgleich') bald(); });
  setInterval(() => abgleichen(), 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') bald(300); });
  window.addEventListener('online', () => bald(300));
  abgleichen();
}
