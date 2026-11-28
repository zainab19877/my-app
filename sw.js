// عامل الخدمة: يجعل التطبيق يعمل بدون إنترنت
// الاستراتيجية: الشبكة أولاً (لتظهر التحديثات فوراً)، والنسخة المحفوظة عند انقطاع الإنترنت
const CACHE = 'gift-organizer-v3';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './gifts.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' يتجاوز ذاكرة المتصفح ليحفظ أحدث نسخة من الخادم
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      fetch(sameOrigin ? new Request(req, { cache: 'no-cache' }) : req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cache.match(req, { ignoreSearch: true }).then(r => r || cache.match('./index.html')))
    )
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});
