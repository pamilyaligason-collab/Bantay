-- Rehearsal for 0027_family_messages.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002 and 0003.
-- Run (WSL Postgres or any local Postgres 15+):
--   wsl psql -v ON_ERROR_STOP=1 -f supabase/tests/family_messages_rehearsal.sql
-- Actors: A admin; B member (sender); C member; D disabled member; E signed in but with no app_roles row. anon is the logged-out role.
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
grant select on storage.objects to anon; -- as on Supabase: anon has the grant, RLS decides the rows
insert into public.app_roles (user_id, role, disabled) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false), ('00000000-0000-0000-0000-00000000000b', 'member', false),
 ('00000000-0000-0000-0000-00000000000c', 'member', false), ('00000000-0000-0000-0000-00000000000d', 'member', true);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('70000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Bee', '00000000-0000-0000-0000-00000000000b'),
 ('70000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'Cee', '00000000-0000-0000-0000-00000000000c');

\ir ../migrations/0023_family_memories.sql
\ir ../migrations/0027_family_messages.sql
-- 0027 must be safe to run twice
\ir ../migrations/0027_family_messages.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
create function pg_temp.n(q text) returns int language plpgsql as $$ declare c int; begin execute 'with u as (' || q || ' returning 1) select count(*) from u' into c; return c; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text), pg_temp.n(text) to authenticated, anon, service_role;

select pg_temp.ok((select not public and file_size_limit = 10485760 and not ('image/png' = any (allowed_mime_types)) and 'audio/webm' = any (allowed_mime_types) from storage.buckets where id = 'family-messages'), 'the bucket is private, 10 MB, a short type list');

-- ===== B sends =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.family_messages (client_id, kind, body) values ('60000000-0000-0000-0000-000000000001', 'text', 'Kumain na ba kayo?');
select pg_temp.ok((select sender_id = '00000000-0000-0000-0000-00000000000b' and sender_person_id = '70000000-0000-0000-0000-00000000000b' from public.family_messages), 'sender and person are stamped from auth.uid()');
select pg_temp.ok(pg_temp.fails($$insert into public.family_messages (client_id, kind, body, sender_id) values ('60000000-0000-0000-0000-000000000002', 'text', 'hi', '00000000-0000-0000-0000-00000000000c')$$), 'cannot send as someone else');
select pg_temp.ok(pg_temp.fails($$insert into public.family_messages (client_id, kind, body) values ('60000000-0000-0000-0000-000000000001', 'text', 'again')$$), 'client_id is unique (retry-safe)');
select pg_temp.ok(pg_temp.fails($$insert into public.family_messages (client_id, kind) values ('60000000-0000-0000-0000-000000000003', 'text')$$), 'a text message needs a body');
select pg_temp.ok(pg_temp.fails($$insert into public.family_messages (client_id, kind, body) values ('60000000-0000-0000-0000-000000000004', 'text', repeat('x', 2001))$$), 'a body is 2000 characters at most');
select pg_temp.ok(pg_temp.fails($$insert into public.family_messages (client_id, kind, attachment_path) values ('60000000-0000-0000-0000-000000000005', 'voice', '00000000-0000-0000-0000-00000000000b/50000000-0000-0000-0000-000000000005.webm')$$) = false, 'a voice note row with its own path is accepted');
select pg_temp.ok(pg_temp.fails($$insert into public.family_messages (client_id, kind, attachment_path) values ('60000000-0000-0000-0000-000000000006', 'file', '00000000-0000-0000-0000-00000000000c/50000000-0000-0000-0000-000000000006.pdf')$$), 'an attachment must sit in the sender''s own folder');
select pg_temp.ok(pg_temp.fails($$insert into public.family_messages (client_id, kind, attachment_path) values ('60000000-0000-0000-0000-000000000007', 'file', 'not-a-path.exe')$$), 'a malformed path is refused');
select pg_temp.ok(pg_temp.fails($$insert into public.family_messages (client_id, kind, body, attachment_path) values ('60000000-0000-0000-0000-000000000008', 'text', 'hi', '00000000-0000-0000-0000-00000000000b/50000000-0000-0000-0000-000000000008.pdf')$$), 'a text message carries no attachment');
select pg_temp.ok(pg_temp.fails($$insert into public.family_messages (client_id, kind, attachment_path, duration_s) values ('60000000-0000-0000-0000-000000000009', 'voice', '00000000-0000-0000-0000-00000000000b/50000000-0000-0000-0000-000000000009.webm', 61)$$), 'a voice note is 60 seconds at most');
insert into storage.objects (bucket_id, name) values ('family-messages', '00000000-0000-0000-0000-00000000000b/50000000-0000-0000-0000-000000000005.webm');
select pg_temp.ok(true, 'a member uploads under their own folder');
select pg_temp.ok(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('family-messages', '00000000-0000-0000-0000-00000000000c/50000000-0000-0000-0000-00000000000f.webm')$$), 'a member cannot upload into someone else''s folder');

-- ===== another active member reads; others do not =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.family_messages) = 2, 'another active member reads the thread');
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'family-messages') = 1, 'and the attachment');
select pg_temp.ok(pg_temp.fails($$update public.family_messages set body = 'edited'$$), 'nothing but deleted_at can be updated');
select pg_temp.ok(pg_temp.n($$update public.family_messages set deleted_at = now()$$) = 0, 'a non-sender cannot delete');
select pg_temp.ok(pg_temp.n($$delete from storage.objects where bucket_id = 'family-messages'$$) = 0, 'a non-sender cannot delete the object');
select pg_temp.ok(pg_temp.fails($$delete from public.family_messages$$), 'no hard delete over REST');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok((select count(*) from public.family_messages) = 0 and (select count(*) from storage.objects where bucket_id = 'family-messages') = 0, 'a disabled member reads nothing');
select pg_temp.ok(pg_temp.fails($$insert into public.family_messages (client_id, kind, body) values ('60000000-0000-0000-0000-00000000000d', 'text', 'hi')$$), 'a disabled member cannot send');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select pg_temp.ok((select count(*) from public.family_messages) = 0 and pg_temp.fails($$insert into public.family_messages (client_id, kind, body) values ('60000000-0000-0000-0000-00000000000e', 'text', 'hi')$$)
  and pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('family-messages', '00000000-0000-0000-0000-00000000000e/50000000-0000-0000-0000-00000000000e.webm')$$), 'a signed-in user with no family role reads, sends and uploads nothing');
reset role; reset request.jwt.claim.sub;
set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.family_messages$$), 'anon cannot read the table');
select pg_temp.ok(pg_temp.fails($$insert into public.family_messages (client_id, kind, body) values ('60000000-0000-0000-0000-0000000000aa', 'text', 'hi')$$), 'anon cannot send');
select pg_temp.ok(not exists (select 1 from storage.objects where bucket_id = 'family-messages'), 'anon sees no objects');
reset role;

-- ===== the sender soft-deletes; family stops seeing it; the sender and an admin still can =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.n($$update public.family_messages set deleted_at = now() where kind = 'text'$$) = 1, 'the sender soft-deletes their message');
select pg_temp.ok(pg_temp.fails($$update public.family_messages set deleted_at = null where kind = 'text'$$), 'a deleted message cannot be undeleted');
delete from storage.objects where bucket_id = 'family-messages';
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'family-messages') = 0, 'the sender removes the object');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.family_messages) = 1, 'family no longer sees a deleted message');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.family_messages) = 2, 'an admin still sees it');
select pg_temp.ok(pg_temp.n($$update public.family_messages set deleted_at = now() where kind = 'voice'$$) = 1, 'an admin soft-deletes another member''s message');
reset role; reset request.jwt.claim.sub;

-- ===== down, then up again =====
\ir ../migrations/0027_family_messages.down.sql
select pg_temp.ok(to_regclass('public.family_messages') is null and not exists (select 1 from storage.buckets where id = 'family-messages') and to_regprocedure('public.family_messages_stamp()') is null, 'down removes the table, bucket and helpers');
\ir ../migrations/0027_family_messages.down.sql
\ir ../migrations/0027_family_messages.sql
select pg_temp.ok(to_regclass('public.family_messages') is not null, 'up again after down works');
\echo ALL PASS
