-- Family Bantay S29 (lane C): pagasa_drought, PAGASA's drought outlook per province, read daily by the pagasa-drought edge function from the public Droughtcaster JSON.
-- Needs nothing earlier (job_runs from 0033 is only written by the function's heartbeat). Written only; applied ONLY when the owner says "apply 0063". The app never requires it (a missing table = the card says "Climate outlook not available yet", the link to PAGASA stays).
-- Safe to run twice. Undo: 0063_pagasa_drought.down.sql.
--
-- * PAGASA stays the authority: the app shows one sentence and month chips and links to PAGASA. Public text only: no person's data, no location (the app asks for its province by name).
-- * One row per province (at most 83, fixed by the function's province list), so the table never grows (ML-06); a rerun upserts the same row and refreshes fetched_at.
-- * months: [{"month": "YYYY-MM", "level": "not_affected|dry_condition|dry_spell|drought", "kind": "assessment|outlook"}], 1-12 entries. The CHECK counts the entries that are well formed and needs all of them to be.
-- * Readers: any signed-in user. Writer: the function with the service role. The client gets select only.
-- * The cron schedule is applied by the owner after the deploy, not here.

create table if not exists public.pagasa_drought (
  province text primary key check (length(province) between 1 and 80),
  -- NOT NULL on purpose (the contract allows null): the parser always sets it.
  issued_at date not null,
  months jsonb not null check (
    jsonb_typeof(months) = 'array'
    and jsonb_array_length(months) between 1 and 12
    and jsonb_array_length(jsonb_path_query_array(months, '$[*] ? (@.month like_regex "^[0-9]{4}-(0[1-9]|1[0-2])$" && (@.level == "not_affected" || @.level == "dry_condition" || @.level == "dry_spell" || @.level == "drought") && (@.kind == "assessment" || @.kind == "outlook"))')) = jsonb_array_length(months)
  ),
  fetched_at timestamptz not null default now()
);

alter table public.pagasa_drought enable row level security;
revoke all on public.pagasa_drought from anon, authenticated;
grant select on public.pagasa_drought to authenticated;
grant select, insert, update, delete on public.pagasa_drought to service_role;
drop policy if exists pagasa_drought_read on public.pagasa_drought;
create policy pagasa_drought_read on public.pagasa_drought for select to authenticated using (true);
