import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

// Someday: places and things saved for a trip one day (supabase/someday.sql). They arrive from the
// trips address and the app's Save idea, both read by the inbound-email function.

const COLS = 'id, place, spot, title, note, url, image_url, image_path, files, source, sender, status, trip_id, created_at';

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

// Ideas are filed by country, or by US state / Canadian province / Australian state / Italian region;
// the board shows them country first, then state.
const STATES = {
  'United States': ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida',
    'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
    'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
    'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
    'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming', 'Washington DC', 'Washington, D.C.', 'District of Columbia', 'Puerto Rico'],
  Canada: ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia', 'Ontario',
    'Prince Edward Island', 'Quebec', 'Québec', 'Saskatchewan', 'Yukon', 'Northwest Territories', 'Nunavut'],
  Italy: ['Abruzzo', 'Aosta Valley', "Valle d'Aosta", 'Apulia', 'Puglia', 'Basilicata', 'Calabria', 'Campania',
    'Emilia-Romagna', 'Friuli Venezia Giulia', 'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardy', 'Lombardia', 'Marche',
    'Molise', 'Piedmont', 'Piemonte', 'Sardinia', 'Sardegna', 'Sicily', 'Sicilia', 'Tuscany', 'Toscana',
    'Trentino-Alto Adige', 'Trentino', 'South Tyrol', 'Umbria', 'Veneto'],
  Australia: ['New South Wales', 'Victoria', 'Queensland', 'South Australia', 'Western Australia', 'Tasmania',
    'Northern Territory', 'Australian Capital Territory'],
};
const COUNTRY_NAMES = { usa: 'United States', us: 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States',
  'united states of america': 'United States', america: 'United States' };
const STATE_OF = new Map();
for (const [country, list] of Object.entries(STATES)) for (const st of list) STATE_OF.set(st.toLowerCase(), country);

// "Alaska" → { country: 'United States', state: 'Alaska' }; "Italy" → { country: 'Italy', state: '' }.
// Also reads "Alaska, USA" and "Tuscany, Italy".
export function countryOf(place) {
  const raw = (place || '').trim();
  if (!raw || raw === 'Anywhere') return { country: 'Anywhere', state: '' };
  const fix = (c) => COUNTRY_NAMES[c.toLowerCase()] || c;
  const known = STATE_OF.get(raw.toLowerCase());
  if (known) return { country: known, state: raw };
  const m = raw.match(/^(.+),\s*([^,]+)$/);
  if (m) {
    const st = m[1].trim(), c = fix(m[2].trim());
    return { country: STATE_OF.get(st.toLowerCase()) || c, state: st };
  }
  return { country: fix(raw), state: '' };
}

// What a country's parts are called on the board.
export const partsOf = (country) => ({ Canada: 'provinces', Italy: 'regions' })[country] || 'states';

// Place groups (from groupByPlace or searchIdeas) gathered under their country: countries with the most
// ideas first. A country's ideas that name no state come first, as their own group.
export function byCountry(groups) {
  const m = new Map();
  for (const g of groups) {
    const { country, state } = countryOf(g.place);
    const k = country.toLowerCase();
    if (!m.has(k)) m.set(k, { country, count: 0, places: [] });
    const c = m.get(k);
    c.count += g.items.length;
    c.places.push({ ...g, state });
  }
  for (const c of m.values()) c.places.sort((a, b) => (a.state ? 1 : 0) - (b.state ? 1 : 0));
  return [...m.values()].sort((a, b) => (a.country === 'Anywhere') - (b.country === 'Anywhere') || b.count - a.count);
}

// Just one place's ideas: a state or region exactly ("California"), else everything in a country
// ("United States", or "Italy" with its regions).
export function onlyPlace(groups, place) {
  if (!place) return groups;
  const k = place.trim().toLowerCase();
  const exact = groups.filter((g) => g.place.toLowerCase() === k);
  const country = countryOf(place).country.toLowerCase();
  return exact.some((g) => countryOf(g.place).state) ? exact : groups.filter((g) => countryOf(g.place).country.toLowerCase() === country);
}

// Search the board: every word must appear in the idea's place, spot, title, note or link.
// Each group keeps `all` so Start planning still takes the whole place, not just the matches.
export function searchIdeas(groups, query) {
  const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return groups;
  const text = (g, it) => [g.place, countryOf(g.place).country, it.spot, it.title, it.note, it.url].filter(Boolean).join(' ').toLowerCase();
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
