const CACHE_NAME = "sx-builder-v6";
const CORE = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
const IONIC_ASSETS = [
  "https://cdn.jsdelivr.net/npm/@ionic/core@9.0.10/css/ionic.bundle.css",
  "https://cdn.jsdelivr.net/npm/@ionic/core@9.0.10/dist/ionic/ionic.esm.js",
  "https://cdn.jsdelivr.net/npm/@ionic/core@9.0.10/dist/ionic/ionic.js",
];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
  await cache.addAll(CORE);
  await Promise.all(IONIC_ASSETS.map(asset => cache.add(asset).catch(error => console.warn("Ionic asset will be cached on first use", error))));
  await self.skipWaiting();
})));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("sx-builder-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const ionicAsset = url.origin === "https://cdn.jsdelivr.net" && url.pathname.startsWith("/npm/@ionic/core@9.0.10/");
  if (event.request.method !== "GET" || (!sameOrigin && !ionicAsset)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok || response.type === "opaque") { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(() => sameOrigin ? caches.match("./index.html") : Response.error())));
});
