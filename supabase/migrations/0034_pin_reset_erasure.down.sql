-- Undo 0034_pin_reset_erasure.sql. Safe to run twice. Run after the 0035 down. Reset requests, erasure requests and consent stamps are deleted.
-- The old audit_log check is put back NOT VALID so existing 'pin_reset' audit rows are kept (never deleted).
-- is_self back to the 0001 body (no disabled check)
create or replace function public.is_self(pid uuid) returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.people where id = pid and auth_user_id = auth.uid()) $$;
revoke execute on function public.is_self(uuid) from public, anon;
grant execute on function public.is_self(uuid) to authenticated;
drop function if exists public.erase_user_data(uuid);
drop function if exists public.erasure_paths(uuid);
drop function if exists public.erasure_due();
drop function if exists public.cancel_erasure();
drop function if exists public.request_erasure();
drop function if exists public.export_my_data();
drop function if exists public.erasure_targets();
drop function if exists public.erasure_scrub_identities(uuid);
drop function if exists public.approve_pin_reset(uuid, text);
grant execute on function public.request_pin_reset(text) to anon, authenticated;   -- as 0009 left it
drop trigger if exists people_consent_stamp on public.people;
drop function if exists public.people_consent_stamp();
alter table public.people drop column if exists consent_at, drop column if exists consent_version, drop column if exists consent_by, drop column if exists erased_at;
drop table if exists public.erasure_requests;
drop table if exists public.pin_reset_requests;
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'confirm', 'reject', 'delete', 'reveal', 'view')) not valid;
