-- Undo 0058_lotto_jackpot.sql. Safe to run twice. Drops the next-jackpot table (public numbers only; the next lotto-pcso run refills it). The null-ed placeholder jackpots on lotto_results are not restored (they were not real amounts).
drop policy if exists lotto_next_jackpot_read on public.lotto_next_jackpot;
drop table if exists public.lotto_next_jackpot;
