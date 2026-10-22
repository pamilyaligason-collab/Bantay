-- Family Bantay: admin "View as member" audit event. Needs 0021 (audit_log, is_admin). Written only; Lloyd applies it. Safe to run twice. Undo: 0029_admin_view_as.down.sql.
-- The preview itself is client-side and read-only (it reads rows the admin can already read). This only records THAT an admin opened it, and for whom:
-- the row has the admin as actor, the viewed person's id, action 'view', and no fields. No health value, name or text is ever written.
begin;

alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'confirm', 'reject', 'delete', 'reveal', 'view'));

create or replace function public.admin_log_view_as(p_person uuid) returns void
  language plpgsql security definer set search_path = '' as
  $$ begin
       if not public.is_admin() then raise exception 'not_admin'; end if;
       if p_person is null or not exists (select 1 from public.people where id = p_person) then raise exception 'not_found'; end if;
       insert into public.audit_log (actor, tbl, row_id, person_id, action, fields) values (auth.uid(), 'people', p_person, p_person, 'view', null);
     end $$;
revoke execute on function public.admin_log_view_as(uuid) from public, anon;
grant execute on function public.admin_log_view_as(uuid) to authenticated;

commit;
