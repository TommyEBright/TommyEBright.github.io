// Service worker: keeps the app working offline. Bump VERSION when you change any file.
const VERSION = 'fa-1.0.0';
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/state.js', 'js/parse.js', 'js/maths.js', 'js/analyse.js', 'js/vars.js', 'js/plot.js', 'js/trace.js', 'js/figure.js',
  'js/integ.js', 'js/filterview.js', 'js/results.js', 'js/events.js', 'js/setup.js', 'js/session.js', 'js/compare.js', 'js/export.js', 'js/zip.js',
  'demo/demo-cmj.txt', 'demo/demo-squat-jump.txt', 'demo/demo-drop-jump.txt',
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
