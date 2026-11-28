// Tombol "Cetak struk" dan "Bagikan struk" yang dipakai di Kasir dan Riwayat.

import { h, icon, toast } from './ui.js';
import { printStruk, btSupported } from './printer.js';
import { strukText } from './struk.js';

export async function cetak(trx, btn) {
  if (btn) btn.disabled = true;
  try {
    await printStruk(trx);
    toast('Struk dicetak', 'ok', 2000);
    return true;
  } catch (e) {
    console.warn(e);
    toast(e.message || String(e), 'err', 6000);
    return false;
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** Bagikan struk sebagai teks (WhatsApp, dll.). Nomor telp pelanggan bon dipakai bila ada. */
export async function bagikan(trx) {
  const text = '```\n' + strukText(trx) + '\n```';
  const telp = String(trx.bon?.telp || '').replace(/\D/g, '');
  if (!telp && navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const nomor = telp ? (telp.startsWith('0') ? `62${telp.slice(1)}` : telp) : '';
  window.open(`https://wa.me/${nomor}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/** Dua tombol kecil: Cetak struk + Bagikan. */
export function strukButtons(trx) {
  const pBtn = h('button', { type: 'button', class: 'btn btn-print btn-sm' }, icon('printer', 18), 'Cetak struk');
  pBtn.addEventListener('click', () => cetak(trx, pBtn));
  const sBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => bagikan(trx) }, icon('share', 18), trx.bon?.telp ? 'Kirim ke WA pelanggan' : 'Bagikan struk');
  if (!btSupported()) pBtn.title = 'Cetak langsung hanya bisa di HP Android dengan Chrome';
  return h('div', { class: 'struk-btns' }, pBtn, sBtn);
}
