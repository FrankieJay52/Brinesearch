const CACHE_VERSION = 'brinesearch-v16-24';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pad-fallback-data.json',
  './road-database.js',
  './road-manager.js',
  './front-sign-scanner.js',
  './v16-24-hotfix.js',
  './road-database.schema.json',
  './road_name_review.csv'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(CORE_ASSETS.map(async (asset) => {
      const response = await fetch(asset, { cache: 'reload' });
      if (response.ok) await cache.put(asset, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('brinesearch-') && key !== CACHE_VERSION)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});


async function injectRepairLoader(response) {
  if (!response) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('text/html')) return response;
  let html = await response.text();
  html = html.replace(/\s*<script[^>]+feature-bootstrap-v16-23\.js[^>]*>\s*<\/script>\s*/gi, '\n');
  if (!/v16-24-hotfix\.js/i.test(html)) {
    const tag = '  <script id="brinesearch-v16-24-hotfix" src="./v16-24-hotfix.js?v=16.24" defer></script>\n';
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tag + '</body>') : html + tag;
  }
  html = html.replace(/V\s*16\.(?:20|21|22|23)/gi, 'V 16.24');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    const repaired = await injectRepairLoader(response);
    if (repaired && repaired.ok) {
      const cache = await caches.open(CACHE_VERSION);
      await cache.put('./index.html', repaired.clone());
    }
    return repaired;
  } catch (error) {
    return injectRepairLoader(await caches.match('./index.html'));
  }
}

async function networkFirst(request, fallbackPath) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (await caches.match(request)) || (fallbackPath ? await caches.match(fallbackPath) : undefined);
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin && event.request.destination !== 'image') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event.request));
    return;
  }

  if (url.origin === self.location.origin && /\.(?:js|css|json|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response && response.ok && url.origin === self.location.origin) {
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      return cached;
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'BRINESEARCH_REFRESH_CACHE') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.allSettled(CORE_ASSETS.map(async (asset) => {
        const response = await fetch(asset, { cache: 'reload' });
        if (response.ok) await cache.put(asset, response);
      }));
    })());
  }
});
