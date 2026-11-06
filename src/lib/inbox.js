import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { sortDays } from './sync.js';

// The family's "To sort" list: forwarded emails the reader could not confidently place in a trip.
// Each item carries its itinerary rows and cost rows ready to file ({ id, doc } like the entries table).

// The family's trips address. The trips Gmail is the family's own and its forwarder reads mail sent to
// the plain address (FAMILY_CODE in gmail-forwarder.gs), so that is the one to give out; the
// "+code" form still works for mail already sent there.
export function forwardingAddress(household) {
  const base = (import.meta.env || {}).VITE_INBOUND_ADDRESS || '';
  return base.includes('@') && household && household.inbox_token ? base : null;
}

// Put an item's rows into one trip (pure, so it can be tested). Rows already somewhere else —
// the same booking forwarded twice — move here; photos already added to a booking are kept.
export function fileRows(trips, tripId, entries, costs) {
  const ids = new Set([...entries, ...costs].map((r) => r.id));
  const oldPhotos = new Map();
  for (const t of trips) for (const d of t.days || []) if (ids.has(d.id) && (d.photos || []).length) oldPhotos.set(d.id, d.photos);
  return trips.map((t) => {
    const days = (t.days || []).filter((d) => !ids.has(d.id));
    const cs = (t.costs || []).filter((c) => !ids.has(c.id));
    if (t.id !== tripId) {
      if (days.length === (t.days || []).length && cs.length === (t.costs || []).length) return t;
      return { ...t, days: sortDays(days), ...(t.costs ? { costs: cs } : {}) };
    }
    const added = entries.map((r) => ({ ...r.doc, id: r.id, photos: oldPhotos.get(r.id) || r.doc.photos || [] }));
    const addedCosts = costs.map((r) => ({ ...r.doc, id: r.id }));
    return {
      ...t,
      days: sortDays([...days, ...added]),
      costs: [...cs, ...addedCosts].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)),
    };
  });
}

export function useInbox(household) {
  const [items, setItems] = useState([]);
  const hid = household && household.id;

  const refresh = useCallback(async () => {
    if (!supabase || !hid) { setItems([]); return; }
    const { data } = await supabase.from('inbox_items').select('id, subject, summary, suggestion, entries, costs, created_at')
      .eq('household_id', hid).eq('status', 'open').order('created_at', { ascending: false });
    setItems(data || []);
  }, [hid]);

  useEffect(() => {
    refresh();
    if (!supabase || !hid) return undefined;
    const channel = supabase.channel('inbox-' + hid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_items', filter: `household_id=eq.${hid}` }, () => refresh())
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { supabase.removeChannel(channel); window.removeEventListener('focus', onFocus); };
  }, [hid, refresh]);

  // mark an item filed (with the trip it went to) or dismissed
  const close = useCallback(async (id, status, tripId) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    const { error } = await supabase.from('inbox_items').update({ status, trip_id: tripId || null }).eq('id', id);
    if (error) { refresh(); throw error; }
  }, [refresh]);

  return { items, refresh, close };
}

// Move everything in one trip (its itinerary, journal, photos and costs) into another trip or a
// gathering, and remove the emptied trip (pure, so it can be tested). An email that started a trip
// of its own — tickets for a gathering — goes where it belongs.
export function mergeTrip(trips, fromId, toId) {
  const from = trips.find((t) => t.id === fromId);
  if (!from || fromId === toId || !trips.some((t) => t.id === toId)) return trips;
  return trips.filter((t) => t.id !== fromId).map((t) => (t.id !== toId ? t : {
    ...t,
    days: sortDays([...(t.days || []), ...(from.days || [])]),
    costs: [...(t.costs || []), ...(from.costs || [])].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)),
  }));
}

// Move one item (a booking, a note) into another trip or gathering. Costs with the same confirmation
// number go with it. A trip an email started on its own (source 'email') that is left empty is removed,
// so tickets that made a "trip" end up only where they belong. Pure, so it can be tested.
const confKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function moveEntry(trips, fromId, entryId, toId) {
  const from = trips.find((t) => t.id === fromId);
  const entry = from && (from.days || []).find((d) => d.id === entryId);
  if (!entry || fromId === toId || !trips.some((t) => t.id === toId)) return trips;
  const conf = confKey(entry.booking && entry.booking.confirmation);
  const goes = (c) => conf.length >= 4 && confKey(c.confirmation) === conf;
  const costs = (from.costs || []).filter(goes);
  const left = { days: (from.days || []).filter((d) => d.id !== entryId), costs: (from.costs || []).filter((c) => !goes(c)) };
  const emptied = from.source === 'email' && !left.days.length && !left.costs.length;
  return trips.filter((t) => !(emptied && t.id === fromId)).map((t) => {
    if (t.id === fromId) return { ...t, days: left.days, ...(t.costs ? { costs: left.costs } : {}) };
    if (t.id !== toId) return t;
    return {
      ...t,
      days: sortDays([...(t.days || []), entry]),
      ...(costs.length || t.costs ? { costs: [...(t.costs || []), ...costs].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)) } : {}),
    };
  });
}
