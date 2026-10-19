import { supabase } from './supabase.js';

// A trip's documents: the forwarded emails filed into it (directly, or from To sort) with their
// saved PDFs and photos. The same email forwarded (or re-imported) more than once is listed once.

const COLS = 'id, subject, sender, created_at, body, attachments, message_id';

export async function tripDocuments(householdId, tripId) {
  if (!supabase || !householdId) return [];
  const [direct, sorted] = await Promise.all([
    supabase.from('inbound_emails').select(COLS).eq('household_id', householdId).eq('trip_id', tripId)
      .order('created_at', { ascending: false }).limit(200),
    supabase.from('inbox_items').select('email_id').eq('household_id', householdId).eq('trip_id', tripId)
      .eq('status', 'filed').not('email_id', 'is', null),
  ]);
  if (direct.error) throw direct.error;
  let rows = direct.data || [];
  const ids = (sorted.data || []).map((r) => r.email_id).filter((id) => !rows.some((x) => x.id === id));
  if (ids.length) {
    const more = await supabase.from('inbound_emails').select(COLS).in('id', ids);
    rows = rows.concat(more.data || []);
  }
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const seen = new Map();
  for (const r of rows) {
    // by content rather than Gmail id: the same email forwarded twice is two Gmail messages
    const key = [r.subject, r.sender, (r.body || '').replace(/^\[Attachments:[^\]]*\]\s*/, '').slice(0, 300)].join('|');
    const had = seen.get(key);
    // newest copy wins, unless an older one is the copy with the saved attachments
    if (!had || (!(had.attachments || []).length && (r.attachments || []).length)) seen.set(key, r);
  }
  return [...seen.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// Open a saved attachment in a new tab. The tab is opened right away (inside the tap) so
// browsers don't block it, then pointed at the file once it has downloaded.
export async function openFile(path) {
  const w = window.open('', '_blank');
  try {
    const { data, error } = await supabase.storage.from('media').download(path);
    if (error || !data) throw error || new Error('missing');
    const url = URL.createObjectURL(data);
    if (w) w.location.href = url; else window.location.href = url;
  } catch (e) {
    if (w) w.close();
    throw e;
  }
}
