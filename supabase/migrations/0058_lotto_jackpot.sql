-- Family Bantay S26 (lane P2J, D-164 board S26Today): the jackpot of the NEXT lotto draw, next to the last result.
-- Needs 0054 (lotto_results already has jackpot_php, so the "last result jackpot" needs no new column). Written only; applied ONLY when the owner says "apply 0058". The app never requires it (a missing table = no "next jackpot" line). Safe to run twice. Undo: 0058_lotto_jackpot.down.sql.
--
-- * One row per game and draw date for a draw whose numbers are not out yet ("Stand by" on the source page); the lotto-pcso function upserts it each run and deletes rows older than today (Manila). Public numbers only.
-- * Same access as lotto_results: signed-in read, service role write, no client write grant.
-- * The CHECK mirrors the function: under P5,000,000 is a placeholder on the source page and is never stored.

create table if not exists public.lotto_next_jackpot (
  game text not null check (length(game) between 1 and 60),
  draw_date date not null,
  jackpot_php numeric not null check (jackpot_php >= 5000000),
  fetched_at timestamptz not null default now(),
  primary key (game, draw_date)
);

alter table public.lotto_next_jackpot enable row level security;
revoke all on public.lotto_next_jackpot from anon, authenticated;
grant select on public.lotto_next_jackpot to authenticated;
grant select, insert, update, delete on public.lotto_next_jackpot to service_role;
drop policy if exists lotto_next_jackpot_read on public.lotto_next_jackpot;
create policy lotto_next_jackpot_read on public.lotto_next_jackpot for select to authenticated using (true);

-- Placeholder amounts that an older function run stored on six-number results (P1.00 style) become "unknown".
update public.lotto_results set jackpot_php = null where jackpot_php is not null and jackpot_php < 5000000 and game ~ '^6/';
