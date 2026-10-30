-- Undo 0044_logged_by.sql. Safe to run twice.
drop trigger if exists readings_logged_by on public.readings;
drop trigger if exists activity_logged_by on public.activity;
drop function if exists public.stamp_logged_by();
alter table public.readings drop column if exists logged_by;
alter table public.activity drop column if exists logged_by;
