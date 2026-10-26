-- Rehearsal for 0032_phone_health.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002 and 0003.
-- Run (WSL Postgres, a throwaway database):
--   wsl -u postgres psql -X -v ON_ERROR_STOP=1 -d <throwaway> -f supabase/tests/phone_health_rehearsal.sql
-- Actors: A admin; B member who owns a phone (and the person row Bee); C member who is a carer of Bee; D member with no link to Bee; E member who is a carer of someone else only.
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
 ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000d', 'd@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000e', 'e@example.com', '{"provider":"google"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
insert into public.app_roles (user_id, role, disabled) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false), ('00000000-0000-0000-0000-00000000000b', 'member', false),
 ('00000000-0000-0000-0000-00000000000c', 'member', false), ('00000000-0000-0000-0000-00000000000d', 'member', false),
 ('00000000-0000-0000-0000-00000000000e', 'member', false);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('70000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Bee', '00000000-0000-0000-0000-00000000000b'),
 ('70000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'Cee', '00000000-0000-0000-0000-00000000000c'),
 ('70000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'Dee', '00000000-0000-0000-0000-00000000000d'),
 ('70000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000e', 'Eee', '00000000-0000-0000-0000-00000000000e');
-- C is a read-only carer of Bee; E is a carer of Dee only
insert into public.carers (carer_id, person_id, can_write) values
 ('00000000-0000-0000-0000-00000000000c', '70000000-0000-0000-0000-00000000000b', false),
 ('00000000-0000-0000-0000-00000000000e', '70000000-0000-0000-0000-00000000000d', false);

\ir ../migrations/0032_phone_health.sql
-- 0032 must be safe to run twice
\ir ../migrations/0032_phone_health.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
create function pg_temp.n(q text) returns int language plpgsql as $$ declare c int; begin execute 'with u as (' || q || ' returning 1) select count(*) from u' into c; return c; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text), pg_temp.n(text) to authenticated, anon, service_role;

-- ===== shape and grants =====
select pg_temp.ok((select count(*) = 14 from information_schema.columns where table_schema = 'public' and table_name = 'phone_health'
                   and column_name in ('user_id','platform','app_version','alarms_ok','notif_ok','exact_ok','battery_ok','call_ok','oem','last_open_at','alarms_checked_at','alarms_set','alarms_rearmed','updated_at')), 'all 14 contract columns exist, including call_ok');
select pg_temp.ok(not has_function_privilege('anon', 'public.phone_health_carer(uuid)', 'execute') and not has_function_privilege('anon', 'public.phone_health_stamp()', 'execute')
                  and not has_function_privilege('authenticated', 'public.phone_health_stamp()', 'execute') and has_function_privilege('authenticated', 'public.phone_health_carer(uuid)', 'execute'), 'function grants are stated: anon none, authenticated only the carer helper');
select pg_temp.ok(not has_table_privilege('anon', 'public.phone_health', 'select') and not has_table_privilege('authenticated', 'public.phone_health', 'delete'), 'anon has no grant, nobody can delete over REST');

-- ===== B writes their own row =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.phone_health (user_id, platform, app_version, alarms_ok, notif_ok, exact_ok, battery_ok, call_ok, oem, alarms_set, alarms_rearmed)
  values ('00000000-0000-0000-0000-00000000000b', 'android', '2.3.0', null, true, true, false, null, 'xiaomi', 3, 1);
select pg_temp.ok((select alarms_ok is null and call_ok is null and battery_ok = false and notif_ok from public.phone_health), 'unknown stays null: alarms_ok and call_ok are null, not false');
select pg_temp.ok(pg_temp.fails($$insert into public.phone_health (user_id, platform) values ('00000000-0000-0000-0000-00000000000c', 'android')$$), 'cannot write a row for someone else');
select pg_temp.ok(pg_temp.fails($$update public.phone_health set platform = 'ios'$$), 'platform is android or web only');
select pg_temp.ok(pg_temp.fails($$update public.phone_health set alarms_set = -1$$) and pg_temp.fails($$update public.phone_health set alarms_rearmed = 5000$$), 'counts are 0 to 1000');
select pg_temp.ok(pg_temp.fails($$update public.phone_health set oem = repeat('x', 33)$$) and pg_temp.fails($$update public.phone_health set app_version = repeat('1', 21)$$), 'oem and app_version are short');
-- the outbox upsert: insert ... on conflict (user_id) do update
insert into public.phone_health (user_id, platform, app_version, alarms_ok, notif_ok, exact_ok, battery_ok, call_ok, oem, last_open_at, updated_at, alarms_set, alarms_rearmed)
  values ('00000000-0000-0000-0000-00000000000b', 'android', '2.3.0', true, true, true, true, false, 'xiaomi', '2099-01-01', '2099-01-01', 3, 0)
  on conflict (user_id) do update set alarms_ok = excluded.alarms_ok, battery_ok = excluded.battery_ok, call_ok = excluded.call_ok, last_open_at = excluded.last_open_at, updated_at = excluded.updated_at, alarms_rearmed = excluded.alarms_rearmed;
select pg_temp.ok((select count(*) = 1 and bool_and(alarms_ok) and bool_and(battery_ok) and bool_and(call_ok = false) from public.phone_health), 'the upsert keeps one row per user and merges the new values');
select pg_temp.ok((select last_open_at < now() + interval '1 minute' and updated_at < now() + interval '1 minute' and last_open_at > now() - interval '1 minute' from public.phone_health), 'the server stamps last_open_at and updated_at; a phone clock in 2099 cannot hide the phone');
select pg_temp.ok(pg_temp.n($$update public.phone_health set notif_ok = false$$) = 1, 'the owner updates their own row');

-- ===== who reads =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.phone_health) = 1, 'a linked carer reads the phone of the person they care for');
select pg_temp.ok(pg_temp.n($$update public.phone_health set alarms_ok = true$$) = 0 and pg_temp.fails($$insert into public.phone_health (user_id, platform) values ('00000000-0000-0000-0000-00000000000b', 'web')$$), 'a carer cannot change or replace it');
select pg_temp.ok(pg_temp.fails($$delete from public.phone_health$$), 'nobody deletes over REST (no grant)');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok((select count(*) from public.phone_health) = 0, 'a member with no link reads nothing');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select pg_temp.ok((select count(*) from public.phone_health) = 0, 'a carer of someone else reads nothing');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.phone_health) = 1, 'an admin reads all rows');
reset role; reset request.jwt.claim.sub;
set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.phone_health$$) and pg_temp.fails($$insert into public.phone_health (user_id, platform) values ('00000000-0000-0000-0000-00000000000d', 'web')$$), 'anon cannot read or write');
reset role;

-- ===== a web user's row (platform web, every switch unknown) =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
insert into public.phone_health (user_id, platform) values ('00000000-0000-0000-0000-00000000000d', 'web');
select pg_temp.ok((select alarms_ok is null and notif_ok is null and exact_ok is null and battery_ok is null and call_ok is null and platform = 'web' from public.phone_health), 'a web row carries platform web and nothing else known');
reset role; reset request.jwt.claim.sub;

-- ===== the sweep reads it with the service role (dose-watch, S1) =====
set role service_role;
select pg_temp.ok((select count(*) from public.phone_health) = 2, 'the service role reads every row for the phone-health sweep');
reset role;

-- ===== deleting a user removes the row =====
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000ff', 'f@example.com', '{}', '{}');
insert into public.phone_health (user_id, platform) values ('00000000-0000-0000-0000-0000000000ff', 'web');
delete from auth.users where id = '00000000-0000-0000-0000-0000000000ff';
select pg_temp.ok((select count(*) from public.phone_health where user_id = '00000000-0000-0000-0000-0000000000ff') = 0, 'a deleted account takes its row with it (cascade)');

-- ===== down, then up again =====
\ir ../migrations/0032_phone_health.down.sql
select pg_temp.ok(to_regclass('public.phone_health') is null and to_regprocedure('public.phone_health_carer(uuid)') is null and to_regprocedure('public.phone_health_stamp()') is null, 'down removes the table and both helpers');
\ir ../migrations/0032_phone_health.down.sql
\ir ../migrations/0032_phone_health.sql
select pg_temp.ok(to_regclass('public.phone_health') is not null, 'up again after down works');
\echo ALL PASS
