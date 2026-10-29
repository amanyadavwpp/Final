// Service worker for the CA Final Lecture Tracker.
//
// Strategy: cache-first for same-origin GETs, with the app shell precached so
// the tracker opens with no network at all. Hashed /_next/static assets are
// immutable, so serving them from cache is always safe. HTML navigations fall
// back to the cached shell when offline.

const CACHE = "tracker-v1";
const SHELL = ["./", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache the API in server mode; never cache range requests.
  if (url.pathname.includes("/api/")) return;
  if (request.headers.get("range")) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: url.pathname.endsWith("/") }).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const shell = await caches.match("./");
          if (shell) return shell;
          return new Response("Offline", { status: 503, statusText: "Offline" });
        });
    }),
  );
});
