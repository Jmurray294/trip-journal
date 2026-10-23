-- Trip Journal: Someday — places and things saved for a trip one day (a shared article or link, a
-- screenshot, a friend's tip, "we should go here"). Saved by the inbound-email function from the trips
-- address or the app's Save idea; grouped by place on the Trips page. "Start planning" turns a place's
-- ideas into a Possible trip (trip_id, status 'planned').
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

create table if not exists public.someday (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households on delete cascade,
  place text not null default '',   -- what the board groups by: a country, US state or region, e.g. 'Italy'
  spot text not null default '',    -- the particular place in it, e.g. 'Amalfi Coast', or empty
  title text not null default '',
  note text not null default '',
  url text,
  image_url text,                   -- a link's preview image
  image_path text,                  -- a screenshot or photo saved in the media bucket
  source text not null default 'email',  -- email | app
  sender text,
  status text not null default 'open',   -- open | planned | removed
  trip_id text,
  created_at timestamptz not null default now()
);
create index if not exists someday_hh_idx on public.someday (household_id, status, created_at desc);

alter table public.someday enable row level security;
drop policy if exists "members read someday" on public.someday;
create policy "members read someday" on public.someday for select using (public.is_member(household_id));
drop policy if exists "members change someday" on public.someday;
create policy "members change someday" on public.someday for update using (public.is_member(household_id)) with check (public.is_member(household_id));

do $$ begin
  alter publication supabase_realtime add table public.someday;
exception when duplicate_object then null; end $$;
