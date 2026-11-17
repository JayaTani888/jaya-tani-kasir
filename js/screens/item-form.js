// Formulir data barang (dipakai "Input Data Barang Baru" dan "Update Data Barang Tersedia").

import { h, icon, textField, combobox, choice, YA_TIDAK, toast, confirmDialog } from '../ui.js';
import { distinct, saveItem, deleteItem, findDuplicate, getStok } from '../store.js';
import { fullName } from '../format.js';
import { scheduleSync } from '../sync.js';

const DEF_KEMASAN = ['Karung', 'Jerigen', 'Botol', 'Sachet', 'Dus', 'Bungkus', 'Slop', 'Kaleng', 'Pak', 'Renteng'];
const DEF_SATUAN = ['kg', 'gram', 'ons', 'liter', 'ml', 'pcs', 'meter'];
const DEF_ECER = ['kg', 'gram', 'ons', 'liter', 'bungkus', 'batang', 'sachet', 'pcs', 'butir'];
const DEF_UKURAN = ['kg', 'gram', 'ons', 'liter', 'meter', 'ikat', 'butir', 'pcs'];

export function itemForm({ item = null, initial = {}, onCancel, onSaved, onDeleted }) {
  const d = item ? { ...item } : { berkemasan: true, bisaEcer: false, ...initial };

  const f = {
    tipe: combobox({ label: 'Tipe Barang', required: true, allowNew: true, getOptions: () => distinct('tipe'), value: d.tipe || '', placeholderEmpty: 'Ketik tipe barang baru' }),
    nama: textField({ label: 'Nama Barang', required: true, value: d.nama }),
    hargaKem: textField({ label: 'Harga Barang per Kemasan', required: true, mode: 'money', value: d.hargaKemasan }),
    hargaEcer: textField({ label: 'Harga Barang Eceran', required: true, mode: 'money', value: d.hargaEcer }),
    kemasan: combobox({ label: 'Kemasan', required: true, allowNew: true, getOptions: () => distinct('kemasan', DEF_KEMASAN), value: d.kemasan || '' }),
    berat: textField({ label: 'Berat/Volume', mode: 'decimal', value: d.beratVolume }),
    satuan: combobox({ label: 'Satuan', allowNew: true, getOptions: () => distinct('satuan', DEF_SATUAN), value: d.satuan || '' }),
    isi: textField({ label: 'Jumlah ecer per kemasan', required: true, mode: 'decimal', value: d.isiEcer }),
    bentuk: combobox({ label: 'Bentuk ecer', required: true, allowNew: true, getOptions: () => distinct('bentukEcer', DEF_ECER), value: d.bentukEcer || '' }),
    harga: textField({ label: 'Harga Barang', required: true, mode: 'money', value: d.harga }),
    ukuran: combobox({ label: 'Ukuran', required: true, allowNew: true, getOptions: () => distinct('ukuran', DEF_UKURAN), value: d.ukuran || '' }),
  };
  const berk = choice({ options: YA_TIDAK, value: !!d.berkemasan, onChange: layout });
  const ecer = choice({ options: YA_TIDAK, value: !!d.bisaEcer, onChange: layout });

  const qBerk = h('div', { class: 'yn' },
    h('span', { class: 'yn-q' }, 'Barang berkemasan tetap? ', h('small', null, '(cth.: jerigen, sachet, botol, karung)')),
    berk.el);
  const qEcer = h('div', { class: 'yn' }, h('span', { class: 'yn-q' }, 'Bisa dibeli eceran?'), ecer.el);
  const ecerRow = h('div', { class: 'row stack-sm' }, f.isi.el, f.bentuk.el);
  const ecerHint = h('p', { class: 'hint' },
    'Contoh: 1 karung beras = 25 kg → isi 25, bentuk ecer kg. 1 slop rokok = 10 bungkus → isi 10, bentuk ecer bungkus.');
  const secKem = h('div', { class: 'form-sec' },
    h('div', { class: 'row stack-sm' }, f.hargaKem.el, f.hargaEcer.el),
    f.kemasan.el,
    h('div', { class: 'row' }, f.berat.el, f.satuan.el),
    ecerRow,
    ecerHint);
  const secTanpa = h('div', { class: 'row per-row' }, f.harga.el, h('span', { class: 'per' }, 'per'), f.ukuran.el);

  function layout() {
    const b = berk.value;
    const e = b && ecer.value;
    qEcer.hidden = !b;
    secKem.hidden = !b;
    secTanpa.hidden = b;
    f.hargaEcer.el.hidden = !e;
    ecerRow.hidden = !e;
    ecerHint.hidden = !e;
    // Bantu isi otomatis: isi ecer = berat/volume kemasan (bisa diubah).
    if (e && !f.isi.raw && f.berat.value > 0 && f.satuan.value) {
      f.isi.value = f.berat.value;
      if (!f.bentuk.value) f.bentuk.value = f.satuan.value;
    }
  }

  function collect() {
    const errs = [];
    const need = (fld, ok, msg = 'Wajib diisi') => {
      if (!ok) {
        fld.setError(msg);
        errs.push(fld);
      }
    };
    const priceMsg = (fld) => (fld.raw ? 'Harga harus lebih dari 0' : 'Wajib diisi');
    const out = { tipe: f.tipe.value.trim(), nama: f.nama.value, berkemasan: berk.value };
    need(f.tipe, out.tipe);
    need(f.nama, out.nama);
    const nul = { kemasan: null, beratVolume: null, satuan: null, hargaKemasan: null, bisaEcer: false, hargaEcer: null, isiEcer: null, bentukEcer: null, harga: null, ukuran: null };
    Object.assign(out, nul);
    if (out.berkemasan) {
      out.bisaEcer = !!ecer.value;
      out.hargaKemasan = f.hargaKem.value;
      need(f.hargaKem, out.hargaKemasan > 0, priceMsg(f.hargaKem));
      if (out.bisaEcer) {
        out.hargaEcer = f.hargaEcer.value;
        need(f.hargaEcer, out.hargaEcer > 0, priceMsg(f.hargaEcer));
      }
      out.kemasan = f.kemasan.value.trim();
      need(f.kemasan, out.kemasan);
      if (f.berat.raw) {
        out.beratVolume = f.berat.value;
        need(f.berat, out.beratVolume > 0, 'Isi angka yang benar');
      }
      // Satuan hanya berarti bila Berat/Volume diisi.
      out.satuan = out.beratVolume ? f.satuan.value.trim() || null : null;
      if (out.beratVolume && !out.satuan) need(f.satuan, false, 'Pilih satuan');
      if (out.bisaEcer) {
        out.isiEcer = f.isi.value;
        need(f.isi, out.isiEcer > 0, f.isi.raw ? 'Isi angka yang benar' : 'Wajib diisi');
        out.bentukEcer = f.bentuk.value.trim();
        need(f.bentuk, out.bentukEcer);
      }
    } else {
      out.harga = f.harga.value;
      need(f.harga, out.harga > 0, priceMsg(f.harga));
      out.ukuran = f.ukuran.value.trim();
      need(f.ukuran, out.ukuran);
    }
    return { out, errs };
  }

  const saveBtn = h('button', { type: 'button', class: 'btn btn-save', onclick: save }, 'Simpan');

  async function save() {
    Object.values(f).forEach((x) => x.setError(null));
    const { out, errs } = collect();
    if (errs.length) {
      errs[0].focus();
      toast('Lengkapi kolom bertanda *', 'err');
      return;
    }
    if (findDuplicate(out, item?.id)) {
      f.nama.setError('Barang dengan tipe, nama, dan kemasan yang sama sudah ada');
      f.nama.focus();
      return;
    }
    if (item && item.berkemasan !== out.berkemasan && Math.abs(getStok(item)) > 1e-9) {
      const ok = await confirmDialog(
        'Jenis kemasan barang ini diubah. Angka stok yang ada akan dibaca dengan satuan baru. Periksa lagi stoknya lewat “Update Stok Barang” setelah ini.',
        { title: 'Ubah jenis kemasan?', okText: 'Lanjutkan' },
      );
      if (!ok) return;
    }
    saveBtn.disabled = true;
    try {
      const saved = await saveItem(item ? { ...out, id: item.id } : out);
      toast(`“${fullName(saved)}” tersimpan`, 'ok');
      scheduleSync();
      onSaved?.(saved);
    } catch (e) {
      console.error(e);
      toast(`Gagal menyimpan: ${e.message || e}`, 'err', 5000);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function del() {
    const ok = await confirmDialog(
      `Hapus “${fullName(item)}”? Barang tidak akan muncul lagi di Kasir dan Update Stok. Riwayat transaksinya tetap tersimpan.`,
      { title: 'Hapus barang', okText: 'Hapus', okClass: 'btn-cancel' },
    );
    if (!ok) return;
    await deleteItem(item.id);
    toast('Barang dihapus', 'ok');
    scheduleSync();
    onDeleted?.();
  }

  const el = h('div', { class: 'form' },
    f.tipe.el,
    f.nama.el,
    qBerk,
    qEcer,
    secKem,
    secTanpa,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-cancel', onclick: () => onCancel?.() }, 'Batal'),
      saveBtn),
    item ? h('div', { class: 'del-row' }, h('button', { type: 'button', class: 'btn btn-danger-text', onclick: del }, icon('trash', 18), 'Hapus barang ini')) : null);

  layout();
  return { el, focusName: () => f.nama.focus() };
}
