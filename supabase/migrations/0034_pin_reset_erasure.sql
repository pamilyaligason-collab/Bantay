-- Family Bantay: PIN reset by family approval, consent columns, erasure, data export (session 10 phase 2, lane S6b, D-76/D-78).
-- Needs 0001 (people), 0002 (app_roles, pin_try), 0003, 0008, 0009 (request_pin_reset), 0021 (audit_log), 0029, 0030 (carer_alerts).
-- Written only; Lloyd applies it. Safe to run twice. Undo: 0034_pin_reset_erasure.down.sql.
-- Rules
-- * A reset request is made by the pin-login function (service role) for a signed-out member. The 4-digit code is shown on the requester's screen;
--   an approver (active family member holding the request's pin_approve alert) types it into approve_pin_reset. 5 wrong codes burn the request.
-- * Erasure: request_erasure() starts a 7-day undo window; the erase function (cron) runs erase_user_data() after cancel_until. audit_log is kept.

-- audit_log: allow the 'pin_reset' action (keeps 'view' from 0029)
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'confirm', 'reject', 'delete', 'reveal', 'view', 'pin_reset'));

create table if not exists public.pin_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  method text not null check (method in ('google', 'family')),
  code char(4) not null check (code ~ '^[0-9]{4}$'),
  attempts int not null default 0,                                  -- wrong-code tries (ML-08)
  secret_hash text not null,
  approved_by uuid,
  approved_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);
create index if not exists pin_reset_requests_user on public.pin_reset_requests (user_id, created_at desc);
create index if not exists pin_reset_requests_created on public.pin_reset_requests (created_at);
alter table public.pin_reset_requests enable row level security;
revoke all on public.pin_reset_requests from anon, authenticated;
grant select, insert, update, delete on public.pin_reset_requests to service_role;

create table if not exists public.erasure_requests (
  user_id uuid primary key,
  requested_at timestamptz not null default now(),
  cancel_until timestamptz not null default now() + interval '7 days',
  done_at timestamptz
);
alter table public.erasure_requests enable row level security;
revoke all on public.erasure_requests from anon, authenticated;
grant select, insert, update, delete on public.erasure_requests to service_role;

alter table public.people
  add column if not exists consent_at timestamptz,
  add column if not exists consent_version text,
  add column if not exists consent_by uuid,
  add column if not exists erased_at timestamptz;

-- S6a writes consent through the people update policy (records_editor). Only the consent columns are newly writable; consent_by is always the caller.
grant update (consent_at, consent_version, consent_by) on public.people to authenticated;
create or replace function public.people_consent_stamp() returns trigger
  language plpgsql set search_path = '' as
  $$ begin
       if auth.uid() is not null and (new.consent_at is distinct from old.consent_at or new.consent_version is distinct from old.consent_version) then
         new.consent_by := auth.uid();
       elsif new.consent_by is distinct from old.consent_by then
         new.consent_by := old.consent_by;                              -- never settable on its own
       end if;
       return new;
     end $$;
revoke execute on function public.people_consent_stamp() from public, anon, authenticated;
drop trigger if exists people_consent_stamp on public.people;
create trigger people_consent_stamp before update on public.people for each row execute function public.people_consent_stamp();

-- ---------- approve_pin_reset ----------
create or replace function public.approve_pin_reset(p_id uuid, p_code text) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare r public.pin_reset_requests%rowtype; me uuid := auth.uid();
begin
  if me is null or p_id is null then return false; end if;
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

-- the admin flow is retired (D-76); admin_requests stays for history
revoke execute on function public.request_pin_reset(text) from public, anon, authenticated, service_role;

-- ---------- export / erasure (scoped to the caller's own person) ----------
create or replace function public.export_my_data() returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); pid uuid; out jsonb := '{}'::jsonb; t text; rows jsonb;
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if public.pin_try(md5('export:' || me::text)::uuid, 5, interval '1 hour') > 5 then raise exception 'too many exports' using errcode = '53400'; end if;
  select id into pid from public.people where auth_user_id = me;
  if pid is null then return out; end if;
  out := jsonb_build_object('person', (select to_jsonb(p) from public.people p where p.id = pid));
  foreach t in array array['readings', 'consults', 'meds_taken', 'activity', 'medications', 'documents', 'vaccinations', 'conditions', 'allergies', 'appointments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.person_id = $1', t) into rows using pid;
      out := out || jsonb_build_object(t, rows);
    end if;
  end loop;
  return out;
end $$;
revoke execute on function public.export_my_data() from public, anon, authenticated, service_role;
grant execute on function public.export_my_data() to authenticated;

create or replace function public.request_erasure() returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c timestamptz;
begin
  if me is null or not exists (select 1 from public.people where auth_user_id = me) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- one open request per user (pk); a finished one may be started again
  insert into public.erasure_requests (user_id) values (me)
    on conflict (user_id) do update set requested_at = now(), cancel_until = now() + interval '7 days', done_at = null
    where public.erasure_requests.done_at is not null;
  select cancel_until into c from public.erasure_requests where user_id = me;
  return c;
end $$;
revoke execute on function public.request_erasure() from public, anon, authenticated, service_role;
grant execute on function public.request_erasure() to authenticated;

create or replace function public.cancel_erasure() returns void
  language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.erasure_requests%rowtype;
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into r from public.erasure_requests where user_id = me for update;
  if not found or r.done_at is not null then return; end if;
  if now() >= r.cancel_until then raise exception 'too late to cancel' using errcode = '42501'; end if;
  delete from public.erasure_requests where user_id = me;
end $$;
revoke execute on function public.cancel_erasure() from public, anon, authenticated, service_role;
grant execute on function public.cancel_erasure() to authenticated;

-- ---------- erase function support (service role only) ----------
create or replace function public.erasure_due() returns table (user_id uuid, person_id uuid)
  language sql stable security definer set search_path = '' as
  $$ select e.user_id, p.id from public.erasure_requests e join public.people p on p.auth_user_id = e.user_id
      where e.done_at is null and e.cancel_until <= now() order by e.cancel_until limit 5 $$;
revoke execute on function public.erasure_due() from public, anon, authenticated;
grant execute on function public.erasure_due() to service_role;

-- storage objects of one user, removed by the function BEFORE erase_user_data (a failed removal aborts and retries next run)
create or replace function public.erasure_paths(p_user uuid) returns table (bucket text, path text)
  language sql stable security definer set search_path = '' as $$
  select 'records', s.storage_path from public.source_files s join public.people p on p.id = s.person_id where p.auth_user_id = p_user and s.storage_path is not null
  union all select 'avatars', p.photo_path from public.people p where p.auth_user_id = p_user and p.photo_path is not null
  union all select 'family-messages', m.attachment_path from public.family_messages m where m.sender_id = p_user and m.attachment_path is not null $$;
revoke execute on function public.erasure_paths(uuid) from public, anon, authenticated;
grant execute on function public.erasure_paths(uuid) to service_role;

-- Deletes the user's rows in one transaction; audit_log is kept. Tables are found by their person_id column (a few passes settle foreign keys).
create or replace function public.erase_user_data(p_user uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare pid uuid; t text; pass int; pending text[]; r public.erasure_requests%rowtype;
begin
  select * into r from public.erasure_requests where user_id = p_user for update;
  if not found or r.done_at is not null or r.cancel_until > now() then raise exception 'erasure not due' using errcode = '42501'; end if;
  select id into pid from public.people where auth_user_id = p_user;
  if pid is not null then
    for pass in 1..4 loop
      pending := '{}';
      for t in select c.table_name from information_schema.columns c join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
                where c.table_schema = 'public' and c.column_name = 'person_id' and c.table_name not in ('audit_log', 'carer_alerts', 'carers') loop
        begin
          execute format('delete from public.%I where person_id = $1', t) using pid;
        exception when foreign_key_violation then pending := pending || t;
        end;
      end loop;
      exit when cardinality(pending) = 0;
    end loop;
    if cardinality(pending) > 0 then raise exception 'erasure blocked by foreign keys' using errcode = '23503'; end if;
  end if;
  delete from public.carer_alerts where carer_user_id = p_user or (pid is not null and person_id = pid);
  delete from public.family_messages where sender_id = p_user;
  delete from public.push_subscriptions where user_id = p_user;
  if to_regclass('public.phone_health') is not null then delete from public.phone_health where user_id = p_user; end if;
  delete from public.sos_acks where user_id = p_user;
  if pid is not null then
    update public.people set display_name = 'Former member', photo_path = null, phone = null, birthdate = null, blood_type = null,
           allergies = '{}', conditions = '{}', medicines = '{}', erased_at = now() where id = pid;
  end if;
  update public.erasure_requests set done_at = now() where user_id = p_user;
end $$;
revoke execute on function public.erase_user_data(uuid) from public, anon, authenticated;
grant execute on function public.erase_user_data(uuid) to service_role;
