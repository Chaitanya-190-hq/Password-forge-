/*
 * Password Forge service worker.
 *
 * Caches only first-party static app-shell files (HTML, JS, CSS, icons).
 * It never caches vault data, form values, request bodies, clipboard content or
 * anything from another origin — the optional breach-check request is left
 * entirely alone by the origin check below.
 *
 * __BUILD_ID__ and __PRECACHE__ are replaced at build time by vite.config.js.
 */

const BUILD_ID = '__BUILD_ID__';
const CACHE_PREFIX = 'password-forge-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const PRECACHE = __PRECACHE__;

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE.map(async (path) => {
          try {
            const response = await fetch(new Request(scopeUrl(path), { cache: 'reload' }));
            if (response.ok) await cache.put(scopeUrl(path), response);
          } catch {
            /* A missing optional asset must not abort the whole install. */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only plain, same-origin GETs are handled. Everything else goes to the network.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(scopeUrl('./index.html'), response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(scopeUrl('./index.html'));
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});
