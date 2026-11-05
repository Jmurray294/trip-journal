-- Trip Journal: the family's contacts (people you invite again and again: followers, guests,
-- the travel crew). One list per family on the household; only members can read it.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

alter table public.households add column if not exists contacts jsonb not null default '[]'::jsonb;
