// Self-unregistering service worker (kill switch).
//
// A previous version cached /_next/static chunks cache-first, which served
// stale JavaScript and broke the app after updates. This replacement takes no
// part in fetches; on activation it deletes every cache, unregisters itself,
// and reloads open tabs so they load fresh assets directly from the network.
//
// Because the registration uses `updateViaCache: "none"`, browsers re-fetch
// this file on navigation and will pick up this kill switch automatically.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })()
  );
});
