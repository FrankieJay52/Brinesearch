const CACHE_VERSION = 'brinesearch-v16-19';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './pad-fallback-data.json', './brand-kit/brinesearch-apple-touch-icon.png', './brand-kit/brinesearch-app-icon-512.png', './brand-kit/brinesearch-app-icon.png', './brand-kit/brinesearch-truck-logo.png', './brand-kit/brinesearch-truck-logo-footer-dark.png', './brand-kit/brinesearch-truck-logo-footer-day.png',
  "./icons/fm-collapse-inactive.svg",
  "./icons/fm-upload-inactive.svg",
  "./icons/fm-favorites-active.svg",
  "./icons/fm-apple-maps.svg",
  "./icons/fm-privacy.svg",
  "./icons/fm-check.svg",
  "./icons/fm-comment-inactive.svg",
  "./icons/fm-info.svg",
  "./icons/fm-filter-inactive.svg",
  "./icons/fm-weather-inactive.svg",
  "./icons/fm-refresh-inactive.svg",
  "./icons/fm-like-inactive.svg",
  "./icons/fm-external.svg",
  "./icons/fm-sync.svg",
  "./icons/fm-pad-inactive.svg",
  "./icons/fm-google-maps.svg",
  "./icons/fm-upload-photo.svg",
  "./icons/fm-restore.svg",
  "./icons/fm-terms.svg",
  "./icons/fm-download-offline.svg",
  "./icons/fm-edit-inactive.svg",
  "./icons/fm-copy-address.svg",
  "./icons/fm-share-pad.svg",
  "./icons/fm-download-inactive.svg",
  "./icons/fm-road-inactive.svg",
  "./icons/fm-home-active.svg",
  "./icons/fm-gps-inactive.svg",
  "./icons/fm-gps-active.svg",
  "./icons/fm-report-inactive.svg",
  "./icons/fm-feed-active.svg",
  "./icons/fm-redo.svg",
  "./icons/fm-search-inactive.svg",
  "./icons/fm-wifi.svg",
  "./icons/fm-pending.svg",
  "./icons/fm-save-inactive.svg",
  "./icons/fm-favorites-inactive.svg",
  "./icons/fm-api.svg",
  "./icons/fm-more.svg",
  "./icons/fm-verified-inactive.svg",
  "./icons/fm-copy-coords.svg",
  "./icons/fm-like-active.svg",
  "./icons/fm-settings-inactive.svg",
  "./icons/fm-camera-inactive.svg",
  "./icons/fm-upload-changes.svg",
  "./icons/fm-settings-active.svg",
  "./icons/fm-warning.svg",
  "./icons/fm-locked-inactive.svg",
  "./icons/fm-signal.svg",
  "./icons/fm-role-user.svg",
  "./icons/fm-notifications-inactive.svg",
  "./icons/fm-cancel.svg",
  "./icons/fm-contact.svg",
  "./icons/fm-feed-notification.svg",
  "./icons/fm-navigate-active.svg",
  "./icons/fm-rejected.svg",
  "./icons/fm-disposal-inactive.svg",
  "./icons/fm-delete-inactive.svg",
  "./icons/fm-profile-inactive.svg",
  "./icons/fm-notifications-active.svg",
  "./icons/fm-legal.svg",
  "./icons/fm-add-route.svg",
  "./icons/fm-role-owner.svg",
  "./icons/fm-role-editor.svg",
  "./icons/fm-feed-inactive.svg",
  "./icons/fm-navigate-inactive.svg",
  "./icons/fm-home-inactive.svg",
  "./icons/fm-role-admin.svg",
  "./icons/fm-share-feed.svg",
  "./icons/fm-back-inactive.svg",
  "./icons/fm-offline-inactive.svg",
  "./icons/fm-copy-inactive.svg",
  "./icons/fm-expand-inactive.svg",
  "./icons/fm-pad-active.svg",
  "./icons/fm-add-inactive.svg",
  "./icons/fm-capture-gps.svg",
  "./icons/fm-directions-inactive.svg",
  "./icons/fm-search-active.svg",
  "./icons/fm-role-moderator.svg",
  "./icons/fm-upload-logo.svg",
  "./icons/fm-edit-directions.svg",
  "./icons/fm-center-location.svg",
  "./icons/fm-help-inactive.svg",
  "./icons/fm-close-inactive.svg",
  "./icons/fm-wells.svg",
  "./icons/fm-gallery.svg",
  "./icons/fm-companies.svg",
  "./icons/fm-share-inactive.svg",
  "./icons/fm-hidden.svg",
  "./icons/fm-spinner.svg",
  "./icons/fm-maps-inactive.svg",
  "./icons/fm-sort.svg",
  "./icons/fm-archived.svg",
  "./icons/fm-undo.svg",  "./icons/large/fm-directions-large.svg",
  "./icons/large/fm-apple-maps-large.svg",
  "./icons/large/fm-share-pad-large.svg",
  "./icons/large/fm-favorite-large.svg",
  "./icons/large/fm-favorite-active-large.svg",
  "./icons/large/fm-edit-pad-large.svg",
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('brinesearch-') && key !== CACHE_VERSION)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin && event.request.destination !== 'image') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      }))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'BRINESEARCH_REFRESH_CACHE') {
    event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)));
  }
});
