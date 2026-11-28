// Struk belanja: teks untuk dibagikan dan perintah ESC/POS untuk printer thermal.

import { state } from './store.js';
import { fmtNum } from './format.js';

export const STRUK_DEFAULT = {
  namaToko: 'TOKO JAYA TANI',
  alamat: '',
  telp: '',
  pesan: 'Terima kasih atas kunjungan Anda',
  lebar: 32, // 32 karakter = kertas 58 mm, 48 = kertas 80 mm
};

export function strukSettings() {
  return { ...STRUK_DEFAULT, ...(state.meta.struk || {}) };
}

const num = (n) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
const pad2 = (n) => String(n).padStart(2, '0');

/** Huruf di luar ASCII (—, ×, é, …) diganti agar terbaca di semua printer. */
export function ascii(s) {
  return String(s ?? '')
    .replace(/[—–]/g, '-')
    .replace(/×/g, 'x')
    .replace(/·/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

function wrap(text, w) {
  const out = [];
  let line = '';
  for (const word of ascii(text).split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= w) line += ' ' + word;
    else {
      out.push(line);
      line = word;
    }
    while (line.length > w) {
      out.push(line.slice(0, w));
      line = line.slice(w);
    }
  }
  if (line) out.push(line);
  return out;
}

const lr = (l, r, w) => {
  l = ascii(l);
  r = ascii(r);
  const space = w - l.length - r.length;
  return space >= 1 ? l + ' '.repeat(space) + r : `${l}\n${' '.repeat(Math.max(0, w - r.length))}${r}`;
};

/**
 * Susun struk sebagai daftar baris { t, align: 'left'|'center', bold, big }.
 * trx = data transaksi tersimpan (lihat store.saveTransaksi).
 */
export function strukRows(trx, s = strukSettings()) {
  const w = Number(s.lebar) || 32;
  const rows = [];
  const add = (t, o = {}) => String(t).split('\n').forEach((x) => rows.push({ t: x, align: 'left', ...o }));
  const line = () => add('-'.repeat(w));
  const d = new Date(trx.waktu);

  wrap(s.namaToko || STRUK_DEFAULT.namaToko, w).forEach((x) => add(x, { align: 'center', bold: true, big: true }));
  if (s.alamat) wrap(s.alamat, w).forEach((x) => add(x, { align: 'center' }));
  if (s.telp) add(`Telp. ${ascii(s.telp)}`, { align: 'center' });
  line();
  add(lr('No.', trx.noTrx, w));
  add(lr('Tanggal', `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`, w));
  line();
  for (const l of trx.lines || []) {
    wrap(l.label || l.nama, w).forEach((x) => add(x));
    add(lr(`  ${fmtNum(l.qty)} ${l.unit} x ${num(l.price)}`, num(l.subtotal), w));
  }
  line();
  add(lr('TOTAL', num(trx.total), w), { bold: true });
  if (trx.bon) {
    add(lr('Dibayar', num(trx.bayar), w));
    add(lr('SISA (BON)', num(trx.bon.sisa), w), { bold: true });
    wrap(`Atas nama: ${trx.bon.nama}`, w).forEach((x) => add(x));
  } else if (trx.bayar != null) {
    add(lr('Tunai', num(trx.bayar), w));
    if (Number(trx.kembalian) > 0) add(lr('Kembali', num(trx.kembalian), w));
  }
  line();
  if (s.pesan) wrap(s.pesan, w).forEach((x) => add(x, { align: 'center' }));
  return rows;
}

/** Teks polos (untuk WhatsApp: dibungkus ``` agar hurufnya sama lebar). */
export function strukText(trx, s = strukSettings()) {
  const w = Number(s.lebar) || 32;
  return strukRows(trx, { ...s, lebar: Math.min(w, 32) })
    .map((r) => (r.align === 'center' ? ' '.repeat(Math.max(0, Math.floor((Math.min(w, 32) - r.t.length) / 2))) + r.t : r.t))
    .join('\n');
}

/** Perintah ESC/POS (dipahami hampir semua printer thermal 58/80 mm). */
export function strukEscPos(trx, s = strukSettings()) {
  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const text = (t) => { for (const ch of ascii(t)) push(ch.charCodeAt(0)); };
  push(0x1b, 0x40); // reset
  for (const r of strukRows(trx, s)) {
    push(0x1b, 0x61, r.align === 'center' ? 1 : 0); // perataan
    push(0x1b, 0x45, r.bold ? 1 : 0); // tebal
    push(0x1d, 0x21, r.big ? 0x01 : 0x00); // tinggi ganda
    text(r.t);
    push(0x0a);
  }
  push(0x1b, 0x45, 0, 0x1d, 0x21, 0, 0x1b, 0x61, 0);
  push(0x0a, 0x0a, 0x0a, 0x0a); // gulung kertas agar mudah disobek
  push(0x1d, 0x56, 0x42, 0x00); // potong kertas (diabaikan printer tanpa pemotong)
  return new Uint8Array(bytes);
}

/** Contoh transaksi untuk "Tes cetak". */
export function contohTrx() {
  return {
    noTrx: 'TES-001',
    waktu: Date.now(),
    total: 35000,
    bayar: 50000,
    kembalian: 15000,
    bon: null,
    lines: [
      { label: 'Contoh barang 1 Liter', qty: 1, unit: 'Botol', price: 20000, subtotal: 20000 },
      { label: 'Contoh barang eceran', qty: 3, unit: 'Bungkus', price: 5000, subtotal: 15000 },
    ],
  };
}
