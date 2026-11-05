import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

// Contacts: people the family invites again and again (followers, guests at a gathering, the travel
// crew). One list per family, kept on the household (households.contacts, supabase/contacts.sql), so
// every member's device has it. Only members can read it; followers and guests never see it.
// A contact: { id, name, email, phone }; at least a name and an email or a phone.

const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
export const normEmail = (e) => clean(e, 120).toLowerCase();
export const normPhone = (p) => clean(p, 30).replace(/[^\d+()\-. ]/g, '');

// a contact from a form; null when it has nothing to reach them by. A blank name stays blank here,
// so saving someone again by email alone keeps the name they already have (upsertContact fills it).
export function makeContact({ name, email, phone }, id) {
  const c = { id, name: clean(name, 60), email: normEmail(email), phone: normPhone(phone) };
  if (c.email && !c.email.includes('@')) c.email = '';
  if (!c.email && !c.phone) return null;
  return c;
}

// add or update: the same email (or, without one, the same phone) is the same person.
// An edit (the same id) replaces the contact, so a cleared phone or email stays cleared.
export function upsertContact(list, c) {
  const own = (list || []).findIndex((x) => x.id === c.id);
  if (own >= 0) return sortContacts(list.map((x, j) => (j === own ? { ...c, name: c.name || x.name } : x)));
  const same = (x) => (c.email && x.email === c.email) || (!c.email && c.phone && x.phone === c.phone);
  const i = (list || []).findIndex(same);
  if (i < 0) return sortContacts([...(list || []), { ...c, name: c.name || (c.email ? c.email.split('@')[0] : c.phone) }]);
  const merged = { ...list[i], ...Object.fromEntries(Object.entries(c).filter(([k, v]) => v && k !== 'id')) };
  return sortContacts(list.map((x, j) => (j === i ? merged : x)));
}

export const removeContact = (list, id) => (list || []).filter((x) => x.id !== id);
export const sortContacts = (list) => [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));

// an email to several people at once (bcc, so they don't see each other's addresses)
export const mailtoMany = (emails, subject, body) =>
  `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
// a text to one person, with the message filled in (the "?&" form works on both iPhone and Android)
export const smsTo = (phone, body) => `sms:${String(phone).replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`;

// ---------- for members: the family's list ----------
export function useContacts(household) {
  const [list, setList] = useState([]);
  const [ready, setReady] = useState(true); // false until contacts.sql has been run
  const hid = household && household.id;

  const read = useCallback(async () => {
    const { data, error } = await supabase.from('households').select('contacts').eq('id', hid).maybeSingle();
    if (error) { setReady(false); throw new Error(/column|contacts/i.test(error.message) ? 'Contacts need a one-time setup: run supabase/contacts.sql' : error.message); }
    setReady(true);
    return Array.isArray(data && data.contacts) ? data.contacts : [];
  }, [hid]);

  const load = useCallback(async () => {
    if (!supabase || !hid) { setList([]); return; }
    try { setList(sortContacts(await read())); } catch (e) { setList([]); }
  }, [hid, read]);
  useEffect(() => { load(); }, [load]);

  // read the latest first, so two people adding at once don't undo each other
  const change = async (fn) => {
    const next = fn(await read());
    const { error } = await supabase.from('households').update({ contacts: next }).eq('id', hid);
    if (error) throw new Error(error.message);
    setList(sortContacts(next));
    return next;
  };
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const save = async (fields, id) => {
    const c = makeContact(fields, id || newId());
    if (!c) throw new Error('Add an email or a phone number');
    await change((l) => upsertContact(l, c));
    return c;
  };
  const remove = (id) => change((l) => removeContact(l, id));
  return { list, ready, save, remove, reload: load };
}
