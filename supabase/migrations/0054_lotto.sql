-- Family Bantay S24 (lane C): lotto_results, the PCSO draw numbers behind the "Lotto results" card on Today (D-152 board S24Today).
-- Needs nothing earlier. Written only; applied ONLY when the owner says "apply 0054". The app never requires it (a missing table hides the card). Safe to run twice. Undo: 0054_lotto.down.sql.
--
-- * One row per game and draw date: a rerun of the lotto-pcso function upserts the same row. Public numbers only: no person's data, no location.
-- * Readers: any signed-in user. Writer: the lotto-pcso edge function with the service role. The 30-day trim runs in that function (ML-06); the CHECKs cap field sizes.
-- * No client insert/update/delete policy exists, and the grants below give the client select only.
-- * The cron schedule is applied by the owner after the deploy, not here.

create table if not exists public.lotto_results (
  game text not null check (length(game) between 1 and 60),
  draw_date date not null,
  combination text not null check (length(combination) between 1 and 40 and combination ~ '^[0-9]{1,2}(-[0-9]{1,2}){1,5}$'),
  jackpot_php numeric check (jackpot_php is null or jackpot_php >= 0),
  winners integer check (winners is null or winners >= 0),
  fetched_at timestamptz not null default now(),
  primary key (game, draw_date)
);
create index if not exists lotto_results_draw on public.lotto_results (draw_date desc);

alter table public.lotto_results enable row level security;
revoke all on public.lotto_results from anon, authenticated;
grant select on public.lotto_results to authenticated;
grant select, insert, update, delete on public.lotto_results to service_role;
drop policy if exists lotto_results_read on public.lotto_results;
create policy lotto_results_read on public.lotto_results for select to authenticated using (true);
