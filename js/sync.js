// Sinkron antrean lokal ke Google Sheets (lewat Web App Apps Script).

import { state, applySync, setMeta, onChange } from './store.js';
import { fmtRelative } from './format.js';

export class ApiError extends Error {}
export class NetError extends Error {}

export const syncState = { status: 'idle', message: '', running: false };
const subs = new Set();
export function onSync(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
function emit() {
  subs.forEach((fn) => {
    try { fn(); } catch (e) { console.error(e); }
  });
}

export const isConfigured = () => !!(state.meta.apiUrl && state.meta.apiKey);

export async function callApi(body, { url = state.meta.apiUrl, timeout = 45000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let text;
  try {
    // text/plain agar Apps Script tidak butuh "preflight" CORS.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    text = await res.text();
  } catch (e) {
    throw new NetError(e.name === 'AbortError' ? 'Koneksi terlalu lambat (waktu habis)' : 'Tidak bisa terhubung ke server');
  } finally {
    clearTimeout(timer);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError('Balasan server tidak dikenali. Periksa URL Web App dan akses "Siapa saja".');
  }
  if (!json.ok) throw new ApiError(json.error || 'Server menolak permintaan');
  return json;
}

let again = false;
export async function syncNow() {
  if (!isConfigured()) {
    syncState.status = 'unconfigured';
    emit();
    return false;
  }
  if (syncState.running) {
    again = true;
    return false;
  }
  syncState.running = true;
  emit();
  let ok = false;
  try {
    for (let round = 0; round < 25; round++) {
      const batch = state.outbox.slice(0, 80);
      const res = await callApi({
        action: 'sync',
        key: state.meta.apiKey,
        deviceId: state.meta.deviceId,
        ops: batch.map((o) => ({ opId: o.opId, type: o.type, data: o.data })),
      });
      await applySync(res.applied || [], res.items || [], res.bons);
      if (!batch.length || !(res.applied || []).length || !state.outbox.length) break;
    }
    await setMeta('lastSyncAt', Date.now());
    syncState.status = 'ok';
    syncState.message = '';
    ok = true;
  } catch (e) {
    console.warn('Sinkron gagal:', e);
    syncState.status = e instanceof NetError ? 'offline' : 'error';
    syncState.message = e.message || String(e);
  } finally {
    syncState.running = false;
    emit();
  }
  if (again) {
    again = false;
    setTimeout(syncNow, 300);
  }
  return ok;
}

let debounce = null;
export function scheduleSync(delay = 1500) {
  clearTimeout(debounce);
  debounce = setTimeout(syncNow, delay);
}

export function startAutoSync() {
  let lastLen = state.outbox.length;
  onChange(() => {
    const n = state.outbox.length;
    if (n > lastLen) scheduleSync(2000);
    lastLen = n;
  });
  window.addEventListener('online', () => scheduleSync(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(500);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, 60000);
  scheduleSync(300);
}

/** Teks status untuk ditampilkan. tone: ok | warn | err | busy | idle */
export function describeStatus() {
  const pending = state.outbox.length;
  const last = state.meta.lastSyncAt;
  const lastTxt = last ? `Terakhir sinkron ${fmtRelative(last)}.` : 'Belum pernah sinkron.';
  if (!isConfigured()) {
    return {
      tone: 'idle',
      short: 'Belum terhubung',
      long: 'Belum terhubung ke Google Sheets',
      detail: `${pending ? `${pending} perubahan tersimpan di perangkat ini. ` : 'Data tetap tersimpan di perangkat ini. '}Atur koneksi di Pengaturan.`,
    };
  }
  if (syncState.running) return { tone: 'busy', short: 'Menyinkron…', long: 'Sedang menyinkron…', detail: pending ? `${pending} perubahan sedang dikirim.` : '' };
  if (syncState.status === 'offline') {
    return {
      tone: 'warn',
      short: pending ? `Offline · ${pending}` : 'Offline',
      long: 'Tidak ada koneksi',
      detail: `${pending ? `${pending} perubahan menunggu dikirim. ` : ''}${lastTxt}`,
    };
  }
  if (syncState.status === 'error') {
    return { tone: 'err', short: 'Gagal sinkron', long: 'Sinkron gagal', detail: `${syncState.message}${pending ? ` · ${pending} perubahan menunggu.` : ''}` };
  }
  if (pending) return { tone: 'warn', short: `${pending} menunggu`, long: `${pending} perubahan menunggu dikirim`, detail: lastTxt };
  return { tone: 'ok', short: 'Tersinkron', long: 'Semua data sudah tersinkron', detail: lastTxt };
}
