-- 0043 (session 15): server security fixes SEC-1..SEC-5. Not applied by the build lane; Lloyd applies it (with the pin-login redeploy).
-- Undo: 0043_s15_security.down.sql.

-- ---------- SEC-1: only an admin may approve a PIN reset ----------
-- 0034 body, plus the is_admin() check. Any family member used to get the pin_approve alert and could approve (and so take over) another member's account.
-- pin-login notifyApprovers now sends the alert to admins only; this check is the server-side guard. All other checks are unchanged.
create or replace function public.approve_pin_reset(p_id uuid, p_code text) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare r public.pin_reset_requests%rowtype; me uuid := auth.uid();
begin
  if me is null or p_id is null then return false; end if;
  if not public.is_admin() then return false; end if;   -- SEC-1: before the lock, so a non-admin costs the request nothing
  select * into r from public.pin_reset_requests where id = p_id for update;
  if not found or r.used_at is not null or r.approved_at is not null or r.expires_at <= now() or r.method <> 'family' or r.user_id = me then return false; end if;
  -- the caller must be an active family member holding this request's pin_approve alert; anyone else is refused and costs the request nothing
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

-- ---------- SEC-2: a creator loses read access once the person has their own login ----------
-- 0022 policy, with `auth_user_id is null` on the creator clause. The owner (first clause), a carer and an admin (people_admin_read) are unchanged.
drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated
  using (auth_user_id = auth.uid() or (((created_by = auth.uid() and auth_user_id is null) or public.is_carer_of(id)) and archived_at is null));

-- ---------- SEC-3: no TRUNCATE / REFERENCES / TRIGGER for the API roles (TRUNCATE skips RLS) ----------
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- ---------- SEC-4: fixed search_path (the body names nothing, so '' is safe). Grants are untouched (alter does not change them). ----------
alter function public.records_auto_threshold() set search_path = '';

-- ---------- SEC-5: assistant_take with search_path '' (0005 body, names qualified) ----------
create or replace function public.assistant_take(p_limit int)
returns table (allowed boolean, used int)
language plpgsql security definer set search_path = '' as $$
declare d date := (now() at time zone 'Asia/Manila')::date; n int;
begin
  if auth.uid() is null then return query select false, 0; return; end if;
  insert into public.assistant_usage (user_id, day, count) values (auth.uid(), d, 0) on conflict do nothing;
  update public.assistant_usage set count = count + 1 where user_id = auth.uid() and day = d and count < p_limit returning count into n;
  if n is null then return query select false, p_limit; else return query select true, n; end if;
end $$;
revoke all on function public.assistant_take(int) from public, anon, service_role;
grant execute on function public.assistant_take(int) to authenticated;
