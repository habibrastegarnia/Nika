// سرویس‌ورکر: پوسته‌ی برنامه برای باز شدن سریع و حالت آفلاین. هرگز /api را کش نمی‌کند.
const CACHE = 'nika-v10';
const SHELL = ['/', '/app.css', '/js/main.js', '/js/util.js', '/js/api.js', '/js/state.js', '/js/ui.js', '/js/pages.js', '/js/admin.js', '/manifest.webmanifest', '/assets/avatar.jpg', '/assets/login%20page%20backgoun.jpg', '/assets/icon-192.png', '/assets/icon-maskable-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
    return res;
  }).catch(async () => (await caches.match(r)) || (r.mode === 'navigate' ? caches.match('/') : Response.error())));
});
