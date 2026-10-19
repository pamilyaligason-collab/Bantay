-- Rehearsal for 0013_records_autoconfirm.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002, 0008 and 0010.
-- Run (WSL Postgres 18):
--   wsl -d Ubuntu -- bash -c "service postgresql start >/dev/null; cd /mnt/d/Claude/Bantay/.claude/worktrees/wf_475f650f-776-5/supabase/tests && su postgres -c 'dropdb --if-exists bantay_ac; createdb bantay_ac; psql -X -q -v ON_ERROR_STOP=1 -d bantay_ac -f records_autoconfirm_rehearsal.sql'"
-- Actors: A admin (own person PA); B member (own person PB); C read-only carer of PB; D creator + writer of no-login PD; F disabled member.
-- The loader runs as the postgres role: no auth.uid(), RLS bypassed (superuser); the stamp trigger is what is rehearsed.
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
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000d', 'd@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000f', 'f@example.com', '{"provider":"google"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
-- Supabase Storage stub (only what 0008 and 0010 touch)
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
\ir ../migrations/0008_records.sql
insert into public.app_roles (user_id, role, disabled) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false), ('00000000-0000-0000-0000-00000000000b', 'member', false),
 ('00000000-0000-0000-0000-00000000000c', 'member', false), ('00000000-0000-0000-0000-00000000000d', 'member', false),
 ('00000000-0000-0000-0000-00000000000f', 'member', true);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Test A', '00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Test B', '00000000-0000-0000-0000-00000000000b'),
 ('10000000-0000-0000-0000-0000000000d1', null, 'Test Dependent', '00000000-0000-0000-0000-00000000000d');
insert into public.carers values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-0000000000b1', false);
\ir ../migrations/0010_people_profile.sql
-- a confirmed row from before 0013 (confirmed by a person): it must keep working and stay confirmed
insert into public.allergies (id, person_id, substance, status, confirmed_by, confirmed_at)
  values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', 'none', 'draft', null, null);
\ir ../migrations/0013_records_autoconfirm.sql
-- 0013 must be safe to run twice
\ir ../migrations/0013_records_autoconfirm.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon;

select pg_temp.ok((select count(*) = 14 from information_schema.columns where table_schema = 'public' and column_name = 'confirmed_source'), 'confirmed_source exists on all 14 records tables');
select pg_temp.ok((select aliases = '{}' and sex is null and address is null from public.people where id = '10000000-0000-0000-0000-0000000000b1'), 'existing people get empty aliases and null sex / address');

-- ===== the loader (postgres role, no user) =====
insert into public.test_catalog (code, name, unit) values ('zz_test', 'Test', 'mg/dL') on conflict do nothing;
insert into public.documents (id, person_id, kind, status, confidence, confirmed_source)
  values ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'lab', 'confirmed', 0.95, 'auto');
select pg_temp.ok((select status = 'confirmed' and confirmed_source = 'auto' and confirmed_by is null and confirmed_at is not null
                   from public.documents where id = '30000000-0000-0000-0000-0000000000b1'), 'loader inserts an auto-confirmed document: confirmed_at stamped, no user, source auto');
insert into public.lab_results (id, person_id, document_id, test_code, name_raw, value_num, unit_raw, collected_at, status, confidence, confirmed_source)
  values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', 'zz_test', 'x', 5, 'mg/dL', now(), 'confirmed', 0.9, 'auto');
select pg_temp.ok((select count(*) = 1 and bool_and(deleted_at is null) from public.readings where lab_result_id = '40000000-0000-0000-0000-000000000001'), 'an auto-confirmed lab result feeds the trend (confidence exactly at the floor)');
select pg_temp.ok(pg_temp.fails($$insert into public.lab_results (person_id, name_raw, value_num, status, confidence, confirmed_source) values ('10000000-0000-0000-0000-0000000000b1', 'x', 1, 'confirmed', 0.89, 'auto')$$), 'below the floor is refused');
select pg_temp.ok(pg_temp.fails($$insert into public.lab_results (person_id, name_raw, value_num, status, confidence) values ('10000000-0000-0000-0000-0000000000b1', 'x', 1, 'confirmed', 0.99)$$), 'confirmed without confirmed_source auto is refused (old rule)');
select pg_temp.ok(pg_temp.fails($$insert into public.lab_results (person_id, name_raw, value_num, status, confirmed_source) values ('10000000-0000-0000-0000-0000000000b1', 'x', 1, 'confirmed', 'auto')$$), 'null confidence is refused');
select pg_temp.ok(pg_temp.fails($$insert into public.lab_results (person_id, name_raw, value_num, status, confidence, confirmed_source) values ('10000000-0000-0000-0000-0000000000b1', 'x', 1, 'confirmed', 0.99, 'user')$$), 'the loader cannot claim a user');
insert into public.lab_results (id, person_id, name_raw, value_num, status, confidence, confirmed_source)
  values ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000b1', 'low', 1, 'draft', 0.5, 'auto');
select pg_temp.ok((select confirmed_source is null and confirmed_at is null and confirmed_by is null from public.lab_results where id = '40000000-0000-0000-0000-000000000002'), 'a draft never keeps a confirm stamp, even if the loader sent one');
insert into public.lab_results (id, person_id, name_raw, value_num, status, confidence, confirmed_source)
  values ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-0000000000b1', 'rej', 1, 'rejected', 0.99, 'auto');
select pg_temp.ok((select status = 'rejected' and confirmed_source is null and confirmed_at is null from public.lab_results where id = '40000000-0000-0000-0000-000000000003'), 'rejected keeps its meaning and carries no stamp');
select pg_temp.ok(pg_temp.fails($$update public.lab_results set status = 'confirmed' where id = '40000000-0000-0000-0000-000000000002'$$), 'a no-user update cannot confirm a draft without auto + floor');
update public.lab_results set status = 'confirmed', confidence = 0.97, confirmed_source = 'auto' where id = '40000000-0000-0000-0000-000000000002';
select pg_temp.ok((select confirmed_source = 'auto' and confirmed_at is not null and confirmed_by is null from public.lab_results where id = '40000000-0000-0000-0000-000000000002'), 'a no-user update can auto-confirm a draft that now clears the floor');
update public.lab_results set status = 'draft' where id = '40000000-0000-0000-0000-000000000002';
select pg_temp.ok((select confirmed_source is null and confirmed_at is null from public.lab_results where id = '40000000-0000-0000-0000-000000000002'), 'back to draft clears the stamp');
update public.allergies set substance = 'x' where id = '60000000-0000-0000-0000-000000000001';
select pg_temp.ok((select status = 'draft' and confirmed_source is null from public.allergies where id = '60000000-0000-0000-0000-000000000001'), 'a maintenance update leaves a pre-0013 draft alone');
-- identifiers
insert into public.person_identifiers (id, person_id, id_type, id_number, status, confidence, confirmed_source)
  values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', 'philhealth', '000-TEST-111', 'confirmed', 0.95, 'auto');
select pg_temp.ok((select confirmed_source = 'auto' from public.person_identifiers), 'identifiers use the same stamp');
select pg_temp.ok(pg_temp.fails($$insert into public.person_identifiers (person_id, id_type, id_number) values ('10000000-0000-0000-0000-0000000000b1', 'philhealth', '000-TEST-111')$$), 'the same number twice for a person is refused');
select pg_temp.ok(pg_temp.fails($$insert into public.person_identifiers (person_id, id_type, id_number) values ('10000000-0000-0000-0000-0000000000b1', 'visa_x', '123456')$$), 'unknown id_type refused');

-- ===== B: member, own person =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.lab_results) = 3 and (select count(*) from public.person_identifiers) = 1, 'self sees own rows and identifiers');
select pg_temp.ok(not pg_temp.fails($$insert into public.lab_results (id, person_id, name_raw, value_num, status, confidence, confirmed_source) values ('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-0000000000b1', 'spoof', 1, 'confirmed', 0.1, 'auto')$$), 'a person confirming (any confidence) is allowed, as THEMSELVES');
select pg_temp.ok((select confirmed_source = 'user' and confirmed_by = '00000000-0000-0000-0000-00000000000b' from public.lab_results where id = '40000000-0000-0000-0000-000000000009'), 'the trigger turns a spoofed auto into user + their own id');
update public.lab_results set value_num = 6 where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.ok((select confirmed_source = 'user' and confirmed_by = '00000000-0000-0000-0000-00000000000b' from public.lab_results where id = '40000000-0000-0000-0000-000000000001'), 'editing an auto row makes the editor the one who vouches');
update public.lab_results set status = 'rejected' where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.ok((select confirmed_source is null and confirmed_by is null from public.lab_results where id = '40000000-0000-0000-0000-000000000001'), 'rejecting clears the stamp');
select pg_temp.ok(not pg_temp.fails($$update public.people set sex = 'female', address = 'Test Street 1', aliases = '{"Test Alias"}' where id = '10000000-0000-0000-0000-0000000000b1'$$), 'self writes sex, address and aliases');
select pg_temp.ok(pg_temp.fails($$update public.people set sex = 'x' where id = '10000000-0000-0000-0000-0000000000b1'$$), 'bad sex refused');
select pg_temp.ok(pg_temp.fails($$update public.people set aliases = array_fill('x'::text, array[21]) where id = '10000000-0000-0000-0000-0000000000b1'$$), 'oversized alias list refused');
select pg_temp.ok(pg_temp.fails($$update public.people set auth_user_id = null where id = '10000000-0000-0000-0000-0000000000b1'$$), 'identity column still not writable');
update public.people set address = 'hacked' where id = '10000000-0000-0000-0000-0000000000a1';
reset role;
select pg_temp.ok((select count(*) from public.people where address = 'hacked') = 0, 'member cannot write another member profile');
select pg_temp.ok((select deleted_at is not null from public.readings where lab_result_id = '40000000-0000-0000-0000-000000000001'), 'rejecting tombstoned the reading');

-- ===== C: read-only carer of PB =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.lab_results where status = 'confirmed') = 1 and (select count(*) from public.lab_results where status <> 'confirmed') = 0, 'carer sees confirmed rows only (the user-confirmed one), no drafts or rejected');
select pg_temp.ok((select count(*) from public.person_identifiers) = 0, 'carer sees no identifiers, even confirmed');
select pg_temp.ok(pg_temp.fails($$insert into public.person_identifiers (person_id, id_type, id_number) values ('10000000-0000-0000-0000-0000000000b1', 'sss', '12345')$$), 'carer cannot add identifiers');

-- ===== D: stranger (writer of another dependent) =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok((select count(*) from public.person_identifiers) = 0 and (select count(*) from public.lab_results) = 0, 'stranger sees nothing');
select pg_temp.ok(pg_temp.fails($$insert into public.person_identifiers (person_id, id_type, id_number) values ('10000000-0000-0000-0000-0000000000b1', 'sss', '12345')$$), 'stranger cannot add identifiers to PB');
select pg_temp.ok(not pg_temp.fails($$insert into public.person_identifiers (person_id, id_type, id_number, status) values ('10000000-0000-0000-0000-0000000000d1', 'sss', '12345', 'confirmed')$$), 'writer adds identifiers for own dependent');
select pg_temp.ok((select confirmed_source = 'user' from public.person_identifiers), 'and is stamped as the user');

-- ===== A: admin =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.person_identifiers) = 2, 'admin sees every identifier');

-- ===== anon =====
set role anon;
select pg_temp.ok(pg_temp.fails($$select count(*) from public.person_identifiers$$), 'anon has no access to identifiers');
reset role;
\echo RECORDS AUTOCONFIRM REHEARSAL DONE
