// Service worker: keeps the app working offline. Bump VERSION when you change any file.
// The demo files are big, so they are cached the first time they are used rather than up front.
const VERSION = 'emg-1.2.0';
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/state.js', 'js/parse.js', 'js/dsp.js', 'js/emg.js', 'js/plot.js', 'js/trace.js', 'js/points.js',
  'js/results.js', 'js/setup.js', 'js/session.js', 'js/compare.js', 'js/export.js', 'js/deeper.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // network first so updates arrive, cache as the offline fallback
  e.respondWith(fetch(req).then((r) => { const copy = r.clone(); if (r.ok) caches.open(VERSION).then((c) => c.put(req, copy)); return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
