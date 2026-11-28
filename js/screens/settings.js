// Pengaturan koneksi ke Google Sheets + status sinkron.

import { h, icon, textField, choice, toast } from '../ui.js';
import { strukSettings, STRUK_DEFAULT, contohTrx } from '../struk.js';
import { btSupported, pickPrinter, printerName } from '../printer.js';
import { cetak } from '../struk-ui.js';
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

  // ---- Struk & printer ----
  const ss = strukSettings();
  const fToko = textField({ label: 'Nama toko di struk', value: ss.namaToko });
  const fAlamat = textField({ label: 'Alamat (opsional)', value: ss.alamat });
  const fTelp = textField({ label: 'No. telp toko (opsional)', value: ss.telp });
  const fPesan = textField({ label: 'Pesan di bawah struk (opsional)', value: ss.pesan });
  const fLebar = choice({
    options: [{ value: 32, label: 'Kertas 58 mm' }, { value: 48, label: 'Kertas 80 mm' }],
    value: Number(ss.lebar) === 48 ? 48 : 32,
  });
  const printerSt = h('div', { class: 'muted small' });
  const updPrinter = () => {
    printerSt.textContent = !btSupported()
      ? 'Perangkat/browser ini tidak bisa cetak langsung lewat Bluetooth (perlu HP Android + Chrome). Struk tetap bisa dibagikan ke WhatsApp.'
      : printerName() ? `Printer: ${printerName()}` : 'Belum ada printer dipilih.';
  };
  updPrinter();
  async function saveStruk(silent = false) {
    await setMeta('struk', {
      namaToko: fToko.value || STRUK_DEFAULT.namaToko, alamat: fAlamat.value, telp: fTelp.value, pesan: fPesan.value, lebar: fLebar.value,
    });
    if (!silent) toast('Pengaturan struk tersimpan', 'ok');
  }
  const pickBtn = h('button', {
    type: 'button',
    class: 'btn btn-ghost btn-sm',
    onclick: async () => {
      try {
        const n = await pickPrinter();
        toast(`Tersambung ke ${n}`, 'ok');
      } catch (e) {
        toast(e.message || String(e), 'err', 6000);
      }
      updPrinter();
    },
  }, icon('printer', 18), 'Pilih printer');
  const testBtn = h('button', { type: 'button', class: 'btn btn-print btn-sm' }, 'Tes cetak');
  testBtn.addEventListener('click', async () => {
    await saveStruk(true);
    await cetak(contohTrx(), testBtn);
    updPrinter();
  });
  pickBtn.disabled = !btSupported();
  testBtn.disabled = !btSupported();

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
    h('section', { class: 'card form' },
      h('h2', null, 'Struk & printer'),
      printerSt,
      h('div', { class: 'actions start' }, pickBtn, testBtn),
      fToko.el, fAlamat.el, fTelp.el, fPesan.el,
      h('div', { class: 'q' }, 'Ukuran kertas printer'), fLebar.el,
      h('div', { class: 'actions start' }, h('button', { type: 'button', class: 'btn btn-save', onclick: () => saveStruk() }, 'Simpan pengaturan struk')),
      h('p', { class: 'muted small' }, 'Pengaturan struk dan printer tersimpan di perangkat ini saja.')),
    h('section', { class: 'card' },
      h('h2', null, 'Perangkat ini'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Kode perangkat'), h('dd', null, code),
        h('dt', null, 'Barang tersimpan'), itemsEl,
        h('dt', null, 'Perubahan menunggu dikirim'), pendingEl),
      h('p', { class: 'muted small' }, `Kode perangkat dipakai di nomor transaksi, mis. 261117-${code}-001.`)));

  return { title: 'Pengaturan', el, destroy: () => offs.forEach((f) => f()) };
}
