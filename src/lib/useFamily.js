import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { createSync } from './sync.js';

// Sign-in (emailed 6-digit code), the family journal this account belongs to, and the sync engine.
// Sync only starts once the local journal has loaded (`enabled`), so a pull never races the load.
export function useFamily({ getTrips, applyTrips, enabled }) {
  const [session, setSession] = useState(null);
  const [household, setHousehold] = useState(null);
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState({ state: 'off' });
  const sync = useMemo(() => (supabase ? createSync({ getTrips, applyTrips, onStatus: setStatus }) : null), []); // eslint-disable-line

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session && session.user && session.user.id;

  const loadMembers = useCallback(async (hid) => {
    const { data } = await supabase.from('household_members').select('user_id, display_name, joined_at').eq('household_id', hid).order('joined_at');
    setMembers(data || []);
  }, []);

  const loadHousehold = useCallback(async () => {
    if (!uid) { setHousehold(null); return; }
    const { data, error } = await supabase.from('household_members')
      .select('household_id, display_name, households(id, name, invite_code)').eq('user_id', uid).order('joined_at').limit(1);
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

  const sendCode = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + import.meta.env.BASE_URL }
    });
    if (error) throw error;
  };

  const verifyCode = async (email, code) => {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) throw error;
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
    session, email: session && session.user && session.user.email, uid,
    household, members, status,
    sendCode, verifyCode, createFamily, joinFamily, signOut,
    syncNow: () => sync && sync.syncNow(),
    schedule: () => sync && sync.schedule()
  };
}
