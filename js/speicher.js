// Speicherung im Browser (IndexedDB). Stufe 1: alles bleibt auf diesem Gerät.
// Zwei Datensätze: „echt“ (deine Daten) und „beispiel“ (zum Ausprobieren). Sie mischen sich nie.

const DB_NAME = 'gcad-kapazitaet';
const DB_VERSION = 1;
const MAX_SICHERUNGEN = 20;

let dbVersprechen;

function db() {
  dbVersprechen ??= new Promise((ok, fehler) => {
    const anfrage = indexedDB.open(DB_NAME, DB_VERSION);
    anfrage.onupgradeneeded = () => {
      const d = anfrage.result;
      d.createObjectStore('saetze');                                  // Schlüssel: 'echt' | 'beispiel'
      d.createObjectStore('meta');                                    // z. B. 'aktiverSatz'
      d.createObjectStore('sicherungen', { keyPath: 'nr', autoIncrement: true });
    };
    anfrage.onsuccess = () => ok(anfrage.result);
    anfrage.onerror = () => fehler(anfrage.error);
  });
  return dbVersprechen;
}

function vorgang(store, modus, arbeit) {
  return db().then((d) => new Promise((ok, fehler) => {
    const t = d.transaction(store, modus);
    const ergebnis = arbeit(t.objectStore(store));
    t.oncomplete = () => ok(ergebnis?.result);
    t.onerror = () => fehler(t.error);
    t.onabort = () => fehler(t.error);
  }));
}

export const satzLaden = (name) => vorgang('saetze', 'readonly', (s) => s.get(name));
export const satzSpeichern = (name, daten) => vorgang('saetze', 'readwrite', (s) => s.put(daten, name));
export const satzLoeschen = (name) => vorgang('saetze', 'readwrite', (s) => s.delete(name));

export const metaLaden = (k) => vorgang('meta', 'readonly', (s) => s.get(k));
export const metaSpeichern = (k, v) => vorgang('meta', 'readwrite', (s) => s.put(v, k));

/** Sicherung ablegen. anlass: 'export' | 'import' | 'wiederherstellen'. Behält die letzten 20. */
export async function sicherungAnlegen(satz, daten, anlass) {
  await vorgang('sicherungen', 'readwrite', (s) => s.add({ zeit: new Date().toISOString(), satz, anlass, daten }));
  const alle = await sicherungenListe();
  const alt = alle.slice(MAX_SICHERUNGEN);
  if (alt.length) await vorgang('sicherungen', 'readwrite', (s) => alt.forEach((x) => s.delete(x.nr)));
}

/** Alle Sicherungen, neueste zuerst */
export async function sicherungenListe() {
  const alle = await vorgang('sicherungen', 'readonly', (s) => s.getAll());
  return (alle || []).sort((a, b) => b.nr - a.nr);
}

export const sicherungLaden = (nr) => vorgang('sicherungen', 'readonly', (s) => s.get(nr));

/** Browser bitten, die Daten nicht von selbst zu löschen (Safari räumt sonst nach 7 Tagen ohne Nutzung auf). */
export async function dauerhaftAnfragen() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
