const CACHE = 'qlda-v3';
const STATIC = ['/logoCTEC.png', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;

  // HTML/JS/CSS: luôn lấy từ server trước (network-first), fallback cache khi offline
  const isStatic = STATIC.some(s => e.request.url.endsWith(s));
  if (isStatic) {
    // Logo/manifest: cache-first (ít thay đổi)
    e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)));
  } else {
    // Network-first cho code
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
  }
});
