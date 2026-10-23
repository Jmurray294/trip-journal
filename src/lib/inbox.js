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
