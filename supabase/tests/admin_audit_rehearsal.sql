-- Rehearsal for 0021_admin_audit.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002, 0003, 0008, 0010, 0013.
-- Run (WSL Postgres or any local Postgres 15+), from supabase/tests:
--   su postgres -c 'dropdb --if-exists bantay_audit; createdb bantay_audit; psql -X -q -v ON_ERROR_STOP=1 -d bantay_audit -f admin_audit_rehearsal.sql'
-- Actors: A admin (person PA); B member (person PB). All rows are synthetic. The checks run inside begin ... rollback; the up/down/up check follows.
-- On the live project use ONLY the section between "=== checks ===" and the rollback, with the 0021 migration already applied inside the same transaction.
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
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon, service_role;

\ir ../migrations/0021_admin_audit.sql
-- 0021 must be safe to run twice
\ir ../migrations/0021_admin_audit.sql

-- === checks ===
begin;
-- seed as the service role (no auth.uid())
insert into public.lab_results (id, person_id, name_raw, value_num, status)
  values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', 'Test Glucose', 123.456, 'draft');
insert into public.person_identifiers (id, person_id, id_type, id_number) values
 ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', 'philsys', '0000-1111-2222'),
 ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000b1', 'other', 'ABC123');
insert into public.insurance_policies (id, person_id, carrier, plan, member_no, valid_from, valid_to) values
 ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', 'Test Carrier', 'Gold', 'MEM-0000-9999', '2026-01-01', '2026-12-31');
select pg_temp.ok((select count(*) from public.audit_log where tbl = 'lab_results' and action = 'insert' and actor is null and fields is null) = 1, 'insert logs one row, actor null for the service role, fields null');
insert into public.people (id, auth_user_id, display_name, created_by) values ('10000000-0000-0000-0000-0000000000c1', null, 'Test C', '00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.audit_log where tbl = 'people' and action = 'insert' and person_id = row_id and row_id = '10000000-0000-0000-0000-0000000000c1') = 1, 'people insert is logged with person_id = id');
delete from public.audit_log;

-- member B edits the lab value: one update row, column name only
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update public.lab_results set value_num = 987.654 where id = '40000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.ok((select count(*) from public.audit_log where action = 'update' and tbl = 'lab_results') = 1, 'a value edit writes one update row');
select pg_temp.ok((select 'value_num' = any (fields) from public.audit_log where tbl = 'lab_results'), 'fields holds the column name');
select pg_temp.ok(not exists (select 1 from public.audit_log l where l::text like '%987.654%' or l::text like '%123.456%'), 'no row text contains the value');
select pg_temp.ok((select actor from public.audit_log where tbl = 'lab_results') = '00000000-0000-0000-0000-00000000000b', 'actor is the signed-in member');
-- a statement that changes only stamp columns writes nothing
delete from public.audit_log;
update public.lab_results set updated_at = now() where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from public.audit_log) = 0, 'a stamp-only update writes nothing');

-- confirm and reject
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update public.lab_results set status = 'confirmed' where id = '40000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.ok((select count(*) from public.audit_log where action = 'confirm' and tbl = 'lab_results') = 1, 'confirming writes a confirm row');
update public.person_identifiers set status = 'rejected' where id = '50000000-0000-0000-0000-000000000002';
select pg_temp.ok((select count(*) from public.audit_log where action = 'reject' and tbl = 'person_identifiers') = 1, 'rejecting writes a reject row');

-- carers: insert and delete, row_id null
insert into public.carers values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000b1', false);
delete from public.carers where carer_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.audit_log where tbl = 'carers' and row_id is null and person_id = '10000000-0000-0000-0000-0000000000b1' and action in ('insert', 'delete')) = 2, 'carer insert and delete are logged without a row id');

-- non-admin: no audit rows, no identifiers, no reveal, sees only own people
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.audit_log) = 0, 'non-admin select on audit_log returns 0');
select pg_temp.ok(pg_temp.fails($$select * from public.admin_identifiers('10000000-0000-0000-0000-0000000000b1')$$), 'non-admin admin_identifiers raises');
select pg_temp.ok(pg_temp.fails($$select public.admin_reveal_identifier('id', '50000000-0000-0000-0000-000000000001')$$), 'non-admin admin_reveal_identifier raises');
select pg_temp.ok(pg_temp.fails($$insert into public.audit_log (tbl, action) values ('x', 'insert')$$), 'clients cannot insert into audit_log');
select pg_temp.ok((select count(*) from public.people) = 1, 'non-admin sees only their own person');
reset role;
set role anon;
select pg_temp.ok(pg_temp.fails($$select count(*) from public.audit_log$$), 'anon cannot read audit_log');
select pg_temp.ok(pg_temp.fails($$select * from public.admin_identifiers('10000000-0000-0000-0000-0000000000b1')$$), 'anon cannot call admin_identifiers');
reset role;

-- admin
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.audit_log) > 0, 'admin reads audit_log');
select pg_temp.ok((select count(*) from public.people) = 3, 'admin sees all people rows');
select pg_temp.ok((select count(*) from public.admin_identifiers('10000000-0000-0000-0000-0000000000b1')) = 3, 'admin lists 2 ids and 1 policy');
select pg_temp.ok((select last4 from public.admin_identifiers('10000000-0000-0000-0000-0000000000b1') where source = 'id' and label = 'philsys') = '2222', 'last4 shown for a long number');
select pg_temp.ok((select last4 from public.admin_identifiers('10000000-0000-0000-0000-0000000000b1') where label = 'other') is null, 'last4 is null for a 6-char number');
select pg_temp.ok((select last4 from public.admin_identifiers('10000000-0000-0000-0000-0000000000b1') where source = 'insurance') = '9999', 'insurance last4 and label/plan mapped');
select pg_temp.ok((select label || plan from public.admin_identifiers('10000000-0000-0000-0000-0000000000b1') where source = 'insurance') = 'Test CarrierGold', 'insurance label is carrier, plan is plan');
select pg_temp.ok(not exists (select 1 from public.admin_identifiers('10000000-0000-0000-0000-0000000000b1') t where t::text like '%0000-1111-2222%' or t::text like '%MEM-0000-9999%'), 'the list never carries a full number');
reset role;
delete from public.audit_log where action = 'reveal';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok(public.admin_reveal_identifier('id', '50000000-0000-0000-0000-000000000001') = '0000-1111-2222', 'reveal returns the full id number');
select pg_temp.ok(public.admin_reveal_identifier('insurance', '60000000-0000-0000-0000-000000000001') = 'MEM-0000-9999', 'reveal returns the full member number');
select pg_temp.ok(pg_temp.fails($$select public.admin_reveal_identifier('bogus', '50000000-0000-0000-0000-000000000001')$$), 'unknown source raises');
select pg_temp.ok(pg_temp.fails($$select public.admin_reveal_identifier('id', '50000000-0000-0000-0000-0000000000ff')$$), 'missing row raises');
reset role;
select pg_temp.ok((select count(*) from public.audit_log where action = 'reveal') = 2, 'each reveal wrote exactly one reveal row');
select pg_temp.ok((select fields from public.audit_log where tbl = 'person_identifiers' and action = 'reveal') = array['id_number'], 'id reveal logs id_number');
select pg_temp.ok((select fields from public.audit_log where tbl = 'insurance_policies' and action = 'reveal') = array['member_no'], 'insurance reveal logs member_no');
select pg_temp.ok(not exists (select 1 from public.audit_log l where l::text like '%0000-1111-2222%' or l::text like '%MEM-0000-9999%'), 'no audit row holds a number');
rollback;

-- ===== down, then up again =====
\ir ../migrations/0021_admin_audit.down.sql
select pg_temp.ok(to_regclass('public.audit_log') is null and to_regprocedure('public.audit_row()') is null and to_regprocedure('public.admin_identifiers(uuid)') is null
  and not exists (select 1 from pg_trigger where tgname like 'audit\_%') and not exists (select 1 from pg_policies where policyname = 'people_admin_read'), 'down leaves the 0020 state');
\ir ../migrations/0021_admin_audit.down.sql
\ir ../migrations/0021_admin_audit.sql
select pg_temp.ok(to_regclass('public.audit_log') is not null and (select count(*) from pg_trigger where tgname like 'audit\_%') = 12, 'up again after down works (12 triggers)');
\echo ALL PASS
