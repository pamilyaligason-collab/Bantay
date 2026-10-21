-- Rehearsal for 0020_scan_extract.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002, 0003, 0008, 0010 and 0013.
-- Run (WSL Postgres or any local Postgres 15+):
--   su postgres -c 'dropdb --if-exists bantay_scan; createdb bantay_scan; psql -X -q -v ON_ERROR_STOP=1 -d bantay_scan -f scan_extract_rehearsal.sql'
-- Actors: A admin (own person PA); B member (own person PB); C read-only carer of PB. The function is the service role:
-- here the postgres role with no request.jwt.claim.sub (no auth.uid(), RLS bypassed).
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
 ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"provider":"google"}', '{}');
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
 ('00000000-0000-0000-0000-00000000000a', 'admin', false), ('00000000-0000-0000-0000-00000000000b', 'member', false),
 ('00000000-0000-0000-0000-00000000000c', 'member', false);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Test A', '00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Test B', '00000000-0000-0000-0000-00000000000b');
insert into public.carers values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-0000000000b1', false);
\ir ../migrations/0010_people_profile.sql
\ir ../migrations/0013_records_autoconfirm.sql
-- an ID card from before 0020: front and back on one document, both page 1 after the migration, never read
insert into public.documents (id, person_id, kind, card_type, status) values ('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000b1', 'id_card', 'philsys', 'draft');
insert into public.source_files (person_id, storage_path, side, document_id, name, mime) values
 ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1/c1.jpg', 'front', '30000000-0000-0000-0000-0000000000c1', 'card-front.jpg', 'image/jpeg'),
 ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1/c2.jpg', 'back', '30000000-0000-0000-0000-0000000000c1', 'card-back.jpg', 'image/jpeg');
\ir ../migrations/0020_scan_extract.sql
-- 0020 must be safe to run twice
\ir ../migrations/0020_scan_extract.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon, service_role;
-- ages a scan without the stamp trigger moving updated_at forward
create function pg_temp.age(doc uuid, created interval, updated interval) returns void language plpgsql as $$ begin
  alter table public.source_files disable trigger source_files_stamp;
  update public.source_files set created_at = now() - created, updated_at = now() - updated where document_id = doc;
  alter table public.source_files enable trigger source_files_stamp;
end $$;

select pg_temp.ok((select bool_and(page_no = 1) from public.source_files), 'existing files are page 1 (cards keep front/back)');

-- ===== the app (member B) uploads a 2-page lab scan under RLS =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.documents (id, client_id, person_id, kind, status, page_count)
  values ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', 'lab', 'draft', 2);
insert into public.source_files (person_id, storage_path, document_id, page_no, name, mime, size_bytes) values
 ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1/30000000-0000-0000-0000-000000000001/p01.jpg', '30000000-0000-0000-0000-000000000001', 1, 'p01.jpg', 'image/jpeg', 1000);
select pg_temp.ok(pg_temp.fails($$insert into public.source_files (person_id, storage_path, document_id, page_no, name, mime) values ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1/30000000-0000-0000-0000-000000000001/dup.jpg', '30000000-0000-0000-0000-000000000001', 1, 'dup.jpg', 'image/jpeg')$$), 'one file per page of a document');
select pg_temp.ok(pg_temp.fails($$insert into public.source_files (person_id, storage_path, document_id, page_no, name, mime) values ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1/x/p00.jpg', '30000000-0000-0000-0000-000000000001', 0, 'p00.jpg', 'image/jpeg')$$), 'page_no starts at 1');
select pg_temp.ok(pg_temp.fails($$insert into public.documents (person_id, kind, status, page_count) values ('10000000-0000-0000-0000-0000000000b1', 'lab', 'draft', 0)$$), 'page_count is 1..50');
select pg_temp.ok(pg_temp.fails($$select public.records_scan_claim('30000000-0000-0000-0000-000000000001')$$) and pg_temp.fails($$select * from public.records_scan_due()$$), 'a member cannot claim or list scans');
select pg_temp.ok(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('records', '10000000-0000-0000-0000-0000000000a1/30000000-0000-0000-0000-000000000001/p01.jpg')$$), 'a member cannot upload under someone else''s person');
insert into storage.objects (bucket_id, name) values ('records', '10000000-0000-0000-0000-0000000000b1/30000000-0000-0000-0000-000000000001/p01.jpg');
select pg_temp.ok(true, 'a member uploads <person_id>/<document_id>/p01.jpg (the extra folder is fine)');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok(not exists (select 1 from public.documents where id = '30000000-0000-0000-0000-000000000001'), 'a read-only carer does not see the draft scan (so the function refuses that caller)');
reset role; reset request.jwt.claim.sub;

-- ===== the function (service role, no auth.uid()) =====
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000001') = 0, 'page 2 of 2 is missing: nothing to claim');
select pg_temp.age('30000000-0000-0000-0000-000000000001', '5 minutes', '5 minutes');
select pg_temp.ok(not exists (select 1 from public.records_scan_due()), 'an incomplete scan is not due either');
insert into public.source_files (person_id, storage_path, document_id, page_no, name, mime, size_bytes) values
 ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1/30000000-0000-0000-0000-000000000001/p02.jpg', '30000000-0000-0000-0000-000000000001', 2, 'p02.jpg', 'image/jpeg', 1000);
select pg_temp.ok(not exists (select 1 from public.records_scan_due()), 'not due until the newest page is 2 minutes old');
select pg_temp.age('30000000-0000-0000-0000-000000000001', '3 minutes', '3 minutes');
select pg_temp.ok((select array_agg(d) from public.records_scan_due() d) = array['30000000-0000-0000-0000-000000000001'::uuid], 'due after 2 minutes; the old ID card is never due');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000001') = 2, 'the claim takes both pages');
select pg_temp.ok((select bool_and(ingest_status = 'reading' and ingest_tries = 1) from public.source_files where document_id = '30000000-0000-0000-0000-000000000001'), 'pages are reading, try 1');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000001') = 0 and not exists (select 1 from public.records_scan_due()), 'a second run cannot take it while it is being read');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-0000000000c1') = 0, 'an ID card is never claimed');

-- the function writes drafts (never confirmed) stamped with the uploader
insert into public.lab_results (id, person_id, document_id, test_code, name_raw, value_num, unit_raw, status, confidence, created_by)
  values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-000000000001', 'hba1c', 'HbA1c', 6.1, '%', 'draft', 0.99, '00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select created_by = '00000000-0000-0000-0000-00000000000b' and status = 'draft' from public.lab_results where id = '40000000-0000-0000-0000-000000000001'), 'a draft written by the service role keeps the uploader as created_by');
select pg_temp.ok(pg_temp.fails($$insert into public.lab_results (person_id, document_id, name_raw, value_num, status, confidence) values ('10000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-000000000001', 'x', 1, 'confirmed', 0.99)$$), 'without confirmed_source auto the server cannot confirm (0013)');
update public.source_files set ingest_status = 'queued', ingest_error = null, ingest_tries = 0 where document_id = '30000000-0000-0000-0000-000000000001' and ingest_status = 'reading';
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000001') = 0, 'a queued scan is not read again');
select pg_temp.ok(pg_temp.fails($$update public.source_files set ingest_error = 'Cholesterol 5.2 high' where document_id = '30000000-0000-0000-0000-000000000001'$$), 'ingest_error takes a short code only, never text from the paper');

-- ===== member B confirms in the app: the 0008 trigger files the reading =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.records_queue where person_id = '10000000-0000-0000-0000-0000000000b1' and kind = 'lab_results') = 1, 'the draft is in the confirm queue');
update public.lab_results set status = 'confirmed' where id = '40000000-0000-0000-0000-000000000001';
reset role; reset request.jwt.claim.sub;
select pg_temp.ok((select confirmed_by = '00000000-0000-0000-0000-00000000000b' from public.lab_results where id = '40000000-0000-0000-0000-000000000001')
  and exists (select 1 from public.readings where lab_result_id = '40000000-0000-0000-0000-000000000001' and deleted_at is null), 'confirmed by the member and filed as a reading');

-- ===== a run that died, and retries =====
insert into public.documents (id, person_id, kind, status, created_by) values ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000b1', 'other', 'draft', '00000000-0000-0000-0000-00000000000b');
insert into public.source_files (person_id, storage_path, document_id, page_no, name, mime) values
 ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1/30000000-0000-0000-0000-000000000002/doc.pdf', '30000000-0000-0000-0000-000000000002', 1, 'doc.pdf', 'application/pdf');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000002') = 1, 'no page_count: whatever pages are there (the app call does not wait 2 minutes)');
select pg_temp.age('30000000-0000-0000-0000-000000000002', '20 minutes', '11 minutes');
select pg_temp.ok((select array_agg(d) from public.records_scan_due() d) = array['30000000-0000-0000-0000-000000000002'::uuid], 'a stale claim is due again');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000002') = 1, 'try 2');
select pg_temp.age('30000000-0000-0000-0000-000000000002', '20 minutes', '11 minutes');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000002') = 1, 'try 3');
select pg_temp.age('30000000-0000-0000-0000-000000000002', '20 minutes', '11 minutes');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000002') = 0, 'a 4th dead run is not claimed');
select pg_temp.ok((select bool_and(ingest_status = 'failed' and ingest_error = 'too_many_tries' and ingest_tries = 0) from public.source_files where document_id = '30000000-0000-0000-0000-000000000002'), 'after 3 dead runs the scan is failed, tries reset');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update public.source_files set ingest_status = 'new' where document_id = '30000000-0000-0000-0000-000000000002';
reset role; reset request.jwt.claim.sub;
select pg_temp.ok((select bool_and(ingest_status = 'new') from public.source_files where document_id = '30000000-0000-0000-0000-000000000002'), 'the app retries a failed scan by setting its pages back to new (existing RLS)');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000002') = 1, 'the retry is claimed');

-- the service role (the function's role) may call both
set role service_role;
select pg_temp.ok(not pg_temp.fails($$select * from public.records_scan_due(5)$$) and not pg_temp.fails($$select public.records_scan_claim('30000000-0000-0000-0000-000000000099')$$), 'the service role claims and lists');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000099') = 0, 'an unknown document claims nothing');
reset role;
set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.records_scan_due()$$), 'anon cannot list scans');
reset role;

-- ===== down, then up again =====
-- down drops page order, so multi-page scans would collide on page 1: rehearse it with the scans removed
delete from public.source_files where document_id <> '30000000-0000-0000-0000-0000000000c1';
\ir ../migrations/0020_scan_extract.down.sql
select pg_temp.ok(to_regprocedure('public.records_scan_due(int,interval,interval)') is null and not exists (select 1 from information_schema.columns where table_name = 'source_files' and column_name = 'page_no'), 'down removes the functions and columns');
\ir ../migrations/0020_scan_extract.sql
select pg_temp.ok((select bool_and(page_no = 1) from public.source_files), 'up again after down works');
\echo ALL PASS
