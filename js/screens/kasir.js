// Layar Kasir: pilih barang → jumlah → Tambah ke daftar belanja → Selesai.

import { h, icon, textField, combobox, choice, toast, modal, confirmDialog, stokNode } from '../ui.js';
import { itemPicker } from '../picker.js';
import { state, setMeta, getStok, saveTransaksi, onChange, itemName, bonList } from '../store.js';
import { rp, fmtNum, round, norm, variantLabel, priceLabel } from '../format.js';
import { scheduleSync } from '../sync.js';
import { strukButtons, cetak } from '../struk-ui.js';

const unitOf = (it, mode) => (mode === 'kemasan' ? it.kemasan : mode === 'ecer' ? it.bentukEcer : it.ukuran) || '';
const priceOf = (it, mode) => Number(mode === 'kemasan' ? it.hargaKemasan : mode === 'ecer' ? it.hargaEcer : it.harga) || 0;
const baseQty = (mode, qty, isi) => (mode === 'ecer' ? qty / isi : qty);
// "AMIFOS 5 Liter" (tanpa kemasan; satuannya sudah terlihat di baris "5 Jerigen × …").
const lineName = (l) => {
  const it = state.items.get(l.itemId);
  if (it) return itemName(it);
  return l.label || l.nama + (l.berkemasan && l.variant ? ` (${l.variant})` : '');
};

export function KasirScreen() {
  // Daftar belanja disimpan di perangkat, jadi tidak hilang bila aplikasi tertutup / listrik padam.
  let cart = { lines: [] };
  try {
    cart = JSON.parse(JSON.stringify(state.meta.cart || { lines: [] }));
  } catch { /* abaikan */ }
  if (!Array.isArray(cart.lines)) cart = { lines: [] };

  let item = null;
  let modeChoice = null;
  let qty = null;
  let unitEl = null;
  let priceF = null;
  let priceUnitEl = null;
  let priceRow = null;
  let priceBtn = null;
  let preview = null;
  let infoEl = null;

  const detail = h('div', { class: 'kasir-detail' });
  const picker = itemPicker({
    onPick: (it) => {
      item = it;
      renderDetail();
    },
  });

  const curMode = () => (modeChoice ? modeChoice.value : item.berkemasan ? 'kemasan' : 'ukuran');

  function renderInfo() {
    if (!infoEl || !item) return;
    infoEl.replaceChildren(h('span', null, priceLabel(item)), h('span', null, 'Stok: ', stokNode(item, getStok(item))));
  }

  function renderDetail() {
    modeChoice = null;
    if (!item) {
      detail.replaceChildren();
      return;
    }
    infoEl = h('div', { class: 'info info-row' });
    const parts = [infoEl];
    if (item.berkemasan && item.bisaEcer) {
      // Eceran didahulukan dan langsung tercentang.
      modeChoice = choice({
        options: [
          { value: 'ecer', label: item.bentukEcer },
          { value: 'kemasan', label: item.kemasan },
        ],
        value: 'ecer',
        onChange: updateUnit,
      });
      parts.push(h('div', { class: 'q' }, 'Pembelian dalam . . .'), modeChoice.el);
    }
    const onEnter = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    };
    qty = textField({ label: item.berkemasan ? 'Jumlah pembelian' : 'Jumlah', mode: 'decimal', enterkeyhint: 'done' });
    qty.input.addEventListener('input', updatePreview);
    qty.input.addEventListener('keydown', onEnter);
    unitEl = h('em', { class: 'unit' });
    // Harga terisi otomatis dari data barang, tetapi boleh diubah untuk transaksi ini saja.
    priceF = textField({ label: 'Harga', mode: 'money', enterkeyhint: 'done' });
    priceF.input.addEventListener('input', updatePreview);
    priceF.input.addEventListener('keydown', onEnter);
    priceF.input.addEventListener('focus', () => setTimeout(() => priceF.input.select(), 0));
    priceUnitEl = h('em', { class: 'unit' });
    preview = h('div', { class: 'preview' });
    // Kotak harga baru muncul setelah tombol "Ubah harga" ditekan.
    priceRow = h('div', { class: 'qty-row price-row', hidden: true }, priceF.el, priceUnitEl);
    priceBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm price-btn', onclick: togglePrice });
    parts.push(
      h('div', { class: 'qty-row' }, qty.el, unitEl),
      priceRow,
      h('div', { class: 'preview-row' }, preview, priceBtn),
    );
    detail.replaceChildren(...parts);
    renderInfo();
    updateUnit();
    setPriceOpen(false);
    qty.focus();
  }

  function setPriceOpen(open) {
    priceRow.hidden = !open;
    priceBtn.replaceChildren(icon(open ? 'x' : 'edit', 16), open ? 'Batal ubah harga' : 'Ubah harga');
    if (!open && item) {
      priceF.value = priceOf(item, curMode()); // kembali ke harga normal
      priceF.setError(null);
    }
    updatePreview();
  }
  function togglePrice() {
    const open = priceRow.hidden;
    setPriceOpen(open);
    if (open) priceF.focus();
    else qty.focus();
  }

  function updateUnit() {
    if (!item) return;
    const m = curMode();
    unitEl.textContent = unitOf(item, m);
    priceUnitEl.textContent = `per ${unitOf(item, m)}`;
    priceF.value = priceOf(item, m); // ganti pilihan → kembali ke harga normal
    priceF.setError(null);
    updatePreview();
  }

  const curPrice = () => (priceF && priceF.raw ? priceF.value : NaN);

  function updatePreview() {
    if (!item) return;
    const m = curMode();
    const normal = priceOf(item, m);
    const price = curPrice();
    const q = qty.value;
    const changed = price > 0 && price !== normal;
    preview.replaceChildren(
      q > 0 && price > 0
        ? `${fmtNum(q)} ${unitOf(item, m)} × ${rp(price)} = ${rp(Math.round(q * price))}`
        : `Harga ${rp(price > 0 ? price : normal)} per ${unitOf(item, m)}`,
      changed ? h('span', { class: 'price-changed' }, ` · harga diubah dari ${rp(normal)}`) : '',
    );
  }

  async function add() {
    if (!item) {
      picker.nama.setError('Pilih barang dulu');
      picker.nama.focus();
      return;
    }
    const q = qty.value;
    if (!(q > 0)) {
      qty.setError(qty.raw ? 'Isi angka yang benar' : 'Isi jumlah pembelian');
      qty.focus();
      return;
    }
    const price = curPrice();
    if (!(price > 0)) {
      setPriceOpen(true);
      priceF.setError(priceF.raw ? 'Harga harus lebih dari 0' : 'Isi harga');
      priceF.focus();
      return;
    }
    const it = item;
    const m = curMode();
    const priceNormal = priceOf(it, m);
    const unit = unitOf(it, m);
    const isi = m === 'ecer' ? Number(it.isiEcer) || 1 : 1;
    const inCart = cart.lines.filter((l) => l.itemId === it.id).reduce((a, l) => a + baseQty(l.mode, l.qty, l.isi), 0);
    const sisa = round(getStok(it) - inCart, 6);
    if (sisa + 1e-9 < baseQty(m, q, isi)) {
      const ok = await confirmDialog(
        h('span', null, 'Stok tidak cukup. Sisa stok: ', stokNode(it, sisa), '. Tetap tambahkan ke daftar belanja?'),
        { title: 'Stok kurang', okText: 'Tetap tambah' },
      );
      if (!ok) return;
    }
    const key = `${it.id}|${m}`;
    const same = cart.lines.find((l) => l.key === key && l.price === price);
    if (same) {
      same.qty = round(same.qty + q, 6);
      same.subtotal = Math.round(same.qty * same.price);
    } else {
      cart.lines.push({
        key, itemId: it.id, tipe: it.tipe, nama: it.nama, variant: variantLabel(it), label: itemName(it),
        berkemasan: it.berkemasan, kemasan: it.kemasan, ukuran: it.ukuran,
        mode: m, unit, price, priceNormal, isi, qty: q, subtotal: Math.round(q * price),
      });
    }
    saveCart();
    renderCart();
    toast(`${itemName(it)} ditambahkan`, 'ok', 1500);
    // Tipe ikut dikosongkan agar barang berikutnya bisa langsung dicari dari semua tipe.
    picker.reset({ focus: window.matchMedia('(pointer: fine)').matches });
  }

  // ---- Daftar belanja ----
  const list = h('ul', { class: 'cart-list' });
  const countEl = h('span', { class: 'muted small' });
  const clearBtn = h('button', { type: 'button', class: 'link-danger', onclick: clearCart }, 'Kosongkan');
  const totalEls = [h('span', { class: 'amt' }), h('span', { class: 'amt' })];
  const doneBtns = [0, 1].map(() => h('button', { type: 'button', class: 'btn btn-save', onclick: finish }, 'Selesai'));
  const cartTotal = () => cart.lines.reduce((a, l) => a + l.subtotal, 0);
  // Pilihan pembayaran di samping tombol Selesai (desktop) dan di bilah bawah (HP); keduanya selalu sama.
  const PAY = [{ value: 'pas', label: 'Uang pas' }, { value: 'bon', label: 'Bon' }];
  const payChoices = [0, 1].map(() => choice({ options: PAY, value: 'pas', className: 'pay-choice', onChange: (v) => setPayMode(v) }));
  const payMode = () => payChoices[0].value;
  function setPayMode(v) {
    payChoices.forEach((c) => { if (c.value !== v) c.value = v; });
  }

  function renderCart() {
    list.replaceChildren(
      ...(cart.lines.length
        ? cart.lines.map((l, i) =>
            h('li', {
              class: 'cart-line', tabindex: '0', role: 'button', 'aria-label': `Ubah ${lineName(l)}`,
              onclick: () => editLine(i),
              onkeydown: (e) => { if (e.key === 'Enter') editLine(i); },
            },
            h('span', { class: 'nm' }, lineName(l)),
            h('span', { class: 'dt' }, `${fmtNum(l.qty)} ${l.unit} × ${rp(l.price)}`,
              l.priceNormal != null && l.price !== l.priceNormal ? h('span', { class: 'price-changed' }, ' · harga diubah') : ''),
            h('span', { class: 'sub' }, rp(l.subtotal)),
            h('button', {
              type: 'button', class: 'rm', 'aria-label': `Hapus ${lineName(l)}`,
              onclick: (e) => { e.stopPropagation(); removeLine(i); },
            }, icon('x', 18))))
        : [h('li', { class: 'cart-empty' }, 'Belum ada barang. Pilih barang lalu tekan Tambah.')]),
    );
    const total = cartTotal();
    totalEls.forEach((e) => { e.textContent = rp(total); });
    doneBtns.forEach((b) => { b.disabled = !cart.lines.length; });
    countEl.textContent = cart.lines.length ? `${cart.lines.length} barang` : '';
    clearBtn.hidden = !cart.lines.length;
  }

  function saveCart() {
    setMeta('cart', cart).catch((e) => console.error(e));
  }
  function removeLine(i) {
    cart.lines.splice(i, 1);
    saveCart();
    renderCart();
  }
  async function clearCart() {
    const ok = await confirmDialog('Kosongkan semua barang di daftar belanja?', { title: 'Kosongkan daftar', okText: 'Kosongkan', okClass: 'btn-cancel' });
    if (!ok) return;
    cart = { lines: [] };
    saveCart();
    renderCart();
  }
  function editLine(i) {
    const l = cart.lines[i];
    if (!l) return;
    const f = textField({ label: `Jumlah (${l.unit})`, mode: 'decimal', value: l.qty, enterkeyhint: 'done' });
    const pf = textField({ label: `Harga per ${l.unit}`, mode: 'money', value: l.price, enterkeyhint: 'done' });
    const normal = l.priceNormal ?? l.price;
    modal({
      title: lineName(l),
      body: h('div', { class: 'form' }, f.el, pf.el, h('p', { class: 'muted small' }, `Harga normal ${rp(normal)} per ${l.unit}`)),
      actions: [
        { label: 'Hapus', class: 'btn-cancel', onClick: () => removeLine(i) },
        {
          label: 'Simpan',
          class: 'btn-save',
          onClick: () => {
            const q = f.value;
            const p = pf.value;
            let bad = false;
            if (!(q > 0)) {
              f.setError('Isi angka yang benar');
              bad = true;
            }
            if (!(p > 0)) {
              pf.setError('Harga harus lebih dari 0');
              bad = true;
            }
            if (bad) return false;
            l.qty = q;
            l.price = p;
            l.subtotal = Math.round(q * l.price);
            saveCart();
            renderCart();
            return true;
          },
        },
      ],
    });
  }

  // ---- Pembayaran: Uang pas (langsung selesai) atau Bon ----
  async function finish() {
    if (!cart.lines.length) return;
    if (payMode() === 'bon') {
      finishBon();
      return;
    }
    doneBtns.forEach((b) => { b.disabled = true; });
    try {
      const trx = await saveTransaksi(cart.lines, null, null);
      afterSave();
      toast(h('span', { class: 'toast-row' },
        h('span', null, `Transaksi ${trx.noTrx} selesai · ${rp(trx.total)}`),
        h('button', { type: 'button', class: 'toast-btn', onclick: (e) => cetak(trx, e.currentTarget) }, icon('printer', 16), 'Cetak struk')),
      'ok', 6000);
    } catch (e) {
      console.error(e);
      toast(`Gagal menyimpan transaksi: ${e.message || e}`, 'err', 5000);
    } finally {
      renderCart();
    }
  }

  function afterSave() {
    cart = { lines: [] };
    saveCart();
    renderCart();
    scheduleSync(800);
    setPayMode('pas'); // transaksi berikutnya kembali ke Uang pas
  }

  function finishBon() {
    const total = cartTotal();
    const bayar = textField({ label: 'Uang dibayar sekarang (kosongkan bila belum bayar)', mode: 'money' });
    const kembali = h('div', { class: 'kembali neg' }, `Sisa bon ${rp(total)}`);

    const pelanggan = new Map();
    for (const b of bonList()) if (b.nama && !pelanggan.has(norm(b.nama))) pelanggan.set(norm(b.nama), b);
    const telp = textField({ label: 'No. telp (opsional)', type: 'tel' });
    telp.input.setAttribute('inputmode', 'tel');
    const nama = combobox({
      label: 'Atas nama',
      required: true,
      allowNew: true,
      getOptions: () => [...pelanggan.values()].map((b) => ({ value: b.nama, label: b.nama, sub: b.telp || '' })),
      placeholderEmpty: 'Ketik nama pembeli',
      onChange: (v) => {
        const p = v ? pelanggan.get(norm(v)) : null;
        if (p?.telp && !telp.raw) telp.value = p.telp;
      },
    });
    const bonBox = h('div', { class: 'bon-box' }, nama.el, telp.el);

    const upd = () => {
      const b = bayar.raw ? bayar.value : 0;
      if (!(b >= 0)) {
        kembali.textContent = '';
        return;
      }
      kembali.textContent = b >= total ? 'Uang sudah cukup — pilih "Uang pas" saja' : `Sisa bon ${rp(total - b)}`;
    };
    bayar.input.addEventListener('input', upd);
    modal({
      title: 'Catat sebagai bon',
      body: h('div', { class: 'form' },
        h('div', { class: 'total-box' }, h('span', null, 'TOTAL'), h('span', { class: 'amt' }, rp(total))),
        bonBox, bayar.el, kembali),
      actions: [
        { label: 'Batal', class: 'btn-cancel' },
        {
          label: 'Simpan',
          class: 'btn-save',
          onClick: async () => {
            const nm = nama.input.value.trim();
            const b = bayar.raw ? bayar.value : 0;
            let bad = false;
            if (!nm) {
              nama.setError('Isi nama untuk catatan bon');
              bad = true;
            }
            if (!(b >= 0)) {
              bayar.setError('Isi angka yang benar');
              bad = true;
            } else if (b >= total) {
              bayar.setError('Uang sudah cukup. Batalkan lalu pilih "Uang pas".');
              bad = true;
            }
            if (bad) {
              (nm ? bayar : nama).focus();
              return false;
            }
            try {
              const trx = await saveTransaksi(cart.lines, b, { nama: nm, telp: telp.raw });
              afterSave();
              showResult(trx);
              return true;
            } catch (e) {
              console.error(e);
              toast(`Gagal menyimpan transaksi: ${e.message || e}`, 'err', 5000);
              return false;
            }
          },
        },
      ],
    });
  }

  // Ringkasan setelah transaksi tersimpan + tombol cetak/bagikan struk.
  function showResult(trx) {
    const big = trx.bon
      ? h('div', { class: 'result-big bon' }, h('span', null, 'Sisa bon'), h('b', null, rp(trx.bon.sisa)))
      : h('div', { class: 'result-big' }, h('span', null, 'Kembalian'), h('b', null, rp(trx.kembalian)));
    modal({
      title: 'Transaksi tersimpan',
      body: h('div', { class: 'form result' },
        h('div', { class: 'muted small' }, `No. ${trx.noTrx}`),
        h('div', { class: 'info-row' },
          h('span', null, 'Total ', h('b', null, rp(trx.total))),
          h('span', null, trx.bon ? 'Dibayar ' : 'Diterima ', h('b', null, rp(trx.bayar)))),
        big,
        trx.bon ? h('div', { class: 'muted small' }, `Bon atas nama ${trx.bon.nama}${trx.bon.telp ? ` · ${trx.bon.telp}` : ''}`) : null,
        strukButtons(trx)),
      actions: [{ label: 'Selesai', class: 'btn-save' }],
    });
  }

  const left = h('section', { class: 'kasir-form form' },
    picker.tipeRow,
    picker.nama.el,
    detail,
    h('div', { class: 'actions start' }, h('button', { type: 'button', class: 'btn btn-save', onclick: add }, 'Tambah')));
  const right = h('section', { class: 'cart-panel' },
    h('div', { class: 'cart' },
      h('div', { class: 'cart-head' }, h('b', null, 'Daftar Belanja'), countEl, clearBtn),
      list,
      h('div', { class: 'total-box' }, h('span', null, 'TOTAL'), totalEls[0])),
    h('div', { class: 'pay-row desk-only' }, payChoices[0].el, doneBtns[0]));
  const bar = h('div', { class: 'mobile-bar' },
    h('div', { class: 'pay-row-m' }, payChoices[1].el),
    h('div', { class: 'bar-main' }, h('div', { class: 'total-box' }, h('span', null, 'TOTAL'), totalEls[1]), doneBtns[1]));

  renderCart();
  document.body.classList.add('has-bar');
  const off = onChange(() => {
    if (!item) return;
    item = state.items.get(item.id) || null;
    if (item) renderInfo();
    else renderDetail();
  });

  return {
    title: 'Kasir',
    el: h('div', { class: 'kasir' }, left, right, bar),
    destroy() {
      off();
      document.body.classList.remove('has-bar');
    },
  };
}
