// Pengaturan koneksi ke Google Sheets + status sinkron.

import { h, icon, textField } from '../ui.js';
import { state, setMeta, onChange, activeItems } from '../store.js';
import { callApi, syncNow, describeStatus, onSync, isConfigured, syncState, NetError } from '../sync.js';

export function SettingsScreen() {
  const url = textField({ label: 'URL Web App (berakhiran /exec)', value: state.meta.apiUrl || '' });
  url.input.setAttribute('inputmode', 'url');
  const key = textField({ label: 'Kunci API', value: state.meta.apiKey || '' });
  const result = h('div', { class: 'test-result', role: 'status' });
  const saveBtn = h('button', { type: 'button', class: 'btn btn-save', onclick: saveAndTest }, 'Simpan & Tes Koneksi');

  function showResult(tone, text) {
    result.className = `test-result ${tone}`;
    result.textContent = text;
  }

  async function saveAndTest() {
    url.setError(null);
    key.setError(null);
    const u = url.value;
    const k = key.value;
    let bad = false;
    if (!u) {
      url.setError('Wajib diisi');
      bad = true;
    } else if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(u) && !u.startsWith('mock://')) {
      url.setError('Salin URL Web App dari Apps Script: diawali https://script.google.com/ dan berakhiran /exec');
      bad = true;
    }
    if (!k) {
      key.setError('Wajib diisi');
      bad = true;
    }
    if (bad) return;
    saveBtn.disabled = true;
    await setMeta('apiUrl', u);
    await setMeta('apiKey', k);
    showResult('busy', 'Menghubungi spreadsheet…');
    try {
      const r = await callApi({ action: 'ping', key: k }, { url: u, timeout: 30000 });
      showResult('ok', `Terhubung ke spreadsheet “${r.nama}”. Data akan disinkron otomatis.`);
      syncNow();
    } catch (e) {
      showResult('err', `Tersimpan, tetapi belum bisa terhubung: ${e.message}`);
      if (e instanceof NetError && !u.startsWith('mock://')) {
        result.append(
          h('div', { class: 'hint' },
            h('b', null, 'Yang biasanya jadi penyebab:'),
            h('ol', null,
              h('li', null, 'Di Apps Script → Terapkan → Kelola deployment → ✎ Edit: "Yang memiliki akses" harus ', h('b', null, 'Siapa saja'), ' (bukan "Siapa saja yang memiliki Akun Google").'),
              h('li', null, 'Setelah kode diubah/ditempel ulang, pilih Versi: ', h('b', null, 'Versi baru'), ' lalu Terapkan.'),
              h('li', null, 'Fungsi "setup" sudah dijalankan dan izin akses sudah diberikan.')),
            h('a', { href: u, target: '_blank', rel: 'noopener' }, 'Tes: buka URL ini di tab baru'),
            ' — yang benar menampilkan tulisan "Penghubung aktif".'),
        );
      }
    } finally {
      saveBtn.disabled = false;
    }
  }

  const stEl = h('div', { class: 'st' });
  const syncBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => syncNow() }, icon('refresh', 18), 'Sinkron sekarang');
  const pendingEl = h('dd');
  const itemsEl = h('dd');
  function upd() {
    const s = describeStatus();
    stEl.replaceChildren(h('b', null, h('span', { class: `dot ${s.tone}` }), ' ', s.long), h('span', { class: 'muted small' }, s.detail));
    syncBtn.disabled = !isConfigured() || syncState.running;
    pendingEl.textContent = String(state.outbox.length);
    itemsEl.textContent = String(activeItems().length);
  }
  const offs = [onSync(upd), onChange(upd)];
  upd();

  const code = state.meta.deviceCode || 'ABC';
  const el = h('div', { class: 'page-settings' },
    h('section', { class: 'card form' },
      h('h2', null, 'Koneksi Google Sheets'),
      h('p', { class: 'muted small' }, 'Isi dengan URL Web App dan Kunci API dari Apps Script (lihat PANDUAN.md).'),
      url.el,
      key.el,
      h('div', { class: 'actions start' }, saveBtn),
      result),
    h('section', { class: 'card sync-card' }, stEl, syncBtn),
    h('section', { class: 'card' },
      h('h2', null, 'Perangkat ini'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Kode perangkat'), h('dd', null, code),
        h('dt', null, 'Barang tersimpan'), itemsEl,
        h('dt', null, 'Perubahan menunggu dikirim'), pendingEl),
      h('p', { class: 'muted small' }, `Kode perangkat dipakai di nomor transaksi, mis. 261117-${code}-001.`)));

  return { title: 'Pengaturan', el, destroy: () => offs.forEach((f) => f()) };
}
