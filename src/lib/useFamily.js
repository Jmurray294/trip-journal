import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { createSync } from './sync.js';

// Sign-in (email + password), the shared journal this account belongs to (a "household" in the
// database), who it is shared with, and the sync engine.
// Sync only starts once the local journal has loaded (`enabled`), so a pull never races the load.
export function useFamily({ getTrips, applyTrips, enabled }) {
  const [session, setSession] = useState(null);
  const [recovering, setRecovering] = useState(false); // arrived from a "reset your password" email
  const [household, setHousehold] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [status, setStatus] = useState({ state: 'off' });
  const sync = useMemo(() => (supabase ? createSync({ getTrips, applyTrips, onStatus: setStatus }) : null), []); // eslint-disable-line

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session && session.user && session.user.id;

  const loadMembers = useCallback(async (hid) => {
    const [m, i] = await Promise.all([
      supabase.from('household_members').select('user_id, display_name, joined_at').eq('household_id', hid).order('joined_at'),
      supabase.from('household_invites').select('email, created_at').eq('household_id', hid).order('created_at'),
    ]);
    setMembers(m.data || []);
    setInvites(i.data || []);
  }, []);

  const loadHousehold = useCallback(async () => {
    if (!uid) { setHousehold(null); return; }
    // anything shared with this email since last time
    await supabase.rpc('accept_invites', { p_display_name: '' });
    const query = (cols) => supabase.from('household_members')
      .select(`household_id, display_name, households(${cols})`).eq('user_id', uid).order('joined_at').limit(1);
    let { data, error } = await query('id, name, invite_code, inbox_token, created_by');
    // databases set up before email forwarding have no inbox column yet; sharing still works without it
    if (error) ({ data, error } = await query('id, name, invite_code, created_by'));
    if (error) return;
    const h = data && data[0] && data[0].households;
    setHousehold(h || null);
    if (h) loadMembers(h.id);
  }, [uid, loadMembers]);

  useEffect(() => { if (supabase) loadHousehold(); }, [loadHousehold]);

  useEffect(() => {
    if (!sync) return undefined;
    if (enabled && household) sync.start(household.id);
    else { sync.stop(); setStatus({ state: 'off' }); }
    return undefined;
  }, [sync, enabled, household]);

  useEffect(() => () => sync && sync.stop(), [sync]);

  const home = () => window.location.origin + import.meta.env.BASE_URL;

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message);
  };

  // returns true when the account still needs its email confirmed before signing in
  const signUp = async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password, options: { data: { name: (name || '').trim() }, emailRedirectTo: home() },
    });
    if (error) throw error;
    return !data.session;
  };

  const sendReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: home() });
    if (error) throw error;
  };

  const setPassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setRecovering(false);
  };

  const invite = async (email) => {
    const e = email.trim().toLowerCase();
    if (!household || !e.includes('@')) throw new Error('Enter an email address');
    const { error } = await supabase.from('household_invites').upsert({ household_id: household.id, email: e }, { onConflict: 'household_id,email' });
    if (error) throw error;
    await loadMembers(household.id);
  };

  const cancelInvite = async (email) => {
    const { error } = await supabase.from('household_invites').delete().eq('household_id', household.id).eq('email', email);
    if (error) throw error;
    await loadMembers(household.id);
  };

  const removeMember = async (userId) => {
    const { error } = await supabase.rpc('remove_member', { p_household: household.id, p_user: userId });
    if (error) throw error;
    await loadMembers(household.id);
  };

  const createFamily = async (name, displayName) => {
    const { error } = await supabase.rpc('create_household', { p_name: name, p_display_name: displayName });
    if (error) throw error;
    await loadHousehold();
  };

  const joinFamily = async (code, displayName) => {
    const { error } = await supabase.rpc('join_household', { p_code: code, p_display_name: displayName });
    if (error) throw error;
    await loadHousehold();
  };

  const signOut = async () => {
    if (sync) sync.stop();
    setHousehold(null); setMembers([]);
    await supabase.auth.signOut();
  };

  return {
    available: !!supabase,
    session, email: session && session.user && session.user.email, uid, recovering,
    household, members, invites, status, isOwner: !!(household && uid && household.created_by === uid),
    signIn, signUp, sendReset, setPassword, invite, cancelInvite, removeMember,
    createFamily, joinFamily, signOut, reload: loadHousehold,
    syncNow: () => sync && sync.syncNow(),
    schedule: () => sync && sync.schedule()
  };
}
