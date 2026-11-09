-- Undo 0056_usage_allowlist.sql. Safe to run twice. Rows already dropped are not recoverable (they were never stored).
drop trigger if exists usage_events_allowlist on public.usage_events;
drop function if exists public.usage_events_filter();
drop function if exists public.usage_event_allowed(text, text);
