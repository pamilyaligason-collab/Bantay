-- Family Bantay S26 (lane W4P, D-163): pagasa_warnings, the latest PAGASA warnings read by the pagasa-warnings edge function (tropical cyclone bulletin, weather advisory, home page Active Warnings).
-- Needs nothing earlier (job_runs from 0033 is only written by the function's heartbeat). Written only; applied ONLY when the owner says "apply 0059". The app never requires it (a missing table = no warnings card, the link to PAGASA stays).
-- Safe to run twice. Undo: 0059_pagasa_warnings.down.sql.
--
-- * PAGASA stays the authority: the app shows these rows as a pointer and links to source_url. Public text only: no person's data, no location.
-- * One row per dedupe_key (kind | title | issued_at): a rerun upserts the same row and refreshes fetched_at. The app treats a row as current only while fetched_at is recent (the cron runs every 30 minutes),
--   so a cyclone that left the page, or a source that broke, stops showing. The function deletes rows with fetched_at older than 14 days after each run (ML-06); the CHECKs cap field sizes.
-- * signals: [{"level": 1..5, "areas": "text"}] for tropical cyclone rows (empty array = the bulletin says no wind signal); [] for the other kinds.
-- * Readers: any signed-in user. Writer: the function with the service role. The client gets select only.
-- * The cron schedule is applied by the owner after the deploy, not here (docs/s26/pagasa-deploy.md).

create table if not exists public.pagasa_warnings (
  dedupe_key text primary key check (length(dedupe_key) between 1 and 400),
  kind text not null check (kind in ('tropical_cyclone', 'rainfall', 'advisory')),
  title text not null check (length(title) between 1 and 200),
  issued_at timestamptz,
  areas text not null default '' check (length(areas) <= 2000),
  signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array' and jsonb_array_length(signals) <= 5),
  source_url text not null check (length(source_url) <= 300 and source_url ~ '^https://www\.pagasa\.dost\.gov\.ph/'),
  fetched_at timestamptz not null default now()
);
create index if not exists pagasa_warnings_fetched on public.pagasa_warnings (fetched_at desc);

alter table public.pagasa_warnings enable row level security;
revoke all on public.pagasa_warnings from anon, authenticated;
grant select on public.pagasa_warnings to authenticated;
grant select, insert, update, delete on public.pagasa_warnings to service_role;
drop policy if exists pagasa_warnings_read on public.pagasa_warnings;
create policy pagasa_warnings_read on public.pagasa_warnings for select to authenticated using (true);
