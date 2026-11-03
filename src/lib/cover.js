// A trip's cover: the photo you pinned ("Use as trip cover" in the photo viewer, stored as
// trip.cover = "<entry id>#<photo index>", the same refs the photo book uses), else the photo
// book's cover, else the first photo. Pure, so it can be tested.

export const coverRef = (entryId, pi) => `${entryId}#${pi}`;

function byRef(trip, ref) {
  if (!ref) return null;
  const [id, i] = String(ref).split('#');
  const d = (trip.days || []).find((x) => x.id === id);
  const p = d && d.photos ? d.photos[Number(i)] : null;
  return p ? { ref, p } : null;
}

// every photo in the trip, in itinerary order, as { ref, p }
function allPhotos(trip) {
  const out = [];
  for (const d of trip.days || []) (d.photos || []).forEach((p, i) => out.push({ ref: coverRef(d.id, i), p }));
  return out;
}

export function coverPhoto(trip) {
  if (!trip) return null;
  const pinned = byRef(trip, trip.cover) || byRef(trip, trip.book && trip.book.draft && trip.book.draft.cover);
  if (pinned) return pinned;
  const all = allPhotos(trip);
  return all[0] || null;
}

// up to `n` photos for the header collage: the cover first, then others spread across the trip
// (and the photo book's chapter openers ahead of the rest, since someone already picked those)
export function collagePhotos(trip, n = 5) {
  const all = allPhotos(trip);
  if (!all.length) return [];
  const first = coverPhoto(trip);
  const out = [first];
  const used = new Set([first.ref]);
  const add = (x) => { if (x && !used.has(x.ref) && out.length < n) { out.push(x); used.add(x.ref); } };
  const chapters = (trip.book && trip.book.draft && trip.book.draft.chapters) || [];
  for (const c of chapters) add(byRef(trip, c.hero));
  const rest = all.filter((x) => !used.has(x.ref));
  const need = n - out.length;
  for (let k = 0; k < need && rest.length; k++) add(rest[Math.floor((k + 0.5) * rest.length / need)]);
  return out;
}

export const isCover = (trip, entryId, pi) => { const c = coverPhoto(trip); return !!c && c.ref === coverRef(entryId, pi); };
