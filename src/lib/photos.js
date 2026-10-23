// Photos filed into a trip by when and where they were taken: one "photos" memory per day and place
// in the trip's timeline, next to the bookings and memories of that day. Used by the app's Add photos
// and by the inbound-email function for the iPhone Shortcut (inlined by scripts/build-inbound.mjs),
// so keep it plain JavaScript with no imports.

const PHOTO_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel_ = (d) => PHOTO_MONTHS[d.getMonth()] + ' ' + d.getDate();
const NEAR_KM = 25;

function kmBetween(a, b) {
  const R = Math.PI / 180;
  const dLat = (b[1] - a[1]) * R, dLon = (b[0] - a[0]) * R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// "2026:10:31 14:22:05" (EXIF) or "2026-10-31 14:22:05" / "2026-10-31T14:22" → a local Date
export function parsePhotoTime(s) {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
  return isNaN(d) ? null : d;
}

// When and where a JPEG was taken, from its EXIF block: { taken: 'YYYY-MM-DD HH:MM:SS' | null, lat, lon }
export function parseExif(buf) {
  try {
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while (off + 10 < v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xFF00) !== 0xFF00) return null;
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10);
      if (marker === 0xFFDA) return null; // image data starts: no EXIF
      off += 2 + v.getUint16(off + 2);
    }
  } catch (e) { /* not a JPEG we can read */ }
  return null;
}

function readTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o) => v.getUint16(t + o, le);
  const u32 = (o) => v.getUint32(t + o, le);
  const ifd = (o) => {
    const tags = {};
    const n = u16(o);
    for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; tags[u16(e)] = { count: u32(e + 4), at: e + 8 }; }
    return tags;
  };
  const ascii = (tag) => {
    const o = tag.count > 4 ? u32(tag.at) : tag.at;
    let s = '';
    for (let i = 0; i < tag.count; i++) { const c = v.getUint8(t + o + i); if (!c) break; s += String.fromCharCode(c); }
    return s;
  };
  const dms = (tag) => {
    const o = u32(tag.at);
    const r = (i) => u32(o + i * 8) / (u32(o + i * 8 + 4) || 1);
    return r(0) + r(1) / 60 + r(2) / 3600;
  };
  const ifd0 = ifd(u32(4));
  let taken = null, lat = null, lon = null;
  if (ifd0[0x8769]) {
    const ex = ifd(u32(ifd0[0x8769].at));
    const tag = ex[0x9003] || ex[0x9004];
    if (tag) taken = ascii(tag);
  }
  if (!taken && ifd0[0x0132]) taken = ascii(ifd0[0x0132]);
  if (ifd0[0x8825]) {
    const g = ifd(u32(ifd0[0x8825].at));
    if (g[2] && g[4]) {
      lat = dms(g[2]); lon = dms(g[4]);
      if (g[1] && ascii(g[1]) === 'S') lat = -lat;
      if (g[3] && ascii(g[3]) === 'W') lon = -lon;
      if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) lat = lon = null;
    }
  }
  return { taken: taken && /^\d{4}:\d{2}:\d{2}/.test(taken) ? taken : null, lat, lon };
}

// A photo's identity across imports (the app and the Shortcut send different copies of the same
// shot): the second it was taken, else whatever the caller gives.
export const photoKey = (taken, fallback) => (taken ? 't' + taken.getTime() / 1000 : 'f' + fallback);

// File photos into one trip. items: [{ key, taken: Date | null, lat, lon, ...photo fields (src or path) }]
// Each photo joins the "photos" memory for its day and place (made if needed): the place is the
// nearest stop in the trip within 25 km when the photo has GPS, else that day's place, else the
// trip's. Photos already in the trip (same key) are skipped.
// Returns { trip, added, created } — `trip` is a new object; `newId()` names new memories.
export function placePhotos(trip, items, newId, fallbackDay = new Date()) {
  const days = (trip.days || []).map((d) => ({ ...d, photos: [...(d.photos || [])] }));
  const have = new Set();
  for (const d of days) for (const p of d.photos) if (p.key) have.add(p.key);
  let added = 0, created = 0;
  const sorted = [...items].sort((a, b) => (a.taken ? a.taken.getTime() : 0) - (b.taken ? b.taken.getTime() : 0));
  for (const it of sorted) {
    if (it.key && have.has(it.key)) continue;
    const when = it.taken || fallbackDay;
    const label = dayLabel_(when);
    const gps = typeof it.lat === 'number' && typeof it.lon === 'number' ? [it.lon, it.lat] : null;
    // where: the nearest stop with coordinates, else the place of that day's memories, else the trip's
    let place = '', at = null;
    if (gps) {
      let best = null;
      for (const d of days) {
        if (typeof d.lon !== 'number' || typeof d.lat !== 'number' || !d.place) continue;
        const km = kmBetween(gps, [d.lon, d.lat]);
        if (km <= NEAR_KM && (!best || km < best.km)) best = { km, d };
      }
      if (best) { place = best.d.place; at = [best.d.lon, best.d.lat]; }
    }
    if (!place) {
      const same = days.filter((d) => d.date === label && d.place && d.source !== 'photos');
      place = same.length ? same[same.length - 1].place : '';
    }
    if (!place && !gps) place = trip.place || '';
    // the photos memory for this day and place, or for this day near these coordinates
    let target = days.find((d) => d.source === 'photos' && d.date === label && (place
      ? d.place === place
      : gps && typeof d.lon === 'number' && kmBetween(gps, [d.lon, d.lat]) <= NEAR_KM));
    if (!target) {
      const c = at || gps;
      target = {
        id: newId(), date: label, title: place ? `Photos in ${place}` : 'Photos', place: place || trip.place || '',
        note: '', photos: [], pos: when.getTime(), added: Date.now(), source: 'photos',
        ...(c ? { lon: c[0], lat: c[1] } : {}),
      };
      days.push(target);
      created++;
    }
    const { key, taken, lat, lon, ...photo } = it; // eslint-disable-line no-unused-vars
    target.photos.push({ label: '', ...photo, key, ...(it.taken ? { taken: it.taken.getTime() } : {}) });
    if (it.key) have.add(it.key);
    added++;
  }
  return { trip: { ...trip, days }, added, created };
}
