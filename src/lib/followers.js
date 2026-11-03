import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { tripSpan, tripStage } from './stages.js';

// Followers: family and friends who follow along in the portal (screens/Portal.jsx) without being in
// the journal. They see only trips switched on for followers (trip.followers), and nothing private —
// supabase/followers.sql picks what they get field by field.

export const portalLink = () => window.location.origin + ((import.meta.env || {}).BASE_URL || '/') + '?follow';

// ---------- for members: who follows, invite, remove ----------
export function useFollowers(household) {
  const [followers, setFollowers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [ready, setReady] = useState(true); // false when followers.sql hasn't been run yet
  const hid = household && household.id;

  const load = useCallback(async () => {
    if (!supabase || !hid) { setFollowers([]); setInvites([]); return; }
    const [f, i] = await Promise.all([
      supabase.from('household_followers').select('user_id, email, display_name, joined_at').eq('household_id', hid).order('joined_at'),
      supabase.from('follower_invites').select('email, created_at').eq('household_id', hid).order('created_at'),
    ]);
    setReady(!f.error);
    setFollowers(f.data || []);
    setInvites(i.data || []);
  }, [hid]);

  useEffect(() => { load(); }, [load]);

  const invite = async (email) => {
    const e = String(email || '').trim().toLowerCase();
    if (!hid || !e.includes('@')) throw new Error('Enter an email address');
    const { error } = await supabase.from('follower_invites').upsert({ household_id: hid, email: e }, { onConflict: 'household_id,email' });
    if (error) throw new Error(/relation|does not exist/i.test(error.message) ? 'Followers need a one-time setup — run supabase/followers.sql' : error.message);
    await load();
  };
  const cancel = async (email) => {
    const { error } = await supabase.from('follower_invites').delete().eq('household_id', hid).eq('email', email);
    if (error) throw error;
    await load();
  };
  const remove = async (userId) => {
    const { error } = await supabase.from('household_followers').delete().eq('household_id', hid).eq('user_id', userId);
    if (error) throw error;
    await load();
  };

  // everyone to tell when a book or song is ready: followers and anyone invited
  const emails = [...new Set([...followers.map((f) => f.email), ...invites.map((i) => i.email)].filter(Boolean))];
  return { followers, invites, emails, ready, invite, cancel, remove, reload: load };
}

// An email to every follower, opened in the phone's or computer's mail app (bcc, so they don't see
// each other's addresses). `what` is 'book' or 'song'.
export function announceEmail(trip, what, emails, familyName) {
  const name = trip.title || 'our trip';
  const subject = what === 'book' ? `The ${name} photo book is ready` : `Our ${name} trip song is ready`;
  const body = (what === 'book'
    ? `We made a photo book from ${name}. Open it here and turn the pages:`
    : `We made a song about ${name}. Have a listen here:`) +
    `\n\n${portalLink()}\n\nSign in with this email address. You'll get a 6-digit code, no password needed.` +
    (familyName && !/^our (family|trips)$/i.test(familyName.trim()) ? `\n\n— ${familyName.trim()}` : '');
  return `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------- for followers: the portal ----------
// `preview`: a member looking at their own family's portal, through the same filter followers get
export async function loadPortal(displayName = '', { preview = false } = {}) {
  if (!preview) await supabase.rpc('accept_follow_invites', { p_display_name: displayName });
  const { data, error } = await supabase.rpc(preview ? 'follower_preview' : 'follower_portal');
  if (error) {
    const missing = /function|does not exist|schema cache/i.test(error.message);
    throw new Error(missing ? (preview ? 'Preview needs a one-time setup: run the follower_preview part of supabase/followers.sql' : 'The family portal isn’t set up yet') : error.message);
  }
  return (data || []).map((f) => ({ ...f, trips: (f.trips || []).map((t) => ({ ...t, days: t.days || [] })) }));
}

const dayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// sort a family's trips into: underway now, the next one coming, and the ones that are over
export function portalSections(trips, today = new Date()) {
  const t0 = dayOf(today);
  const live = [], coming = [], past = [];
  for (const t of trips) {
    if (t.possible) continue;
    const span = tripSpan(t);
    if (span && dayOf(span[0]) <= t0 && dayOf(span[1]) >= t0) live.push(t);
    else if (tripStage(t, today) === 'past') past.push(t);
    else coming.push(t);
  }
  const start = (t) => { const s = tripSpan(t); return s ? +s[0] : Infinity; };
  coming.sort((a, b) => start(a) - start(b));
  past.sort((a, b) => start(b) - start(a));
  return { live, next: coming[0] || null, past };
}

// the newest things first: journal notes and photos (not bookings), for "on the road now"
export function latestMoments(trip, n = 30) {
  const isBooking = (d) => !!(d.booking || d.kind);
  return (trip.days || [])
    .filter((d) => !isBooking(d) && ((d.note || '').trim() || (d.photos || []).length))
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (b.d.added || b.d.pos || 0) - (a.d.added || a.d.pos || 0) || b.i - a.i)
    .slice(0, n)
    .map((x) => x.d);
}

export const hasBook = (t) => !!(t.book && t.book.draft);
export const hasSong = (t) => !!(t.song && (t.song.audioPath || (t.song.lines || []).length));
