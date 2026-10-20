-- Undo 0015_usage_client_at.sql. Safe to run twice.
drop index if exists public.usage_events_user_client_at;
alter table public.usage_events drop constraint if exists usage_events_client_at_sane;
alter table public.usage_events drop column if exists client_at;
