// Printer struk Bluetooth langsung dari aplikasi (Web Bluetooth).
// Hanya tersedia di Android + Chrome (bukan iPhone), untuk printer thermal
// yang mendukung Bluetooth LE. Lihat PANDUAN.md bagian "Printer struk".

import { state, setMeta } from './store.js';
import { strukEscPos } from './struk.js';

// Layanan (service) Bluetooth LE yang umum dipakai printer thermal murah.
const SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000ff10-0000-1000-8000-00805f9b34fb',
  '0000af30-0000-1000-8000-00805f9b34fb',
];

let device = null;
let ch = null;

export const btSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

export function printerName() {
  return device?.name || state.meta.printer?.name || '';
}

export class PrinterError extends Error {}

async function findWritable(server) {
  const services = await server.getPrimaryServices();
  for (const svc of services) {
    let chars = [];
    try {
      chars = await svc.getCharacteristics();
    } catch { continue; }
    const c = chars.find((x) => x.properties.writeWithoutResponse) || chars.find((x) => x.properties.write);
    if (c) return c;
  }
  throw new PrinterError('Printer tersambung, tetapi jalur cetaknya tidak dikenali. Kemungkinan printer ini tidak mendukung Bluetooth LE.');
}

async function open(dev) {
  if (!dev.gatt.connected) await dev.gatt.connect();
  ch = await findWritable(dev.gatt);
  device = dev;
  device.addEventListener('gattserverdisconnected', () => { ch = null; }, { once: true });
  await setMeta('printer', { id: dev.id, name: dev.name || 'Printer' });
}

/** Pilih printer dari daftar Bluetooth (harus dipanggil dari ketukan tombol). */
export async function pickPrinter() {
  if (!btSupported()) throw new PrinterError('Cetak langsung hanya bisa di HP Android dengan Chrome.');
  let dev;
  try {
    dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
  } catch (e) {
    if (e.name === 'NotFoundError') throw new PrinterError('Tidak ada printer yang dipilih.');
    if (e.name === 'SecurityError') throw new PrinterError('Ketuk tombol cetak sekali lagi untuk memilih printer.');
    throw new PrinterError(`Bluetooth tidak bisa dipakai: ${e.message || e}`);
  }
  try {
    await open(dev);
  } catch (e) {
    if (e instanceof PrinterError) throw e;
    throw new PrinterError(`Gagal tersambung ke printer: ${e.message || e}. Pastikan printer menyala dan dekat.`);
  }
  return printerName();
}

let forcePick = false;

async function ensure() {
  if (ch && device?.gatt.connected) return;
  if (!forcePick) {
    if (device) {
      try {
        await open(device);
        return;
      } catch { /* coba cara lain */ }
    }
    // Printer yang pernah diizinkan (bila browser mendukung), tanpa memilih ulang.
    const saved = state.meta.printer?.id;
    if (saved && navigator.bluetooth.getDevices) {
      try {
        const list = await navigator.bluetooth.getDevices();
        const dev = list.find((d) => d.id === saved);
        if (dev) {
          await open(dev);
          return;
        }
      } catch { /* pilih ulang */ }
    }
  }
  // Bila memilih printer gagal (mis. waktu ketukan habis), ketukan berikutnya langsung ke daftar printer.
  forcePick = true;
  await pickPrinter();
  forcePick = false;
}

async function send(bytes) {
  const size = 100;
  for (let i = 0; i < bytes.length; i += size) {
    const part = bytes.slice(i, i + size);
    if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(part);
    else await ch.writeValue(part);
    await new Promise((r) => setTimeout(r, 25)); // beri waktu printer memproses
  }
}

/** Cetak struk transaksi. Menyambung/meminta pilih printer bila perlu. */
export async function printStruk(trx) {
  if (!btSupported()) throw new PrinterError('Cetak langsung hanya bisa di HP Android dengan Chrome. Gunakan "Bagikan struk".');
  await ensure();
  try {
    await send(strukEscPos(trx));
  } catch (e) {
    ch = null;
    throw new PrinterError(`Gagal mengirim ke printer: ${e.message || e}`);
  }
}
