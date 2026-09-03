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
// v2 drops every page cached under v1. Those caches can hold pages that no
// longer exist on the site (see the 404 handling in the page branch below),
// and until this bump there was no way for an already-poisoned client to
// shed them. Activate deletes any cache whose name is not current.
const PAGES = 'matur-pages-v2';
const OFFLINE_URL = '/offline/';
const PAGE_LIMIT = 120;
const STATIC_LIMIT = 300;

const isFontFile = (url) => url.hostname === 'fonts.gstatic.com';
const isFontCss = (url) => url.hostname === 'fonts.googleapis.com';
const isImmutable = (url) => url.pathname.startsWith('/_astro/') || isFontFile(url);
// The picker is precached too: its recipe manifest is embedded in the page and
// favourites are already cached by the account script, so with the page itself
// on hand the whole draw → shopping list flow works with no signal.
const PRECACHE_PATHS = ['/', OFFLINE_URL, '/manifest.webmanifest', '/handahof/'];
const PRECACHED = PRECACHE_PATHS.map((p) => new URL(p, self.location.origin).href);

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
    caches.open(PAGES).then((c) => c.addAll(PRECACHE_PATHS)),
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
          } else if (response.status === 404 || response.status === 410) {
            // A page removed from the site has to leave the cache too.
            // Without this a deleted route is served from here forever: the
            // revalidation fetch 404s, the write above is skipped, and the
            // stale copy is never touched again. Dropping it means the next
            // visit gets the real 404.
            const cache = await caches.open(PAGES);
            await cache.delete(request);
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
