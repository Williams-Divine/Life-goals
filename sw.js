// Service worker — network-first for the HTML app file so updates always reach
// the user automatically. Cache-first only for static assets like fonts.
// Update CACHE_VERSION whenever you deploy new code — this busts the old cache.
const CACHE_VERSION = '2026.08.13';
const CACHE_NAME = `life-goals-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  // Pre-cache the app shell so there's always something to fall back to,
  // even before the first successful network fetch completes.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['./', './index.html']).catch(() => {
        // If index.html doesn't exist at this path, that's fine — the
        // fetch handler will populate the cache on first successful load.
      })
    )
  );
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

  // HTML files — NETWORK FIRST so new code always reaches the user, but with
  // a short timeout: a slow/flaky connection should fall back to cache
  // gracefully, not hang and then show a dead "Offline" screen.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      (async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s network budget
          const response = await fetch(event.request, { cache: 'no-store', signal: controller.signal });
          clearTimeout(timeoutId);
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
            return response;
          }
          // Non-OK response (e.g. 404/500) — prefer cache over showing an error page
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return response; // last resort: whatever the network gave us
        } catch (err) {
          // Network failed or timed out — try cache, then ANY cached HTML as a
          // last resort, so the app still opens instead of a blank "Offline" page.
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const anyCachedPage = await caches.match(url.pathname === '/' ? './index.html' : url.pathname)
            || await caches.match('./');
          if (anyCachedPage) return anyCachedPage;
          return new Response(
            '<html><body style="font-family:sans-serif;padding:24px;color:#444"><h3>Connection trouble</h3><p>Could not reach the network and no offline copy was found yet. Please check your connection and try again.</p></body></html>',
            { status: 200, headers: { 'Content-Type': 'text/html' } }
          );
        }
      })()
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
