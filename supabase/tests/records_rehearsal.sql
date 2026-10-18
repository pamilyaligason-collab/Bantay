-- Rehearsal for 0008_records.sql on a THROWAWAY Postgres (never the live project), with the real is_admin() from 0002.
-- Run (WSL Postgres 18):
--   wsl -d Ubuntu -- bash -c "service postgresql start >/dev/null; cd /mnt/d/Claude/Bantay/supabase/tests && su postgres -c 'dropdb --if-exists bantay_rec; createdb bantay_rec; psql -X -q -v ON_ERROR_STOP=1 -d bantay_rec -f records_rehearsal.sql'"
-- Actors: A admin (own person PA); B member (own person PB); C read-only carer of PB; D creator + writer of no-login PD.
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
 ('00000000-0000-0000-0000-00000000000d', 'd@example.com', '{"provider":"google"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
-- Supabase Storage stub (only what 0008 touches)
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
\ir ../migrations/0008_records.sql
insert into public.app_roles (user_id, role) values
 ('00000000-0000-0000-0000-00000000000a', 'admin'), ('00000000-0000-0000-0000-00000000000b', 'member'),
 ('00000000-0000-0000-0000-00000000000c', 'member'), ('00000000-0000-0000-0000-00000000000d', 'member');
create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon;

-- people (as owner; the trigger links D as writer of PD)
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Test A', '00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Test B', '00000000-0000-0000-0000-00000000000b'),
 ('10000000-0000-0000-0000-0000000000d1', null, 'Test Dependent', '00000000-0000-0000-0000-00000000000d');
insert into public.carers values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-0000000000b1', false);

-- server-side load (owner role, no auth.uid()): drafts only
select pg_temp.ok(not pg_temp.fails($$insert into public.source_files (id, drive_file_id, name, mime) values ('20000000-0000-0000-0000-000000000001', 'drv1', 'f1.pdf', 'application/pdf')$$), 'loader inserts an unassigned source file');
select pg_temp.ok(not pg_temp.fails($$insert into public.documents (id, person_id, kind, doc_date) values ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'lab', '2024-03-01')$$), 'loader inserts a draft document');
select pg_temp.ok(pg_temp.fails($$insert into public.lab_results (person_id, name_raw, value_num, status) values ('10000000-0000-0000-0000-0000000000b1', 'x', 1, 'confirmed')$$), 'loader cannot insert a confirmed row');
update public.source_files set person_id = '10000000-0000-0000-0000-0000000000b1', document_id = '30000000-0000-0000-0000-0000000000b1' where id = '20000000-0000-0000-0000-000000000001';
insert into public.source_files (id, drive_file_id, name, mime) values ('20000000-0000-0000-0000-000000000002', 'drv2', 'f2.jpg', 'image/jpeg');

set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.lab_results$$), 'anon has no access to lab_results');
select pg_temp.ok(pg_temp.fails($$select * from public.test_catalog$$), 'anon has no access to test_catalog');
reset role;

-- B: own records
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(not pg_temp.fails($$insert into public.lab_results (id, person_id, document_id, test_code, name_raw, value_num, unit_raw, ref_low, ref_high)
  values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', 'fasting_glucose', 'FBS', 100, 'mg/dL', 70, 110)$$), 'person adds own draft result');
select pg_temp.ok((select count(*) from public.lab_results) = 1, 'person reads own draft');
select pg_temp.ok((select count(*) from public.readings) = 0, 'a draft never reaches readings');
select pg_temp.ok((select count(*) from public.source_files) = 1, 'person sees own file, not the unassigned one');
select pg_temp.ok((select drafts from public.records_queue where kind = 'lab_results') = 1, 'queue counts the draft');
update public.lab_results set status = 'confirmed', confirmed_by = '00000000-0000-0000-0000-00000000000c' where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.ok((select confirmed_by from public.lab_results) = '00000000-0000-0000-0000-00000000000b', 'confirmed_by is the caller, not what was sent');
select pg_temp.ok((select count(*) from public.readings where lab_result_id = '40000000-0000-0000-0000-000000000001' and test = 'fasting_glucose' and value = 100 and lab_low = 70 and source_file_id = 'drv1') = 1, 'confirm creates one reading with lab range and file');
select pg_temp.ok((select (taken_at at time zone 'Asia/Manila')::date from public.readings) = '2024-03-01', 'reading dated from the document (Manila day) when no collected_at');
create temp table rid as select id, client_id from public.readings;
update public.lab_results set value_num = 101 where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from public.readings r join rid using (id, client_id) where r.value = 101) = 1, 'edit of a confirmed result updates the same reading');
select pg_temp.ok(pg_temp.fails($$update public.lab_results set created_by = '00000000-0000-0000-0000-00000000000c'$$) or (select created_by from public.lab_results) is distinct from '00000000-0000-0000-0000-00000000000c', 'created_by cannot change');
-- unit conversion: canonical value trends, lab range in another unit is dropped
insert into public.lab_results (id, person_id, document_id, test_code, name_raw, value_num, unit_raw, value_canonical, ref_low, ref_high, status)
  values ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', 'creatinine', 'Creatinine', 88, 'umol/L', 0.995, 53, 97, 'confirmed');
select pg_temp.ok((select lab_low is null and value = 0.995 and unit = 'mg/dL' from public.readings where lab_result_id = '40000000-0000-0000-0000-000000000002'), 'converted value trends without a mismatched range');
-- unmapped or text result: confirmed but no trend
insert into public.lab_results (person_id, name_raw, value_text, status) values ('10000000-0000-0000-0000-0000000000b1', 'Urine protein', 'negative', 'confirmed');
select pg_temp.ok((select count(*) from public.readings) = 2, 'unmapped text result does not trend');
insert into public.lab_results (person_id, test_code, name_raw, value_num, unit_raw, status) values ('10000000-0000-0000-0000-0000000000b1', 'uric_acid', 'Uric acid', 300, 'mmol/x', 'confirmed');
select pg_temp.ok((select count(*) from public.readings) = 2, 'mapped value in an unconverted unit does not trend');
select pg_temp.ok(pg_temp.fails($$update public.lab_results set person_id = '10000000-0000-0000-0000-0000000000a1' where id = '40000000-0000-0000-0000-000000000002'$$), 'a row cannot move to another person');
select pg_temp.ok(pg_temp.fails($$select * from public.person_aliases where false$$) = false and (select count(*) from public.person_aliases) = 0, 'member sees no aliases');
select pg_temp.ok(pg_temp.fails($$insert into public.person_aliases values ('test b', '10000000-0000-0000-0000-0000000000b1')$$), 'member cannot write aliases');
select pg_temp.ok(pg_temp.fails($$insert into public.test_catalog (code, name, unit) values ('zz', 'z', 'z')$$), 'member cannot edit catalog');
insert into public.prescriptions (id, person_id, document_id, rx_date) values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', '2024-03-01');
insert into public.prescription_items (person_id, prescription_id, line_no, drug_raw) values ('10000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-000000000001', 1, 'x');

-- D-63: B adds an ID card picture for themselves
select pg_temp.ok(not pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('records', '10000000-0000-0000-0000-0000000000b1/card-front.jpg')$$), 'person uploads to own folder');
select pg_temp.ok(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('records', '10000000-0000-0000-0000-0000000000d1/x.jpg')$$), 'person cannot upload into another person folder');
select pg_temp.ok(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('records', 'not-a-uuid/x.jpg')$$), 'malformed path refused');
insert into public.documents (id, person_id, kind, card_type, status) values ('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000b1', 'id_card', 'senior', 'confirmed');
select pg_temp.ok(not pg_temp.fails($$insert into public.source_files (person_id, storage_path, name, mime, side, document_id) values ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1/card-front.jpg', 'card', 'image/jpeg', 'front', '30000000-0000-0000-0000-0000000000c1')$$), 'card picture row without a Drive id yet');
select pg_temp.ok(pg_temp.fails($$insert into public.source_files (person_id, name, mime) values ('10000000-0000-0000-0000-0000000000b1', 'x', 'image/jpeg')$$), 'a file needs a Drive id or a storage path');

-- C: read-only carer of PB
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.documents where kind = 'id_card') = 0, 'read-only carer never sees ID cards, even confirmed');
select pg_temp.ok((select count(*) from storage.objects) = 0, 'read-only carer cannot read card pictures');
select pg_temp.ok((select count(*) from public.lab_results) = 4, 'read-only carer sees confirmed results');
select pg_temp.ok((select count(*) from public.prescription_items) = 0, 'read-only carer does not see drafts');
select pg_temp.ok((select count(*) from public.documents) = 0, 'read-only carer does not see draft documents');
select pg_temp.ok((select count(*) from public.readings) = 2, 'read-only carer sees the trend');
select pg_temp.ok(pg_temp.fails($$insert into public.lab_results (person_id, name_raw, value_num) values ('10000000-0000-0000-0000-0000000000b1', 'x', 1)$$), 'read-only carer cannot add');
update public.lab_results set value_num = 5;
select pg_temp.ok((select count(*) from public.lab_results where value_num = 5) = 0, 'read-only carer cannot edit');
select pg_temp.ok((select count(*) from public.source_files) = 0, 'read-only carer sees no files');

-- D: writer of the no-login PD, stranger to PB
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok((select count(*) from public.lab_results) = 0 and (select count(*) from public.readings) = 0, 'stranger sees nothing of PB');
select pg_temp.ok((select count(*) from storage.objects) = 0 and (select count(*) from public.documents where kind = 'id_card') = 0, 'stranger sees no cards');
select pg_temp.ok(not pg_temp.fails($$insert into public.documents (id, person_id, kind) values ('30000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'vaccination')$$), 'writer adds a document for the dependent');
select pg_temp.ok(not pg_temp.fails($$insert into public.vaccinations (person_id, document_id, vaccine, status) values ('10000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000d1', 'v', 'confirmed')$$), 'writer confirms for the dependent');
select pg_temp.ok(pg_temp.fails($$insert into public.lab_results (person_id, name_raw, value_num) values ('10000000-0000-0000-0000-0000000000b1', 'x', 1)$$), 'stranger cannot add to PB');
select pg_temp.ok(pg_temp.fails($$insert into public.lab_results (person_id, document_id, name_raw, value_num) values ('10000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000b1', 'x', 1)$$), 'cannot attach a result to another person''s document');
select pg_temp.ok(not pg_temp.fails($$insert into public.medications (person_id, name, status, stock_qty, per_day) values ('10000000-0000-0000-0000-0000000000d1', 'm', 'confirmed', 30, 2)$$), 'writer adds a medicine with stock');

-- A: admin manages imports for everyone
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.source_files) = 3, 'admin sees assigned, unassigned and phone-upload files');
select pg_temp.ok((select count(*) from public.documents where kind = 'id_card') = 1 and (select count(*) from storage.objects) = 1, 'admin sees ID cards and pictures');
select pg_temp.ok((select count(*) from public.lab_results) = 4 and (select count(*) from public.prescription_items) = 1, 'admin sees drafts of members');
select pg_temp.ok(not pg_temp.fails($$insert into public.person_aliases values ('test b', '10000000-0000-0000-0000-0000000000b1')$$), 'admin writes aliases');
update public.prescription_items set status = 'confirmed', generic_name = 'g';
select pg_temp.ok((select confirmed_by from public.prescription_items) = '00000000-0000-0000-0000-00000000000a', 'admin confirm is stamped as admin');
select pg_temp.ok((select count(*) from public.readings) = 2, 'admin reads readings (D-34)');
select pg_temp.ok(pg_temp.fails($$insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000b1', now(), 't', 1)$$), 'admin still cannot write readings directly');
update public.lab_results set status = 'rejected' where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.ok((select deleted_at is not null and updated_at > confirmed_at from public.readings where lab_result_id = '40000000-0000-0000-0000-000000000001'), 'rejecting tombstones the reading for phones');
select pg_temp.ok((select confirmed_by is null and confirmed_at is null from public.lab_results where id = '40000000-0000-0000-0000-000000000001'), 'rejected row loses its confirm stamp');
update public.lab_results set status = 'confirmed' where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.ok((select deleted_at is null from public.readings where lab_result_id = '40000000-0000-0000-0000-000000000001'), 're-confirm revives the same reading');
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000c'), 'an auth user can still be deleted');
-- E: a second writer of PD who confirms a row, then leaves (0001 keeps creators of people undeletable on purpose)
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000e');
insert into public.carers values ('00000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-0000000000d1', true);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
insert into public.allergies (person_id, substance, status) values ('10000000-0000-0000-0000-0000000000d1', 'none', 'confirmed');
reset role; set request.jwt.claim.sub = ''; -- the dashboard/admin API deletes users with no user JWT
delete from auth.users where id = '00000000-0000-0000-0000-00000000000e';
select pg_temp.ok((select created_by is null and confirmed_by is null and status = 'confirmed' from public.allergies), 'a user who created and confirmed rows can still be deleted');
\echo RECORDS REHEARSAL DONE
