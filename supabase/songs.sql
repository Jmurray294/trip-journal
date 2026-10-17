-- Trip Journal: AI songs — per-person daily cap for the write-song function.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

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
