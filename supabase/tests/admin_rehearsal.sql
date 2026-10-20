-- Rehearsal for 0004_admin.sql on a THROWAWAY Postgres (never the live project). Stubs Supabase roles, auth.uid() and is_admin().
-- Run (WSL Postgres 18), from PowerShell or bash:
--   wsl -d Ubuntu -- bash -c "service postgresql start; su postgres -c 'dropdb --if-exists bantay_a3; createdb bantay_a3; psql -X -v ON_ERROR_STOP=1 -d bantay_a3 -f /mnt/d/Claude/Bantay-A3/supabase/tests/admin_rehearsal.sql'"
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
\ir ../migrations/0001_health.sql
-- STUB of lane A1's is_admin (0002_auth.sql): A is admin, B and C are members.
create table public.app_roles (user_id uuid primary key, role text not null, disabled boolean not null default false);
insert into public.app_roles values ('00000000-0000-0000-0000-00000000000a','admin'),('00000000-0000-0000-0000-00000000000b','member'),('00000000-0000-0000-0000-00000000000c','member');
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.app_roles where user_id = auth.uid() and role = 'admin' and not disabled) $$;
grant execute on function public.is_admin() to authenticated;
\ir ../migrations/0004_admin.sql
create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean,text) to authenticated, anon;
-- health rows seeded as the owner so the import counts have something to count; 123456.5 is a marker value that must never leak
insert into public.people (id, auth_user_id, display_name, created_by) values ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','Test B','00000000-0000-0000-0000-00000000000b');
insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000b1', now(), 'ldl', 123456.5), ('10000000-0000-0000-0000-0000000000b1', now(), 'ldl', 2);
insert into public.consults (person_id, taken_at) values ('10000000-0000-0000-0000-0000000000b1', now());

-- member B
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(not pg_temp.fails($$insert into public.usage_events (kind, name, app_version) values ('screen','health','0.0.1')$$), 'member inserts own event');
select pg_temp.ok(pg_temp.fails($$insert into public.usage_events (user_id, kind, name) values ('00000000-0000-0000-0000-00000000000c','screen','health')$$), 'member cannot insert as another user');
select pg_temp.ok(pg_temp.fails($$insert into public.usage_events (kind, name) values ('screen','bp_150')$$), 'db rejects a digit-bearing name');
select pg_temp.ok(pg_temp.fails($$insert into public.usage_events (kind, name) values ('reading','health')$$), 'db rejects an unknown kind');
select pg_temp.ok((select count(*) from public.usage_events) = 1, 'member reads only their own events, not others');
select pg_temp.ok(pg_temp.fails($$update public.usage_events set name = 'x'$$), 'member cannot update events');
select pg_temp.ok(pg_temp.fails($$delete from public.usage_events$$), 'member cannot delete events');
select pg_temp.ok(pg_temp.fails($$select * from public.admin_usage_summary(30)$$), 'member cannot call admin_usage_summary');
select pg_temp.ok(pg_temp.fails($$select * from public.admin_import_counts()$$), 'member cannot call admin_import_counts');
-- member C
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok(pg_temp.fails($$insert into public.carers values ('00000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-0000000000b1', true)$$), 'member (not admin) cannot link carers');
insert into public.usage_events (kind, name) values ('screen','health'), ('screen','health'), ('screen','safety'), ('action','alerts_on');
insert into public.usage_events (client_id, kind, name) values ('20000000-0000-0000-0000-000000000001','screen','today');
insert into public.usage_events (client_id, kind, name) values ('20000000-0000-0000-0000-000000000001','screen','today') on conflict (client_id) do nothing;
select pg_temp.ok(pg_temp.fails($$insert into public.usage_events (client_id, kind, name) values ('20000000-0000-0000-0000-000000000001','screen','today')$$), 'duplicate client_id is rejected without on conflict');
select pg_temp.ok(pg_temp.fails($$insert into public.usage_events (at, kind, name) values ('2000-01-01','screen','today')$$), 'client cannot set at (column grant)');
select pg_temp.ok(pg_temp.fails($$insert into public.usage_events (id, kind, name) values (999,'screen','today')$$), 'client cannot set id (column grant)');
insert into public.people (id, display_name) values ('10000000-0000-0000-0000-0000000000c1','Test kid of C');
select pg_temp.ok((select count(*) from public.usage_events) = 5, 'C reads only their own 5 events');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.usage_events) = 1, 'cross-user isolation: B still sees exactly 1 (their own)');
-- anon
reset role; set role anon;
select pg_temp.ok(pg_temp.fails($$insert into public.usage_events (kind, name) values ('screen','health')$$), 'anon cannot insert');
select pg_temp.ok(pg_temp.fails($$select * from public.admin_usage_summary(30)$$), 'anon cannot call admin RPCs');
-- admin A
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.usage_events) = 6, 'admin reads all events, duplicate client_id counted once');
select pg_temp.ok((select events from public.admin_usage_summary(30) where user_id = '00000000-0000-0000-0000-00000000000c') = 5, 'admin_usage_summary counts events per user');
select pg_temp.ok((select top_screens->0->>'name' from public.admin_usage_summary(30) where user_id = '00000000-0000-0000-0000-00000000000c') = 'health', 'top screen is the most used');
select pg_temp.ok((select alerts_on and active_7 and active_30 from public.admin_usage_summary(30) where user_id = '00000000-0000-0000-0000-00000000000c'), 'alerts on and active flags');
select pg_temp.ok((select readings = 2 and consults = 1 from public.admin_import_counts() where person_id = '10000000-0000-0000-0000-0000000000b1'), 'admin_import_counts returns counts');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('admin_usage_summary','admin_import_counts')
     and (pg_get_function_result(p.oid) ~* '\mvalue\M|unit|lab_|systolic|diastolic')), 'RPC output types have no value column');
select pg_temp.ok(not (coalesce((select string_agg(to_jsonb(u)::text, ' ') from public.admin_usage_summary(30) u), '') || coalesce((select string_agg(to_jsonb(i)::text, ' ') from public.admin_import_counts() i), '') ~ '123456'), 'RPC output carries no reading value');
select pg_temp.ok(not pg_temp.fails($$insert into public.carers values ('00000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-0000000000b1', false)$$), 'admin links a read-only carer');
select pg_temp.ok(pg_temp.fails($$insert into public.carers values ('00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000c1', true)$$), 'admin cannot create a can_write link');
select pg_temp.ok(pg_temp.fails($$update public.carers set can_write = true where carer_id = '00000000-0000-0000-0000-00000000000c' and person_id = '10000000-0000-0000-0000-0000000000b1'$$), 'admin cannot raise a link to can_write');
delete from public.carers where carer_id = '00000000-0000-0000-0000-00000000000c' and person_id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select count(*) from public.carers where carer_id = '00000000-0000-0000-0000-00000000000c' and person_id = '10000000-0000-0000-0000-0000000000c1') = 1, 'admin cannot delete the creator link of a no-login person');
select pg_temp.ok(pg_temp.fails($$insert into public.carers values ('00000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-0000000000c1', false) on conflict (carer_id, person_id) do update set can_write = excluded.can_write$$), 'admin upsert cannot downgrade the creator writer link');
select pg_temp.ok((select can_write from public.carers where carer_id = '00000000-0000-0000-0000-00000000000c' and person_id = '10000000-0000-0000-0000-0000000000c1'), 'creator link still can_write after the upsert attempt');
delete from public.carers where carer_id = '00000000-0000-0000-0000-00000000000c' and person_id = '10000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select count(*) from public.carers where carer_id = '00000000-0000-0000-0000-00000000000c' and person_id = '10000000-0000-0000-0000-0000000000b1') = 0, 'admin removes an ordinary read-only link');
select pg_temp.ok(pg_temp.fails($$insert into public.carers values ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000b1', false)$$), 'admin cannot link self as carer');
select pg_temp.ok((select count(*) from public.readings) = 0, 'admin role alone does not read readings');
reset role;
-- ===== 0015: client time on usage events (session 6 lane T) =====
\ir ../migrations/0015_usage_client_at.sql
\ir ../migrations/0015_usage_client_at.sql
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(not pg_temp.fails($$insert into public.usage_events (kind, name, client_at) values ('action','dose_logged', now() - interval '3 hours')$$), 'member inserts an event with the phone time');
select pg_temp.ok(pg_temp.fails($$insert into public.usage_events (kind, name, client_at) values ('action','dose_logged', now() + interval '3 days')$$), 'a phone clock days in the future is refused');
select pg_temp.ok(pg_temp.fails($$insert into public.usage_events (kind, name, client_at) values ('action','dose_logged', timestamptz '2020-01-01')$$), 'a phone clock years in the past is refused');
reset role;
select pg_temp.ok((select count(*) from public.usage_events where client_at is not null) = 1 and (select client_at < at from public.usage_events where client_at is not null), 'client_at stored and earlier than arrival');
\ir ../migrations/0015_usage_client_at.down.sql
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_name = 'usage_events' and column_name = 'client_at'), 'down drops client_at');
\ir ../migrations/0015_usage_client_at.down.sql
\echo REHEARSAL DONE
