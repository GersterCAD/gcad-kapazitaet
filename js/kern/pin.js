// App-Sperre: PIN prüfen und den Zugang zu GitHub damit verschlüsseln (PBKDF2 + AES-GCM). Ohne Oberfläche, ohne DOM.
// Die PIN wird nie gespeichert. Der Schlüssel daraus ist nicht auslesbar (extractable: false).

const ITERATIONEN = 600000;
export const STANDARD_MINUTEN = 30;
export const SPERR_MINUTEN = [5, 15, 30, 60];
const WARTEN_AB = 5;

const subtle = () => globalThis.crypto.subtle;
const zufall = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const nachB64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const ausB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Sechs bis zwölf Ziffern */
export const pinGueltig = (pin) => /^\d{6,12}$/.test(pin ?? '');

async function ableiten(pin, salz, iter) {
  const roh = await subtle().importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salz, iterations: iter }, roh, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Schlüssel aus PIN und dem Salz des Tresors */
export const schluesselAus = (pin, tresor) => ableiten(pin, ausB64(tresor.salz), tresor.iter);

/** Text in den Tresor schreiben. Gibt den neuen Tresor zurück (jedes Mal neuer Startwert). */
export async function tresorSchreiben(schluessel, tresor, text) {
  const iv = zufall(12);
  const daten = await subtle().encrypt({ name: 'AES-GCM', iv }, schluessel, new TextEncoder().encode(text));
  return { salz: tresor.salz, iter: tresor.iter, iv: nachB64(iv), daten: nachB64(daten) };
}

/** Tresor öffnen. Wirft bei falscher PIN (AES-GCM erkennt das selbst). */
export async function tresorOeffnen(schluessel, tresor) {
  const klar = await subtle().decrypt({ name: 'AES-GCM', iv: ausB64(tresor.iv) }, schluessel, ausB64(tresor.daten));
  return new TextDecoder().decode(klar);
}

/** Neuer Tresor mit neuem Salz: { schluessel, tresor } */
export async function neuerTresor(pin, text, iter = ITERATIONEN) {
  const leer = { salz: nachB64(zufall(16)), iter };
  const schluessel = await schluesselAus(pin, leer);
  return { schluessel, tresor: await tresorSchreiben(schluessel, leer, text) };
}

/** Muss gesperrt werden? Nach `minuten` ohne Nutzung und spätestens, wenn ein neuer Tag begonnen hat. Zeiten in ms. */
export function sperreFaellig({ jetzt, letzteNutzung, minuten = STANDARD_MINUTEN, tag, heute }) {
  return tag !== heute || jetzt - letzteNutzung >= minuten * 60000;
}

/** Sekunden Wartezeit nach so vielen falschen Eingaben: bis 4 keine, dann 30 s, verdoppelt, höchstens 15 Minuten */
export function wartezeitSek(fehlversuche) {
  return fehlversuche < WARTEN_AB ? 0 : Math.min(900, 30 * 2 ** (fehlversuche - WARTEN_AB));
}
