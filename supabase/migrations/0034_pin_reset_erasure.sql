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
       if new.erased_at is distinct from old.erased_at then
         return new;                                                    -- erase_user_data (service role) blanks the consent columns together with erased_at
       elsif auth.uid() is not null and (new.consent_at is distinct from old.consent_at or new.consent_version is distinct from old.consent_version) then
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

-- ---------- export / erasure (scoped to the caller's own person and user id) ----------
-- ONE discovery for both export and erasure: every base table in public with a person_id column (matched against the caller's own people row) and every
-- table with a column that holds the caller's user id (user_id, uploaded_by, sender_id, carer_id, carer_user_id). Kept on purpose: audit_log, app_roles
-- (the login is disabled, not deleted), erasure_requests (the marker). A new table with one of these columns is picked up by both automatically; the
-- rehearsal pins the expected list by hand. Never callable by clients.
create or replace function public.erasure_targets() returns table (tbl text, col text, kind text)
  language sql stable security definer set search_path = '' as
  $$ select c.table_name::text, c.column_name::text, case when c.column_name = 'person_id' then 'person' else 'user' end
       from information_schema.columns c
       join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name in ('person_id', 'user_id', 'uploaded_by', 'sender_id', 'carer_id', 'carer_user_id')
        and c.table_name not in ('audit_log', 'app_roles', 'erasure_requests')
      order by 1, 2 $$;
revoke execute on function public.erasure_targets() from public, anon, authenticated;
grant execute on function public.erasure_targets() to service_role;

-- The export returns every table the erase reaches, except secrets that are not the member's data (reset codes, lock rows); push keys are stripped.
create or replace function public.export_my_data() returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); pid uuid; out jsonb := '{}'::jsonb; r record; rows jsonb;
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if public.pin_try(md5('export:' || me::text)::uuid, 5, interval '1 hour') > 5 then raise exception 'too many exports' using errcode = '53400'; end if;
  select id into pid from public.people where auth_user_id = me;
  if pid is null then return out; end if;
  out := jsonb_build_object('person', (select to_jsonb(p) from public.people p where p.id = pid));
  for r in select t.tbl, string_agg(format('x.%I = %L::uuid', t.col, case when t.kind = 'person' then pid else me end), ' or ' order by t.col) as cond
             from public.erasure_targets() t where t.tbl not in ('pin_reset_requests', 'pin_attempts') group by t.tbl order by t.tbl loop
    execute format('select coalesce(jsonb_agg(case when %L = ''push_subscriptions'' then to_jsonb(x) - ''p256dh'' - ''auth'' else to_jsonb(x) end), ''[]''::jsonb) from public.%I x where %s', r.tbl, r.tbl, r.cond) into rows;
    out := out || jsonb_build_object(r.tbl, rows);
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
-- Due = past the undo window and not erased yet, OR erased but the auth step is unfinished (the email is not yet the synthetic erased-<id>@ value, so
-- the erase function retries the ban, session revoke and email scrub; erased = true skips the data steps). Keep the domain equal to SYNTHETIC_DOMAIN (_shared/pin.ts).
drop function if exists public.erasure_due();
create function public.erasure_due() returns table (user_id uuid, person_id uuid, erased boolean)
  language sql stable security definer set search_path = '' as
  $$ select e.user_id, p.id, e.done_at is not null
       from public.erasure_requests e join public.people p on p.auth_user_id = e.user_id join auth.users u on u.id = e.user_id
      where (e.done_at is null and e.cancel_until <= now())
         or (e.done_at is not null and u.email is distinct from ('erased-' || e.user_id::text || '@members.bantay.invalid'))
      order by e.cancel_until limit 5 $$;
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

-- Deletes the user's rows in one transaction; audit_log is kept. Tables come from erasure_targets() (a few passes settle foreign keys): rows with the person's
-- person_id and rows keyed by the user are deleted, uploaded_by is set null (family photos stay with the family). The people row stays, every personal column
-- blanked. The login is disabled (app_roles.disabled), and is_self() refuses a disabled user, so an erased member cannot write health data even with a live token.
-- The auth side (session revoke, ban, email scrub) is done right after by the erase function with the Auth admin API, then erasure_scrub_identities().
create or replace function public.erase_user_data(p_user uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare pid uuid; pass int; pending text[]; r public.erasure_requests%rowtype; tg record;
begin
  select * into r from public.erasure_requests where user_id = p_user for update;
  if not found or r.done_at is not null or r.cancel_until > now() then raise exception 'erasure not due' using errcode = '42501'; end if;
  select id into pid from public.people where auth_user_id = p_user;
  for pass in 1..4 loop
    pending := '{}';
    for tg in select * from public.erasure_targets() loop
      begin
        if tg.kind = 'person' then
          if pid is not null then execute format('delete from public.%I where %I = $1', tg.tbl, tg.col) using pid; end if;
        elsif tg.col = 'uploaded_by' then
          execute format('update public.%I set %I = null where %I = $1', tg.tbl, tg.col, tg.col) using p_user;
        else
          execute format('delete from public.%I where %I = $1', tg.tbl, tg.col) using p_user;
        end if;
      exception when foreign_key_violation then pending := pending || (tg.tbl || '.' || tg.col);
      end;
    end loop;
    exit when cardinality(pending) = 0;
  end loop;
  if cardinality(pending) > 0 then raise exception 'erasure blocked by foreign keys' using errcode = '23503'; end if;
  delete from public.invites where email = (select lower(u.email) from auth.users u where u.id = p_user);
  update public.app_roles set disabled = true where user_id = p_user;
  if pid is not null then
    update public.people set display_name = 'Former member', photo_path = null, phone = null, birthdate = null, blood_type = null, sex = null, address = null,
           allergies = '{}', conditions = '{}', medicines = '{}', aliases = '{}', consent_at = null, consent_version = null, consent_by = null, erased_at = now() where id = pid;
  end if;
  update public.erasure_requests set done_at = now() where user_id = p_user;
end $$;
revoke execute on function public.erase_user_data(uuid) from public, anon, authenticated;
grant execute on function public.erase_user_data(uuid) to service_role;

-- Drops the login identities (Google subject, name, avatar) of an erased user. The Auth admin API cannot, so this runs here; refused until the erasure is done.
create or replace function public.erasure_scrub_identities(p_user uuid) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.erasure_requests where user_id = p_user and done_at is not null) then raise exception 'erasure not done' using errcode = '42501'; end if;
  delete from auth.identities where user_id = p_user;
end $$;
revoke execute on function public.erasure_scrub_identities(uuid) from public, anon, authenticated;
grant execute on function public.erasure_scrub_identities(uuid) to service_role;

-- A disabled member (disable or erase) is no longer "self": every own-data write policy goes through is_self, so a token that outlives the ban writes nothing.
-- Same body as 0001 plus the disabled check; grants restated as 0001 had them (ML-21).
create or replace function public.is_self(pid uuid) returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.people where id = pid and auth_user_id = auth.uid())
        and not exists (select 1 from public.app_roles r where r.user_id = auth.uid() and r.disabled) $$;
revoke execute on function public.is_self(uuid) from public, anon;
grant execute on function public.is_self(uuid) to authenticated;
