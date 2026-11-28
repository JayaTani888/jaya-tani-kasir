// Titik awal aplikasi: navigasi antar layar, status sinkron, dan mode offline (service worker).

import { init, onChange } from './store.js';
import { startAutoSync, onSync, describeStatus } from './sync.js';
import { h, closeAllModals } from './ui.js';
import { HomeScreen } from './screens/home.js';
import { InputScreen } from './screens/input.js';
import { UpdateScreen } from './screens/update.js';
import { KasirScreen } from './screens/kasir.js';
import { StokScreen } from './screens/stok.js';
import { RiwayatScreen } from './screens/riwayat.js';
import { SettingsScreen } from './screens/settings.js';
import { BonScreen } from './screens/bon.js';

const routes = {
  '': HomeScreen,
  input: InputScreen,
  update: UpdateScreen,
  kasir: KasirScreen,
  stok: StokScreen,
  riwayat: RiwayatScreen,
  bon: BonScreen,
  pengaturan: SettingsScreen,
};

const view = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const backBtn = document.getElementById('btn-back');
const chip = document.getElementById('sync-chip');
let current = null;

function route() {
  const name = location.hash.replace(/^#\/?/, '').split(/[?/]/)[0];
  const Screen = routes[name] || HomeScreen;
  closeAllModals();
  try {
    current?.destroy?.();
  } catch (e) {
    console.error(e);
  }
  current = Screen();
  view.replaceChildren(current.el);
  const isHome = Screen === HomeScreen;
  // Beranda: tampilkan logo Toko Jaya Tani. Layar lain: judul teks.
  titleEl.replaceChildren(isHome ? h('img', { class: 'brand-logo', src: 'icons/logo-jaya-tani.png', alt: 'Toko Jaya Tani' }) : current.title);
  document.body.classList.toggle('is-home', isHome);
  document.title = isHome ? 'Jaya Tani Kasir' : `${current.title} · Jaya Tani Kasir`;
  backBtn.hidden = isHome;
  window.scrollTo(0, 0);
}

function updateChip() {
  const s = describeStatus();
  chip.replaceChildren(h('span', { class: `dot ${s.tone}` }), h('span', null, s.short));
  chip.title = s.long + (s.detail ? ` — ${s.detail}` : '');
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const banner = document.getElementById('update-banner');
  // Versi baru langsung aktif di latar belakang; pengguna cukup memuat ulang.
  const hadController = !!navigator.serviceWorker.controller;
  banner.querySelector('button').addEventListener('click', () => location.reload());
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) banner.hidden = false;
  });
  navigator.serviceWorker
    .register('sw.js')
    .then((r) => {
      if (r.waiting) r.waiting.postMessage('SKIP_WAITING'); // versi lama yang masih menunggu
    })
    .catch((e) => console.warn('Service worker gagal didaftarkan:', e));
}

async function boot() {
  const params = new URLSearchParams(location.search);
  // Mode uji lokal: ?mock memakai tiruan Apps Script di browser (folder dev/).
  if (params.has('mock')) {
    try {
      await import('../dev/mock-backend.js');
    } catch (e) {
      console.error('Mock gagal dimuat', e);
    }
  }
  try {
    await init();
  } catch (e) {
    view.replaceChildren(
      h('div', { class: 'card' },
        h('b', null, 'Penyimpanan di perangkat tidak bisa dibuka.'),
        h('p', null, String(e?.message || e)),
        h('p', { class: 'muted' }, 'Pastikan tidak memakai mode penyamaran/private, lalu muat ulang.')),
    );
    return;
  }
  backBtn.addEventListener('click', () => { location.hash = '#/'; });
  chip.addEventListener('click', () => { location.hash = '#/pengaturan'; });
  window.addEventListener('hashchange', route);
  route();
  updateChip();
  onSync(updateChip);
  onChange(updateChip);
  startAutoSync();
  registerSW();
  navigator.storage?.persist?.().catch(() => {});
}

boot();
