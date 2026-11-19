// Service worker: keeps Projectile Motion working offline. Bump VERSION when you change any file.
const VERSION = 'pm-1.5.0';
const CORE = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'js/app.js', 'js/maths.js', 'js/plot.js', 'js/learn.js', 'js/analyse.js', 'js/ball.js', 'js/forceplate.js', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin || req.headers.has('range')) return;
  e.respondWith(fetch(req).then((r) => { const c = r.clone(); if (r.ok && r.status === 200) caches.open(VERSION).then((x) => x.put(req, c)); return r; }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
