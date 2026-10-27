-- Undo 0041_rollcall.sql: storm check-ins are short-lived (30 days), so dropping the table loses nothing worth keeping.
begin;
drop trigger if exists rollcall_alert on public.rollcall;
drop trigger if exists rollcall_stamp on public.rollcall;
drop function if exists public.rollcall_alert();
drop function if exists public.rollcall_stamp();
drop table if exists public.rollcall;
-- sos_events_prune back to its 0031 body
create or replace function public.sos_events_prune() returns void
  language sql security definer set search_path = '' as
  $$ delete from public.sos_events where created_at < now() - interval '90 days' $$;
revoke execute on function public.sos_events_prune() from public, anon, authenticated, service_role;
commit;
