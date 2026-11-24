/* Pulse Lab service worker: caches the app shell so it works offline.
   Bump VERSION whenever you change any file so phones pick up the update. */
const VERSION = 'pulse-lab-v3';
const SHELL = ['./', './index.html', './dsp.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Stale-while-revalidate for same-origin GETs. Query strings are ignored so
// ?mode=lab and ?test=1 still open offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const isApp = req.mode === 'navigate' && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'));
  const key = isApp ? './index.html' : url.origin + url.pathname;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(key, { ignoreSearch: true });
    const net = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
