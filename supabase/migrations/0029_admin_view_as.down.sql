-- Undo 0029_admin_view_as.sql. Safe to run twice. The 'view' audit rows are removed so the old action check can be put back.
begin;
drop function if exists public.admin_log_view_as(uuid);
delete from public.audit_log where action = 'view';
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'confirm', 'reject', 'delete', 'reveal'));
commit;
