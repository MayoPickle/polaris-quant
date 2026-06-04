const CACHE_NAME = "polaris-pwa-shell-v1";
const ICON_URLS = [
  "/pwa-icon.svg",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/apple-touch-icon.png",
  "/icons/polaris-mark.svg",
  "/icons/polaris-maskable.svg",
  "/icons/polaris-maskable-512.png",
  "/icons/polaris-monochrome.svg",
  "/icons/polaris-monochrome-512.png",
  "/icons/shortcut-overview.svg",
  "/icons/shortcut-overview-96.png",
  "/icons/shortcut-strategies.svg",
  "/icons/shortcut-strategies-96.png",
  "/icons/shortcut-portfolio.svg",
  "/icons/shortcut-portfolio-96.png",
  "/icons/shortcut-orders.svg",
  "/icons/shortcut-orders-96.png",
  "/icons/shortcut-market.svg",
  "/icons/shortcut-market-96.png",
];
const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  ...ICON_URLS,
];

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    ICON_URLS.includes(url.pathname) ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isApiRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  if (!isStaticAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
