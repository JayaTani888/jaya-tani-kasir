// Data barang, stok, transaksi, dan antrean sinkron.
//
// Cara kerja "semi online":
// - Setiap perubahan langsung disimpan di perangkat dan dimasukkan ke antrean (outbox).
// - Saat ada internet, antrean dikirim ke Google Sheets (lihat sync.js).
// - Stok = stok terakhir dari server + semua mutasi yang belum terkirim.
//   Mutasi dicatat sebagai tambah/kurang (bukan menimpa angka) agar aman
//   bila beberapa HP dipakai bersamaan saat offline.

import * as db from './db.js';
import { round, norm, fullName, fmtNum, localDate, stockUnit, metricLabel, variantTag } from './format.js';

export const state = { items: new Map(), outbox: [], meta: {} };

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  twins = null;
  listeners.forEach((fn) => {
    try { fn(); } catch (e) { console.error(e); }
  });
}

// Semua perubahan data dijalankan berurutan agar tidak saling menimpa.
let chain = Promise.resolve();
function exclusive(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

function randomCode(n) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(n))].map((v) => abc[v % abc.length]).join('');
}

export async function init() {
  const [items, outbox, meta] = await Promise.all([db.getAll('items'), db.getAll('outbox'), db.getAll('meta')]);
  items.forEach((it) => state.items.set(it.id, it));
  state.outbox = outbox.sort((a, b) => a.seq - b.seq);
  meta.forEach((m) => { state.meta[m.key] = m.value; });
  if (!state.meta.deviceId) {
    await setMeta('deviceId', uuid());
    await setMeta('deviceCode', randomCode(3));
  }
}

export async function setMeta(key, value) {
  state.meta[key] = value;
  await db.tx(['meta'], (t) => { t.put('meta', { key, value }); });
}

export function activeItems() {
  return [...state.items.values()]
    .filter((it) => !it.dihapus)
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id') || fullName(a).localeCompare(fullName(b), 'id'));
}

// ---- Nama tampilan: "AJI BASS 1 Liter"; kemasan hanya ditambahkan bila ada kembaran ----
let twins = null;
const twinKey = (it) => `${norm(it.nama)}|${norm(metricLabel(it))}`;
function twinCounts() {
  if (!twins) {
    twins = new Map();
    for (const it of state.items.values()) if (!it.dihapus) twins.set(twinKey(it), (twins.get(twinKey(it)) || 0) + 1);
  }
  return twins;
}

/** Nama barang untuk ditampilkan di aplikasi (bukan untuk spreadsheet). */
export function itemName(it) {
  if (!it) return '';
  const m = metricLabel(it);
  let s = m ? `${it.nama} ${m}` : it.nama;
  if (!it.dihapus && (twinCounts().get(twinKey(it)) || 0) > 1) {
    const tag = variantTag(it);
    if (tag) s += ` · ${tag}`;
  }
  return s;
}

/** Daftar nilai unik (untuk dropdown Tipe, Kemasan, Satuan, dst.) + nilai bawaan. */
export function distinct(field, defaults = []) {
  const seen = new Map();
  const add = (v) => {
    const s = String(v ?? '').trim();
    if (s && !seen.has(norm(s))) seen.set(norm(s), s);
  };
  for (const it of state.items.values()) if (!it.dihapus) add(it[field]);
  defaults.forEach(add);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'id'));
}

export function getStok(it) {
  if (!it) return 0;
  let s = Number(it.stokServer) || 0;
  for (const op of state.outbox) if (op.type === 'mutasi' && op.data.itemId === it.id) s += op.data.delta;
  return round(s, 6);
}

const ITEM_FIELDS = [
  'id', 'tipe', 'nama', 'berkemasan', 'kemasan', 'beratVolume', 'satuan', 'hargaKemasan', 'bisaEcer',
  'hargaEcer', 'isiEcer', 'bentukEcer', 'harga', 'ukuran', 'dihapus', 'updatedAt', 'deviceId',
];
function wireItem(it) {
  const o = {};
  ITEM_FIELDS.forEach((k) => { o[k] = it[k] ?? null; });
  return o;
}

function dupKey(d) {
  return d.berkemasan
    ? ['k', norm(d.tipe), norm(d.nama), norm(d.kemasan), Number(d.beratVolume) || '', norm(d.satuan)].join('|')
    : ['u', norm(d.tipe), norm(d.nama), norm(d.ukuran)].join('|');
}
export function findDuplicate(d, excludeId) {
  const key = dupKey(d);
  for (const it of state.items.values()) if (!it.dihapus && it.id !== excludeId && dupKey(it) === key) return it;
  return null;
}

function queueOps(t, ops) {
  ops.forEach((op) => {
    const r = t.add('outbox', op);
    r.onsuccess = () => { op.seq = r.result; };
  });
}

export function saveItem(data) {
  return exclusive(async () => {
    const now = Date.now();
    const prev = data.id ? state.items.get(data.id) : null;
    const item = {
      ...(prev || { stokServer: 0, dihapus: false }),
      ...data,
      id: data.id || uuid(),
      updatedAt: now,
      deviceId: state.meta.deviceId,
    };
    const op = { opId: uuid(), type: 'item', data: wireItem(item), createdAt: now };
    await db.tx(['items', 'outbox'], (t) => {
      t.put('items', item);
      queueOps(t, [op]);
    });
    state.items.set(item.id, item);
    state.outbox.push(op);
    emit();
    return item;
  });
}

export function deleteItem(id) {
  return saveItem({ id, dihapus: true });
}

function mutasiOp(src, { jenis, delta, ket, trxId = null }, now = Date.now()) {
  return {
    opId: uuid(),
    type: 'mutasi',
    createdAt: now,
    data: {
      id: uuid(),
      waktu: now,
      itemId: src.id,
      tipe: src.tipe,
      nama: fullName(src),
      jenis,
      ket,
      delta: round(delta, 6),
      satuanStok: stockUnit(src),
      deviceId: state.meta.deviceId,
      deviceCode: state.meta.deviceCode,
      trxId,
    },
  };
}

/** jenis: 'tambah' | 'koreksi'. delta dalam satuan dasar stok. */
export function changeStock(item, { jenis, delta, ket }) {
  return exclusive(async () => {
    const op = mutasiOp(item, { jenis, delta, ket });
    await db.tx(['outbox'], (t) => queueOps(t, [op]));
    state.outbox.push(op);
    emit();
  });
}

export function saveTransaksi(lines, bayar) {
  return exclusive(async () => {
    const now = new Date();
    const ms = now.getTime();
    const tanggal = localDate(now);
    const c = state.meta.trxCounter;
    const n = c && c.tanggal === tanggal ? c.n + 1 : 1;
    const noTrx = `${tanggal.slice(2).replace(/-/g, '')}-${state.meta.deviceCode}-${String(n).padStart(3, '0')}`;
    const total = lines.reduce((a, l) => a + l.subtotal, 0);
    const trx = {
      id: uuid(),
      noTrx,
      waktu: ms,
      tanggal,
      total,
      bayar: bayar ?? null,
      kembalian: bayar == null ? null : bayar - total,
      deviceId: state.meta.deviceId,
      deviceCode: state.meta.deviceCode,
      lines: lines.map((l) => ({
        itemId: l.itemId, tipe: l.tipe, nama: l.nama, variant: l.variant, label: l.label, mode: l.mode,
        qty: l.qty, unit: l.unit, price: l.price, subtotal: l.subtotal,
      })),
    };
    const ops = [{ opId: uuid(), type: 'transaksi', data: trx, createdAt: ms }];
    for (const l of lines) {
      const src = state.items.get(l.itemId) || {
        id: l.itemId, tipe: l.tipe, nama: l.nama, berkemasan: l.berkemasan, kemasan: l.kemasan, ukuran: l.ukuran,
      };
      const delta = l.mode === 'ecer' ? -(l.qty / l.isi) : -l.qty;
      ops.push(mutasiOp(src, { jenis: 'jual', delta, ket: `Terjual ${fmtNum(l.qty)} ${l.unit} (${noTrx})`, trxId: trx.id }, ms));
    }
    const counter = { tanggal, n };
    await db.tx(['transactions', 'outbox', 'meta'], (t) => {
      t.put('transactions', { ...trx, synced: false });
      queueOps(t, ops);
      t.put('meta', { key: 'trxCounter', value: counter });
    });
    state.meta.trxCounter = counter;
    state.outbox.push(...ops);
    emit();
    return trx;
  });
}

export function getTransaksiByDate(tanggal) {
  return db.getAllByIndex('transactions', 'tanggal', tanggal);
}

function normalizeServerItem(s) {
  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const str = (v) => (v == null ? '' : String(v));
  return {
    id: str(s.id), tipe: str(s.tipe), nama: str(s.nama),
    berkemasan: !!s.berkemasan, kemasan: str(s.kemasan) || null, beratVolume: num(s.beratVolume), satuan: str(s.satuan) || null,
    hargaKemasan: num(s.hargaKemasan), bisaEcer: !!s.bisaEcer, hargaEcer: num(s.hargaEcer),
    isiEcer: num(s.isiEcer), bentukEcer: str(s.bentukEcer) || null,
    harga: num(s.harga), ukuran: str(s.ukuran) || null,
    dihapus: !!s.dihapus, updatedAt: num(s.updatedAt), deviceId: str(s.deviceId) || null,
    stokServer: num(s.stok) || 0,
  };
}

/**
 * Terapkan balasan server: buang operasi yang sudah diterima dari antrean,
 * lalu ganti data barang dengan versi server (kecuali yang masih punya
 * perubahan lokal yang belum terkirim).
 */
export function applySync(appliedIds, serverItems) {
  return exclusive(async () => {
    const applied = new Set(appliedIds);
    const done = state.outbox.filter((o) => applied.has(o.opId));
    const remaining = state.outbox.filter((o) => !applied.has(o.opId));
    const pendingItemIds = new Set(remaining.filter((o) => o.type === 'item').map((o) => o.data.id));
    const next = new Map();
    for (const s of serverItems) {
      const srv = normalizeServerItem(s);
      if (!srv.id) continue;
      const local = state.items.get(srv.id);
      next.set(srv.id, local && pendingItemIds.has(srv.id) ? { ...local, stokServer: srv.stokServer } : srv);
    }
    for (const [id, local] of state.items) if (!next.has(id) && pendingItemIds.has(id)) next.set(id, local);
    const trxIds = done.filter((o) => o.type === 'transaksi').map((o) => o.data.id);
    await db.tx(['items', 'outbox', 'transactions'], (t) => {
      t.store('items').clear();
      next.forEach((v) => t.put('items', v));
      done.forEach((o) => t.del('outbox', o.seq));
      const ts = t.store('transactions');
      trxIds.forEach((id) => {
        const r = ts.get(id);
        r.onsuccess = () => {
          if (r.result && !r.result.synced) ts.put({ ...r.result, synced: true });
        };
      });
    });
    state.items = next;
    state.outbox = remaining;
    emit();
  });
}
