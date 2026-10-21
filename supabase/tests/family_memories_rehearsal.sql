-- Rehearsal for 0023_family_memories.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002 and 0003.
-- Run (WSL Postgres or any local Postgres 15+):
--   su postgres -c 'dropdb --if-exists bantay_mem; createdb bantay_mem; psql -X -q -v ON_ERROR_STOP=1 -d bantay_mem -f family_memories_rehearsal.sql'
-- Actors: A admin; B member (uploader); C member; D disabled member; E signed in but with no app_roles row. anon is the logged-out role.
-- NOT YET RUN: no Postgres on the build PC (session 8). Run it before applying 0023.
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
 ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000d', 'd@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000e', 'e@example.com', '{"provider":"google"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
insert into public.app_roles (user_id, role, disabled) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false), ('00000000-0000-0000-0000-00000000000b', 'member', false),
 ('00000000-0000-0000-0000-00000000000c', 'member', false), ('00000000-0000-0000-0000-00000000000d', 'member', true);

\ir ../migrations/0023_family_memories.sql
-- 0023 must be safe to run twice
\ir ../migrations/0023_family_memories.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
create function pg_temp.n(q text) returns int language plpgsql as $$ declare c int; begin execute 'with u as (' || q || ' returning 1) select count(*) from u' into c; return c; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text), pg_temp.n(text) to authenticated, anon, service_role;

select pg_temp.ok((select not public and file_size_limit = 3145728 and allowed_mime_types = array['image/jpeg'] from storage.buckets where id = 'memories'), 'the memories bucket is private, 3 MB, jpeg only');

-- ===== B uploads =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into storage.objects (bucket_id, name) values ('memories', '00000000-0000-0000-0000-00000000000b/50000000-0000-0000-0000-000000000001.jpg');
select pg_temp.ok(true, 'a member uploads under their own folder');
select pg_temp.ok(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('memories', '00000000-0000-0000-0000-00000000000c/50000000-0000-0000-0000-000000000002.jpg')$$), 'a member cannot upload into someone else''s folder');
insert into public.family_photos (client_id, storage_path, caption, taken_on)
  values ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b/50000000-0000-0000-0000-000000000001.jpg', 'Sunday lunch', '2026-10-12');
select pg_temp.ok((select uploaded_by = '00000000-0000-0000-0000-00000000000b' from public.family_photos), 'uploaded_by is stamped from auth.uid()');
select pg_temp.ok(pg_temp.fails($$insert into public.family_photos (client_id, storage_path) values ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c/50000000-0000-0000-0000-000000000003.jpg')$$), 'a row must point into the uploader''s own folder');
select pg_temp.ok(pg_temp.fails($$insert into public.family_photos (client_id, storage_path, uploaded_by) values ('60000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b/50000000-0000-0000-0000-000000000004.jpg', '00000000-0000-0000-0000-00000000000c')$$), 'cannot upload as someone else');
select pg_temp.ok(pg_temp.fails($$insert into public.family_photos (client_id, storage_path) values ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b/50000000-0000-0000-0000-000000000005.jpg')$$), 'client_id is unique (retry-safe)');
select pg_temp.ok(pg_temp.fails($$insert into public.family_photos (client_id, storage_path) values ('60000000-0000-0000-0000-000000000006', 'not-a-path.jpg')$$), 'a malformed path is refused');
select pg_temp.ok(pg_temp.fails($$insert into public.family_photos (client_id, storage_path, caption) values ('60000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-00000000000b/50000000-0000-0000-0000-000000000007.jpg', repeat('x', 141))$$), 'a caption is 140 characters at most');

-- ===== another active member reads; others do not =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.family_photos) = 1, 'another active member reads the photo');
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'memories') = 1, 'and the object');
select pg_temp.ok(pg_temp.fails($$update public.family_photos set storage_path = '00000000-0000-0000-0000-00000000000c/50000000-0000-0000-0000-000000000009.jpg'$$), 'nothing but caption and deleted_at can be updated');
select pg_temp.ok(pg_temp.n($$update public.family_photos set deleted_at = now()$$) = 0, 'a non-uploader cannot delete');
select pg_temp.ok(pg_temp.n($$delete from storage.objects where bucket_id = 'memories'$$) = 0, 'a non-uploader cannot delete the object');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok((select count(*) from public.family_photos) = 0 and (select count(*) from storage.objects where bucket_id = 'memories') = 0, 'a disabled member reads nothing');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select pg_temp.ok((select count(*) from public.family_photos) = 0 and pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('memories', '00000000-0000-0000-0000-00000000000e/50000000-0000-0000-0000-00000000000e.jpg')$$), 'a signed-in user with no family role reads and uploads nothing');
reset role; reset request.jwt.claim.sub;
set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.family_photos$$), 'anon cannot read the table');
select pg_temp.ok(not exists (select 1 from storage.objects where bucket_id = 'memories'), 'anon sees no objects');
reset role;

-- ===== the uploader soft-deletes; family stops seeing it; the uploader and an admin still can =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update public.family_photos set deleted_at = now();
select pg_temp.ok((select count(*) from public.family_photos) = 1, 'the uploader still sees their deleted row (the update does not hit its own read policy)');
delete from storage.objects where bucket_id = 'memories';
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'memories') = 0, 'the uploader removes the object');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.family_photos) = 0, 'family no longer sees a deleted photo');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.family_photos) = 1, 'an admin still sees it');
reset role; reset request.jwt.claim.sub;

-- ===== an admin can delete someone else's photo =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into storage.objects (bucket_id, name) values ('memories', '00000000-0000-0000-0000-00000000000b/50000000-0000-0000-0000-00000000000a.jpg');
insert into public.family_photos (client_id, storage_path) values ('60000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b/50000000-0000-0000-0000-00000000000a.jpg');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok(pg_temp.n($$update public.family_photos set deleted_at = now() where client_id = '60000000-0000-0000-0000-00000000000a'$$) = 1, 'an admin soft-deletes another member''s photo');
select pg_temp.ok(pg_temp.n($$delete from storage.objects where bucket_id = 'memories'$$) = 1, 'and removes the object');
reset role; reset request.jwt.claim.sub;

-- ===== down, then up again =====
\ir ../migrations/0023_family_memories.down.sql
select pg_temp.ok(to_regclass('public.family_photos') is null and not exists (select 1 from storage.buckets where id = 'memories') and to_regprocedure('public.is_family_member()') is null, 'down removes the table, bucket and helpers');
\ir ../migrations/0023_family_memories.down.sql
\ir ../migrations/0023_family_memories.sql
select pg_temp.ok(to_regclass('public.family_photos') is not null, 'up again after down works');
\echo ALL PASS
