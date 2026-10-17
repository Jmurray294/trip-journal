// On-device storage: IndexedDB database `tripjournal`, store `kv`.
// `journal` holds { v, trips, home, homeLon, homeLat }; `geo:<place>` keys cache geocoding.

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('tripjournal', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

export function kvGet(key) {
  return open().then((db) => new Promise((res) => {
    const q = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    q.onsuccess = () => res(q.result);
    q.onerror = () => res(null);
  })).catch(() => null);
}

export function kvPut(key, value) {
  return open().then((db) => new Promise((res) => {
    const q = db.transaction('kv', 'readwrite').objectStore('kv').put(value, key);
    q.onsuccess = () => res(true);
    q.onerror = () => res(false);
  })).catch(() => false);
}

export const SCHEMA_V = 6;

export function saveJournal({ trips, home, homeLon, homeLat }) {
  return kvPut('journal', { v: SCHEMA_V, trips, home: home || '', homeLon, homeLat });
}

// Ask the browser not to evict our data under storage pressure (photos live here).
export function requestPersistence() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* not supported */ }
}
