// Format angka, rupiah, tanggal, dan teks stok.

const nf3 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });
const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export function round(x, d = 6) {
  const f = 10 ** d;
  return Math.round((Number(x) || 0) * f) / f;
}

export const fmtNum = (n) => nf3.format(round(n, 3));
export const rp = (n) => 'Rp ' + nf0.format(Math.round(Number(n) || 0));

/**
 * Baca angka ketikan pengguna.
 * Koma = desimal ("1,5"). Titik dianggap pemisah ribuan bila diikuti tepat
 * 3 angka ("1.500" = 1500); selain itu titik dianggap desimal ("1.5").
 */
export function parseNum(s) {
  let t = String(s ?? '').trim().replace(/\s+/g, '');
  if (!t) return NaN;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

export function parseMoney(s) {
  const d = String(s ?? '').replace(/\D/g, '');
  return d ? Number(d) : NaN;
}

export function fmtMoneyInput(s) {
  const d = String(s ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return d ? nf0.format(Number(d)) : '';
}

export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** "Botol 1 liter", "Karung 25 kg", atau "per kg" untuk barang tanpa kemasan. */
export function variantLabel(it) {
  if (!it) return '';
  if (it.berkemasan) {
    let s = it.kemasan || '';
    if (it.beratVolume) s += ' ' + fmtNum(it.beratVolume) + (it.satuan ? ' ' + it.satuan : '');
    return s.trim();
  }
  return 'per ' + (it.ukuran || '-');
}

export function fullName(it) {
  const v = variantLabel(it);
  return v ? `${it.nama} — ${v}` : it.nama;
}

/** Berat/volume per kemasan, mis. "1 Liter" atau "25 kg". Kosong bila tidak diisi. */
export function metricLabel(it) {
  if (!it || !it.berkemasan || !it.beratVolume) return '';
  return `${fmtNum(it.beratVolume)}${it.satuan ? ' ' + it.satuan : ''}`;
}

/** Pembeda bila ada barang lain dengan nama + ukuran yang sama: kemasannya, atau "per kg". */
export function variantTag(it) {
  return it.berkemasan ? it.kemasan || '' : it.ukuran ? `per ${it.ukuran}` : '';
}

/** Pemisah antara harga per kemasan dan harga eceran. */
export const PRICE_SEP = '  |  '; // spasi tak terputus agar jaraknya tetap lebar

export function priceLabel(it) {
  if (it.berkemasan) {
    let s = `${rp(it.hargaKemasan)}/${it.kemasan}`;
    if (it.bisaEcer) s += `${PRICE_SEP}${rp(it.hargaEcer)}/${it.bentukEcer}`;
    return s;
  }
  return `${rp(it.harga)}/${it.ukuran}`;
}

/** Satuan dasar stok: nama kemasan (barang berkemasan) atau ukuran (tanpa kemasan). */
export function stockUnit(it) {
  return (it.berkemasan ? it.kemasan : it.ukuran) || '';
}

/**
 * Stok disimpan dalam satuan dasar (jumlah kemasan, boleh pecahan).
 * Untuk barang yang bisa diecer, ditampilkan "9 Karung + 22 kg".
 */
export function stokParts(it, base) {
  const neg = base < -1e-9;
  const b = Math.abs(Number(base) || 0);
  const parts = [];
  const isi = Number(it.isiEcer);
  if (it.berkemasan && it.bisaEcer && isi > 0) {
    const totalEcer = round(b * isi, 3);
    const kem = Math.floor(round(totalEcer / isi, 6));
    const sisa = round(totalEcer - kem * isi, 3);
    if (kem > 0 || sisa === 0) parts.push({ n: kem, unit: it.kemasan || '' });
    if (sisa > 0) parts.push({ n: sisa, unit: it.bentukEcer || '' });
  } else {
    parts.push({ n: round(b, 3), unit: stockUnit(it) });
  }
  return { neg, parts };
}

export function stokText(it, base) {
  const { neg, parts } = stokParts(it, base);
  return (neg ? '−' : '') + parts.map((p) => `${fmtNum(p.n)} ${p.unit}`.trim()).join(' + ');
}

export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

export function fmtDateLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function fmtRelative(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return new Date(ms).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
