/* ParaAura service worker — generated from noble-vision-ds/sw-template.js.
   Bump CACHE version when DS or app shell files change. */
const CACHE = 'paraaura-v1';
const PRECACHE = [
  './', './index.html', './style.css', './app.js',
  './vendor/nvds/tokens.css', './vendor/nvds/ds.css', './vendor/nvds/ds.js',
  './vendor/nvds/icons.css', './theme.css', './manifest.webmanifest', './offline.html',
  './rates.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never intercept cross-origin (AdSense, OneSignal, external APIs, font CDNs) — pass through.
  if (url.origin !== self.location.origin) return;
  // Stale-while-revalidate for same-origin app shell + data.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached || caches.match('./offline.html'));
      return cached || network;
    })
  );
});
