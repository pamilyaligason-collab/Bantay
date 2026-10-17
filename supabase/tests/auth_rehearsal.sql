-- Rehearsal for 0001_health.sql + 0002_auth.sql on a THROWAWAY Postgres (never the live project). Stubs Supabase roles and auth.*.
-- Run from WSL: createdb bantay_a1; psql -X -v ON_ERROR_STOP=1 -d bantay_a1 -f supabase/tests/auth_rehearsal.sql
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
grant select, delete on auth.sessions to service_role;
alter default privileges in schema public grant all on tables to service_role;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com',  '{"provider":"google"}', '{"full_name":"Ada Admin"}'),
 ('00000000-0000-0000-0000-0000000000b1', 'member@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-0000000000c1', 'off@example.com',    '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-0000000000d1', 'new@example.com',    '{"provider":"google"}', '{"name":"Nina New"}'),
 ('00000000-0000-0000-0000-0000000000e1', 'stranger@example.com','{"provider":"google"}', '{}');

\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
grant all on all tables in schema public to service_role;

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
create function pg_temp.accepted(em text, meta jsonb) returns boolean language sql as
  $$ select (public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', em, 'app_metadata', meta))) -> 'error') is null $$;
create function pg_temp.accepted_user(u jsonb) returns boolean language sql as
  $$ select (public.hook_before_user_created(jsonb_build_object('user', u)) -> 'error') is null $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text), pg_temp.accepted(text, jsonb), pg_temp.accepted_user(jsonb) to authenticated, anon, supabase_auth_admin, service_role;

-- seed as superuser: roles + invites
insert into public.app_roles (user_id, role, handle) values
 ('00000000-0000-0000-0000-0000000000a1', 'admin',  null),
 ('00000000-0000-0000-0000-0000000000b1', 'member', 'lola'),
 ('00000000-0000-0000-0000-0000000000c1', 'admin',  null);
update public.app_roles set disabled = true where user_id = '00000000-0000-0000-0000-0000000000c1';
insert into public.invites (email) values ('invited@example.com');

-- app_roles / invites visibility and writes
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select count(*) from public.invites) = 0, 'non-admin cannot read invites');
select pg_temp.ok(pg_temp.fails($$insert into public.invites (email) values ('x@example.com')$$), 'non-admin cannot write invites');
select pg_temp.ok((select count(*) from public.app_roles) = 1, 'member reads only own app_roles row');
select pg_temp.ok(pg_temp.fails($$insert into public.app_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000b1', 'admin')$$), 'non-admin cannot insert app_roles');
select pg_temp.ok(pg_temp.fails($$update public.app_roles set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000b1'$$), 'non-admin cannot self-promote');
select pg_temp.ok(pg_temp.fails($$delete from public.app_roles$$), 'non-admin cannot delete app_roles');
select pg_temp.ok(not public.is_admin(), 'is_admin false for member');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok(public.is_admin(), 'is_admin true for admin');
select pg_temp.ok((select count(*) from public.invites) = 1, 'admin reads invites');
select pg_temp.ok((select count(*) from public.app_roles) = 3, 'admin reads all app_roles');
select pg_temp.ok(pg_temp.fails($$update public.app_roles set role = 'member' where user_id = '00000000-0000-0000-0000-0000000000b1'$$), 'admin cannot write app_roles over REST');
select pg_temp.ok(pg_temp.fails($$insert into public.invites (email) values ('x@example.com')$$), 'admin cannot write invites over REST');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok(not public.is_admin(), 'is_admin false for disabled admin');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.ok(not public.is_admin(), 'is_admin false for user with no role');
select pg_temp.ok((select count(*) from public.app_roles) = 0, 'stranger sees no app_roles');
select pg_temp.ok(pg_temp.fails($$select * from public.pin_attempts$$), 'authenticated cannot read pin_attempts');
select pg_temp.ok(pg_temp.fails($$select public.pin_try(gen_random_uuid(), 5, '15 minutes')$$), 'authenticated cannot call pin_try');
select pg_temp.ok(pg_temp.fails($$select public.hook_before_user_created('{}'::jsonb)$$), 'authenticated cannot call the hook');
reset role; set role anon;
select pg_temp.ok(pg_temp.fails($$select public.is_admin()$$), 'anon cannot call is_admin');
select pg_temp.ok(pg_temp.fails($$select * from public.app_roles$$), 'anon cannot read app_roles');
select pg_temp.ok(pg_temp.fails($$select public.ensure_self_person()$$), 'anon cannot call ensure_self_person');

-- Before User Created hook
reset role; set role supabase_auth_admin;
select pg_temp.ok(not pg_temp.accepted('invited@example.com', '{"provider":"email"}'), 'hook rejects invited email on the Email provider');
select pg_temp.ok(not pg_temp.accepted('invited@example.com', '{}'), 'hook rejects invited email with no provider');
select pg_temp.ok(pg_temp.accepted('invited@example.com', '{"providers":["google"]}'), 'hook accepts invited email with providers array containing google');
select pg_temp.ok(not pg_temp.accepted('invited@example.com', '{"providers":["email"]}'), 'hook rejects invited email with providers array of email only');
select pg_temp.ok(pg_temp.accepted_user('{"email":"invited@example.com","app_metadata":{},"identities":[{"provider":"google"}]}'), 'hook accepts invited email with google identity');
select pg_temp.ok(not pg_temp.accepted_user('{"email":"invited@example.com","app_metadata":{},"identities":[{"provider":"email"}]}'), 'hook rejects invited email with email identity');
select pg_temp.ok(not pg_temp.accepted_user('{"email":"rando@example.com","app_metadata":{},"identities":[{"provider":"google"}]}'), 'hook rejects uninvited email with google identity');
select pg_temp.ok(not pg_temp.accepted('rando@example.com', '{"provider":"google"}'), 'hook rejects uninvited Google email');
select pg_temp.ok(pg_temp.accepted('invited@example.com', '{"provider":"google"}'), 'hook accepts invited Google email');
select pg_temp.ok(pg_temp.accepted('Invited@Example.com', '{"provider":"google"}'), 'hook invite match ignores case');
select pg_temp.ok(pg_temp.accepted('m-5b6e2c1e-0000-4000-8000-000000000001@members.bantay.invalid', '{"created_by_admin":true}'), 'hook accepts admin-created synthetic member');
select pg_temp.ok(not pg_temp.accepted('m-5b6e2c1e-0000-4000-8000-000000000001@members.bantay.invalid', '{"provider":"email"}'), 'hook rejects synthetic email without admin mark');
select pg_temp.ok(not pg_temp.accepted('m-x@evil.example.com', '{"created_by_admin":true}'), 'hook rejects admin mark on a real domain');
select pg_temp.ok(not pg_temp.accepted('', '{"created_by_admin":true}'), 'hook rejects empty email');
reset role;

-- revoke_sessions: service role only, removes only that user's sessions
insert into auth.sessions (user_id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000a1');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok(pg_temp.fails($$select public.revoke_sessions('00000000-0000-0000-0000-0000000000b1')$$), 'authenticated (even admin) cannot call revoke_sessions');
reset role; set role anon;
select pg_temp.ok(pg_temp.fails($$select public.revoke_sessions('00000000-0000-0000-0000-0000000000b1')$$), 'anon cannot call revoke_sessions');
reset role; set role supabase_auth_admin;
select pg_temp.ok(pg_temp.fails($$select public.revoke_sessions('00000000-0000-0000-0000-0000000000b1')$$), 'auth admin cannot call revoke_sessions');
reset role; set role service_role;
select public.revoke_sessions('00000000-0000-0000-0000-0000000000b1');
reset role;
select pg_temp.ok((select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000b1') = 0, 'service_role revoke_sessions removes that user sessions');
select pg_temp.ok((select count(*) from auth.sessions) = 1, 'revoke_sessions leaves other users sessions');

-- pin_try: 5 attempts allowed, the 6th is over the limit, a lapsed window restarts
create temp table t_k as select '99999999-0000-0000-0000-000000000001'::uuid as k;
grant all on t_k to service_role;
set role service_role;
select pg_temp.ok((select public.pin_try(k, 5, '15 minutes') from t_k) = 1, 'pin_try counts first attempt');
select public.pin_try(k, 5, '15 minutes') from t_k; select public.pin_try(k, 5, '15 minutes') from t_k; select public.pin_try(k, 5, '15 minutes') from t_k;
select pg_temp.ok((select public.pin_try(k, 5, '15 minutes') from t_k) = 5, 'pin_try fifth attempt still allowed');
select pg_temp.ok((select public.pin_try(k, 5, '15 minutes') from t_k) = 6, 'pin_try sixth attempt is over the limit');
select pg_temp.ok((select locked_until > now() + interval '14 minutes' from public.pin_attempts where user_id = (select k from t_k)), 'lock lasts about 15 minutes');
update public.pin_attempts set locked_until = now() - interval '1 second';
select pg_temp.ok((select public.pin_try(k, 5, '15 minutes') from t_k) = 1, 'pin_try window restarts after the lock lapses');
reset role;
insert into public.pin_attempts values ('99999999-0000-0000-0000-0000000000f1', 3, now() - interval '2 days');
set role service_role; select public.pin_try('99999999-0000-0000-0000-0000000000f2', 5, '15 minutes'); reset role;
select pg_temp.ok((select count(*) from public.pin_attempts where user_id = '99999999-0000-0000-0000-0000000000f1') = 0, 'pin_try purges rows stale for over a day');

-- ensure_self_person: idempotent, names from profile, never downgrades an admin
create temp table t_p (pid uuid);
grant all on t_p to authenticated;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
insert into t_p select public.ensure_self_person();
select pg_temp.ok((select pid from t_p) = public.ensure_self_person(), 'ensure_self_person returns the same id twice');
select pg_temp.ok((select count(*) from public.people where auth_user_id = '00000000-0000-0000-0000-0000000000d1') = 1, 'ensure_self_person creates exactly one people row');
select pg_temp.ok((select display_name from public.people where id = (select pid from t_p)) = 'Nina New', 'ensure_self_person uses the profile name');
select pg_temp.ok((select created_by from public.people where id = (select pid from t_p)) = '00000000-0000-0000-0000-0000000000d1', 'ensure_self_person sets created_by = caller');
select pg_temp.ok((select role from public.app_roles where user_id = '00000000-0000-0000-0000-0000000000d1') = 'member', 'ensure_self_person gives a member role');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.ensure_self_person();
select pg_temp.ok((select display_name from public.people where auth_user_id = '00000000-0000-0000-0000-0000000000a1') = 'Ada Admin', 'ensure_self_person uses full_name first');
select pg_temp.ok(public.is_admin(), 'ensure_self_person leaves an admin an admin');
set request.jwt.claim.sub = '';
select pg_temp.ok(pg_temp.fails($$select public.ensure_self_person()$$), 'ensure_self_person refuses a caller with no uid');
reset role;
\echo REHEARSAL DONE
