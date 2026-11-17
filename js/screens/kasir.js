// Layar Kasir: pilih barang → jumlah → Tambah ke daftar belanja → Selesai.

import { h, icon, textField, choice, toast, modal, confirmDialog, stokNode } from '../ui.js';
import { itemPicker } from '../picker.js';
import { state, setMeta, getStok, saveTransaksi, onChange } from '../store.js';
import { rp, fmtNum, round, variantLabel, priceLabel } from '../format.js';
import { scheduleSync } from '../sync.js';

const unitOf = (it, mode) => (mode === 'kemasan' ? it.kemasan : mode === 'ecer' ? it.bentukEcer : it.ukuran) || '';
const priceOf = (it, mode) => Number(mode === 'kemasan' ? it.hargaKemasan : mode === 'ecer' ? it.hargaEcer : it.harga) || 0;
const baseQty = (mode, qty, isi) => (mode === 'ecer' ? qty / isi : qty);
const lineName = (l) => l.nama + (l.berkemasan && l.variant ? ` (${l.variant})` : '');

function payOptions(total) {
  const s = new Set([total]);
  [5000, 10000, 50000, 100000].forEach((step) => {
    const v = Math.ceil(total / step) * step;
    if (v > total) s.add(v);
  });
  return [...s].sort((a, b) => a - b).slice(0, 4);
}

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
      modeChoice = choice({
        options: [
          { value: 'kemasan', label: `Kemasan (${item.kemasan})` },
          { value: 'ecer', label: `Eceran (${item.bentukEcer})` },
        ],
        value: 'kemasan',
        onChange: updateUnit,
      });
      parts.push(h('div', { class: 'q' }, 'Pembelian dalam . . .'), modeChoice.el);
    }
    qty = textField({ label: item.berkemasan ? 'Jumlah pembelian' : 'Jumlah', mode: 'decimal', enterkeyhint: 'done' });
    qty.input.addEventListener('input', updatePreview);
    qty.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    });
    unitEl = h('em', { class: 'unit' });
    preview = h('div', { class: 'preview' });
    parts.push(h('div', { class: 'qty-row' }, qty.el, unitEl), preview);
    detail.replaceChildren(...parts);
    renderInfo();
    updateUnit();
    qty.focus();
  }

  function updateUnit() {
    if (!item) return;
    unitEl.textContent = unitOf(item, curMode());
    updatePreview();
  }

  function updatePreview() {
    if (!item) return;
    const m = curMode();
    const price = priceOf(item, m);
    const q = qty.value;
    preview.textContent = q > 0
      ? `${fmtNum(q)} ${unitOf(item, m)} × ${rp(price)} = ${rp(Math.round(q * price))}`
      : `Harga ${rp(price)} per ${unitOf(item, m)}`;
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
    const it = item;
    const m = curMode();
    const price = priceOf(it, m);
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
        key, itemId: it.id, tipe: it.tipe, nama: it.nama, variant: variantLabel(it),
        berkemasan: it.berkemasan, kemasan: it.kemasan, ukuran: it.ukuran,
        mode: m, unit, price, isi, qty: q, subtotal: Math.round(q * price),
      });
    }
    saveCart();
    renderCart();
    toast(`${it.nama} ditambahkan`, 'ok', 1500);
    picker.clear();
    if (window.matchMedia('(pointer: fine)').matches) picker.nama.focus();
  }

  // ---- Daftar belanja ----
  const list = h('ul', { class: 'cart-list' });
  const countEl = h('span', { class: 'muted small' });
  const clearBtn = h('button', { type: 'button', class: 'link-danger', onclick: clearCart }, 'Kosongkan');
  const totalEls = [h('span', { class: 'amt' }), h('span', { class: 'amt' })];
  const doneBtns = [0, 1].map(() => h('button', { type: 'button', class: 'btn btn-save', onclick: finish }, 'Selesai'));
  const cartTotal = () => cart.lines.reduce((a, l) => a + l.subtotal, 0);

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
            h('span', { class: 'dt' }, `${fmtNum(l.qty)} ${l.unit} × ${rp(l.price)}`),
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
    modal({
      title: lineName(l),
      body: h('div', { class: 'form' }, h('p', { class: 'muted' }, `${rp(l.price)} per ${l.unit}`), f.el),
      actions: [
        { label: 'Hapus', class: 'btn-cancel', onClick: () => removeLine(i) },
        {
          label: 'Simpan',
          class: 'btn-save',
          onClick: () => {
            const q = f.value;
            if (!(q > 0)) {
              f.setError('Isi angka yang benar');
              return false;
            }
            l.qty = q;
            l.subtotal = Math.round(q * l.price);
            saveCart();
            renderCart();
            return true;
          },
        },
      ],
    });
  }

  function finish() {
    if (!cart.lines.length) return;
    const total = cartTotal();
    const bayar = textField({ label: 'Uang diterima (opsional)', mode: 'money' });
    const kembali = h('div', { class: 'kembali' });
    const upd = () => {
      const b = bayar.value;
      if (!bayar.raw || !(b >= 0)) {
        kembali.className = 'kembali';
        kembali.textContent = '';
        return;
      }
      const k = b - total;
      kembali.className = `kembali ${k < 0 ? 'neg' : 'pos'}`;
      kembali.textContent = k < 0 ? `Uang kurang ${rp(-k)}` : `Kembalian ${rp(k)}`;
    };
    bayar.input.addEventListener('input', upd);
    const quick = h('div', { class: 'quick' },
      payOptions(total).map((v) =>
        h('button', { type: 'button', class: 'chip', onclick: () => { bayar.value = v; bayar.setError(null); upd(); } },
          v === total ? 'Uang pas' : rp(v))));
    modal({
      title: 'Selesaikan transaksi',
      body: h('div', { class: 'form' },
        h('div', { class: 'total-box' }, h('span', null, 'TOTAL'), h('span', { class: 'amt' }, rp(total))),
        bayar.el, quick, kembali),
      actions: [
        { label: 'Batal', class: 'btn-cancel' },
        {
          label: 'Simpan',
          class: 'btn-save',
          onClick: async () => {
            const b = bayar.raw ? bayar.value : null;
            if (b != null && !(b >= total)) {
              bayar.setError('Uang diterima kurang dari total');
              return false;
            }
            try {
              const trx = await saveTransaksi(cart.lines, b);
              cart = { lines: [] };
              saveCart();
              renderCart();
              toast(`Transaksi ${trx.noTrx} tersimpan${b != null ? ` · Kembalian ${rp(b - total)}` : ''}`, 'ok', 4500);
              scheduleSync(800);
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

  const left = h('section', { class: 'kasir-form form' },
    picker.tipe.el,
    picker.nama.el,
    detail,
    h('div', { class: 'actions start' }, h('button', { type: 'button', class: 'btn btn-save', onclick: add }, 'Tambah')));
  const right = h('section', { class: 'cart-panel' },
    h('div', { class: 'cart' },
      h('div', { class: 'cart-head' }, h('b', null, 'Daftar Belanja'), countEl, clearBtn),
      list,
      h('div', { class: 'total-box' }, h('span', null, 'TOTAL'), totalEls[0])),
    h('div', { class: 'actions end desk-only' }, doneBtns[0]));
  const bar = h('div', { class: 'mobile-bar' }, h('div', { class: 'total-box' }, h('span', null, 'TOTAL'), totalEls[1]), doneBtns[1]);

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
