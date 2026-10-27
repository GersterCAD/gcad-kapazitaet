// Service Worker: App-Hülle für den Offline-Start.
// Bei jeder Änderung an den Dateien unten VERSION hochzählen.

const VERSION = 'v2';
const CACHE = `gcad-kapazitaet-${VERSION}`;

const HUELLE = [
  './',
  './index.html',
  './manifest.json',
  './styles/ci.css',
  './styles/app.css',
  './js/app.js',
  './js/ui.js',
  './js/zustand.js',
  './js/speicher.js',
  './js/austausch.js',
  './js/kern/datum.js',
  './js/kern/daten.js',
  './js/kern/beispiel.js',
  './js/ansichten/platzhalter.js',
  './js/ansichten/einstellungen.js',
  './schrift/inter-latin-wght-normal.woff2',
  './schrift/inter-latin-ext-wght-normal.woff2',
  './bilder/bildzeichen.svg',
  './bilder/apple-touch-icon.png',
  './bilder/icon-192.png',
  './bilder/icon-512.png',
  './bilder/icon-rund-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(HUELLE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n.startsWith('gcad-kapazitaet-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Nur eigene Dateien aus dem Cache. Anfragen an GitHub (Daten, Kalender) gehen immer ins Netz.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Netz zuerst, damit neue Stände sofort ankommen; ohne Netz der Cache.
  e.respondWith(
    fetch(e.request)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((c) => c.put(e.request, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((t) => t || caches.match('./index.html'))),
  );
});
