-- Trip Journal: the family's home base ({ home, lon, lat }), shared so every device shows it on the
-- map and measures distances from it. Members can already update their household.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

alter table public.households add column if not exists home jsonb;
