-- Undo 0018_dose_watch.sql. Drops the sent-alert log (nothing else depends on it). Safe to run twice.
drop function if exists public.dose_watch_prune();
drop function if exists public.dose_watch_claim(uuid, date, text);
drop table if exists public.dose_watch_sent;
