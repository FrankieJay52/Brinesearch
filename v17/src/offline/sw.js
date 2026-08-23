const CACHE_VERSION = 'brinesearch-v17-3-31-v18-scope-bypass';
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-31-exact-structured-route-geometry
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-30-authoritative-driver-directions
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-28-step-snap-route-editor
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-27-interactive-route-map
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-26-responsive-backtrace
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-25-backtrace-route-highlight
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-24-road-manager-route-mapper
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-23-exit-road-truth
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-22-all-pad-direction-cleanup
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-21-final-direction-integrity
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-20-road-turn-mileage-truth
// Previous cache marker retained for release-audit continuity: brinesearch-v17-3-19-all-road-deep-pass
// Earlier cache marker retained for release-audit continuity: brinesearch-v17-3-18-road-mileage-recovery
const DIRECTION_DATA_FILES = __DIRECTION_DATA_FILES__;
const APP_SHELL = [
  './index.html', './styles/app.css', './styles/field-mark-icons.css', './app/theme-boot.js',
  './app/brinesearch-app.js', './app/weather-feature.js',
  './app/root-scroll-guard.js', './app/field-mark-runtime.js', './app/front-sign-structured.js',
  './app/front-sign-hidden.js',
  './manifest.webmanifest', './brand-kit/brinesearch-app-icon.png', './brand-kit/brinesearch-app-icon-512.png', './pad-fallback-data.json',
  './road-database.js', './road-manager.js', './front-sign-scanner.js',
  './road-database.schema.json', './road_name_review.csv',
  './icons/fm-home-inactive.svg', './icons/fm-search-inactive.svg', './icons/fm-feed-inactive.svg',
  './icons/fm-back-inactive.svg', './icons/fm-capture-gps.svg', './icons/fm-favorites-inactive.svg',
  './icons/fm-add-inactive.svg', './icons/fm-offline-inactive.svg', './icons/fm-refresh-inactive.svg',
  './icons/fm-profile-inactive.svg', './icons/fm-settings-inactive.svg', './icons/fm-weather-inactive.svg',
  './icons/fm-pad-inactive.svg'
].concat(DIRECTION_DATA_FILES);

async function refreshAppShell() {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.allSettled(APP_SHELL.map(async asset => {
    const response = await fetch(asset, { cache: 'reload' });
    if (response.ok) await cache.put(asset, response);
  }));
  return cache;
}

self.addEventListener('install', event => event.waitUntil((async () => {
  await refreshAppShell();
  await self.skipWaiting();
})()));

self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('brinesearch-') && key !== CACHE_VERSION).map(key => caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && event.request.destination !== 'image') return;
  if (sameOrigin && (url.pathname === '/v18' || url.pathname.startsWith('/v18/'))) return;

  if (event.request.mode === 'navigate') {
    if (!sameOrigin || url.pathname !== '/index.html') return;
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(async response => {
      if (response.ok) (await caches.open(CACHE_VERSION)).put('./index.html', response.clone());
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  const networkFirstAppAsset = sameOrigin && (
    /\.(?:js|css|json|webmanifest)$/i.test(url.pathname)
    || url.pathname.endsWith('/sw.js')
  );

  if (networkFirstAppAsset) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(async response => {
      if (response.ok) (await caches.open(CACHE_VERSION)).put(event.request, response.clone());
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(async response => {
    if (response.ok && sameOrigin) (await caches.open(CACHE_VERSION)).put(event.request, response.clone());
    return response;
  })));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'BRINESEARCH_REFRESH_CACHE') event.waitUntil(refreshAppShell());
});
