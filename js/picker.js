// Pemilih barang: Tipe Barang (penyaring) + Nama Barang.
// Barang dengan nama sama tapi kemasan berbeda dibedakan lewat keterangan kemasan & harga.

import { combobox } from './ui.js';
import { state, activeItems, distinct, getStok } from './store.js';
import { norm, fullName, variantLabel, priceLabel, stokText } from './format.js';

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
          label: it.nama,
          display: fullName(it),
          sub: [it.berkemasan ? variantLabel(it) : null, priceLabel(it), showStock ? `Stok ${stokText(it, getStok(it))}` : null]
            .filter(Boolean)
            .join(' · '),
          search: it.tipe,
        })),
    placeholderEmpty: 'Belum ada barang. Tambahkan lewat “Input Data Barang Baru”.',
    onChange: (id) => {
      const it = id ? state.items.get(id) : null;
      if (it && norm(tipe.value) !== norm(it.tipe)) tipe.value = it.tipe;
      set(it || null);
    },
  });

  return {
    tipe,
    nama,
    get item() {
      return picked ? state.items.get(picked.id) || picked : null;
    },
    clear() {
      nama.clear();
      set(null);
    },
  };
}
