-- Trip Journal: family sharing + cloud backup.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

create extension if not exists pgcrypto;

-- ---------- families ----------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our family',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  display_name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- ---------- journal data ----------
-- Each trip and each memory is one row holding the app's JSON for it, so two people adding
-- memories to the same trip at once never overwrite each other (last write wins per row).
create table if not exists public.trips (
  household_id uuid not null references public.households on delete cascade,
  id text not null,
  doc jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (household_id, id)
);

create table if not exists public.entries (
  household_id uuid not null references public.households on delete cascade,
  id text not null,
  trip_id text not null,
  doc jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (household_id, id)
);

create index if not exists trips_sync_idx on public.trips (household_id, updated_at);
create index if not exists entries_sync_idx on public.entries (household_id, updated_at);

-- the server's clock decides ordering, not each phone's
create or replace function public.touch_row() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists trips_touch on public.trips;
create trigger trips_touch before insert or update on public.trips for each row execute function public.touch_row();
drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before insert or update on public.entries for each row execute function public.touch_row();

-- ---------- access: members only ----------
create or replace function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid());
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.trips enable row level security;
alter table public.entries enable row level security;

drop policy if exists "members read household" on public.households;
create policy "members read household" on public.households for select using (public.is_member(id));
drop policy if exists "members rename household" on public.households;
create policy "members rename household" on public.households for update using (public.is_member(id));

drop policy if exists "members see each other" on public.household_members;
create policy "members see each other" on public.household_members for select using (public.is_member(household_id));
drop policy if exists "members leave" on public.household_members;
create policy "members leave" on public.household_members for delete using (user_id = auth.uid());
drop policy if exists "members edit own name" on public.household_members;
create policy "members edit own name" on public.household_members for update using (user_id = auth.uid());

drop policy if exists "members use trips" on public.trips;
create policy "members use trips" on public.trips for all using (public.is_member(household_id)) with check (public.is_member(household_id));
drop policy if exists "members use entries" on public.entries;
create policy "members use entries" on public.entries for all using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ---------- start / join a family ----------
create or replace function public.create_household(p_name text, p_display_name text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into households (name, created_by) values (coalesce(nullif(trim(p_name), ''), 'Our family'), auth.uid()) returning * into h;
  insert into household_members (household_id, user_id, display_name) values (h.id, auth.uid(), coalesce(trim(p_display_name), ''));
  return h;
end $$;

create or replace function public.join_household(p_code text, p_display_name text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into h from households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'That invite code was not found'; end if;
  insert into household_members (household_id, user_id, display_name)
    values (h.id, auth.uid(), coalesce(trim(p_display_name), ''))
    on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return h;
end $$;

revoke all on function public.create_household(text, text) from public, anon;
revoke all on function public.join_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;

-- ---------- live updates ----------
do $$ begin
  alter publication supabase_realtime add table public.trips;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.entries;
exception when duplicate_object then null; end $$;

-- ---------- photos and song audio ----------
-- Private bucket; files live under <household id>/..., readable only by that family.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "family media read" on storage.objects;
create policy "family media read" on storage.objects for select
  using (bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "family media write" on storage.objects;
create policy "family media write" on storage.objects for insert
  with check (bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "family media delete" on storage.objects;
create policy "family media delete" on storage.objects for delete
  using (bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid));

create table if not exists public.song_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists song_requests_user_idx on public.song_requests (user_id, created_at);

alter table public.song_requests enable row level security;
drop policy if exists "own song requests read" on public.song_requests;
create policy "own song requests read" on public.song_requests for select using (user_id = auth.uid());
drop policy if exists "own song requests add" on public.song_requests;
create policy "own song requests add" on public.song_requests for insert with check (user_id = auth.uid());
