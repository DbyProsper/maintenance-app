/* Cache name changes whenever the offline asset list is updated. */
const CACHE_NAME = "ufh-maintenance-v3";

/* Core application files and campus slideshow images available offline. */
const OFFLINE_ASSETS = [
  "/",
  "/index.html",
  "/app.css",
  "/app.js",
  "/ufh-logo.png",
  "/favicon.png",
  "/stewart-hall.jpg",
  "/campusimage1.jpg",
  "/Library.png",
  "/Nkandla.jpg",
  "/ufhchurchclock.jpg",
  "/SV3.jpg",
];

/* Preload the application shell so the prototype can reopen offline. */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)),
  );
});

/* Remove old caches after a newer service worker takes control. */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

/* Prefer fresh network responses and fall back to the cached copy offline. */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const cachedResponse = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(event.request, cachedResponse));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
