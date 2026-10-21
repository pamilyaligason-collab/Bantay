-- Rehearsal for 0022_people_archive.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002, 0003, 0006, 0008, 0010, 0011, 0013, 0021.
-- Run (WSL Postgres or any local Postgres 15+), from supabase/tests:
--   su postgres -c 'dropdb --if-exists bantay_archive; createdb bantay_archive; psql -X -q -v ON_ERROR_STOP=1 -d bantay_archive -f people_archive_rehearsal.sql'
-- Actors: A admin (person PA); B writer carer, member (person PB); D a dependent with its own PIN login (person PD, created by B).
-- Person PC is a child with no login, created by B (B becomes its writer through link_creator). All rows are synthetic.
-- The checks run inside begin ... rollback; the up/down/up check follows.
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
 ('00000000-0000-0000-0000-00000000000d', 'm-testchild@members.bantay.invalid', '{"provider":"email"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
\ir ../migrations/0006_family_profiles.sql
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
\ir ../migrations/0008_records.sql
insert into public.app_roles (user_id, role, disabled, handle) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false, null), ('00000000-0000-0000-0000-00000000000b', 'member', false, null),
 ('00000000-0000-0000-0000-00000000000d', 'member', false, 'testchild');
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Test A', '00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Test B', '00000000-0000-0000-0000-00000000000b');
\ir ../migrations/0010_people_profile.sql
\ir ../migrations/0011_family_profiles_photo.sql
\ir ../migrations/0013_records_autoconfirm.sql
\ir ../migrations/0021_admin_audit.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
-- fails_with: the call raises exactly this message (a typo on the refusal path must not pass)
create function pg_temp.fails_with(q text, msg text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return sqlerrm = msg; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
create function pg_temp.affected(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on function pg_temp.fails(text), pg_temp.fails_with(text, text), pg_temp.affected(text), pg_temp.ok(boolean, text) to authenticated, anon, service_role;

-- snapshot of the 0021 state, compared after the down script
create table pg_temp.snap as select
  (select md5(string_agg(policyname || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname)) from pg_policies where schemaname = 'public' and tablename = 'people') as pol,
  (select md5(replace(prosrc, chr(13), '') || pg_get_function_result(oid)) from pg_proc where proname = 'family_profiles' and pronamespace = 'public'::regnamespace) as fp,
  (select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'people') as cols,
  (select string_agg(has_function_privilege('anon', oid, 'execute')::text || has_function_privilege('authenticated', oid, 'execute')::text, ',') from pg_proc where proname = 'family_profiles' and pronamespace = 'public'::regnamespace) as fpgrant;

\ir ../migrations/0022_people_archive.sql
-- 0022 must be safe to run twice
\ir ../migrations/0022_people_archive.sql

-- === checks ===
begin;
-- seed as the service role (no auth.uid())
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000c1', null, 'Test Child', '00000000-0000-0000-0000-00000000000b'),
 ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000d', 'Test Dependent', '00000000-0000-0000-0000-00000000000b');
insert into public.carers (carer_id, person_id, can_write) values ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-0000000000d1', true);
insert into public.lab_results (id, person_id, name_raw, value_num, status) values
 ('40000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'Test Glucose', 5, 'draft'),
 ('40000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'Test Glucose', 6, 'draft');
create table pg_temp.recs_before as select md5(string_agg(l::text, '|' order by l.id)) as h, count(*) as n from public.lab_results l;
select pg_temp.ok((select archived_at is null and archived_by is null from public.people where id = '10000000-0000-0000-0000-0000000000c1'), 'new people rows start unarchived');

-- before archiving: B sees self, child, dependent; D sees itself; admin sees all four
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.people) = 3, 'before: writer carer sees 3 people');
select pg_temp.ok((select count(*) from public.family_profiles()) = 3, 'before: sign-in list holds the 3 logins (A, B, dependent)');
reset role;

-- refusals
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.fails_with($$select public.admin_set_archived('10000000-0000-0000-0000-0000000000c1', true)$$, 'not_admin'), 'non-admin archive raises not_admin');
reset role;
set role anon;
select pg_temp.ok(pg_temp.fails($$select public.admin_set_archived('10000000-0000-0000-0000-0000000000c1', true)$$), 'anon cannot call admin_set_archived');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok(pg_temp.fails_with($$select public.admin_set_archived('10000000-0000-0000-0000-0000000000a1', true)$$, 'self'), 'admin archiving their own person raises self');
select pg_temp.ok(pg_temp.fails_with($$select public.admin_set_archived('10000000-0000-0000-0000-0000000000ff', true)$$, 'not_found'), 'unknown person raises not_found');
select pg_temp.ok(pg_temp.fails_with($$select public.admin_set_archived('10000000-0000-0000-0000-0000000000c1', null)$$, 'bad_input'), 'null flag raises bad_input');
reset role;
select pg_temp.ok((select count(*) from public.people where archived_at is not null) = 0, 'refusals archived nobody');

-- admin archives the child and the dependent
delete from public.audit_log;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.admin_set_archived('10000000-0000-0000-0000-0000000000c1', true);
select public.admin_set_archived('10000000-0000-0000-0000-0000000000d1', true);
select pg_temp.ok((select count(*) from public.people) = 4, 'admin still sees every person (4: A, B, child, dependent)');
reset role;
select pg_temp.ok((select count(*) from public.people where archived_at is not null and archived_by = '00000000-0000-0000-0000-00000000000a') = 2, 'both rows carry archived_at and the admin as archived_by');
select pg_temp.ok((select count(*) from public.audit_log where tbl = 'people' and action = 'update' and fields = array['archived_at', 'archived_by'] and actor = '00000000-0000-0000-0000-00000000000a') = 2, 'audit logs the two column names for the admin, no values');
-- archiving twice keeps the first date
create table pg_temp.first_at as select archived_at from public.people where id = '10000000-0000-0000-0000-0000000000c1';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.admin_set_archived('10000000-0000-0000-0000-0000000000c1', true);
reset role;
select pg_temp.ok((select p.archived_at = f.archived_at from public.people p, pg_temp.first_at f where p.id = '10000000-0000-0000-0000-0000000000c1'), 'archiving twice keeps the first date');

-- writer carer: the archived people vanish
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.people) = 1, 'after: writer carer sees only their own person');
select pg_temp.ok((select count(*) from public.people where id in ('10000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000d1')) = 0, 'after: archived child and dependent are not selectable');
select pg_temp.ok(pg_temp.affected('update public.people set display_name = ''Test Edit'' where id = ''10000000-0000-0000-0000-0000000000c1''') = 0, 'after: carer cannot edit an archived person (0 rows)');
select pg_temp.ok((select count(*) from public.family_profiles() where person_id = '10000000-0000-0000-0000-0000000000d1') = 0 and (select count(*) from public.family_profiles()) = 2, 'after: archived dependent is not in the sign-in list (2 logins left)');
-- residual (documented in REHEARSAL-0022.md): record tables keep their own policies, so a direct query by a carer still returns rows
select pg_temp.ok((select count(*) from public.lab_results where person_id = '10000000-0000-0000-0000-0000000000c1') = 1, 'records policies unchanged: a writer carer can still read the lab row by direct query');
reset role;

-- the dependent's own login still sees itself and its own records
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok((select count(*) from public.people) = 1, 'archived dependent with a login still sees its own row');
select pg_temp.ok(public.is_self('10000000-0000-0000-0000-0000000000d1'), 'is_self still true for the archived dependent');
select pg_temp.ok((select count(*) from public.lab_results where person_id = '10000000-0000-0000-0000-0000000000d1') = 1, 'archived dependent still reads its own record');
select pg_temp.ok(pg_temp.affected('update public.people set display_name = ''Test Self'' where id = ''10000000-0000-0000-0000-0000000000d1''') = 1, 'archived dependent can still edit its own display name');
reset role;

-- admin sees all and every record row is unchanged
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.people) = 4, 'admin sees all 4 people');
select pg_temp.ok((select count(*) from public.lab_results) = 2, 'admin counts both lab rows after archiving');
reset role;
select pg_temp.ok((select md5(string_agg(l::text, '|' order by l.id)) = b.h and count(*) = b.n from public.lab_results l, pg_temp.recs_before b group by b.h, b.n), 'lab_results are byte-identical after archiving');

-- clients cannot write archived_at / archived_by
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok(pg_temp.fails_with($$update public.people set archived_at = null where id = '10000000-0000-0000-0000-0000000000d1'$$, 'permission denied for table people'), 'a person cannot clear their own archived_at');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.fails_with($$update public.people set archived_at = now() where id = '10000000-0000-0000-0000-0000000000b1'$$, 'permission denied for table people'), 'a member cannot archive themselves directly');
select pg_temp.ok(pg_temp.fails_with($$update public.people set archived_by = null where id = '10000000-0000-0000-0000-0000000000b1'$$, 'permission denied for table people'), 'a member cannot write archived_by');
select pg_temp.ok(pg_temp.fails_with($$insert into public.people (display_name, created_by, archived_at) values ('Test X', '00000000-0000-0000-0000-00000000000b', now())$$, 'new row violates row-level security policy for table "people"'), 'a member cannot insert an already archived row');
select pg_temp.ok(pg_temp.affected('insert into public.people (display_name, created_by) values (''Test Y'', ''00000000-0000-0000-0000-00000000000b'')') = 1, 'control: a normal insert still works');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok(pg_temp.fails_with($$update public.people set archived_at = null where id = '10000000-0000-0000-0000-0000000000c1'$$, 'permission denied for table people'), 'even the admin session cannot update archived_at directly (RPC only)');
reset role;

-- reactivate the dependent: both columns clear, same row, visible again
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.admin_set_archived('10000000-0000-0000-0000-0000000000d1', false);
reset role;
select pg_temp.ok((select archived_at is null and archived_by is null from public.people where id = '10000000-0000-0000-0000-0000000000d1'), 'reactivate clears archived_at and archived_by');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.people where id = '10000000-0000-0000-0000-0000000000d1') = 1, 'reactivated dependent is visible to the carer again');
select pg_temp.ok((select count(*) from public.family_profiles() where person_id = '10000000-0000-0000-0000-0000000000d1') = 1, 'reactivated dependent is back in the sign-in list');
select pg_temp.ok((select count(*) from public.people where id = '10000000-0000-0000-0000-0000000000c1') = 0, 'the other person stays archived');
reset role;
select pg_temp.ok((select count(*) from public.audit_log where tbl = 'people' and fields = array['archived_at', 'archived_by'] and row_id = '10000000-0000-0000-0000-0000000000d1') = 2, 'archive and reactivate are both in the audit log');
select pg_temp.ok((select md5(string_agg(l::text, '|' order by l.id)) = b.h and count(*) = b.n from public.lab_results l, pg_temp.recs_before b group by b.h, b.n), 'lab_results still byte-identical after the full cycle');
rollback;

-- ===== down, then up again =====
\ir ../migrations/0022_people_archive.down.sql
select pg_temp.ok(
  (select s.pol = (select md5(string_agg(policyname || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname)) from pg_policies where schemaname = 'public' and tablename = 'people') from pg_temp.snap s),
  'down restores the 0021 people policies exactly');
select pg_temp.ok(
  (select s.fp = (select md5(replace(prosrc, chr(13), '') || pg_get_function_result(oid)) from pg_proc where proname = 'family_profiles' and pronamespace = 'public'::regnamespace) from pg_temp.snap s),
  'down restores the 0011 family_profiles body exactly');
select pg_temp.ok(
  (select s.cols = (select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'people') from pg_temp.snap s),
  'down restores the people columns');
select pg_temp.ok(
  (select s.fpgrant = (select string_agg(has_function_privilege('anon', oid, 'execute')::text || has_function_privilege('authenticated', oid, 'execute')::text, ',') from pg_proc where proname = 'family_profiles' and pronamespace = 'public'::regnamespace) from pg_temp.snap s),
  'down keeps the family_profiles grants');
select pg_temp.ok(to_regprocedure('public.admin_set_archived(uuid,boolean)') is null, 'down drops admin_set_archived');
\ir ../migrations/0022_people_archive.down.sql
\ir ../migrations/0022_people_archive.sql
select pg_temp.ok(to_regprocedure('public.admin_set_archived(uuid,boolean)') is not null
  and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'people' and column_name in ('archived_at', 'archived_by')) = 2,
  'up again after down works');
\echo ALL PASS
