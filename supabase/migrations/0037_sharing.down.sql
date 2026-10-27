-- Undo 0037_sharing.sql: sharing returns to the 0001 / 0004 model (carers rows stay; pending offers are dropped, they never gave access).
-- The two CHECKs go back to their 0030 / 0034 lists as NOT VALID, so rows written meanwhile (rollcall, kudos, share audit rows) are kept and new rows follow the old lists.
begin;

drop function if exists public.admin_share_grid();
drop function if exists public.share_candidates();
drop function if exists public.my_viewers();
drop function if exists public.share_accept(uuid, boolean);
drop function if exists public.share_set(uuid, uuid, boolean, boolean);

drop table if exists public.share_offers;
delete from public.carer_alerts where kind = 'share';

alter table public.carer_alerts drop constraint if exists carer_alerts_kind_check;
alter table public.carer_alerts add constraint carer_alerts_kind_check
  check (kind in ('dose_missed', 'review_open', 'phone_health', 'reading_high', 'mood_unwell', 'hazard', 'sos', 'sos_cancel', 'digest', 'pin_approve', 'pin_changed', 'system')) not valid;
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'confirm', 'reject', 'delete', 'reveal', 'view', 'pin_reset')) not valid;

alter table public.carers drop column if exists added_by, drop column if exists added_at;

-- 0001 policies and the table grant
grant insert, update, delete on public.carers to authenticated;
drop policy if exists carers_insert on public.carers;
create policy carers_insert on public.carers for insert to authenticated
  with check (public.is_self(person_id) or public.is_writer_of(person_id));
drop policy if exists carers_update on public.carers;
create policy carers_update on public.carers for update to authenticated
  using (public.is_self(person_id) or (public.is_writer_of(person_id) and carer_id <> auth.uid()))
  with check (public.is_self(person_id) or (public.is_writer_of(person_id) and carer_id <> auth.uid()));
drop policy if exists carers_delete on public.carers;
create policy carers_delete on public.carers for delete to authenticated
  using (public.is_self(person_id) or public.is_writer_of(person_id));
-- 0004 admin policies
drop policy if exists carers_admin_insert on public.carers;
create policy carers_admin_insert on public.carers for insert to authenticated
  with check (public.is_admin() and carer_id <> auth.uid() and not can_write);
drop policy if exists carers_admin_update on public.carers;
create policy carers_admin_update on public.carers for update to authenticated
  using (public.is_admin() and carer_id <> auth.uid() and not public.is_person_creator(person_id, carer_id))
  with check (public.is_admin() and carer_id <> auth.uid() and not can_write);
drop policy if exists carers_admin_delete on public.carers;
create policy carers_admin_delete on public.carers for delete to authenticated
  using (public.is_admin() and carer_id <> auth.uid() and not public.is_person_creator(person_id, carer_id));

commit;
