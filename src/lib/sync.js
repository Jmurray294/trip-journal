import { supabase } from './supabase.js';
import { kvGet, kvPut } from './db.js';
import { cacheBlob } from './media.js';

// Two-way sync between this device's journal and the family's rows in Supabase.
//
// Each trip and each memory is one row. Costs (payments, deposits, balances due) are rows in the
// same entries table with `type: 'cost'`; locally they live in `trip.costs`, not the itinerary.
// A snapshot remembers the JSON last exchanged with the
// server for every row, so a local change is anything that differs from its snapshot — no edit
// code has to mark things dirty. Every run pulls first (remote wins unless this device changed
// the row since the last sync), then pushes local changes, deletions and new photos.

// Key order must be stable: Postgres jsonb reorders keys, plain JSON.stringify does not.
export function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : stableStringify(x))).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

const isData = (s) => typeof s === 'string' && s.startsWith('data:');

// Docs as stored on the server. Data-URL photos/audio become storage paths once uploaded;
// `uploaded` maps a data URL to its path (pending ones stay inline, so they read as changed).
export function tripDoc(t, uploaded) {
  const { days, costs, ...doc } = t; // eslint-disable-line no-unused-vars
  if (doc.song && isData(doc.song.audio)) {
    const p = uploaded.get(doc.song.audio);
    doc.song = { ...doc.song, audio: p ? undefined : doc.song.audio, audioPath: p || doc.song.audioPath };
  }
  return doc;
}

export function entryDoc(d, uploaded) {
  const { num, ...doc } = d; // eslint-disable-line no-unused-vars
  doc.photos = (d.photos || []).map((p) => {
    if (isData(p.src) && uploaded.has(p.src)) return { label: p.label || '', path: uploaded.get(p.src) };
    return p;
  });
  return doc;
}

const isCost = (d) => !!d && d.type === 'cost';
export const itemDoc = (d, uploaded) => {
  if (!isCost(d)) return entryDoc(d, uploaded);
  const { num, ...doc } = d; // eslint-disable-line no-unused-vars
  return doc;
};

export function sortDays(days) {
  return [...days].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)).map((d, i) => ({ ...d, num: i + 1 }));
}
const byPos = (list) => [...list].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));

// Apply pulled rows to the local trips. Pure, so it can be tested.
export function mergeRemote(trips, tRows, eRows, snap, uploaded) {
  let list = trips.map((t) => ({ ...t, days: [...(t.days || [])], ...(t.costs ? { costs: [...t.costs] } : {}) }));
  const localJ = (id) => { const t = list.find((x) => x.id === id); return t ? stableStringify(tripDoc(t, uploaded)) : null; };
  const touched = new Set();

  for (const r of tRows) {
    const j = localJ(r.id);
    if (r.id in snap.t && j !== snap.t[r.id]) continue; // changed here since last sync: ours goes up next
    if (r.deleted) {
      list = list.filter((t) => t.id !== r.id);
      delete snap.t[r.id];
      continue;
    }
    const i = list.findIndex((t) => t.id === r.id);
    const next = { ...r.doc, id: r.id, days: i >= 0 ? list[i].days : [] };
    if (i >= 0) list[i] = next;
    else {
      const at = next.planning ? 0 : list.findIndex((t) => !t.planning);
      if (at < 0) list.push(next); else list.splice(at, 0, next);
    }
    snap.t[r.id] = stableStringify(r.doc);
  }

  for (const r of eRows) {
    // where this row lives on this device now: a trip's itinerary (days) or its costs
    let trip = null, key = 'days', idx = -1;
    for (const t of list) {
      for (const k of ['days', 'costs']) {
        const i = (t[k] || []).findIndex((d) => d.id === r.id);
        if (i >= 0) { trip = t; key = k; idx = i; break; }
      }
      if (trip) break;
    }
    const j = trip ? stableStringify(itemDoc(trip[key][idx], uploaded)) : null;
    if (r.id in snap.e && j !== snap.e[r.id][1]) continue;
    if (r.deleted) {
      if (trip) { trip[key].splice(idx, 1); touched.add(trip.id); }
      delete snap.e[r.id];
      continue;
    }
    const target = list.find((t) => t.id === r.trip_id);
    if (!target) continue; // trip is gone on this device
    const want = isCost(r.doc) ? 'costs' : 'days';
    if (trip && (trip !== target || key !== want)) { trip[key].splice(idx, 1); touched.add(trip.id); }
    if (!target[want]) target[want] = [];
    const entry = { ...r.doc, id: r.id };
    const k = target[want].findIndex((d) => d.id === r.id);
    if (k >= 0) target[want][k] = entry; else target[want].push(entry);
    touched.add(target.id);
    snap.e[r.id] = [r.trip_id, stableStringify(r.doc)];
  }

  list = list.map((t) => (touched.has(t.id) ? { ...t, days: sortDays(t.days), ...(t.costs ? { costs: byPos(t.costs) } : {}) } : t));
  return list;
}

export function createSync({ getTrips, applyTrips, onStatus }) {
  let hid = null, snap = null, cursor = null;
  let running = false, again = false, timer = null, every = null, channel = null;
  const uploaded = new Map();

  const metaKey = () => 'sync:' + hid;
  const save = () => kvPut(metaKey(), { snap, cursor });

  async function upload(dataUrl, ext) {
    if (uploaded.has(dataUrl)) return uploaded.get(dataUrl);
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${hid}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: blob.type || undefined, upsert: false });
    if (error) throw error;
    await cacheBlob(path, blob);
    uploaded.set(dataUrl, path);
    return path;
  }

  async function fetchSince(table, since) {
    const out = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from(table).select('*').eq('household_id', hid)
        .gt('updated_at', since).order('updated_at').range(from, from + 499);
      if (error) throw error;
      out.push(...data);
      if (data.length < 500) return out;
    }
  }

  async function pull() {
    // overlap a little so rows committed out of order are never skipped (merging is idempotent)
    const since = cursor ? new Date(new Date(cursor).getTime() - 30000).toISOString() : '1970-01-01T00:00:00Z';
    const tRows = await fetchSince('trips', since);
    const eRows = await fetchSince('entries', since);
    if (!tRows.length && !eRows.length) return;
    applyTrips((trips) => mergeRemote(trips, tRows, eRows, snap, uploaded));
    for (const r of [...tRows, ...eRows]) if (!cursor || new Date(r.updated_at) > new Date(cursor)) cursor = r.updated_at;
    await save();
  }

  async function push() {
    const trips = getTrips();

    // upload new photos and song audio first
    for (const t of trips) {
      if (t.song && isData(t.song.audio)) {
        const ext = ((t.song.audioName || '').split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';
        await upload(t.song.audio, ext);
      }
      for (const d of t.days || []) for (const p of d.photos || []) if (isData(p.src)) await upload(p.src, 'jpg');
    }
    // swap inline data for storage paths locally too (keeps this device's journal small)
    if (uploaded.size) {
      applyTrips((ts) => ts.map((t) => {
        let song = t.song;
        if (song && isData(song.audio) && uploaded.has(song.audio)) song = { ...song, audio: undefined, audioPath: uploaded.get(song.audio) };
        const days = (t.days || []).map((d) => ({
          ...d, photos: (d.photos || []).map((p) => (isData(p.src) && uploaded.has(p.src) ? { label: p.label || '', path: uploaded.get(p.src) } : p))
        }));
        return { ...t, song, days };
      }));
    }

    const now = getTrips();
    const tRows = [], eRows = [];
    const seenT = new Set(), seenE = new Set();
    for (const t of now) {
      seenT.add(t.id);
      const doc = tripDoc(t, uploaded); const j = stableStringify(doc);
      if (snap.t[t.id] !== j) tRows.push({ row: { household_id: hid, id: t.id, doc: JSON.parse(j), deleted: false }, j });
      for (const d of [...(t.days || []), ...(t.costs || [])]) {
        seenE.add(d.id);
        const ed = itemDoc(d, uploaded); const ej = stableStringify(ed);
        const s = snap.e[d.id];
        if (!s || s[1] !== ej || s[0] !== t.id) eRows.push({ row: { household_id: hid, id: d.id, trip_id: t.id, doc: JSON.parse(ej), deleted: false }, j: ej });
      }
    }
    for (const id of Object.keys(snap.t)) if (!seenT.has(id)) tRows.push({ row: { household_id: hid, id, doc: {}, deleted: true }, j: null });
    for (const [id, s] of Object.entries(snap.e)) if (!seenE.has(id)) eRows.push({ row: { household_id: hid, id, trip_id: s[0], doc: {}, deleted: true }, j: null });
    if (!tRows.length && !eRows.length) return;

    for (const [table, rows] of [['trips', tRows], ['entries', eRows]]) {
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await supabase.from(table).upsert(chunk.map((x) => x.row), { onConflict: 'household_id,id' });
        if (error) throw error;
        for (const x of chunk) {
          if (table === 'trips') { if (x.j == null) delete snap.t[x.row.id]; else snap.t[x.row.id] = x.j; }
          else if (x.j == null) delete snap.e[x.row.id]; else snap.e[x.row.id] = [x.row.trip_id, x.j];
        }
      }
    }
    await save();
  }

  async function run() {
    if (!hid) return;
    if (running) { again = true; return; }
    running = true;
    onStatus({ state: 'syncing' });
    try {
      if (!navigator.onLine) throw new Error('offline');
      await pull();
      await push();
      onStatus({ state: 'idle', at: Date.now() });
    } catch (e) {
      onStatus({ state: navigator.onLine ? 'error' : 'offline', error: e && e.message });
    } finally {
      running = false;
      if (again) { again = false; schedule(300); }
    }
  }

  function schedule(ms = 1500) {
    if (!hid) return;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }

  async function start(householdId) {
    if (hid === householdId) return;
    stop();
    hid = householdId;
    const meta = (await kvGet(metaKey())) || {};
    snap = meta.snap || { t: {}, e: {} };
    cursor = meta.cursor || null;
    channel = supabase.channel('household-' + hid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `household_id=eq.${hid}` }, () => schedule(600))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: `household_id=eq.${hid}` }, () => schedule(600))
      .subscribe();
    every = setInterval(() => schedule(0), 60000);
    window.addEventListener('online', onOnline);
    run();
  }

  function onOnline() { schedule(0); }

  function stop() {
    if (channel) { supabase.removeChannel(channel); channel = null; }
    clearInterval(every); clearTimeout(timer);
    window.removeEventListener('online', onOnline);
    hid = null;
  }

  return { start, stop, schedule, syncNow: () => schedule(0), active: () => !!hid };
}
