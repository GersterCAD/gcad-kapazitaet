// Zugang zum privaten Daten-Repo über die GitHub-API. Der Token bleibt nur auf diesem Gerät (IndexedDB, meta).
// Er braucht nur Lese- und Schreibrecht auf dieses eine Repo (Fine-grained-Token). Öffentliche Repos werden abgelehnt.

import * as speicher from './speicher.js';

export const STANDARD_REPO = 'GersterCAD/gcad-kapazitaet-daten';
const API = 'https://api.github.com';

let zugang = null; // { repo, token }

export async function starten() { zugang = (await speicher.metaLaden('github')) ?? null; }
export const verbunden = () => !!zugang?.token;
export const repo = () => zugang?.repo ?? STANDARD_REPO;

function kopf(token = zugang?.token, art = 'application/vnd.github+json') {
  return { Accept: art, Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
}

function fehlerText(status) {
  if (status === 401) return 'Der Token ist ungültig oder abgelaufen.';
  if (status === 403) return 'Der Token darf auf dieses Repo nicht zugreifen.';
  if (status === 404) return 'Repo oder Datei nicht gefunden – oder der Token sieht das Repo nicht.';
  return `GitHub antwortet mit Fehler ${status}.`;
}

/** Zugang prüfen und speichern. Das Repo muss privat sein. */
export async function verbinden(repoName, token) {
  const name = repoName.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(name)) throw new Error('Repo bitte als „Besitzer/Name“ angeben.');
  let antwort;
  try { antwort = await fetch(`${API}/repos/${name}`, { headers: kopf(token.trim()) }); } catch { throw new Error('Keine Verbindung zu GitHub.'); }
  if (!antwort.ok) throw new Error(fehlerText(antwort.status));
  const info = await antwort.json();
  if (!info.private) throw new Error('Dieses Repo ist öffentlich. Deine Daten gehören nur in ein privates Repo.');
  zugang = { repo: name, token: token.trim() };
  await speicher.metaSpeichern('github', zugang);
}

export async function trennen() { zugang = null; await speicher.metaSpeichern('github', null); }

/** Datei als Text holen. Gibt null zurück, wenn es sie (noch) nicht gibt. */
export async function dateiHolen(pfad) {
  if (!verbunden()) throw new Error('Nicht mit GitHub verbunden.');
  let antwort;
  try {
    antwort = await fetch(`${API}/repos/${zugang.repo}/contents/${pfad}`, { headers: kopf(undefined, 'application/vnd.github.raw+json'), cache: 'no-store' });
  } catch { throw new Error('Keine Verbindung zu GitHub.'); }
  if (antwort.status === 404) return null;
  if (!antwort.ok) throw new Error(fehlerText(antwort.status));
  return antwort.text();
}

// UTF-8 sicher nach/aus Base64 (die GitHub-API liefert Dateien als Base64)
function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function ausBase64(b64) {
  const s = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
}

/** Datei mit ihrer Version (sha) holen: { text, sha } oder null, wenn es sie nicht gibt */
export async function dateiMitVersion(pfad) {
  if (!verbunden()) throw new Error('Nicht mit GitHub verbunden.');
  let antwort;
  try { antwort = await fetch(`${API}/repos/${zugang.repo}/contents/${pfad}`, { headers: kopf(), cache: 'no-store' }); } catch { throw new Error('Keine Verbindung zu GitHub.'); }
  if (antwort.status === 404) return null;
  if (!antwort.ok) throw new Error(fehlerText(antwort.status));
  const j = await antwort.json();
  // Ab 1 MB liefert die API den Inhalt nicht mit – dann roh nachladen
  const text = j.content ? ausBase64(j.content) : await dateiHolen(pfad);
  return { text, sha: j.sha };
}

/**
 * Datei schreiben. sha = Version, auf der die Änderung beruht (null für neu).
 * Hat sich die Datei inzwischen geändert, antwortet GitHub mit 409 – dann { veraltet: true }.
 */
export async function dateiSchreiben(pfad, text, sha, nachricht) {
  if (!verbunden()) throw new Error('Nicht mit GitHub verbunden.');
  let antwort;
  try {
    antwort = await fetch(`${API}/repos/${zugang.repo}/contents/${pfad}`, {
      method: 'PUT', headers: { ...kopf(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: nachricht, content: base64(text), ...(sha ? { sha } : {}) }),
    });
  } catch { throw new Error('Keine Verbindung zu GitHub.'); }
  if (antwort.status === 409 || antwort.status === 422) return { veraltet: true };
  if (!antwort.ok) throw new Error(fehlerText(antwort.status));
  const j = await antwort.json();
  return { sha: j.content.sha };
}
