// matlam service worker — network first, offline fallback for the app shell.
// Paths are relative to the registration scope, so the same file works at any repo path.
const CACHE_NAME = 'matlam-v2-shell-1';
const SHELL = new URL('./', self.registration.scope).pathname;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.add(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  // also removes the old site's cache ('matlam-v1') when this worker takes over its scope
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME && (k.startsWith('matlam-v2') || k === 'matlam-v1')).map(k => caches.delete(k)))));
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
