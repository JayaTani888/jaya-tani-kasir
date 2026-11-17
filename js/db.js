// Penyimpanan lokal di perangkat (IndexedDB). Data tetap ada walau internet/listrik mati.

const DB_NAME = 'jaya-tani-kasir';
const DB_VERSION = 1;
let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        if (!db.objectStoreNames.contains('transactions')) {
          const t = db.createObjectStore('transactions', { keyPath: 'id' });
          t.createIndex('tanggal', 'tanggal');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Tutup tab lain aplikasi ini lalu muat ulang.'));
    });
  }
  return dbPromise;
}

const wrap = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export async function getAll(store) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).getAll());
}

export async function getAllByIndex(store, index, key) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).index(index).getAll(key));
}

/**
 * Tulis ke beberapa store dalam satu transaksi (semua berhasil atau semua batal).
 * fn menerima { put, add, del, store }.
 */
export async function tx(stores, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, 'readwrite');
    const api = {
      put: (s, v) => t.objectStore(s).put(v),
      add: (s, v) => t.objectStore(s).add(v),
      del: (s, k) => t.objectStore(s).delete(k),
      store: (s) => t.objectStore(s),
    };
    try {
      fn(api);
    } catch (e) {
      try { t.abort(); } catch { /* sudah selesai */ }
      reject(e);
      return;
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Penyimpanan dibatalkan'));
  });
}
