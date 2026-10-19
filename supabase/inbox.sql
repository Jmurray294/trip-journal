-- Trip Journal: email forwarding — a private inbox code per family, and a log of imported emails.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

alter table public.households add column if not exists inbox_token text unique
  default lower(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
update public.households set inbox_token = lower(substr(encode(gen_random_bytes(8), 'hex'), 1, 12)) where inbox_token is null;

create table if not exists public.inbound_emails (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households on delete cascade,
  sender text, subject text, items int not null default 0,
  trip_title text, status text, reader text,
  created_at timestamptz not null default now()
);
create index if not exists inbound_emails_hh_idx on public.inbound_emails (household_id, created_at desc);

alter table public.inbound_emails enable row level security;
drop policy if exists "members read email log" on public.inbound_emails;
create policy "members read email log" on public.inbound_emails for select using (public.is_member(household_id));

-- the email text (for re-reading and, later, a trip's documents) and the trip it was filed in
alter table public.inbound_emails add column if not exists body text;
alter table public.inbound_emails add column if not exists trip_id text;

-- "To sort": emails the reader could not confidently place. Each holds the itinerary items and
-- costs ready to file; the app adds them to the trip someone picks, then marks the row filed.
create table if not exists public.inbox_items (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households on delete cascade,
  subject text, sender text, summary text,
  suggestion jsonb not null default '{}',
  entries jsonb not null default '[]',
  costs jsonb not null default '[]',
  status text not null default 'open',  -- open | filed | dismissed
  trip_id text,
  created_at timestamptz not null default now()
);
create index if not exists inbox_items_open_idx on public.inbox_items (household_id, status, created_at desc);

alter table public.inbox_items enable row level security;
drop policy if exists "members read inbox" on public.inbox_items;
create policy "members read inbox" on public.inbox_items for select using (public.is_member(household_id));
drop policy if exists "members sort inbox" on public.inbox_items;
create policy "members sort inbox" on public.inbox_items for update using (public.is_member(household_id)) with check (public.is_member(household_id));

do $$ begin
  alter publication supabase_realtime add table public.inbox_items;
exception when duplicate_object then null; end $$;
