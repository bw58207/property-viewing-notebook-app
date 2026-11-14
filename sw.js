/* Service worker: cache the app shell so the notebook opens with no signal.
 *
 * Records are not cached here - they live in localStorage, on the phone. This
 * only makes the interface itself available offline so you can read and edit
 * what you already captured at a viewing with no bars.
 */
var CACHE = "pvn-shell-v1";
var SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) { return caches.delete(key); }
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") { return; }
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) { return cached; }
      return fetch(event.request).catch(function () {
        return caches.match("./index.html");
      });
    })
  );
});
