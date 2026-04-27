const CACHE = 'technion-static-v1';
const IMAGES = [
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/moodle-step3.png',
  '/moodle-step4.png',
  '/moodle-step5.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(IMAGES)));
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

  // Always go to network for external services
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('cheesefork') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('jsdelivr')
  ) return;

  // Cache-first for images only (they never change)
  if (/\.(png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // Network-first for HTML/CSS/JS — always get fresh, fall back to cache if offline
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
