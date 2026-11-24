// Pemilih barang: Tipe Barang (penyaring) + Nama Barang.
// Barang dengan nama sama tapi kemasan berbeda dibedakan lewat keterangan kemasan & harga.

import { combobox, h, icon } from './ui.js';
import { state, activeItems, distinct, getStok, itemName } from './store.js';
import { norm, priceLabel, stokText } from './format.js';

export function itemPicker({ onPick, tipeRequired = false, showStock = true } = {}) {
  let picked = null;
  function set(it) {
    if (picked === it) return;
    picked = it;
    onPick?.(it);
  }

  const tipe = combobox({
    label: 'Tipe Barang',
    required: tipeRequired,
    getOptions: () => distinct('tipe'),
    placeholderEmpty: 'Belum ada tipe barang',
    onChange: (v) => {
      if (picked && v && norm(picked.tipe) !== norm(v)) {
        nama.clear();
        set(null);
      }
    },
  });

  const nama = combobox({
    label: 'Nama Barang',
    required: true,
    getOptions: () =>
      activeItems()
        .filter((it) => !tipe.value || norm(it.tipe) === norm(tipe.value))
        .map((it) => ({
          value: it.id,
          // "AJI BASS 1 Liter" — kemasan hanya muncul bila ada barang kembar.
          label: itemName(it),
          sub: [priceLabel(it), showStock ? `Stok ${stokText(it, getStok(it))}` : null].filter(Boolean).join(' · '),
          // Tetap bisa dicari dengan mengetik tipe atau kemasan (mis. "jerigen").
          search: [it.tipe, it.kemasan, it.ukuran].filter(Boolean).join(' '),
        })),
    placeholderEmpty: 'Belum ada barang. Tambahkan lewat “Input Data Barang Baru”.',
    onChange: (id) => {
      const it = id ? state.items.get(id) : null;
      if (it && norm(tipe.value) !== norm(it.tipe)) tipe.value = it.tipe;
      set(it || null);
    },
  });

  // Kosongkan Tipe + Nama sekaligus agar penyaring tipe tidak "tersangkut".
  function reset({ focus = false } = {}) {
    tipe.clear();
    tipe.setError(null);
    nama.clear();
    nama.setError(null);
    set(null);
    if (focus) nama.focus();
  }

  const resetBtn = h('button', {
    type: 'button',
    class: 'btn btn-ghost btn-sm filter-reset',
    title: 'Hapus pilihan Tipe & Nama Barang',
    onclick: () => reset({ focus: true }),
  }, icon('refresh', 18), 'Reset');

  return {
    tipe,
    nama,
    /** Baris Tipe Barang + tombol Reset. */
    tipeRow: h('div', { class: 'filter-row' }, tipe.el, resetBtn),
    get item() {
      return picked ? state.items.get(picked.id) || picked : null;
    },
    clear() {
      nama.clear();
      set(null);
    },
    reset,
  };
}
