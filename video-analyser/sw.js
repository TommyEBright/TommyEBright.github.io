// Service worker: keeps the app working offline. Bump VERSION when you change any file.
const VERSION = 'kva-1.0.1';
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/state.js', 'js/maths.js', 'js/video.js', 'js/overlay.js', 'js/tracking.js',
  'js/events.js', 'js/results.js', 'js/charts.js', 'js/export.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== 'kva-runtime').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  const isModel = /cdn\.jsdelivr\.net\/npm\/@mediapipe|storage\.googleapis\.com\/mediapipe-models/.test(req.url);
  if (url.origin === location.origin && !/\/demo\//.test(url.pathname)) {
    // app files: network first so updates arrive, cache as the offline fallback
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); if (r.ok) caches.open(VERSION).then((c) => c.put(req, copy)); return r; }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
  } else if (isModel || /\/demo\//.test(url.pathname)) {
    // AI model files and demo clips: cache first (they are large and never change)
    e.respondWith(caches.open('kva-runtime').then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }))));
  }
});
