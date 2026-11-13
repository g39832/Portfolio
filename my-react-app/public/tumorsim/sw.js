/**
 * TumorSim service worker — offline-first app shell.
 *
 * Strategy: cache-first for same-origin assets (the app shell: hashed JS/CSS
 * bundles, the worker, fonts, icons), network-first for the HTML document so
 * updates always win on reload. The simulated data itself never leaves the
 * browser, so nothing sensitive is cached.
 */

const CACHE = 'tumorsim-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './manifest.webmanifest'])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Only handle same-origin requests; let the network own everything else.
  if (url.origin !== self.location.origin) return;

  // HTML: network-first (always try fresh, fall back to cache when offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached ?? caches.match('./'))),
    );
    return;
  }

  // Everything else (JS/CSS/worker/icons): cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Only keep good responses, so an error page is never served forever.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});
