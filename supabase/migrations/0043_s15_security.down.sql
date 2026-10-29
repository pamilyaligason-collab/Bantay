-- Undo 0043_s15_security.sql. Safe to run twice. Puts back the 0034 / 0022 / 0005 definitions.
create or replace function public.approve_pin_reset(p_id uuid, p_code text) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare r public.pin_reset_requests%rowtype; me uuid := auth.uid();
begin
  if me is null or p_id is null then return false; end if;
  select * into r from public.pin_reset_requests where id = p_id for update;
  if not found or r.used_at is not null or r.approved_at is not null or r.expires_at <= now() or r.method <> 'family' or r.user_id = me then return false; end if;
  if not exists (select 1 from public.app_roles a where a.user_id = me and not a.disabled) then return false; end if;
  if not exists (select 1 from public.carer_alerts c where c.carer_user_id = me and c.kind = 'pin_approve' and c.ref = p_id::text) then return false; end if;
  if p_code is null or p_code !~ '^[0-9]{4}$' or p_code <> r.code then
    update public.pin_reset_requests set attempts = attempts + 1, used_at = case when attempts + 1 >= 5 then now() else used_at end where id = p_id;
    return false;
  end if;
  update public.pin_reset_requests set approved_by = me, approved_at = now() where id = p_id;
  return true;
end $$;
revoke execute on function public.approve_pin_reset(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.approve_pin_reset(uuid, text) to authenticated;

drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated
  using (auth_user_id = auth.uid() or ((created_by = auth.uid() or public.is_carer_of(id)) and archived_at is null));

-- SEC-3 is not undone on purpose: before 0043 many tables had revoke all for authenticated, so a blanket re-grant would widen access
-- (TRUNCATE skips RLS). The revoke is safe to keep after a rollback; re-grant per table from a privilege snapshot if ever needed.

alter function public.records_auto_threshold() reset search_path;

create or replace function public.assistant_take(p_limit int)
returns table (allowed boolean, used int)
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Manila')::date; n int;
begin
  if auth.uid() is null then return query select false, 0; return; end if;
  insert into assistant_usage (user_id, day, count) values (auth.uid(), d, 0) on conflict do nothing;
  update assistant_usage set count = count + 1 where user_id = auth.uid() and day = d and count < p_limit returning count into n;
  if n is null then return query select false, p_limit; else return query select true, n; end if;
end $$;
revoke all on function public.assistant_take(int) from public, anon;
grant execute on function public.assistant_take(int) to authenticated;
