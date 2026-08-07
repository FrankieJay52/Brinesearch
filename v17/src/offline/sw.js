const CACHE_VERSION = 'brinesearch-v17-1-0';
const DIRECTION_DATA_FILES = __DIRECTION_DATA_FILES__;
const APP_SHELL = [
  './', './index.html', './styles/app.css', './styles/field-mark-icons.css', './app/theme-boot.js',
  './app/brinesearch-app.js', './app/weather-feature.js',
  './app/root-scroll-guard.js', './app/field-mark-runtime.js',
  './manifest.webmanifest', './pad-fallback-data.json',
  './road-database.js', './road-manager.js', './front-sign-scanner.js',
  './v16-25-hotfix.js', './road-database.schema.json', './road_name_review.csv',
  './icons/fm-home-inactive.svg', './icons/fm-search-inactive.svg', './icons/fm-feed-inactive.svg',
  './icons/fm-back-inactive.svg', './icons/fm-capture-gps.svg', './icons/fm-favorites-inactive.svg',
  './icons/fm-add-inactive.svg', './icons/fm-offline-inactive.svg', './icons/fm-refresh-inactive.svg',
  './icons/fm-profile-inactive.svg', './icons/fm-settings-inactive.svg', './icons/fm-weather-inactive.svg',
  './icons/fm-pad-inactive.svg'
].concat(DIRECTION_DATA_FILES);
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.allSettled(APP_SHELL.map(async asset => {
    const response = await fetch(asset, { cache: 'reload' });
    if (response.ok) await cache.put(asset, response);
  }));
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
  if (url.origin !== self.location.origin && event.request.destination !== 'image') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(async response => {
      if (response.ok) (await caches.open(CACHE_VERSION)).put('./index.html', response.clone());
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(async response => {
    if (response.ok && url.origin === self.location.origin) (await caches.open(CACHE_VERSION)).put(event.request, response.clone());
    return response;
  })));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
