import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { kvGet, kvPut } from './db.js';
import { tripSpan } from './stages.js';
import { bookingProgram, programKey, last4 } from './loyalty.js';

// Travelers (supabase/travelers.sql): one row per person, details in `doc`:
//   passport  { name, number, country, issued, expires, scans: [{ path, name, type }] }
//   ktn       { program, number, expires }          Global Entry / TSA PreCheck / NEXUS
//   dob, redress
//   license   { state, expires }
//   loyalty   [{ program, number, status, balance, asOf }]   balance and asOf also come from statements
//   cards     [{ name, last }]   cards used for trips: only their purchase alerts reach trip budgets
//   prefs     { airport, seat, cabin, meal, room, airlines, hotels, notes }
//   emergency { insurance, contacts, medical }
// Dates are YYYY-MM-DD. A copy is kept on the device so the numbers are there at the airport offline.

const iso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
export const monthYear = (s) => { const d = iso(s); return d ? d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''; };

// What needs attention before a trip: [{ level: 'bad' | 'warn' | 'info', text }]
// `international`: true / false, or null when the trip's country isn't known yet.
export function tripDocAlerts(trip, travelers, international, today = new Date()) {
  const span = tripSpan(trip);
  if (!span || span[1] < today) return [];
  const [start, end] = span;
  const out = [];
  const hasCar = (trip.days || []).some((d) => d.kind === 'Car' && (!d.booking || d.booking.status !== 'cancelled'));
  for (const t of travelers) {
    const doc = t.doc || {};
    const who = t.name || 'Someone';
    if (international) {
      const exp = iso(doc.passport && doc.passport.expires);
      if (!exp) out.push({ level: 'info', text: `No passport saved for ${who} — add it under Travelers.` });
      else if (exp < end) out.push({ level: 'bad', text: `${who}'s passport expires ${monthYear(doc.passport.expires)}, before this trip ends.` });
      else if (exp < addMonths(end, 6)) out.push({ level: 'warn', text: `${who}'s passport expires ${monthYear(doc.passport.expires)} — many countries need 6 months left after you travel.` });
    }
    const ktn = doc.ktn || {};
    const kexp = iso(ktn.expires);
    if (ktn.number && kexp && kexp < start) out.push({ level: 'warn', text: `${who}'s ${ktn.program || 'Global Entry'} expires ${monthYear(ktn.expires)}, before this trip — renew it.` });
    const lexp = iso(doc.license && doc.license.expires);
    if (hasCar && lexp && lexp < end) out.push({ level: 'warn', text: `${who}'s driver's license expires ${monthYear(doc.license.expires)} — you have a car rental on this trip.` });
  }
  return out;
}

// Upcoming bookings that don't show a traveler's number for that program, e.g. no AAdvantage # on an
// American flight. Only bookings read since loyalty numbers were recorded (booking.loyalty is a
// string) are checked; when a booking names its travelers, only those people are.
export function loyaltyAlerts(trip, travelers, today = new Date()) {
  const out = [];
  const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (const d of trip.days || []) {
    const b = d.booking;
    if (!b || b.status === 'cancelled' || typeof b.loyalty !== 'string') continue;
    const start = iso(b.start);
    if (!start || start < day0) continue;
    const prog = bookingProgram(b.provider, d.title);
    if (!prog) continue;
    const shown = new Set(b.loyalty.split(/[,;]/).map(last4).filter(Boolean));
    const names = String(b.travelers || '').toLowerCase();
    const missing = travelers.filter((t) => {
      const acct = ((t.doc || {}).loyalty || []).find((l) => l.number && programKey(l.program) === prog.key);
      if (!acct || shown.has(last4(acct.number))) return false;
      const first = String(t.name || '').toLowerCase().split(/\s+/)[0];
      const pp = String(((t.doc || {}).passport || {}).name || '').toLowerCase().split(/\s+/)[0];
      return !names || (first && names.includes(first)) || (pp && names.includes(pp));
    });
    if (missing.length) {
      out.push({ level: 'warn', text: `No ${prog.name} # for ${missing.map((t) => t.name).join(' or ')} on ${d.title} — add it before you go.` });
    }
  }
  return out;
}

// Expiry notes for a traveler's own card: a passport within 9 months, anything else within 6.
export function expiryNote(dateStr, months = 6, today = new Date()) {
  const d = iso(dateStr);
  if (!d) return null;
  if (d < today) return { level: 'bad', text: 'Expired' };
  if (d < addMonths(today, months)) return { level: 'warn', text: 'Expires ' + monthYear(dateStr) };
  return null;
}

export function useTravelers(household) {
  const [list, setList] = useState([]);
  const hid = household && household.id;
  const cacheKey = 'travelers:' + hid;

  const refresh = useCallback(async () => {
    if (!supabase || !hid) { setList([]); return; }
    const { data, error } = await supabase.from('travelers').select('id, name, sort, doc, updated_at')
      .eq('household_id', hid).order('sort').order('name');
    if (error) return; // offline: keep the device copy
    setList(data || []);
    kvPut(cacheKey, data || []);
  }, [hid, cacheKey]);

  useEffect(() => {
    if (!hid) { setList([]); return undefined; }
    let live = true;
    kvGet(cacheKey).then((c) => { if (live && Array.isArray(c)) setList((cur) => (cur.length ? cur : c)); });
    refresh();
    if (!supabase) return undefined;
    const channel = supabase.channel('travelers-' + hid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'travelers', filter: `household_id=eq.${hid}` }, () => refresh())
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { live = false; supabase.removeChannel(channel); window.removeEventListener('focus', onFocus); };
  }, [hid, cacheKey, refresh]);

  const save = useCallback(async (id, fields) => {
    setList((xs) => xs.map((x) => (x.id === id ? { ...x, ...fields } : x)));
    const { error } = await supabase.from('travelers').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { refresh(); throw error; }
    refresh();
  }, [refresh]);

  const add = useCallback(async (name) => {
    const { error } = await supabase.from('travelers').insert({ household_id: hid, name, sort: list.length + 1 });
    if (error) throw error;
    refresh();
  }, [hid, list.length, refresh]);

  const remove = useCallback(async (t) => {
    const scans = ((t.doc || {}).passport || {}).scans || [];
    const { error } = await supabase.from('travelers').delete().eq('id', t.id);
    if (error) throw error;
    if (scans.length) await supabase.storage.from('media').remove(scans.map((s) => s.path));
    refresh();
  }, [refresh]);

  // a passport scan or photo, into the family's private media bucket
  const addScan = useCallback(async (t, file) => {
    const ext = (/\.([a-z0-9]+)$/i.exec(file.name || '') || [, file.type === 'application/pdf' ? 'pdf' : 'jpg'])[1].toLowerCase();
    const path = `${hid}/travelers/${t.id}/passport-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw error;
    const doc = t.doc || {};
    const passport = doc.passport || {};
    await save(t.id, { doc: { ...doc, passport: { ...passport, scans: [...(passport.scans || []), { path, name: file.name || 'Passport scan', type: file.type }] } } });
  }, [hid, save]);

  const removeScan = useCallback(async (t, path) => {
    const doc = t.doc || {};
    const passport = doc.passport || {};
    await save(t.id, { doc: { ...doc, passport: { ...passport, scans: (passport.scans || []).filter((s) => s.path !== path) } } });
    await supabase.storage.from('media').remove([path]);
  }, [save]);

  return { list, refresh, save, add, remove, addScan, removeScan };
}
