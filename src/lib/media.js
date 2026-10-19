import { kvGet, kvPut } from './db.js';
import { supabase } from './supabase.js';

// Synced photos and song audio live in the private `media` bucket. Downloaded files are kept in
// IndexedDB (`media:<path>`) so they still show offline; render code asks for a URL synchronously
// and re-renders when one becomes ready.

const urls = new Map();
const loading = new Set();
const failedAt = new Map();
const listeners = new Set();
const RETRY_MS = 30000;

export function onMediaReady(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const notify = () => listeners.forEach((fn) => fn());

export function mediaUrl(path) {
  if (!path) return null;
  const u = urls.get(path);
  if (u) return u;
  load(path);
  return null;
}

async function load(path) {
  if (loading.has(path)) return;
  const failed = failedAt.get(path);
  if (failed && Date.now() - failed < RETRY_MS) return;
  loading.add(path);
  try {
    let blob = await kvGet('media:' + path);
    if (!blob && supabase && navigator.onLine) {
      const { data, error } = await supabase.storage.from('media').download(path);
      if (!error && data) { blob = data; await kvPut('media:' + path, blob); }
    }
    if (blob) { urls.set(path, URL.createObjectURL(blob)); failedAt.delete(path); notify(); }
    else failedAt.set(path, Date.now());
  } catch (e) {
    failedAt.set(path, Date.now());
  } finally { loading.delete(path); }
}

// Wait for a synced file (photo book export needs every photo, not just the ones on screen).
export async function ensureMedia(path) {
  if (!path) return null;
  for (let i = 0; i < 80 && !urls.has(path); i++) {
    failedAt.delete(path);
    await load(path);
    if (!urls.has(path)) await new Promise((r) => setTimeout(r, 250));
  }
  return urls.get(path) || null;
}

export async function cacheBlob(path, blob) {
  await kvPut('media:' + path, blob);
  if (!urls.has(path)) urls.set(path, URL.createObjectURL(blob));
}
