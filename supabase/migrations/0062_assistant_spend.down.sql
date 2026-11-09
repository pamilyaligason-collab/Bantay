-- Undo 0062_assistant_spend.sql. Safe to run twice. Drops the monthly spend counter (the router then runs on the fast model only until it is back).
drop function if exists public.assistant_spend_add(numeric);
drop function if exists public.assistant_spend_get();
drop table if exists public.assistant_spend;
