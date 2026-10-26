-- Rehearsal for 0035_reading_alerts.sql on a THROWAWAY Postgres (never the live project), with the real 0001, 0002, 0003 and a STUB of what 0030 (lane S1) provides.
-- The stub is only the contract shape (carer_alerts + notify_family as in docs/session-10/contracts.md); when 0030 merges, swap the stub block for `\ir ../migrations/0030_*.sql` and the same cases must pass.
-- Run (WSL Postgres 15+):
--   su postgres -c 'dropdb --if-exists bantay_ra; createdb bantay_ra; psql -X -q -v ON_ERROR_STOP=1 -d bantay_ra -f reading_alerts_rehearsal.sql'
-- Actors: B member (own person PB); C writer carer of PB; D read-only carer of PB.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb, raw_user_meta_data jsonb);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon, supabase_auth_admin, service_role;
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon, service_role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000d', 'd@example.com', '{"provider":"google"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Test B', '00000000-0000-0000-0000-00000000000b');
insert into public.carers values
 ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-0000000000b1', true),
 ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-0000000000b1', false);

-- ===== STUB of 0030 (contract shape only) =====
create table public.carer_alerts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people (id) on delete cascade,
  carer_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('dose_missed','review_open','phone_health','reading_high','mood_unwell','hazard','sos','sos_cancel','digest','pin_approve','pin_changed','system')),
  template text not null,
  ref text,
  created_at timestamptz not null default now(),
  pushed_at timestamptz, seen_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days'
);
create unique index carer_alerts_ref on public.carer_alerts (kind, ref, carer_user_id) where ref is not null;
create function public.notify_family(p_person uuid, p_kind text, p_template text, p_ref text, p_scope text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
  select p_person, c.carer_id, p_kind, p_template, p_ref from public.carers c where c.person_id = p_person and c.can_write and p_scope = 'carers'
  on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.notify_family(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify_family(uuid, text, text, text, text) to service_role;
-- ===== end stub =====

\ir ../migrations/0035_reading_alerts.sql
-- 0035 must be safe to run twice
\ir ../migrations/0035_reading_alerts.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
-- one reading row, taken `ago` before now, home/device unless a source file id is given; clears the alerts first so each case counts on its own
create function pg_temp.rd(t text, v numeric, u text, ago interval default interval '5 minutes', src text default null) returns void language sql as $$
  insert into public.readings (person_id, taken_at, test, value, unit, source_file_id) values ('10000000-0000-0000-0000-0000000000b1', now() - ago, t, v, u, src) $$;
create function pg_temp.alerts() returns bigint language sql as $$ select count(*) from public.carer_alerts $$;

-- ===== the lines =====
select pg_temp.rd('bp_systolic', 185, 'mmHg'); select pg_temp.rd('bp_diastolic', 90, 'mmHg');
select pg_temp.ok(pg_temp.alerts() = 1, '185/90 at home: one alert (one row for the one writer carer)');
select pg_temp.ok((select carer_user_id from public.carer_alerts) = '00000000-0000-0000-0000-00000000000c', 'the writer carer gets it, the read-only carer does not');
select pg_temp.ok((select kind = 'reading_high' and template = 'reading_high' and person_id = '10000000-0000-0000-0000-0000000000b1' from public.carer_alerts), 'kind and template are reading_high; the row names the person');
select pg_temp.ok(not exists (select 1 from public.carer_alerts where ref ~ '185|90|mmHg' or template ~ '[0-9]'), 'no value in the row (B-7)');
select pg_temp.rd('bp_systolic', 185, 'mmHg'); select pg_temp.rd('bp_diastolic', 90, 'mmHg');
select pg_temp.ok(pg_temp.alerts() = 1, 'two 185/90 rows inside 6 hours: still one alert');
delete from public.carer_alerts;

select pg_temp.rd('bp_systolic', 200, 'mmHg', interval '5 minutes', 'file-1'); select pg_temp.rd('bp_diastolic', 130, 'mmHg', interval '5 minutes', 'file-1');
select pg_temp.ok(pg_temp.alerts() = 0, 'a lab import row (source_file_id set) raises nothing');
select pg_temp.rd('bp_systolic', 200, 'mmHg', interval '3 hours'); select pg_temp.rd('bp_diastolic', 130, 'mmHg', interval '3 hours');
select pg_temp.ok(pg_temp.alerts() = 0, 'a reading 3 hours old (a late device sync) raises nothing');
select pg_temp.rd('bp_systolic', 200, 'mmHg', interval '119 minutes');
select pg_temp.ok(pg_temp.alerts() = 1, 'a reading 119 minutes old still counts');
delete from public.carer_alerts;

select pg_temp.rd('bp_systolic', 179, 'mmHg'); select pg_temp.rd('bp_diastolic', 119, 'mmHg');
select pg_temp.ok(pg_temp.alerts() = 0, '179/119 raises nothing (lines are 180 and 120)');
select pg_temp.rd('bp_systolic', 150, 'mmHg');
select pg_temp.ok(pg_temp.alerts() = 0, 'a high top alone under 180 raises nothing');
select pg_temp.rd('bp_diastolic', 120, 'mmHg');
select pg_temp.ok(pg_temp.alerts() = 1, 'bottom 120 alone is enough (each component on its own)');
delete from public.carer_alerts;

select pg_temp.rd('glucose', 3.0, 'mmol/L');
select pg_temp.ok(pg_temp.alerts() = 1, 'glucose 3.0 mmol/L is 54 mg/dL: one alert');
delete from public.carer_alerts;
select pg_temp.rd('glucose', 5.5, 'mmol/L'); select pg_temp.rd('fasting_glucose', 70, 'mg/dL'); select pg_temp.rd('glucose', 300, 'mg/dL'); select pg_temp.rd('fasting_glucose', 99, null);
select pg_temp.ok(pg_temp.alerts() = 0, '5.5 mmol/L, 70, 300 and 99 mg/dL raise nothing');
select pg_temp.rd('fasting_glucose', 69, 'mg/dL');
select pg_temp.ok(pg_temp.alerts() = 1, '69 mg/dL: one alert');
delete from public.carer_alerts;
select pg_temp.rd('glucose', 301, 'mg/dL');
select pg_temp.ok(pg_temp.alerts() = 1, '301 mg/dL: one alert');
delete from public.carer_alerts;
select pg_temp.rd('glucose', 17, 'mmol/L');
select pg_temp.ok(pg_temp.alerts() = 1, '17 mmol/L is 306 mg/dL: one alert');
delete from public.carer_alerts;

select pg_temp.rd('spo2', 90, '%'); select pg_temp.rd('heart_rate', 40, 'bpm'); select pg_temp.rd('weight', 5, 'kg');
select pg_temp.ok(pg_temp.alerts() = 0, 'oxygen 90, a slow pulse and a light weight raise nothing');
select pg_temp.rd('spo2', 89, '%');
select pg_temp.ok(pg_temp.alerts() = 1, 'oxygen 89: one alert');
select pg_temp.rd('bp_systolic', 190, 'mmHg');
select pg_temp.ok(pg_temp.alerts() = 2, 'a different kind of reading in the same 6 hours is its own alert');
delete from public.carer_alerts;

-- ===== the push call: only after a NEW row, and a failure of it never loses the row =====
create schema net;
create table public.http_calls (n serial, body jsonb, secret text);
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language plpgsql as $$
begin insert into public.http_calls (body, secret) values (body, headers ->> 'x-dose-watch-secret'); return 1; end $$;
create schema vault;
create view vault.decrypted_secrets as select 'dose_watch_cron_secret'::text as name, 'rehearsal-secret'::text as decrypted_secret;
select pg_temp.rd('spo2', 85, '%');
select pg_temp.ok((select count(*) from public.http_calls) = 1 and (select body ->> 'mode' from public.http_calls) = 'flush' and (select secret from public.http_calls) = 'rehearsal-secret', 'a new alert calls dose-watch once with {mode:flush} and the vault secret');
select pg_temp.rd('spo2', 84, '%');
select pg_temp.ok((select count(*) from public.http_calls) = 1, 'a duplicate (same ref) inserts no row and calls nothing');
delete from public.carer_alerts;
create or replace function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language plpgsql as $$
begin raise exception 'network down'; end $$;
select pg_temp.rd('spo2', 85, '%');
select pg_temp.ok(pg_temp.alerts() = 1 and (select count(*) from public.readings where test = 'spo2' and value = 85) >= 1, 'the push call fails: the alert row and the reading both stay');
delete from public.carer_alerts;
drop schema net cascade; drop view vault.decrypted_secrets; drop schema vault;
select pg_temp.rd('spo2', 85, '%');
select pg_temp.ok(pg_temp.alerts() = 1, 'no pg_net and no vault at all: the alert row is still stored');
delete from public.carer_alerts;

-- ===== the reading always commits =====
create or replace function public.notify_family(p_person uuid, p_kind text, p_template text, p_ref text, p_scope text) returns int
language plpgsql security definer set search_path = '' as $$ begin raise exception 'notify_family is broken'; end $$;
select count(*) as before_n from public.readings where test = 'bp_systolic' \gset
select pg_temp.rd('bp_systolic', 199, 'mmHg');
select pg_temp.ok((select count(*) from public.readings where test = 'bp_systolic') = :before_n + 1, 'notify_family raises -> the reading still commits');
select pg_temp.ok(pg_temp.alerts() = 0, '... and no half-written alert row is left');
create or replace function public.notify_family(p_person uuid, p_kind text, p_template text, p_ref text, p_scope text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
  select p_person, c.carer_id, p_kind, p_template, p_ref from public.carers c where c.person_id = p_person and c.can_write and p_scope = 'carers'
  on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.notify_family(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify_family(uuid, text, text, text, text) to service_role;

-- ===== who can do what =====
select pg_temp.ok(not has_function_privilege('anon', 'public.readings_alert()', 'execute') and not has_function_privilege('authenticated', 'public.readings_alert()', 'execute') and not has_function_privilege('service_role', 'public.readings_alert()', 'execute'), 'nobody but the owner runs the trigger function (grants restated)');
select pg_temp.ok((select prosecdef from pg_proc where proname = 'readings_alert') and array_to_string((select proconfig from pg_proc where proname = 'readings_alert'), ',') = 'search_path=""', 'the trigger function is SECURITY DEFINER with an empty search_path');
grant select, insert on public.readings to authenticated;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.readings (person_id, test, value, unit, taken_at) values ('10000000-0000-0000-0000-0000000000b1', 'bp_systolic', 188, 'mmHg', now());
reset role;
select pg_temp.ok(pg_temp.alerts() = 1, 'the person logging their own reading as a signed-in user still raises the family row (definer rights), without being able to call notify_family');
select pg_temp.ok(pg_temp.fails($$set role authenticated; select public.notify_family('10000000-0000-0000-0000-0000000000b1', 'reading_high', 'reading_high', 'x', 'carers')$$), 'a signed-in user cannot call notify_family');
reset role;
delete from public.carer_alerts;

-- ===== down =====
\ir ../migrations/0035_reading_alerts.down.sql
\ir ../migrations/0035_reading_alerts.down.sql
select pg_temp.rd('bp_systolic', 210, 'mmHg');
select pg_temp.ok(pg_temp.alerts() = 0 and not exists (select 1 from pg_trigger where tgname = 'readings_alert') and to_regproc('public.readings_alert') is null, 'down: no trigger, no function, readings keep working (and the down is safe to run twice)');
\echo ALL PASSED
