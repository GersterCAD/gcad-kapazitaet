// Export und Import als kapazitaet-daten.json. Beim Export wird automatisch eine Sicherung im Browser abgelegt.

import * as speicher from './speicher.js';
import * as zustand from './zustand.js';
import { pruefeDaten } from './kern/daten.js';

export function dateiname() {
  return zustand.istBeispiel() ? 'kapazitaet-daten-beispiel.json' : 'kapazitaet-daten.json';
}

export async function exportieren() {
  const daten = zustand.aktuell();
  await speicher.sicherungAnlegen(zustand.aktiverSatz(), daten, 'export');
  const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: dateiname() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Datei lesen und prüfen. Gibt { ok, fehler, daten } zurück, ersetzt noch nichts. */
export async function dateiPruefen(datei) {
  let roh;
  try {
    roh = JSON.parse(await datei.text());
  } catch {
    return { ok: false, fehler: ['Die Datei ist kein gültiges JSON.'], daten: null };
  }
  return pruefeDaten(roh);
}

export const importieren = (daten) => zustand.ersetzen(daten, 'import');

export async function wiederherstellen(nr) {
  const s = await speicher.sicherungLaden(nr);
  const p = pruefeDaten(s.daten);
  if (!p.daten) throw new Error(p.fehler.join(' '));
  await zustand.ersetzen(p.daten, 'wiederherstellen');
}
