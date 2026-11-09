-- Undo 0057_da_prices.sql. Safe to run twice. Drops the price table (public DA prices only; the next da-prices run would refill the latest day).
drop policy if exists da_prices_read on public.da_prices;
drop index if exists public.da_prices_date;
drop table if exists public.da_prices;
