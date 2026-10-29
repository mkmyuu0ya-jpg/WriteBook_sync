const CACHE_NAME = 'book-app-v1';
const APP_ROOT = new URL('./', self.location.href).href;
const PRECACHE_URLS = [APP_ROOT, new URL('manifest.webmanifest', APP_ROOT).href, new URL('icon.svg', APP_ROOT).href];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('book-app-') && key !== CACHE_NAME).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) {
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())).catch((error) => {
          console.error('Service worker cache update failed:', error);
        });
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const appShell = await caches.match(APP_ROOT);
        if (appShell) return appShell;
      }
      return Response.error();
    }),
  );
});
