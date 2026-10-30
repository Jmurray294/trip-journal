import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

// Someday: places and things saved for a trip one day (supabase/someday.sql). They arrive from the
// trips address and the app's Save idea, both read by the inbound-email function.

const COLS = 'id, place, spot, title, note, url, image_url, image_path, source, sender, status, trip_id, created_at';

// Open ideas by place: the places with the most saved first, newest ideas first within a place.
export function groupByPlace(items) {
  const m = new Map();
  for (const it of items) {
    const place = (it.place || '').trim() || 'Anywhere';
    const k = place.toLowerCase();
    if (!m.has(k)) m.set(k, { place, items: [] });
    m.get(k).items.push(it);
  }
  const newest = (g) => g.items.reduce((a, it) => (it.created_at > a ? it.created_at : a), '');
  for (const g of m.values()) g.items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return [...m.values()].sort((a, b) => b.items.length - a.items.length || (newest(a) < newest(b) ? 1 : -1));
}

// Search the board: every word must appear in the idea's place, spot, title, note or link.
// Each group keeps `all` so Start planning still takes the whole place, not just the matches.
export function searchIdeas(groups, query) {
  const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return groups;
  const text = (g, it) => [g.place, it.spot, it.title, it.note, it.url].filter(Boolean).join(' ').toLowerCase();
  return groups
    .map((g) => ({ place: g.place, all: g, items: g.items.filter((it) => words.every((w) => text(g, it).includes(w))) }))
    .filter((g) => g.items.length);
}

export function useSomeday(household) {
  const [items, setItems] = useState([]);
  const hid = household && household.id;

  const refresh = useCallback(async () => {
    if (!supabase || !hid) { setItems([]); return; }
    const { data } = await supabase.from('someday').select(COLS).eq('household_id', hid).eq('status', 'open')
      .order('created_at', { ascending: false }).limit(500);
    setItems(data || []);
  }, [hid]);

  useEffect(() => {
    refresh();
    if (!supabase || !hid) return undefined;
    const channel = supabase.channel('someday-' + hid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'someday', filter: `household_id=eq.${hid}` }, () => refresh())
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { supabase.removeChannel(channel); window.removeEventListener('focus', onFocus); };
  }, [hid, refresh]);

  const set = useCallback(async (ids, fields) => {
    setItems((xs) => xs.filter((x) => !ids.includes(x.id)));
    const { error } = await supabase.from('someday').update(fields).in('id', ids);
    if (error) { refresh(); throw error; }
  }, [refresh]);

  const remove = useCallback((id) => set([id], { status: 'removed' }), [set]);
  // the ideas behind a trip being planned
  const plan = useCallback((ids, tripId) => set(ids, { status: 'planned', trip_id: tripId }), [set]);
  // a trip from Someday that isn't happening: its ideas go back on the board
  const reopen = useCallback(async (tripId) => {
    if (!supabase || !hid) return;
    await supabase.from('someday').update({ status: 'open', trip_id: null }).eq('household_id', hid).eq('trip_id', tripId);
    refresh();
  }, [hid, refresh]);

  return { items, groups: groupByPlace(items), refresh, remove, plan, reopen };
}

// The saved ideas a trip was planned from (shown in its Documents tab).
export async function tripIdeas(householdId, tripId) {
  if (!supabase || !householdId) return [];
  const { data } = await supabase.from('someday').select(COLS).eq('household_id', householdId).eq('trip_id', tripId)
    .neq('status', 'removed').order('created_at', { ascending: false });
  return data || [];
}
