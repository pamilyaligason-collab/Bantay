-- Rehearsal for 0009_pin_reset_requests.sql on a THROWAWAY Postgres (never the live project). Stubs Supabase roles and auth.*.
-- Run from WSL: createdb bantay_pr; psql -X -v ON_ERROR_STOP=1 -d bantay_pr -f supabase/tests/pin_reset_rehearsal.sql
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
alter default privileges in schema public grant all on tables to service_role;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com'),
 ('00000000-0000-0000-0000-0000000000b1', 'm-b@members.bantay.invalid'),
 ('00000000-0000-0000-0000-0000000000c1', 'm-c@members.bantay.invalid'),
 ('00000000-0000-0000-0000-0000000000d1', 'm-d@members.bantay.invalid');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0009_pin_reset_requests.sql
grant all on all tables in schema public to service_role;
create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon, service_role;
insert into public.app_roles (user_id, role, handle, disabled) values
 ('00000000-0000-0000-0000-0000000000a1', 'admin', null, false),
 ('00000000-0000-0000-0000-0000000000b1', 'member', 'lola', false),
 ('00000000-0000-0000-0000-0000000000c1', 'member', 'kuya', false),
 ('00000000-0000-0000-0000-0000000000d1', 'member', 'off', true);

-- anon from the sign-in screen
set role anon; set request.headers = '{"x-forwarded-for":"203.0.113.9"}';
select pg_temp.ok(not pg_temp.fails($$select public.request_pin_reset('lola')$$), 'anon can call request_pin_reset for a known handle');
select pg_temp.ok(not pg_temp.fails($$select public.request_pin_reset('ghost')$$), 'unknown handle gives the same silent reply');
select pg_temp.ok(not pg_temp.fails($$select public.request_pin_reset('off')$$), 'disabled handle gives the same silent reply');
select pg_temp.ok(not pg_temp.fails($$select public.request_pin_reset('X!')$$), 'malformed handle gives the same silent reply');
select pg_temp.ok(not pg_temp.fails($$select public.request_pin_reset(null)$$), 'null gives the same silent reply');
select pg_temp.ok(not pg_temp.fails($$select public.request_pin_reset('lola')$$), 'a repeat request is silent too');
select pg_temp.ok(pg_temp.fails($$select * from public.admin_requests$$), 'anon cannot read requests');
select pg_temp.ok(pg_temp.fails($$insert into public.admin_requests (kind, handle) values ('pin_reset', 'lola')$$), 'anon cannot insert directly');
select pg_temp.ok(pg_temp.fails($$select public.pin_try(gen_random_uuid(), 5, interval '1 hour')$$), 'anon cannot call pin_try');
reset role;
select pg_temp.ok((select count(*) from public.admin_requests) = 1, 'exactly one request stored (known, enabled, de-duplicated)');
select pg_temp.ok((select handle from public.admin_requests) = 'lola', 'stored for lola');

-- member cannot read, admin can
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select count(*) from public.admin_requests) = 0, 'a member sees no requests');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok((select count(*) from public.admin_requests) = 1, 'admin sees the request');
update public.admin_requests set handled_at = now();
select pg_temp.ok((select count(*) from public.admin_requests where handled_at is not null) = 1, 'admin can mark it handled');
select pg_temp.ok(pg_temp.fails($$update public.admin_requests set handle = 'zzz'$$), 'admin can change handled_at only');
reset role;

-- per-IP limit: the sixth call from one address inside the hour stores nothing but still replies silently
set role anon; set request.headers = '{"x-forwarded-for":"198.51.100.7"}';
select public.request_pin_reset('ghost'); select public.request_pin_reset('ghost'); select public.request_pin_reset('ghost');
select public.request_pin_reset('ghost'); select public.request_pin_reset('ghost');
select pg_temp.ok(not pg_temp.fails($$select public.request_pin_reset('kuya')$$), 'sixth call from one address is silent');
set request.headers = '{"x-forwarded-for":"1.2.3.4, 198.51.100.7"}'; -- a spoofed first hop does not buy a fresh budget
select pg_temp.ok(not pg_temp.fails($$select public.request_pin_reset('kuya')$$), 'spoofed first hop is silent');
reset role;
select pg_temp.ok((select count(*) from public.admin_requests where handle = 'kuya') = 0, 'the over-limit call stored nothing');
\echo REHEARSAL DONE
