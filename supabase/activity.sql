-- Trip Journal: the bell and "added" dates.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

-- the bell updates live as emails and Shortcut photos come in
do $$ begin
  alter publication supabase_realtime add table public.inbound_emails;
exception when duplicate_object then null; end $$;

-- when each itinerary item and cost went into the journal (ms), for items from before it was
-- recorded: a memory made in the app was added at its pos time; anything else when it last changed
update public.entries
set doc = doc || jsonb_build_object('added',
  case when coalesce(doc->>'source', '') = '' and coalesce(doc->>'type', '') <> 'cost' and (doc->>'pos') ~ '^\d{13}$'
       then (doc->>'pos')::bigint
       else floor(extract(epoch from updated_at) * 1000)::bigint end)
where not (doc ? 'added');
