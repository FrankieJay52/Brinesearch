const V18_ENTRY = "/v18/#/";
const V18_PATH = "/v18/";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((cacheName) => cacheName.startsWith("brinesearch-"))
      .map((cacheName) => caches.delete(cacheName)));
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.allSettled(windows.map((client) => {
      const url = new URL(client.url);
      return url.origin === self.location.origin && !url.pathname.startsWith(V18_PATH)
        ? client.navigate(new URL(V18_ENTRY, self.location.origin).href)
        : undefined;
    }));
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith(V18_PATH)) return;
  event.respondWith(Promise.resolve(Response.redirect(new URL(V18_ENTRY, self.location.origin).href, 302)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});
