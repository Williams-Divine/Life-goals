// Service worker — network-first for the HTML app file so updates always reach
// the user automatically. Cache-first only for static assets like fonts.
// Update CACHE_VERSION whenever you deploy new code — this busts the old cache.
const CACHE_VERSION = '2026.07.25';
const CACHE_NAME = `life-goals-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  // Activate immediately — don't wait for old SW to stop controlling pages
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete all caches from previous versions
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept GitHub API (cloud sync) or external requests
  if (url.hostname === 'api.github.com') return;
  if (url.hostname !== self.location.hostname && !url.hostname.endsWith('github.io')) return;

  // HTML files — NETWORK FIRST so new code always reaches the user
  // Falls back to cache only when genuinely offline
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request.url + '?v=' + CACHE_VERSION, { cache: 'no-store' })
        .then(response => {
          if (response.ok) {
            // Cache the fresh response for offline fallback
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() =>
          // Offline fallback — serve cached version
          caches.match(event.request).then(cached => cached || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // Everything else (manifest, fonts, icons) — cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});

// Tell all open tabs that a new service worker has taken over
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
