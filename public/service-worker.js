/*
 * Caches the application shell and public assets only.
 *
 * Nothing from Firestore is cached here. Incident details carry precise
 * coordinates and contact numbers, and a cache is readable by anyone who
 * later picks up the device, so protected data must never enter it. Requests
 * to Firebase and to the upload endpoints are passed straight through.
 */
const CACHE_NAME = "tabang-shell-v1";

const SHELL_ASSETS = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheable(request) {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);

  // Same-origin only, and never the signing or data endpoints.
  return (
    url.origin === self.location.origin && !url.pathname.startsWith("/api/")
  );
}

self.addEventListener("fetch", (event) => {
  if (!isCacheable(event.request)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();

        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);

        // A navigation offline falls back to the shell so the app still opens
        // and the queued-report state is visible.
        return (
          cached ??
          (event.request.mode === "navigate"
            ? caches.match("/index.html")
            : Response.error())
        );
      }),
  );
});
