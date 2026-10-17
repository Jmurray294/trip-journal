import { createClient } from '@supabase/supabase-js';

// The URL and anon key are public by design (row-level security protects the data).
// Without them the app runs exactly as before: everything stays on this device.
const env = import.meta.env || {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
