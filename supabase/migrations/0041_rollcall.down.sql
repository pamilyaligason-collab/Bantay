-- Undo 0041_rollcall.sql: storm check-ins are short-lived (30 days), so dropping the table loses nothing worth keeping. The storm family_tasks rows stay (the family may want them).
begin;
drop function if exists public.rollcall_set(uuid, text, text);
drop function if exists public.ensure_storm_tasks(text);
drop function if exists public.storm_gate(text);
drop table if exists public.rollcall;
-- sos_events_prune back to its 0031 body
create or replace function public.sos_events_prune() returns void
  language sql security definer set search_path = '' as
  $$ delete from public.sos_events where created_at < now() - interval '90 days' $$;
revoke execute on function public.sos_events_prune() from public, anon, authenticated, service_role;
commit;
