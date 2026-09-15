const CACHE = 'schneggen-twerkout-v12';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css?v=12',
  '/app.js?v=12',
  '/data.js?v=12',
  '/presets.js?v=12',
  '/plans.js?v=12',
  '/workouts.js?v=12',
  '/profiles.js?v=12',
  '/sync.js?v=12',
  '/feedback.js?v=12',
  '/reorder.js?v=12',
  '/training.js?v=12',
  '/session-ui.js?v=12',
  '/snail.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest?v=12',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    }),
  );
});
