// matlam v2 service worker — network first, offline fallback for the app shell
const CACHE_NAME = 'matlam-v2-shell-1';
const SHELL = '/matlam-v2/';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.add(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith('matlam-v2') && k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(SHELL, copy)); return res; })
      .catch(() => caches.match(SHELL))
  );
});
