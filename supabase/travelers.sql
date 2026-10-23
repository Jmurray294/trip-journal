-- Trip Journal: Travelers — each person's travel documents, loyalty programs, preferences and
-- emergency details (doc jsonb, shaped in src/lib/travelers.js). Passport scans live in the private
-- media bucket under <household>/travelers/. Readable and editable only by the family's members.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

create table if not exists public.travelers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  name text not null default '',
  sort int not null default 0,
  doc jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists travelers_hh_idx on public.travelers (household_id, sort);

alter table public.travelers enable row level security;
drop policy if exists "members use travelers" on public.travelers;
create policy "members use travelers" on public.travelers for all
  using (public.is_member(household_id)) with check (public.is_member(household_id));

do $$ begin
  alter publication supabase_realtime add table public.travelers;
exception when duplicate_object then null; end $$;

-- start the family's cards: Joe and Cathy (only if there are none yet)
insert into public.travelers (household_id, name, sort)
select h.id, n.name, n.sort
from public.households h, (values ('Joe', 1), ('Cathy', 2)) as n(name, sort)
where h.inbox_token = 'trips'
  and not exists (select 1 from public.travelers t where t.household_id = h.id);
