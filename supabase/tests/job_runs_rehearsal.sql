-- Rehearsal for 0033_job_runs.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001 to 0004.
-- Run (WSL Postgres 15+), from supabase/tests:
--   su postgres -c 'dropdb --if-exists bantay_s8; createdb bantay_s8; psql -X -q -v ON_ERROR_STOP=1 -d bantay_s8 -f job_runs_rehearsal.sql'
-- Actors: A admin, B member, C member. All rows are synthetic. carer_alerts (0030) is stubbed LATER to prove both branches of admin_weekly_kpis.
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
grant execute on function auth.uid() to authenticated, anon, service_role;
grant usage on schema public to authenticated, anon, service_role;
grant select, delete on auth.sessions to service_role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"provider":"google"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
insert into public.app_roles (user_id, role, disabled) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false), ('00000000-0000-0000-0000-00000000000b', 'member', false), ('00000000-0000-0000-0000-00000000000c', 'member', false);
\ir ../migrations/0004_admin.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.fails_with(q text, msg text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return sqlerrm = msg; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.fails_with(text, text), pg_temp.ok(boolean, text) to authenticated, anon, service_role;

\ir ../migrations/0033_job_runs.sql
-- 0033 must be safe to run twice
\ir ../migrations/0033_job_runs.sql

-- === grants (ML-21): no PUBLIC, anon or service_role execute on the RPCs; authenticated only ===
select pg_temp.ok(not has_function_privilege('anon', 'public.log_client_error(text,text,text)', 'execute')
              and not has_function_privilege('service_role', 'public.log_client_error(text,text,text)', 'execute')
              and has_function_privilege('authenticated', 'public.log_client_error(text,text,text)', 'execute'), 'log_client_error: authenticated only');
select pg_temp.ok(not has_function_privilege('anon', 'public.admin_weekly_kpis()', 'execute') and has_function_privilege('authenticated', 'public.admin_weekly_kpis()', 'execute'), 'admin_weekly_kpis: authenticated only');
select pg_temp.ok(not has_function_privilege('anon', 'public.admin_pending_migrations(text[])', 'execute') and has_function_privilege('authenticated', 'public.admin_pending_migrations(text[])', 'execute'), 'admin_pending_migrations: authenticated only');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.job_runs_trim()', 'execute') and not has_function_privilege('anon', 'public.job_runs_trim()', 'execute'), 'trim trigger function is not callable');

-- === job_runs: service role writes, admin reads, members read nothing, 30-day trim ===
set role service_role;
insert into public.job_runs (job, ran_at, ok) values ('old-job', now() - interval '31 days', true);
insert into public.job_runs (job, ok, summary) values ('dose-watch', true, '{"sent":2}'), ('dose-watch', false, '{"errors":1}');
reset role;
select pg_temp.ok((select count(*) from public.job_runs) = 2, 'a new insert trims rows older than 30 days (the 31-day row is gone), two remain');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.job_runs) = 2, 'admin reads job_runs');
select pg_temp.ok(pg_temp.fails($$insert into public.job_runs (job, ok) values ('x', true)$$), 'admin cannot write job_runs from the app');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.job_runs) = 0, 'a member reads no job_runs rows');
reset role;
set role anon;
select pg_temp.ok(pg_temp.fails($$select count(*) from public.job_runs$$), 'anon cannot read job_runs');
reset role;
select pg_temp.ok(pg_temp.fails($$insert into public.job_runs (job, ok) values ('', true)$$), 'an empty job name is refused');

-- === log_client_error ===
set role anon;
select pg_temp.ok(pg_temp.fails($$select public.log_client_error('window.onerror', 'abc123', '1.0')$$), 'anon cannot call log_client_error');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.log_client_error('window.onerror', 'abc123', '2.3.0');
select public.log_client_error('window.onerror', 'abc123', '2.3.0');
select public.log_client_error('unhandledrejection', 'def456', null);
select pg_temp.ok((select count(*) from public.client_errors) = 0, 'a member cannot read client_errors rows (not even their own)');
reset role;
select pg_temp.ok((select count(*) from public.client_errors) = 2, 'two keys = two rows (same key twice is one row)');
select pg_temp.ok((select count from public.client_errors where message_hash = 'abc123') = 2, 'the second identical call bumps count to 2');
select pg_temp.ok((select user_id from public.client_errors where message_hash = 'abc123') = '00000000-0000-0000-0000-00000000000b', 'user_id comes from auth.uid()');
select pg_temp.ok((select app_version is null from public.client_errors where message_hash = 'def456'), 'a null version stays null, never a made-up value');
select pg_temp.ok((select day = (now() at time zone 'Asia/Manila')::date from public.client_errors where message_hash = 'abc123'), 'day is the Manila day');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.fails_with($$select public.log_client_error(repeat('a', 65), 'abc', '1')$$, 'too_long'), 'where longer than 64 raises');
select pg_temp.ok(pg_temp.fails_with($$select public.log_client_error('x', repeat('a', 65), '1')$$, 'too_long'), 'hash longer than 64 raises');
select pg_temp.ok(pg_temp.fails_with($$select public.log_client_error('has space and "values"', 'abc', '1')$$, 'bad_where'), 'where must be a plain place name');
select pg_temp.ok(pg_temp.fails_with($$select public.log_client_error('x', 'not hex message text', '1')$$, 'bad_hash'), 'hash must be hex (a message cannot be stored)');
select pg_temp.ok(pg_temp.fails($$select public.log_client_error(null, 'abc', '1')$$) and pg_temp.fails($$select public.log_client_error('x', null, '1')$$), 'null where or hash raises');
select pg_temp.ok(pg_temp.fails($$insert into public.client_errors (user_id, where_, message_hash, day) values (auth.uid(), 'x', 'abc', current_date)$$), 'no direct insert');
select pg_temp.ok(pg_temp.fails($$update public.client_errors set count = 99$$), 'no direct update');
reset role;
-- cap: C makes 55 distinct calls; only 50 rows exist; B is unaffected
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select public.log_client_error('page', to_hex(i), 'v') from generate_series(1, 55) i;
reset role;
select pg_temp.ok((select count(*) from public.client_errors where user_id = '00000000-0000-0000-0000-00000000000c') = 50, '50 rows per user per day, the 55 calls stop at 50');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select public.log_client_error('page', to_hex(1), 'v'); -- existing key at the cap: does nothing at all
reset role;
select pg_temp.ok((select count from public.client_errors where user_id = '00000000-0000-0000-0000-00000000000c' and message_hash = to_hex(1)) = 1, 'at the cap even an existing key is not bumped');
select pg_temp.ok((select count(*) from public.client_errors where user_id = '00000000-0000-0000-0000-00000000000b') = 2, 'the cap is per user: B still has its 2 rows');
-- retention: an old row is trimmed by the next call
insert into public.client_errors (user_id, where_, message_hash, day, count) values ('00000000-0000-0000-0000-00000000000b', 'old', 'ff', (now() at time zone 'Asia/Manila')::date - 31, 1);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.log_client_error('window.onerror', 'abc123', '2.3.0');
reset role;
select pg_temp.ok(not exists (select 1 from public.client_errors where where_ = 'old'), 'rows older than 30 days are trimmed');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.client_errors) = 52, 'admin reads client_errors');
reset role;

-- === admin_pending_migrations ===
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.fails_with($$select * from public.admin_pending_migrations(array['0001'])$$, 'not_admin'), 'a member cannot ask');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.admin_pending_migrations(array['0001','0033'])) = 0, 'no supabase_migrations schema (WSL): empty set');
select pg_temp.ok((select count(*) from public.admin_pending_migrations()) = 0, 'no argument: empty set');
reset role;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, name text);
insert into supabase_migrations.schema_migrations values ('0001', 'health'), ('0002', 'auth'), ('0029', 'admin_view_as');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select array_agg(v order by v) from public.admin_pending_migrations(array['0001','0002','0028','0029','0033','0030']) v) = array['0030','0033'], 'pending = known not recorded, 0028 skipped, sorted');
reset role;
drop schema supabase_migrations cascade;

-- === admin_weekly_kpis, without carer_alerts ===
insert into public.people (id, auth_user_id, display_name, created_by) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Test B', '00000000-0000-0000-0000-00000000000b');
insert into public.usage_events (user_id, at, kind, name) values
 ('00000000-0000-0000-0000-00000000000a', now() - interval '1 hour', 'screen', 'today'),
 ('00000000-0000-0000-0000-00000000000a', now() - interval '2 hours', 'screen', 'health'),
 ('00000000-0000-0000-0000-00000000000b', now() - interval '3 hours', 'screen', 'today'),
 ('00000000-0000-0000-0000-00000000000b', now() - interval '10 days', 'screen', 'today'),
 ('00000000-0000-0000-0000-00000000000c', now() - interval '10 days', 'screen', 'today'),
 ('00000000-0000-0000-0000-00000000000c', now() - interval '40 days', 'screen', 'today'),
 ('00000000-0000-0000-0000-00000000000a', now() - interval '1 hour', 'action', 'dose_logged');
insert into public.meds_taken (person_id, name, taken_at) values ('10000000-0000-0000-0000-0000000000b1', 'm', now() - interval '1 day'), ('10000000-0000-0000-0000-0000000000b1', 'm', now() - interval '9 days');
insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000b1', now() - interval '2 days', 'ldl', 123456.5);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.fails_with($$select public.admin_weekly_kpis()$$, 'not_admin'), 'a member cannot read the KPIs');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
create temp table k as select public.admin_weekly_kpis() as j;
select pg_temp.ok((select (j->'active_members'->>'cur')::int from k) = 2 and (select (j->'active_members'->>'prev')::int from k) = 2, 'active members: this week A and B (2), the week before B and C (2); the 40-day row is outside');
select pg_temp.ok((select (j->'screens'->>'cur')::int from k) = 3 and (select (j->'screens'->>'prev')::int from k) = 2, 'screens opened 3 now, 2 before (action rows excluded)');
select pg_temp.ok((select (j->'doses_logged'->>'cur')::int from k) = 1 and (select (j->'doses_logged'->>'prev')::int from k) = 1, 'doses 1 now, 1 before');
select pg_temp.ok((select (j->'readings_logged'->>'cur')::int from k) = 1 and (select (j->'readings_logged'->>'prev')::int from k) = 0, 'readings 1 now, 0 before');
select pg_temp.ok((select (j->'client_errors'->>'cur')::int from k) = 54 and (select (j->'client_errors'->>'prev')::int from k) = 0, 'client errors: B 3 + 1, C 50 = 54 this week, none before (the 31-day row was trimmed)');
select pg_temp.ok((select j->'alerts' = 'null'::jsonb from k), 'no carer_alerts table: alerts is null (unknown), not 0');
select pg_temp.ok((select position('123456' in j::text) = 0 and position('Test B' in j::text) = 0 from k), 'no health value or name in the KPI output');
reset role;
drop table k;

-- === admin_weekly_kpis, with a carer_alerts stub shaped like 0030 (kind, created_at, seen_at) ===
create table public.carer_alerts (id uuid primary key default gen_random_uuid(), kind text not null, created_at timestamptz not null default now(), seen_at timestamptz);
insert into public.carer_alerts (kind, created_at, seen_at) values
 ('dose_missed', now() - interval '1 day', now() - interval '1 day' + interval '10 minutes'),   -- seen within 1 h
 ('dose_missed', now() - interval '1 day', now() - interval '1 day' + interval '3 hours'),     -- seen late
 ('hazard', now() - interval '2 days', null),                                                  -- unseen
 ('system', now() - interval '3 days', null),                                                  -- unseen
 ('system', now() - interval '3 days', null),                                                  -- unseen
 ('dose_missed', now() - interval '9 days', null),                                             -- last week: not in sent / unseen
 ('dose_missed', now() - interval '10 minutes', null);                                         -- brand new: sent and unseen, but not due yet
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
create temp table k as select public.admin_weekly_kpis() as j;
select pg_temp.ok((select (j->'alerts'->>'sent')::int from k) = 6, 'alerts sent in 7 days = 6 (5 old + 1 brand new)');
select pg_temp.ok((select (j->'alerts'->>'due_1h')::int from k) = 5, 'alerts due (at least an hour old) = 5, the 10-minute-old one is left out of the rate');
select pg_temp.ok((select (j->'alerts'->>'seen')::int from k) = 2, 'alerts seen = 2');
select pg_temp.ok((select (j->'alerts'->>'seen_1h')::int from k) = 1, 'alerts seen within 1 hour = 1');
select pg_temp.ok((select j->'alerts'->'unseen_by_kind' from k) = '{"dose_missed": 1, "hazard": 1, "system": 2}'::jsonb, 'unseen by kind = dose_missed 1 (new one), hazard 1, system 2');
select pg_temp.ok((select jsonb_array_length(j->'alerts'->'by_day') from k) = 4, 'by_day has the 4 days that have alerts in the last 14');
select pg_temp.ok((select sum((e->>'total')::int) from k, jsonb_array_elements(j->'alerts'->'by_day') e) = 6, 'by_day totals add up to the 6 due alerts in 14 days (the brand-new one is excluded)');
reset role;
drop table k;

-- === down, then up again ===
\ir ../migrations/0033_job_runs.down.sql
\ir ../migrations/0033_job_runs.down.sql
select pg_temp.ok(to_regclass('public.job_runs') is null and to_regclass('public.client_errors') is null
              and to_regprocedure('public.log_client_error(text,text,text)') is null and to_regprocedure('public.admin_weekly_kpis()') is null
              and to_regprocedure('public.admin_pending_migrations(text[])') is null and to_regprocedure('public.job_runs_trim()') is null, 'down removes tables and functions');
\ir ../migrations/0033_job_runs.sql
select pg_temp.ok(to_regclass('public.job_runs') is not null and to_regprocedure('public.admin_weekly_kpis()') is not null, 'up again after down works');
\echo ALL PASS
