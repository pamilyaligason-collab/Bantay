-- RLS rehearsal for 0001_health.sql on a THROWAWAY Postgres (never the live project). Stubs Supabase roles and auth.uid().
-- Run from supabase/tests: createdb bantay_rehearsal; psql -X -d bantay_rehearsal -f rls_rehearsal.sql
-- Verified 2026-10-17 on Postgres 18 (WSL Ubuntu): 21/21 PASS.
\set ON_ERROR_STOP on
-- Supabase-like stubs
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; create role authenticated nologin; end if; end $$;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-00000000000d');
\ir ../migrations/0001_health.sql
-- helper: expect an error
create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean,text) to authenticated, anon;
-- seed as A: own person PA; link B as read-only carer
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into public.people (id, auth_user_id, display_name) values ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','Test A');
select pg_temp.ok(not pg_temp.fails($$insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000a1', now(), 't', 1)$$), 'person writes own');
select pg_temp.ok(pg_temp.fails($$insert into public.readings (person_id, taken_at, test, value, confirmed_by) values ('10000000-0000-0000-0000-0000000000a1', now(), 't', 1, '00000000-0000-0000-0000-00000000000b')$$), 'cannot confirm as someone else');
insert into public.carers values ('00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000a1', false);
select pg_temp.ok((select count(*) from public.readings) = 1, 'person reads own');
select pg_temp.ok(pg_temp.fails($$update public.people set created_by = '00000000-0000-0000-0000-00000000000c'$$), 'self cannot change created_by');
select pg_temp.ok(pg_temp.fails($$update public.people set auth_user_id = null$$), 'self cannot null own login');
select pg_temp.ok(not pg_temp.fails($$update public.people set display_name = 'Test A2'$$), 'self renames');
reset role; set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.readings$$), 'anon has no access');
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.readings) = 1, 'read-only carer reads linked person');
select pg_temp.ok(pg_temp.fails($$insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000a1', now(), 't', 2)$$), 'read-only carer cannot write');
update public.carers set can_write = true where carer_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select can_write from public.carers where carer_id = '00000000-0000-0000-0000-00000000000b') = false, 'carer cannot self-escalate');
delete from public.readings; select pg_temp.ok((select count(*) from public.readings) = 1, 'read-only carer cannot delete');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.readings) = 0, 'stranger sees no readings');
select pg_temp.ok((select count(*) from public.people) = 0, 'stranger sees no people');
select pg_temp.ok(pg_temp.fails($$insert into public.carers values ('00000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-0000000000a1', true)$$), 'stranger cannot link self');
select pg_temp.ok(pg_temp.fails($$insert into public.people (display_name, created_by) values ('x','00000000-0000-0000-0000-00000000000a')$$), 'cannot create as someone else');
select pg_temp.ok(pg_temp.fails($$insert into public.people (auth_user_id, display_name) values ('00000000-0000-0000-0000-00000000000a','x')$$), 'cannot create person for another login');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
insert into public.people (id, display_name) values ('10000000-0000-0000-0000-0000000000d1','Test Lola');
select pg_temp.ok((select can_write from public.carers where person_id = '10000000-0000-0000-0000-0000000000d1' and carer_id = '00000000-0000-0000-0000-00000000000d'), 'creator becomes writer');
select pg_temp.ok(not pg_temp.fails($$insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000d1', now(), 't', 3)$$), 'writer logs a reading');
select pg_temp.ok(pg_temp.fails($$update public.people set auth_user_id = '00000000-0000-0000-0000-00000000000d' where id = '10000000-0000-0000-0000-0000000000d1'$$), 'writer cannot claim no-login person');
delete from public.readings where person_id = '10000000-0000-0000-0000-0000000000d1';
select pg_temp.ok((select count(*) from public.readings where person_id = '10000000-0000-0000-0000-0000000000d1') = 0, 'writer deletes a wrong row');
select pg_temp.ok(pg_temp.fails($$insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000a1', now(), 't', 4)$$), 'writer of D-person cannot write A-person');
reset role;
\echo REHEARSAL DONE
