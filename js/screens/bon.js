// Catatan Bon: daftar pembeli yang belum lunas + pencatatan pembayaran/cicilan.

import { h, icon, textField, toast, modal } from '../ui.js';
import { bonList, bayarBon, onChange } from '../store.js';
import { scheduleSync, onSync } from '../sync.js';
import { rp, norm, fmtDateLong, localDate, fmtTime } from '../format.js';

export function BonScreen() {
  let tab = 'belum'; // 'belum' | 'lunas'
  const search = textField({ label: 'Cari nama' });
  search.input.addEventListener('input', render);

  const tabBelum = h('button', { type: 'button', class: 'seg-btn', onclick: () => { tab = 'belum'; render(); } }, 'Belum lunas');
  const tabLunas = h('button', { type: 'button', class: 'seg-btn', onclick: () => { tab = 'lunas'; render(); } }, 'Lunas (30 hari)');
  const sum = h('div', { class: 'card day-sum' });
  const listEl = h('div', { class: 'bon-list' });

  function pay(b) {
    const f = textField({ label: 'Jumlah dibayar', mode: 'money', value: b.sisa });
    const quick = h('div', { class: 'quick' },
      h('button', { type: 'button', class: 'chip', onclick: () => { f.value = b.sisa; f.setError(null); } }, `Lunas ${rp(b.sisa)}`));
    modal({
      title: `Bayar bon · ${b.nama}`,
      body: h('div', { class: 'form' },
        h('div', { class: 'info-row' }, h('span', null, 'Sisa bon ', h('b', null, rp(b.sisa))), h('span', { class: 'muted' }, `No. ${b.noTrx}`)),
        f.el, quick),
      actions: [
        { label: 'Batal', class: 'btn-cancel' },
        {
          label: 'Simpan',
          class: 'btn-save',
          onClick: async () => {
            const v = f.value;
            if (!(v > 0)) {
              f.setError('Isi jumlah yang dibayar');
              return false;
            }
            if (v > b.sisa) {
              f.setError(`Lebih besar dari sisa bon (${rp(b.sisa)})`);
              return false;
            }
            try {
              await bayarBon(b, v);
            } catch (e) {
              toast(`Gagal menyimpan: ${e.message || e}`, 'err', 5000);
              return false;
            }
            const sisa = b.sisa - v;
            toast(sisa > 0 ? `Pembayaran ${rp(v)} dicatat · sisa ${rp(sisa)}` : `Bon ${b.nama} lunas`, 'ok', 3500);
            scheduleSync(800);
            return true;
          },
        },
      ],
    });
  }

  function card(b) {
    const tglBelanja = localDate(new Date(b.waktu));
    const telp = String(b.telp || '').trim();
    return h('div', { class: `card bon-card ${b.sisa > 0 ? '' : 'lunas'}` },
      h('div', { class: 'bon-head' },
        h('div', null,
          h('b', { class: 'bon-nama' }, b.nama),
          telp ? h('a', { class: 'bon-telp', href: `tel:${telp.replace(/[^\d+]/g, '')}` }, icon('phone', 15), telp) : null),
        h('div', { class: 'bon-sisa' },
          b.sisa > 0 ? h('span', { class: 'muted small' }, 'Sisa') : h('span', { class: 'badge' }, 'Lunas'),
          b.sisa > 0 ? h('b', null, rp(b.sisa)) : null)),
      h('div', { class: 'muted small' },
        `${fmtDateLong(tglBelanja)} ${fmtTime(b.waktu)} · No. ${b.noTrx} · Belanja ${rp(b.total)} · Sudah dibayar ${rp(b.dibayar)}`,
        b.pending ? h('span', { class: 'badge wait' }, 'Menunggu dikirim') : null),
      b.sisa > 0 ? h('div', { class: 'actions start' }, h('button', { type: 'button', class: 'btn btn-save btn-sm', onclick: () => pay(b) }, 'Bayar')) : null);
  }

  function render() {
    const all = bonList();
    const q = norm(search.value);
    const open = all.filter((b) => b.sisa > 0);
    const rows = (tab === 'belum' ? open : all.filter((b) => b.sisa <= 0))
      .filter((b) => !q || norm(`${b.nama} ${b.telp} ${b.noTrx}`).includes(q));
    tabBelum.classList.toggle('on', tab === 'belum');
    tabLunas.classList.toggle('on', tab === 'lunas');
    const piutang = open.reduce((a, b) => a + b.sisa, 0);
    const orang = new Set(open.map((b) => norm(b.nama))).size;
    sum.replaceChildren(
      h('div', null, h('div', { class: 'muted small' }, 'Total bon belum lunas'), h('div', { class: 'big' }, rp(piutang))),
      h('div', { class: 'muted' }, `${open.length} bon · ${orang} orang`));
    listEl.replaceChildren(...(rows.length
      ? rows.map(card)
      : [h('p', { class: 'muted empty' }, tab === 'belum' ? (q ? 'Tidak ditemukan.' : 'Tidak ada bon yang belum lunas.') : 'Belum ada bon lunas dalam 30 hari terakhir.')]));
  }

  const offs = [onChange(render), onSync(render)];
  render();
  return {
    title: 'Catatan Bon',
    el: h('div', { class: 'page-bon' },
      sum,
      h('div', { class: 'seg' }, tabBelum, tabLunas),
      search.el,
      listEl,
      h('p', { class: 'muted small foot' }, 'Semua bon dan pembayarannya juga tercatat di sheet “Catatan Bon” dan “Pembayaran Bon”.')),
    destroy: () => offs.forEach((f) => f()),
  };
}
