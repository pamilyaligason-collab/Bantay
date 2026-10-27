-- Rehearsal for 0036_scan_skip.sql (on top of 0020) on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002, 0003, 0008, 0010 and 0013.
-- Run (WSL Postgres or any local Postgres 15+):
--   su postgres -c 'dropdb --if-exists bantay_scan; createdb bantay_scan; psql -X -q -v ON_ERROR_STOP=1 -d bantay_scan -f scan_skip_rehearsal.sql'
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
\ir ../migrations/0036_scan_skip.sql
-- 0036 must be safe to run twice
\ir ../migrations/0036_scan_skip.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon, service_role;
-- ages a scan without the stamp trigger moving updated_at forward
create function pg_temp.age(doc uuid, created interval, updated interval) returns void language plpgsql as $$ begin
  alter table public.source_files disable trigger source_files_stamp;
  update public.source_files set created_at = now() - created, updated_at = now() - updated where document_id = doc;
  alter table public.source_files enable trigger source_files_stamp;
end $$;


-- doc 101: three 'new' pages -> due and claimed. doc 102: page 1 'new', pages 2-3 'skipped' -> neither due nor claimed, rows untouched.
insert into public.documents (id, person_id, kind, status, page_count, created_by) values
 ('30000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-0000000000b1', 'lab', 'draft', 3, '00000000-0000-0000-0000-00000000000b'),
 ('30000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-0000000000b1', 'lab', 'draft', 3, '00000000-0000-0000-0000-00000000000b');
insert into public.source_files (person_id, storage_path, document_id, page_no, name, mime, ingest_status) values
 ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1'||'/a/p01.jpg', '30000000-0000-0000-0000-000000000101', 1, 'p01.jpg', 'image/jpeg', 'new'),
 ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1'||'/a/p02.jpg', '30000000-0000-0000-0000-000000000101', 2, 'p02.jpg', 'image/jpeg', 'new'),
 ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1'||'/a/p03.jpg', '30000000-0000-0000-0000-000000000101', 3, 'p03.jpg', 'image/jpeg', 'new'),
 ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1'||'/b/p01.jpg', '30000000-0000-0000-0000-000000000102', 1, 'p01.jpg', 'image/jpeg', 'new'),
 ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1'||'/b/p02.jpg', '30000000-0000-0000-0000-000000000102', 2, 'p02.jpg', 'image/jpeg', 'skipped'),
 ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1'||'/b/p03.jpg', '30000000-0000-0000-0000-000000000102', 3, 'p03.jpg', 'image/jpeg', 'skipped');
select pg_temp.age('30000000-0000-0000-0000-000000000101', '5 minutes', '5 minutes');
select pg_temp.age('30000000-0000-0000-0000-000000000102', '5 minutes', '5 minutes');
select pg_temp.ok((select array_agg(d) from public.records_scan_due() d) = array['30000000-0000-0000-0000-000000000101'::uuid], 'all-new document is due; the mixed new+skipped document is not');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000102') = 0, 'the mixed document is not claimed');
select pg_temp.ok((select array_agg(ingest_status order by page_no) from public.source_files where document_id = '30000000-0000-0000-0000-000000000102') = array['new','skipped','skipped'], 'its rows stay exactly as they were (page 1 still new)');
select pg_temp.ok((select max(ingest_tries) from public.source_files where document_id = '30000000-0000-0000-0000-000000000102') = 0, 'and no try was counted');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000101') = 3, 'the all-new document is claimed, all 3 pages');
select pg_temp.ok((select bool_and(ingest_status = 'reading') from public.source_files where document_id = '30000000-0000-0000-0000-000000000101'), 'its pages are reading');
-- a document that gains a skipped page later is left alone, and the claim never rewrites the skipped row
update public.source_files set ingest_status = 'skipped' where document_id = '30000000-0000-0000-0000-000000000101' and page_no = 3;
select pg_temp.age('30000000-0000-0000-0000-000000000101', '20 minutes', '11 minutes');
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000101') = 0 and not exists (select 1 from public.records_scan_due() d where d = '30000000-0000-0000-0000-000000000101'::uuid), 'a document that gains a skipped page later is no longer due or claimable');
select pg_temp.ok((select array_agg(ingest_status order by page_no) from public.source_files where document_id = '30000000-0000-0000-0000-000000000101') = array['reading','reading','skipped'], 'the claim left its skipped page and the rest alone');
-- the app (member B) can set still-new pages to skipped under existing RLS
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update public.source_files set ingest_status = 'skipped' where document_id = '30000000-0000-0000-0000-000000000102' and ingest_status = 'new';
reset role; reset request.jwt.claim.sub;
select pg_temp.ok((select bool_and(ingest_status = 'skipped') from public.source_files where document_id = '30000000-0000-0000-0000-000000000102'), 'the uploader may mark the still-new pages skipped (source_files_update)');
-- grants: service role only
set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.records_scan_due()$$), 'anon cannot list scans');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.fails($$select public.records_scan_claim('30000000-0000-0000-0000-000000000101')$$), 'a member cannot claim');
reset role; reset request.jwt.claim.sub;
set role service_role;
select pg_temp.ok(not pg_temp.fails($$select * from public.records_scan_due(5)$$), 'the service role lists');
reset role;
-- down restores 0020 (twice is fine); up again works
\ir ../migrations/0036_scan_skip.down.sql
\ir ../migrations/0036_scan_skip.down.sql
select pg_temp.ok(to_regprocedure('public.records_scan_claim(uuid,interval,int)') is not null, 'down keeps the 0020 functions');
\ir ../migrations/0036_scan_skip.sql
select pg_temp.ok(public.records_scan_claim('30000000-0000-0000-0000-000000000102') = 0, 'up again after down works');
\echo ALL PASS
