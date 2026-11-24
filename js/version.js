// Nomor versi aplikasi. Sumbernya hanya satu: konstanta VERSION di sw.js,
// jadi saat memperbarui aplikasi cukup ubah angka di sw.js saja.

let cached = null;

function ask(worker) {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(''), 3000);
    ch.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(String(e.data || ''));
    };
    worker.postMessage({ type: 'version' }, [ch.port2]);
  });
}

/** Mengembalikan mis. "1.1.0", atau '' bila belum bisa diketahui. */
export function appVersion() {
  if (!('serviceWorker' in navigator)) return Promise.resolve('');
  if (!cached) {
    cached = (async () => {
      const ctrl = navigator.serviceWorker.controller;
      if (ctrl) return ask(ctrl);
      // Kunjungan pertama: tunggu service worker aktif.
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 8000))]);
      return reg?.active ? ask(reg.active) : '';
    })().then((v) => {
      if (!v) cached = null; // coba lagi lain kali
      return v;
    });
  }
  return cached;
}

// Versi baru aktif → lupakan angka lama.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => { cached = null; });
}
