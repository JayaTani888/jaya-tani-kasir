// Service worker: menyimpan file aplikasi agar tetap bisa dibuka tanpa internet.
// PENTING: naikkan VERSION setiap kali file aplikasi diperbarui di hosting,
// supaya HP mengunduh versi baru.
const VERSION = '1.0.3';
const CACHE = `jaya-tani-kasir-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/format.js',
  'js/picker.js',
  'js/store.js',
  'js/sync.js',
  'js/ui.js',
  'js/screens/home.js',
  'js/screens/input.js',
  'js/screens/item-form.js',
  'js/screens/kasir.js',
  'js/screens/riwayat.js',
  'js/screens/settings.js',
  'js/screens/stok.js',
  'js/screens/update.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/logo-jaya-tani.png',
];

// Saat uji di komputer sendiri (localhost), ambil versi terbaru dulu.
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('jaya-tani-kasir-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google Apps Script tidak disimpan
  if (url.pathname.includes('/dev/') || url.pathname.includes('/apps-script/')) return;

  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const key = req.mode === 'navigate' ? 'index.html' : req;
      if (DEV) {
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(key, res.clone());
          return res;
        } catch {
          const hit = await cache.match(key, { ignoreSearch: true });
          return hit || Response.error();
        }
      }
      const hit = await cache.match(key, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
      } catch {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })(),
  );
});
