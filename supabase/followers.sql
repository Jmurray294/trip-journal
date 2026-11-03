-- Trip Journal: followers — family and friends who follow along without being in the journal.
-- A member invites an email; when that person signs in (an emailed 6-digit code, no password) they
-- see the family portal: only the trips switched on for followers ("followers": true on the trip),
-- with their journal, photos, photo book and song. Never costs, budgets, card charges, confirmation
-- numbers, travel documents, the Someday board or the To-sort inbox. Followers can't change anything.
-- A trip with "followersLater": true shows each entry once it's a day old.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

create table if not exists public.follower_invites (
  household_id uuid not null references public.households on delete cascade,
  email text not null,
  invited_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (household_id, email)
);

create table if not exists public.household_followers (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  email text not null default '',
  display_name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.follower_invites enable row level security;
alter table public.household_followers enable row level security;

drop policy if exists "members see follower invites" on public.follower_invites;
create policy "members see follower invites" on public.follower_invites for select using (public.is_member(household_id));
drop policy if exists "members invite followers" on public.follower_invites;
create policy "members invite followers" on public.follower_invites for insert with check (public.is_member(household_id) and email = lower(trim(email)));
drop policy if exists "members cancel follower invites" on public.follower_invites;
create policy "members cancel follower invites" on public.follower_invites for delete using (public.is_member(household_id));

drop policy if exists "members and the follower see followers" on public.household_followers;
create policy "members and the follower see followers" on public.household_followers for select
  using (public.is_member(household_id) or user_id = auth.uid());
drop policy if exists "members remove followers, followers leave" on public.household_followers;
create policy "members remove followers, followers leave" on public.household_followers for delete
  using (public.is_member(household_id) or user_id = auth.uid());

-- follow every family that invited the signed-in email; returns how many
create or replace function public.accept_follow_invites(p_display_name text)
returns int language plpgsql security definer set search_path = public as $$
declare n int; me text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or me is null then return 0; end if;
  insert into household_followers (household_id, user_id, email, display_name)
    select i.household_id, auth.uid(), me, coalesce(nullif(trim(p_display_name), ''), me)
    from follower_invites i where i.email = me
    on conflict (household_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from follower_invites where email = me;
  return n;
end $$;

-- ---------- what a follower sees: picked field by field, so nothing private slips through ----------
create or replace function public.follower_num(v jsonb) returns numeric language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end;
$$;

create or replace function public.follower_entry(p_id text, d jsonb) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'date', d->'date', 'title', d->'title', 'place', d->'place', 'kind', d->'kind',
    'pos', d->'pos', 'by', d->'by', 'added', d->'added', 'lat', d->'lat', 'lon', d->'lon', 'source', d->'source',
    -- what the family wrote; a booking's note (confirmation numbers, who holds it) stays private
    'note', case when jsonb_typeof(d->'booking') = 'object' or coalesce(d->>'kind', '') <> '' then null else d->'note' end,
    'booking', case when jsonb_typeof(d->'booking') = 'object' then jsonb_build_object(
      'provider', d->'booking'->'provider', 'status', d->'booking'->'status',
      'start', d->'booking'->'start', 'end', d->'booking'->'end') end,
    -- every photo keeps its place in the list (the photo book refers to them by position)
    'photos', (select coalesce(jsonb_agg(jsonb_build_object(
        'path', p->'path', 'label', p->'label', 'by', p->'by', 'taken', p->'taken',
        'src', case when p->>'src' like 'data:%' then null else p->'src' end) order by i), '[]'::jsonb)
      from jsonb_array_elements(case when jsonb_typeof(d->'photos') = 'array' then d->'photos' else '[]'::jsonb end) with ordinality as x(p, i))
  ));
$$;

create or replace function public.follower_trip(p_household uuid, p_id text, p_doc jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'title', p_doc->'title', 'place', p_doc->'place', 'dates', p_doc->'dates', 'grad', p_doc->'grad',
    'coverSrc', case when p_doc->>'coverSrc' like 'data:%' then null else p_doc->'coverSrc' end,
    'companions', p_doc->'companions', 'possible', p_doc->'possible', 'planning', p_doc->'planning',
    'book', case when jsonb_typeof(p_doc->'book'->'draft') = 'object' then jsonb_build_object(
      'draft', p_doc->'book'->'draft', 'size', p_doc->'book'->'size', 'style', p_doc->'book'->'style') end,
    'song', case when jsonb_typeof(p_doc->'song') = 'object' then jsonb_build_object(
      'title', p_doc->'song'->'title', 'lines', p_doc->'song'->'lines', 'mood', p_doc->'song'->'mood',
      'audioPath', p_doc->'song'->'audioPath', 'audioDur', p_doc->'song'->'audioDur') end,
    'days', (select coalesce(jsonb_agg(public.follower_entry(e.id, e.doc) order by public.follower_num(e.doc->'pos') nulls last), '[]'::jsonb)
      from entries e
      where e.household_id = p_household and e.trip_id = p_id and not e.deleted
        and coalesce(e.doc->>'type', '') <> 'cost'
        and (coalesce(p_doc->>'followersLater', '') <> 'true'
          or coalesce(public.follower_num(e.doc->'added'), 0) < extract(epoch from now() - interval '24 hours') * 1000))
  ));
$$;

-- the portal: each family this person follows, with its shared trips
create or replace function public.follower_portal() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'name', h.name,
    'trips', (select coalesce(jsonb_agg(public.follower_trip(t.household_id, t.id, t.doc) order by t.updated_at desc), '[]'::jsonb)
      from trips t where t.household_id = h.id and not t.deleted and t.doc->>'followers' = 'true')
  ) order by f.joined_at), '[]'::jsonb)
  from household_followers f join households h on h.id = f.household_id
  where f.user_id = auth.uid();
$$;

-- a follower may open a photo or song file only when a trip they can see uses it
create or replace function public.follower_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_followers f
    join trips t on t.household_id = f.household_id and not t.deleted and t.doc->>'followers' = 'true'
    where f.user_id = auth.uid() and p_name like f.household_id::text || '/%'
      and (t.doc->'song'->>'audioPath' = p_name
        or exists (select 1 from entries e
          where e.household_id = t.household_id and e.trip_id = t.id and not e.deleted
            and coalesce(e.doc->>'type', '') <> 'cost'
            and e.doc->'photos' @> jsonb_build_array(jsonb_build_object('path', p_name))
            and (coalesce(t.doc->>'followersLater', '') <> 'true'
              or coalesce(public.follower_num(e.doc->'added'), 0) < extract(epoch from now() - interval '24 hours') * 1000)))
  );
$$;

drop policy if exists "follower media read" on storage.objects;
create policy "follower media read" on storage.objects for select
  using (bucket_id = 'media' and public.follower_can_read(name));

revoke all on function public.accept_follow_invites(text) from public, anon;
revoke all on function public.follower_trip(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.follower_portal() from public, anon;
revoke all on function public.follower_can_read(text) from public, anon;
grant execute on function public.accept_follow_invites(text) to authenticated;
grant execute on function public.follower_portal() to authenticated;
grant execute on function public.follower_can_read(text) to authenticated;
