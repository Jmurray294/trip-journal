import { kvGet, kvPut } from './db.js';

// OpenStreetMap Nominatim geocoding, cached per query in IndexedDB (misses cached too).
// Nominatim allows at most 1 request/second; callers space requests out.
export async function geocode(place) {
  const q = String(place || '').trim();
  if (!q) return null;
  const key = 'geo:' + q.toLowerCase();
  const hit = await kvGet(key);
  if (hit) return hit.c || null;
  if (!navigator.onLine) return null;
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const c = j && j[0] ? [parseFloat(j[0].lon), parseFloat(j[0].lat)] : null;
    await kvPut(key, { c });
    return c;
  } catch (e) {
    return null;
  }
}

export function haversineKm(a, b) {
  const R = Math.PI / 180;
  const dLat = (b[1] - a[1]) * R, dLon = (b[0] - a[0]) * R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// What to look up for a trip's place: the whole name, then its first part ("Japan & Seoul" → "Japan",
// "Banff & Jasper" → "Banff"), which the geocoder finds when the whole name is too loose.
export function placeQueries(place) {
  const q = String(place || '').trim();
  if (!q) return [];
  const first = q.split(/\s*(?:&|,|\+|\/|\band\b|\bwith\b)\s*/i)[0].trim();
  return first && first !== q ? [q, first] : [q];
}

// Where a trip pins on the all-trips map: its own place, looked up (trip.lon/lat); else the stop
// farthest from home, since a trip's first stop is often the airport at home.
export function tripPoint(trip, home) {
  if (typeof trip.lon === 'number' && typeof trip.lat === 'number') return [trip.lon, trip.lat];
  const pts = (trip.days || []).filter((d) => typeof d.lon === 'number' && typeof d.lat === 'number').map((d) => [d.lon, d.lat]);
  if (!pts.length) return null;
  if (typeof home.homeLon !== 'number' || typeof home.homeLat !== 'number') return pts[Math.floor(pts.length / 2)];
  const h = [home.homeLon, home.homeLat];
  return pts.reduce((a, p) => (haversineKm(h, p) > haversineKm(h, a) ? p : a));
}

// Index 0 is always Home; then one stop per distinct place in day order.
// A repeated place extends that stop's day range and merges its photos.
export function buildStops(trip, home) {
  if (!trip) return [];
  const seen = {};
  const out = [{ name: 'Home', sub: home.home || 'Set your home address', dayStart: 0, dayEnd: 0, photos: [], isHome: true, lon: home.homeLon, lat: home.homeLat, date: '' }];
  (trip.days || []).forEach((d) => {
    const place = (d.place || '').trim();
    if (!place) return;
    if (seen[place] != null) {
      const o = out[seen[place]];
      o.dayEnd = d.num;
      o.photos.push(...(d.photos || []));
      return;
    }
    seen[place] = out.length;
    out.push({ name: place, sub: d.title || trip.place || '', dayStart: d.num, dayEnd: d.num, photos: [...(d.photos || [])], lon: d.lon, lat: d.lat, date: d.date || '' });
  });
  if (out.length <= 1) return [];
  return out.map((s) => ({
    ...s,
    day: s.isHome ? 'Departure' : (s.dayEnd > s.dayStart ? 'Day ' + s.dayStart + '–' + s.dayEnd : 'Day ' + s.dayStart),
    photo: s.photos[0]
  }));
}
