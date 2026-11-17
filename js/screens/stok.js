// Layar Update Stok Barang: "Tambah stok" (barang masuk) atau "Koreksi stok" (hasil hitung ulang).

import { h, textField, choice, toast, stokNode } from '../ui.js';
import { itemPicker } from '../picker.js';
import { state, getStok, changeStock, onChange } from '../store.js';
import { fmtNum, stokText, stockUnit, round } from '../format.js';
import { scheduleSync } from '../sync.js';

export function StokScreen() {
  let item = null;
  let infoEl = null;
  let modeC = null;
  let f1 = null;
  let f2 = null;
  let hint = null;
  let prev = null;

  const detail = h('div', { class: 'stok-detail' });
  const picker = itemPicker({
    onPick: (it) => {
      item = it;
      render();
    },
  });

  function renderInfo() {
    if (!item || !infoEl) return;
    const rows = [h('div', null, 'Jumlah barang saat ini: ', h('b', null, stokNode(item, getStok(item))))];
    if (item.berkemasan && item.bisaEcer) {
      rows.push(h('div', null, 'Jumlah ecer per kemasan: ', h('b', null, fmtNum(item.isiEcer), ' ', h('em', null, item.bentukEcer)), ' per ', h('em', null, item.kemasan)));
    }
    infoEl.replaceChildren(...rows);
  }

  function render() {
    if (!item) {
      detail.replaceChildren();
      prev = null;
      return;
    }
    infoEl = h('div', { class: 'info' });
    modeC = choice({
      options: [
        { value: 'tambah', label: 'Tambah stok' },
        { value: 'koreksi', label: 'Koreksi stok' },
      ],
      value: 'tambah',
      onChange: relabel,
    });
    hint = h('p', { class: 'hint' });
    f1 = textField({ label: '', mode: 'decimal' });
    const rows = [h('div', { class: 'qty-row' }, f1.el, h('em', { class: 'unit' }, stockUnit(item)))];
    f2 = null;
    if (item.berkemasan && item.bisaEcer) {
      f2 = textField({ label: '', mode: 'decimal' });
      rows.push(h('div', { class: 'qty-row' }, f2.el, h('em', { class: 'unit' }, item.bentukEcer)));
    }
    prev = h('div', { class: 'preview' });
    [f1, f2].filter(Boolean).forEach((f) => {
      f.input.addEventListener('input', preview);
      f.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        }
      });
    });
    detail.replaceChildren(infoEl, modeC.el, hint, ...rows, prev,
      h('div', { class: 'actions start' }, h('button', { type: 'button', class: 'btn btn-pick', onclick: save }, 'Simpan')));
    renderInfo();
    relabel();
  }

  function relabel() {
    const t = modeC.value === 'tambah';
    if (item.berkemasan) {
      f1.setLabel(t ? 'Tambah jumlah kemasan' : 'Jumlah kemasan sebenarnya');
      f2?.setLabel(t ? 'Tambah ecer (opsional)' : 'Sisa ecer (opsional)');
    } else {
      f1.setLabel(t ? 'Tambah jumlah barang' : 'Jumlah barang sebenarnya');
    }
    hint.textContent = t
      ? 'Untuk barang masuk / belanja stok. Jumlah ini ditambahkan ke stok sekarang.'
      : 'Untuk hasil hitung ulang. Stok diganti menjadi jumlah ini.';
    preview();
  }

  function compute() {
    const has1 = !!f1.raw;
    const has2 = !!(f2 && f2.raw);
    const a = has1 ? f1.value : 0;
    const b = has2 ? f2.value : 0;
    if (has1 && !(a >= 0)) return { err: [f1, 'Isi angka yang benar'] };
    if (has2 && !(b >= 0)) return { err: [f2, 'Isi angka yang benar'] };
    if (!has1 && !has2) return { err: [f1, 'Isi jumlahnya'], empty: true };
    const amount = round(a + (f2 ? b / Number(item.isiEcer) : 0), 6);
    const cur = getStok(item);
    if (modeC.value === 'tambah') {
      if (!(amount > 0)) return { err: [f1, 'Jumlah harus lebih dari 0'] };
      return { delta: amount, target: round(cur + amount, 6), a, b };
    }
    return { delta: round(amount - cur, 6), target: amount, a, b };
  }

  function preview() {
    if (!prev || !item) return;
    const r = compute();
    prev.replaceChildren(...(r.err ? [] : ['Stok setelah disimpan: ', h('b', null, stokNode(item, r.target))]));
  }

  async function save() {
    if (!item) {
      picker.nama.setError('Pilih barang dulu');
      picker.nama.focus();
      return;
    }
    const r = compute();
    if (r.err) {
      r.err[0].setError(r.err[1]);
      r.err[0].focus();
      return;
    }
    if (Math.abs(r.delta) < 1e-9) {
      toast('Stok tidak berubah', 'info');
      return;
    }
    const it = item;
    const jenis = modeC.value;
    const amt = [r.a > 0 ? `${fmtNum(r.a)} ${stockUnit(it)}` : null, r.b > 0 ? `${fmtNum(r.b)} ${it.bentukEcer}` : null].filter(Boolean).join(' + ') || '0';
    const before = stokText(it, getStok(it));
    const after = stokText(it, r.target);
    const ket = jenis === 'tambah' ? `Tambah ${amt}` : `Koreksi ${before} → ${after}`;
    try {
      await changeStock(it, { jenis, delta: r.delta, ket });
    } catch (e) {
      toast(`Gagal menyimpan: ${e.message || e}`, 'err', 5000);
      return;
    }
    toast(`Stok ${it.nama} sekarang ${after}`, 'ok', 3500);
    scheduleSync(800);
    render();
  }

  const off = onChange(() => {
    if (!item) return;
    item = state.items.get(item.id) || item;
    renderInfo();
    preview();
  });

  return {
    title: 'Update Stok Barang',
    el: h('div', { class: 'form page-stok' }, picker.tipe.el, picker.nama.el, detail),
    destroy: off,
  };
}
