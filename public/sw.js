/**
 * Matur service worker.
 *
 * Two caches with different lifetimes:
 *  - STATIC: /_astro/* hashed assets and font files — immutable, cache-first,
 *    never revalidated (a changed asset gets a new hash and URL).
 *  - PAGES: HTML and other same-origin GETs — stale-while-revalidate, so the
 *    kitchen gets an instant (possibly one-deploy-old) page and the next view
 *    is fresh. No manual version bump needed for content updates.
 *
 * Navigations that miss both cache and network fall back to /offline/.
 */
const STATIC = 'matur-static-v1';
const PAGES = 'matur-pages-v1';
const OFFLINE_URL = '/offline/';
const PAGE_LIMIT = 120;
const STATIC_LIMIT = 300;

const isFontFile = (url) => url.hostname === 'fonts.gstatic.com';
const isFontCss = (url) => url.hostname === 'fonts.googleapis.com';
const isImmutable = (url) => url.pathname.startsWith('/_astro/') || isFontFile(url);
const PRECACHED = ['/', OFFLINE_URL, '/manifest.webmanifest'].map(
  (p) => new URL(p, self.location.origin).href,
);

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  // Oldest entries first (Cache API preserves insertion order), but the
  // precached shell and the offline fallback are never evicted — they are
  // only ever written at install and would otherwise be first out.
  const evictable = keys.filter((k) => !PRECACHED.includes(k.url));
  for (let i = 0; i < evictable.length - max; i++) await cache.delete(evictable[i]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => c.addAll(['/', OFFLINE_URL, '/manifest.webmanifest'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;
  const sameOrigin = url.origin === self.location.origin;
  // The fonts.googleapis.com stylesheet holds the @font-face rules; without it
  // the cached gstatic font files would never be referenced offline. It flows
  // through the page (SWR) branch below; the binaries are immutable.
  if (!sameOrigin && !isFontFile(url) && !isFontCss(url)) return;

  if (isImmutable(url)) {
    // Hashed assets and font files: cache-first, cached once, never revalidated.
    // Both arrive CORS-readable, so response.ok is a valid gate for each.
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(STATIC);
          event.waitUntil(
            cache.put(request, response.clone()).then(() => trimCache(STATIC, STATIC_LIMIT)),
          );
        }
        return response;
      })(),
    );
    return;
  }

  // Pages: stale-while-revalidate with an offline fallback for navigations.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const refresh = fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(PAGES);
            await cache.put(request, response.clone());
            await trimCache(PAGES, PAGE_LIMIT);
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        // Serve instantly; the refresh continues in the background.
        event.waitUntil(refresh);
        return cached;
      }
      const network = await refresh;
      if (network) return network;
      if (request.mode === 'navigate') {
        const offline = await caches.match(OFFLINE_URL);
        if (offline) return offline;
      }
      return Response.error();
    })(),
  );
});
