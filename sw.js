// Service worker: menyimpan file aplikasi agar tetap bisa dibuka tanpa internet.
// PENTING: naikkan VERSION setiap kali file aplikasi diperbarui di hosting,
// supaya HP mengunduh versi baru.
const VERSION = '1.0.4';
const CACHE = `jaya-tani-kasir-${VERSION}`;
// Halaman utama disimpan dengan kunci './' (bukan 'index.html'), karena
// sebagian hosting (mis. Cloudflare Pages) mengalihkan /index.html ke /.
const PAGE = './';
const ASSETS = [
  PAGE,
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

// Jawaban hasil pengalihan (redirect) tidak boleh dipakai untuk membuka halaman:
// browser akan menolaknya (ERR_FAILED). Salin menjadi jawaban biasa.
async function clean(res) {
  if (!res || !res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

// Saat uji di komputer sendiri (localhost), ambil versi terbaru dulu.
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        ASSETS.map(async (a) => {
          const res = await fetch(a, { cache: 'no-cache' });
          if (!res.ok) throw new Error(`Gagal menyimpan ${a}: ${res.status}`);
          await cache.put(a, await clean(res));
        }),
      );
      // Langsung aktif (tidak menunggu semua tab ditutup), agar versi lama yang
      // bermasalah segera tergantikan. Aplikasi akan menawarkan "Muat ulang".
      await self.skipWaiting();
    })(),
  );
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
      const nav = req.mode === 'navigate';
      const key = nav ? PAGE : req;
      if (DEV) {
        try {
          const res = await clean(await fetch(req));
          if (res.ok) cache.put(key, res.clone());
          return res;
        } catch {
          const hit = await cache.match(key, { ignoreSearch: true });
          return (await clean(hit)) || Response.error();
        }
      }
      const hit = await cache.match(key, { ignoreSearch: true });
      if (hit) return clean(hit);
      try {
        const res = await clean(await fetch(req));
        if (res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
      } catch {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })(),
  );
});
