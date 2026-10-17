-- RLS rehearsal for 0003_sync.sql on a THROWAWAY Postgres (never the live project).
-- Run: psql -X -v ON_ERROR_STOP=1 -d <scratch db> -f supabase/tests/sync_rehearsal.sql (migrations are included by relative path). public.is_admin() belongs to 0002_auth.sql (lane A1):
-- here it is stubbed to read public.stub_admins.
\set ON_ERROR_STOP on
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
             if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-00000000000d'),('00000000-0000-0000-0000-0000000000ad');
\ir ../migrations/0001_health.sql
-- STUB for lane A1's 0002_auth.sql
create table public.stub_admins (user_id uuid primary key);
insert into public.stub_admins values ('00000000-0000-0000-0000-0000000000ad');
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.stub_admins where user_id = auth.uid()) $$;
grant execute on function public.is_admin() to authenticated;
\ir ../migrations/0003_sync.sql
create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean,text) to authenticated, anon;

-- A: own person PA, B read-only carer of PA, C stranger, D creates no-login PD (writer), AD admin.
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into public.people (id, auth_user_id, display_name) values ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','Test A');
insert into public.carers values ('00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000a1', false);
select pg_temp.ok(not pg_temp.fails($$insert into public.meds_taken (person_id, name, taken_at) values ('10000000-0000-0000-0000-0000000000a1','TestMed', now())$$), 'person writes own meds_taken');
select pg_temp.ok(not pg_temp.fails($$insert into public.activity (person_id, kind, minutes, steps, started_at, source) values ('10000000-0000-0000-0000-0000000000a1','walk', null, null, now(), 'manual')$$), 'person writes own activity (unknown minutes/steps are null)');
select pg_temp.ok(pg_temp.fails($$insert into public.activity (person_id, kind, minutes, started_at, source) values ('10000000-0000-0000-0000-0000000000a1','walk', -1, now(), 'manual')$$), 'negative minutes refused');
select pg_temp.ok(not pg_temp.fails($$insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000a1', now(), 't', 1)$$), 'reading gets a server client_id by default');
select pg_temp.ok((select count(*) from public.meds_taken) = 1 and (select count(*) from public.activity) = 1, 'person reads own rows');
select pg_temp.ok(pg_temp.fails($$update public.meds_taken set person_id = '10000000-0000-0000-0000-0000000000d1'$$), 'person_id is not updatable');
-- idempotent retry: same client_id twice, second is ignored
insert into public.meds_taken (client_id, person_id, name, taken_at) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-0000000000a1','Dup', now());
insert into public.meds_taken (client_id, person_id, name, taken_at) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-0000000000a1','Dup', now()) on conflict (client_id) do nothing;
select pg_temp.ok((select count(*) from public.meds_taken where client_id = '20000000-0000-0000-0000-000000000001') = 1, 'duplicate client_id ignored (meds_taken)');
insert into public.readings (client_id, person_id, taken_at, test, value) values ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-0000000000a1', now(), 't', 5);
insert into public.readings (client_id, person_id, taken_at, test, value) values ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-0000000000a1', now(), 't', 5) on conflict (client_id) do nothing;
select pg_temp.ok((select count(*) from public.readings where client_id = '20000000-0000-0000-0000-000000000002') = 1, 'duplicate client_id ignored (readings)');
select pg_temp.ok(pg_temp.fails($$insert into public.activity (client_id, person_id, kind, started_at, source) select client_id, person_id, 'x', now(), 'manual' from public.activity limit 1$$), 'duplicate client_id without on conflict is a unique violation');
insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.test/a', 'k', 'a');
select pg_temp.ok((select user_id from public.push_subscriptions) = '00000000-0000-0000-0000-00000000000a', 'push_subscriptions user_id defaults to caller');
select pg_temp.ok(pg_temp.fails($$insert into public.push_subscriptions (user_id, endpoint) values ('00000000-0000-0000-0000-00000000000b', 'https://push.test/forged')$$), 'cannot create a push subscription for another user');
select pg_temp.ok(pg_temp.fails($$insert into public.safety_overrides (kind, key, data) values ('hotline','911','{}')$$), 'non-admin cannot write safety_overrides');

reset role; set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.meds_taken$$) and pg_temp.fails($$select * from public.activity$$) and pg_temp.fails($$select * from public.push_subscriptions$$) and pg_temp.fails($$select * from public.safety_overrides$$), 'anon has no access to any sync table');

reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.meds_taken) = 2 and (select count(*) from public.activity) = 1, 'read-only carer reads linked person');
select pg_temp.ok(pg_temp.fails($$insert into public.meds_taken (person_id, name, taken_at) values ('10000000-0000-0000-0000-0000000000a1','X', now())$$), 'read-only carer cannot write meds_taken');
select pg_temp.ok(pg_temp.fails($$insert into public.activity (person_id, kind, started_at, source) values ('10000000-0000-0000-0000-0000000000a1','x', now(), 'manual')$$), 'read-only carer cannot write activity');
delete from public.meds_taken; select pg_temp.ok((select count(*) from public.meds_taken) = 2, 'read-only carer cannot delete');
select pg_temp.ok((select count(*) from public.push_subscriptions) = 0, 'carer cannot see another user push subscription');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.meds_taken) = 0 and (select count(*) from public.activity) = 0 and (select count(*) from public.push_subscriptions) = 0, 'stranger sees nothing');
select pg_temp.ok(pg_temp.fails($$insert into public.meds_taken (person_id, name, taken_at) values ('10000000-0000-0000-0000-0000000000a1','X', now())$$), 'stranger cannot write meds_taken');
update public.push_subscriptions set p256dh = 'hijack'; delete from public.push_subscriptions;
reset role; select pg_temp.ok((select p256dh from public.push_subscriptions where endpoint='https://push.test/a') = 'k', 'stranger cannot update or delete another push subscription');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok(pg_temp.fails($$insert into public.push_subscriptions (endpoint) values ('https://push.test/a')$$), 'endpoint is unique across users');
select pg_temp.ok(pg_temp.fails($$insert into public.push_subscriptions (endpoint, p256dh) values ('https://push.test/a', 'hijack') on conflict (endpoint) do update set p256dh = excluded.p256dh$$), 'stranger merge-upsert on (endpoint) fails');
select pg_temp.ok(pg_temp.fails($$insert into public.push_subscriptions (endpoint, p256dh) values ('https://push.test/a', 'hijack') on conflict (endpoint) do update set p256dh = excluded.p256dh, user_id = auth.uid()$$), 'stranger cannot take over an endpoint by changing user_id');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
insert into public.people (id, display_name) values ('10000000-0000-0000-0000-0000000000d1','Test Lola');
select pg_temp.ok(not pg_temp.fails($$insert into public.meds_taken (person_id, name, taken_at) values ('10000000-0000-0000-0000-0000000000d1','M', now())$$) and not pg_temp.fails($$insert into public.activity (person_id, kind, started_at, source) values ('10000000-0000-0000-0000-0000000000d1','walk', now(), 'healthkit')$$), 'writer logs for the no-login person');
select pg_temp.ok(pg_temp.fails($$insert into public.meds_taken (person_id, name, taken_at) values ('10000000-0000-0000-0000-0000000000a1','X', now())$$), 'writer of one person cannot write another');
delete from public.meds_taken where person_id = '10000000-0000-0000-0000-0000000000d1';
select pg_temp.ok((select count(*) from public.meds_taken) = 0, 'writer deletes a wrong row');

-- safety_overrides: everyone signed in reads, admin writes
reset role; insert into public.safety_overrides (kind, key, data) values ('hotline','test-1','{"n":"x"}');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.safety_overrides) = 1, 'any signed-in user reads safety_overrides');
update public.safety_overrides set removed = true; delete from public.safety_overrides;
reset role; select pg_temp.ok((select count(*) from public.safety_overrides where not removed) = 1, 'non-admin cannot update or delete safety_overrides');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok(pg_temp.fails($$insert into public.safety_overrides (kind, key, data) values ('hotline','test-1','{"hijack":1}') on conflict (kind,key) do update set data = excluded.data$$), 'non-admin merge-upsert on (kind,key) fails');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ad';
select pg_temp.ok(not pg_temp.fails($$insert into public.safety_overrides (kind, key, data) values ('place','test-2','{}')$$), 'admin writes safety_overrides');
select pg_temp.ok(pg_temp.fails($$insert into public.safety_overrides (kind, key) values ('place','test-2')$$), '(kind,key) is unique');
update public.safety_overrides set removed = true where key = 'test-1';
select pg_temp.ok((select removed from public.safety_overrides where key = 'test-1'), 'admin updates safety_overrides');
select pg_temp.ok(not pg_temp.fails($$insert into public.safety_overrides (kind, key, data) values ('hotline','test-1','{"n":"y"}') on conflict (kind,key) do update set data = excluded.data, removed = false$$), 'admin merge-upsert on (kind,key) succeeds');
select pg_temp.ok((select data->>'n' from public.safety_overrides where key = 'test-1') = 'y', 'merge-upsert replaced the data');
reset role;
\echo REHEARSAL DONE
