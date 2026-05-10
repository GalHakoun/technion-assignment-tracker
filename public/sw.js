const CACHE = 'checker-static-v8';

const PRECACHE = [
  '/index.html',
  '/dashboard.html',
  '/onboarding.html',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

const IMAGES = [
  '/logo.png',
  '/moodle-step345.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([...PRECACHE, ...IMAGES]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always network for external services
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('jsdelivr')
  ) return;

  // Stale-while-revalidate for HTML/CSS/JS — instant load from cache, update in background
  if (/\.(html|css|js)$/.test(url.pathname) || url.pathname === '/') {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const network = fetch(e.request).then(res => {
            cache.put(e.request, res.clone());
            return res;
          });
          return cached || network;
        })
      )
    );
    return;
  }

  // Cache-first for images
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});

// ── Push notifications ──

self.addEventListener('push', e => {
  let data = { title: 'Checker', body: 'יש לך מטלות ממתינות 📚' };
  try { if (e.data) data = e.data.json(); } catch (_) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: '/dashboard.html' },
      dir: 'rtl',
      lang: 'he',
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('/dashboard.html') && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(e.notification.data?.url || '/dashboard.html');
    })
  );
});
