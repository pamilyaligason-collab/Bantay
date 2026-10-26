-- Rehearsal for 0029_admin_view_as.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001 to 0021.
-- Run (WSL Postgres or any local Postgres 15+), from supabase/tests:
--   su postgres -c 'dropdb --if-exists bantay_viewas; createdb bantay_viewas; psql -X -q -v ON_ERROR_STOP=1 -d bantay_viewas -f admin_view_as_rehearsal.sql'
-- Actors: A admin (person PA); B member (person PB). All rows are synthetic.
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
 ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"provider":"google"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
\ir ../migrations/0008_records.sql
insert into public.app_roles (user_id, role, disabled) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false), ('00000000-0000-0000-0000-00000000000b', 'member', false);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Test A', '00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Test B', '00000000-0000-0000-0000-00000000000b');
\ir ../migrations/0010_people_profile.sql
\ir ../migrations/0013_records_autoconfirm.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
-- fails_with: the call raises exactly this message (a typo on the refusal path must not pass)
create function pg_temp.fails_with(q text, msg text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return sqlerrm = msg; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.fails_with(text, text), pg_temp.ok(boolean, text) to authenticated, anon, service_role;

\ir ../migrations/0021_admin_audit.sql
\ir ../migrations/0029_admin_view_as.sql
-- 0029 must be safe to run twice
\ir ../migrations/0029_admin_view_as.sql

-- === checks ===
begin;
insert into public.people (id, auth_user_id, display_name, created_by) values ('10000000-0000-0000-0000-0000000000c1', null, 'Test C', '00000000-0000-0000-0000-00000000000a');
delete from public.audit_log;

-- admin B? no: A is the admin. Member B cannot log a view.
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.fails_with($$select public.admin_log_view_as('10000000-0000-0000-0000-0000000000b1')$$, 'not_admin'), 'a member cannot log a view');
reset role;
set role anon;
select pg_temp.ok(pg_temp.fails($$select public.admin_log_view_as('10000000-0000-0000-0000-0000000000b1')$$), 'anon cannot call it');
reset role;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok(pg_temp.fails_with($$select public.admin_log_view_as('10000000-0000-0000-0000-0000000000ff')$$, 'not_found'), 'unknown person raises not_found');
select pg_temp.ok(pg_temp.fails_with($$select public.admin_log_view_as(null)$$, 'not_found'), 'null person raises not_found');
select public.admin_log_view_as('10000000-0000-0000-0000-0000000000b1');
select pg_temp.ok(pg_temp.fails($$insert into public.audit_log (tbl, action) values ('people', 'view')$$), 'clients still cannot insert into audit_log directly');
reset role;

select pg_temp.ok((select count(*) from public.audit_log) = 1, 'one view = exactly one audit row');
select pg_temp.ok((select action = 'view' and tbl = 'people' and actor = '00000000-0000-0000-0000-00000000000a' and person_id = '10000000-0000-0000-0000-0000000000b1'
                          and row_id = person_id and fields is null from public.audit_log), 'row shape: view, people, admin actor, viewed person, no fields');
select pg_temp.ok(not exists (select 1 from public.audit_log l where l::text like '%Test B%'), 'no name or value text in the row');
select pg_temp.ok(pg_temp.fails($$insert into public.audit_log (tbl, action) values ('people', 'bogus')$$), 'the action check still refuses other words');
rollback;

-- ===== down, then up again =====
\ir ../migrations/0029_admin_view_as.down.sql
\ir ../migrations/0029_admin_view_as.down.sql
select pg_temp.ok(to_regprocedure('public.admin_log_view_as(uuid)') is null and pg_temp.fails($$insert into public.audit_log (tbl, action) values ('people', 'view')$$), 'down removes the function and the view word');
\ir ../migrations/0029_admin_view_as.sql
select pg_temp.ok(to_regprocedure('public.admin_log_view_as(uuid)') is not null, 'up again after down works');
\echo ALL PASS
