import { h, icon } from '../ui.js';
import { onChange, activeItems, bonList } from '../store.js';
import { onSync, describeStatus, syncNow, isConfigured, syncState } from '../sync.js';
import { appVersion } from '../version.js';

function tile(href, label, ic, cls) {
  return h('a', { class: `tile ${cls}`, href }, icon(ic, 34), h('span', null, label));
}

export function HomeScreen() {
  const st = h('div', { class: 'st' });
  const syncBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => syncNow() }, icon('refresh', 18), 'Sinkron sekarang');
  const connectBtn = h('a', { class: 'btn btn-pick btn-sm', href: '#/pengaturan' }, 'Hubungkan');
  const count = h('p', { class: 'foot muted small' });
  const bonBadge = h('span', { class: 'count-badge', title: 'Bon belum lunas' });

  function update() {
    const s = describeStatus();
    st.replaceChildren(h('b', null, h('span', { class: `dot ${s.tone}` }), ' ', s.long), h('span', { class: 'muted small' }, s.detail));
    syncBtn.hidden = !isConfigured();
    syncBtn.disabled = syncState.running;
    connectBtn.hidden = isConfigured();
    count.textContent = `${activeItems().length} barang terdaftar`;
    const nBon = bonList().filter((b) => b.sisa > 0).length;
    bonBadge.textContent = nBon ? String(nBon) : '';
  }

  const versionEl = h('span', { class: 'credit-ver' });
  appVersion().then((v) => { if (v) versionEl.textContent = `Versi ${v}`; });

  const el = h('div', { class: 'page-home' },
    // Kasir paling besar dan paling atas; menu lain di bawahnya.
    h('nav', { class: 'tiles-home', 'aria-label': 'Menu utama' },
      tile('#/kasir', 'Kasir', 'cash', 'tile-kasir tile-main'),
      h('div', { class: 'tiles-sub' },
        tile('#/input', 'Input Data Barang Baru', 'plusbox', 'tile-green'),
        tile('#/update', 'Update Data Barang Tersedia', 'edit', 'tile-yellow'),
        tile('#/stok', 'Update Stok Barang', 'boxes', 'tile-yellow'))),
    h('section', { class: 'card sync-card' }, st, syncBtn, connectBtn),
    h('div', { class: 'links' },
      h('a', { class: 'link-btn', href: '#/riwayat' }, icon('history'), 'Riwayat Transaksi'),
      h('a', { class: 'link-btn', href: '#/bon' }, icon('note'), h('span', null, 'Catatan Bon'), bonBadge),
      h('a', { class: 'link-btn', href: '#/pengaturan' }, icon('settings'), 'Pengaturan')),
    count,
    h('p', { class: 'credit' }, h('span', null, 'Designed by Sinnu Group (Tama & Ani)'), versionEl));

  const offs = [onSync(update), onChange(update)];
  update();
  return { title: 'Jaya Tani Kasir', el, destroy: () => offs.forEach((f) => f()) };
}
