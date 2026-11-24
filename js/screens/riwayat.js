// Riwayat transaksi per tanggal (dari perangkat ini).

import { h } from '../ui.js';
import { getTransaksiByDate, onChange } from '../store.js';
import { rp, fmtNum, localDate, shiftDate, fmtDateLong, fmtTime } from '../format.js';

export function RiwayatScreen() {
  let tanggal = localDate();
  const openIds = new Set();

  const dateIn = h('input', { type: 'date', class: 'date-input', value: tanggal, max: localDate(), 'aria-label': 'Tanggal' });
  dateIn.addEventListener('change', () => {
    if (dateIn.value) {
      tanggal = dateIn.value;
      load();
    }
  });
  const prevB = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Hari sebelumnya', onclick: () => go(-1) }, '‹');
  const nextB = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Hari berikutnya', onclick: () => go(1) }, '›');
  function go(n) {
    const t = shiftDate(tanggal, n);
    if (t > localDate()) return;
    tanggal = t;
    dateIn.value = t;
    load();
  }

  const sum = h('div', { class: 'card day-sum' });
  const listEl = h('div', { class: 'trx-list' });

  function card(t) {
    const d = h('details', { class: 'trx', open: openIds.has(t.id) },
      h('summary', null,
        h('span', { class: 'trx-main' }, h('b', null, t.noTrx), h('span', { class: 'muted small' }, `${fmtTime(t.waktu)} · ${t.lines.length} barang`)),
        h('span', { class: 'trx-side' }, h('b', null, rp(t.total)), h('span', { class: `badge ${t.synced ? '' : 'wait'}` }, t.synced ? 'Terkirim' : 'Menunggu'))),
      h('ul', { class: 'trx-lines' },
        t.lines.map((l) =>
          h('li', null,
            h('span', null, l.label || `${l.nama}${l.variant && l.mode !== 'ukuran' ? ` (${l.variant})` : ''}`, h('span', { class: 'muted small' }, ` · ${fmtNum(l.qty)} ${l.unit} × ${rp(l.price)}`)),
            h('span', null, rp(l.subtotal))))),
      t.bayar != null ? h('div', { class: 'trx-pay muted small' }, `Uang diterima ${rp(t.bayar)} · Kembalian ${rp(t.kembalian)}`) : null);
    d.addEventListener('toggle', () => (d.open ? openIds.add(t.id) : openIds.delete(t.id)));
    return d;
  }

  let seq = 0;
  async function load() {
    const my = ++seq;
    const rows = (await getTransaksiByDate(tanggal)).sort((a, b) => b.waktu - a.waktu);
    if (my !== seq) return;
    const total = rows.reduce((a, t) => a + t.total, 0);
    nextB.disabled = tanggal >= localDate();
    sum.replaceChildren(
      h('div', null, h('div', { class: 'muted small' }, fmtDateLong(tanggal)), h('div', { class: 'big' }, rp(total))),
      h('div', { class: 'muted' }, `${rows.length} transaksi`));
    listEl.replaceChildren(...(rows.length ? rows.map(card) : [h('p', { class: 'muted empty' }, 'Belum ada transaksi di tanggal ini.')]));
  }

  const off = onChange(load);
  load();
  return {
    title: 'Riwayat Transaksi',
    el: h('div', { class: 'page-riwayat' },
      h('div', { class: 'day-nav' }, prevB, dateIn, nextB),
      sum,
      listEl,
      h('p', { class: 'muted small foot' }, 'Hanya menampilkan transaksi dari perangkat ini. Transaksi dari semua perangkat ada di sheet “Transaksi Harian”.')),
    destroy: off,
  };
}
