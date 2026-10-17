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
