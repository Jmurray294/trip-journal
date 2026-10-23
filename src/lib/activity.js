import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { kvGet, kvPut } from './db.js';

// What's new: what the trips address and the iPhone Shortcut brought in (the inbound_emails log —
// bookings, changes, ideas, Someday saves, loyalty updates, photo days), newest first. "Seen" is kept
// per device.

const COLS = 'id, subject, sender, items, status, trip_title, trip_id, created_at, message_id';

export function useActivity(household) {
  const [items, setItems] = useState([]);
  const [seenAt, setSeenAt] = useState(null);
  const hid = household && household.id;
  const seenKey = 'activitySeen:' + hid;

  const refresh = useCallback(async () => {
    if (!supabase || !hid) { setItems([]); return; }
    const { data } = await supabase.from('inbound_emails').select(COLS).eq('household_id', hid)
      .in('status', ['added', 'to sort']).order('created_at', { ascending: false }).limit(40);
    // one line per email, however many times it was forwarded or read again
    const seen = new Set();
    setItems((data || []).filter((m) => { const k = (m.subject || '') + '|' + (m.trip_title || ''); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 25));
  }, [hid]);

  useEffect(() => {
    if (!hid) { setItems([]); return undefined; }
    let live = true;
    // first time on this device: everything before now counts as seen
    kvGet(seenKey).then((v) => { if (!live) return; if (typeof v === 'string') setSeenAt(v); else { const now = new Date().toISOString(); setSeenAt(now); kvPut(seenKey, now); } });
    refresh();
    if (!supabase) return undefined;
    const channel = supabase.channel('activity-' + hid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbound_emails', filter: `household_id=eq.${hid}` }, () => refresh())
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const t = setInterval(refresh, 5 * 60 * 1000);
    return () => { live = false; supabase.removeChannel(channel); window.removeEventListener('focus', onFocus); clearInterval(t); };
  }, [hid, seenKey, refresh]);

  const unread = seenAt ? items.filter((m) => m.created_at > seenAt).length : 0;
  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    setSeenAt(now);
    kvPut(seenKey, now);
  }, [seenKey]);

  return { items, unread, seenAt, refresh, markSeen };
}
