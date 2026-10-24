// Explore: suggestions of what to see, do and eat at each stop of a trip, kept on the trip
// (trip.suggestions[placeKey] = { at, summary, items: [{ id, kind, title, why, when, where, url, status }] })
// so they sync to the family and work offline.

export const placeKey = (p) => String(p || '').trim().toLowerCase();

// A trip's stops in itinerary order, with the day labels spent there. Places that only appear as a
// flight's departure (the home airport) aren't stops; a trip with no itinerary yet has its own place.
export function stopsOf(trip) {
  const m = new Map();
  for (const d of trip.days || []) {
    const p = String(d.place || '').trim();
    if (!p) continue;
    const k = placeKey(p);
    if (!m.has(k)) m.set(k, { place: p, dates: [], kinds: new Set(), first: d });
    const s = m.get(k);
    if (d.date && !s.dates.includes(d.date)) s.dates.push(d.date);
    s.kinds.add(d.kind || 'memory');
  }
  const stops = [...m.values()].filter((s) => !(s.kinds.size === 1 && s.kinds.has('Flight')))
    .map(({ place, dates, first }) => ({ place, dates, first }));
  if (!stops.length && trip.place) return [{ place: trip.place, dates: [], first: null }];
  return stops;
}

// New suggestions join the ones already there (same title = same suggestion, kept as it was).
export function mergeSuggestions(prev, fresh, newId, now = Date.now()) {
  const old = (prev && prev.items) || [];
  const seen = new Set(old.map((i) => i.title.toLowerCase()));
  const added = (fresh.items || []).filter((i) => !seen.has(i.title.toLowerCase())).map((i) => ({ ...i, id: newId(), status: 'new' }));
  return { at: now, summary: fresh.summary || (prev && prev.summary) || '', items: [...old, ...added] };
}
