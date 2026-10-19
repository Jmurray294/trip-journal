-- Trip Journal: share by email address.
-- The owner adds someone's email; when a person signs in with that email they get access
-- automatically (accept_invites). Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

create table if not exists public.household_invites (
  household_id uuid not null references public.households on delete cascade,
  email text not null,
  invited_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (household_id, email)
);

alter table public.household_invites enable row level security;
drop policy if exists "members see invites" on public.household_invites;
create policy "members see invites" on public.household_invites for select using (public.is_member(household_id));
drop policy if exists "members invite" on public.household_invites;
create policy "members invite" on public.household_invites for insert with check (public.is_member(household_id) and email = lower(trim(email)));
drop policy if exists "members cancel invites" on public.household_invites;
create policy "members cancel invites" on public.household_invites for delete using (public.is_member(household_id));

-- join every journal shared with the signed-in email; returns how many
create or replace function public.accept_invites(p_display_name text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return 0; end if;
  insert into household_members (household_id, user_id, display_name)
    select i.household_id, auth.uid(), coalesce(nullif(trim(p_display_name), ''), auth.jwt() ->> 'email')
    from household_invites i where i.email = lower(auth.jwt() ->> 'email')
    on conflict (household_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from household_invites where email = lower(auth.jwt() ->> 'email');
  return n;
end $$;

-- the journal's owner (whoever started it) can take someone's access away
create or replace function public.remove_member(p_household uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from households where id = p_household and created_by = auth.uid()) then
    raise exception 'Only the person who started this journal can remove people';
  end if;
  if p_user = auth.uid() then raise exception 'You cannot remove yourself'; end if;
  delete from household_members where household_id = p_household and user_id = p_user;
end $$;

revoke all on function public.accept_invites(text) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.accept_invites(text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
