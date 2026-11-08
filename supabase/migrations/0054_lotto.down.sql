-- Undo 0054_lotto.sql. Safe to run twice. Drops the lotto table (public draw numbers only; the next lotto-pcso run would refill it).
drop policy if exists lotto_results_read on public.lotto_results;
drop index if exists public.lotto_results_draw;
drop table if exists public.lotto_results;
