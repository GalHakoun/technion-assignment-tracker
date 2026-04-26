const CACHE = 'technion-v1';
const SHELL = [
  '/index.html',
  '/dashboard.html',
  '/onboarding.html',
  '/style.css',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/moodle-step3.png',
  '/moodle-step4.png',
  '/moodle-step5.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
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
  // Always use network for Supabase and external APIs
  if (url.hostname.includes('supabase') || url.hostname.includes('cheesefork') || url.hostname.includes('googleapis')) {
    return;
  }
  // Cache-first for local assets
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
