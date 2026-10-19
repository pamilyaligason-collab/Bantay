-- Rehearsal for 0010_people_profile.sql and 0011_family_profiles_photo.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002 and 0008.
-- Run (WSL Postgres 18):
--   wsl -d Ubuntu -- bash -c "service postgresql start >/dev/null; cd /mnt/d/Claude/Bantay/.claude/worktrees/bantay-status-verify-3737fd/supabase/tests && su postgres -c 'dropdb --if-exists bantay_pp; createdb bantay_pp; psql -X -q -v ON_ERROR_STOP=1 -d bantay_pp -f people_profile_rehearsal.sql'"
-- Actors: A admin (own person PA); B member (own person PB); C read-only carer of PB; D creator + writer of no-login PD; F disabled member.
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
-- people rows exist before 0010 so the "add column" path is rehearsed on real data
insert into public.app_roles (user_id, role, disabled) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false), ('00000000-0000-0000-0000-00000000000b', 'member', false),
 ('00000000-0000-0000-0000-00000000000c', 'member', false), ('00000000-0000-0000-0000-00000000000d', 'member', false),
 ('00000000-0000-0000-0000-00000000000f', 'member', true);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Test A', '00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Test B', '00000000-0000-0000-0000-00000000000b'),
 ('10000000-0000-0000-0000-0000000000d1', null, 'Test Dependent', '00000000-0000-0000-0000-00000000000d');
insert into public.carers values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-0000000000b1', false);
\ir ../migrations/0006_family_profiles.sql
\ir ../migrations/0010_people_profile.sql
-- 0010 must be safe to run twice
\ir ../migrations/0010_people_profile.sql
\ir ../migrations/0011_family_profiles_photo.sql
\ir ../migrations/0011_family_profiles_photo.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon;

select pg_temp.ok((select allergies = '{}' and conditions = '{}' and medicines = '{}' and phone is null and blood_type is null from public.people where id = '10000000-0000-0000-0000-0000000000b1'), 'existing people get empty lists and null profile fields');
select pg_temp.ok((select count(*) from storage.buckets where id = 'avatars' and not public) = 1, 'avatars bucket exists and is private');

-- B: member, own person
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(not pg_temp.fails($$update public.people set phone = '+63 912 345 6789', birthdate = '1950-05-04', blood_type = 'O+', allergies = '{Penicillin}', conditions = '{Diabetes,"High blood pressure"}', medicines = '{Metformin}', photo_path = '10000000-0000-0000-0000-0000000000b1.jpg' where id = '10000000-0000-0000-0000-0000000000b1'$$), 'self updates own profile');
select pg_temp.ok((select phone = '+63 912 345 6789' and blood_type = 'O+' and conditions[2] = 'High blood pressure' from public.people where id = '10000000-0000-0000-0000-0000000000b1'), 'self update landed');
select pg_temp.ok((select updated_at > now() - interval '1 minute' from public.people where id = '10000000-0000-0000-0000-0000000000b1'), 'updated_at is stamped by the trigger');
select pg_temp.ok(pg_temp.fails($$update public.people set blood_type = 'Z+' where id = '10000000-0000-0000-0000-0000000000b1'$$), 'bad blood type refused');
select pg_temp.ok(pg_temp.fails($$update public.people set auth_user_id = null where id = '10000000-0000-0000-0000-0000000000b1'$$), 'identity column not writable');
select pg_temp.ok(pg_temp.fails($$update public.people set created_by = '00000000-0000-0000-0000-00000000000a' where id = '10000000-0000-0000-0000-0000000000b1'$$), 'created_by not writable');
select pg_temp.ok(pg_temp.fails($$update public.people set updated_at = '2000-01-01' where id = '10000000-0000-0000-0000-0000000000b1'$$), 'updated_at not directly writable');
select pg_temp.ok(pg_temp.fails($$update public.people set allergies = array_fill('x'::text, array[31]) where id = '10000000-0000-0000-0000-0000000000b1'$$), 'oversized list refused');
update public.people set phone = 'hacked' where id = '10000000-0000-0000-0000-0000000000a1';
select pg_temp.ok((select count(*) from public.people where phone = 'hacked') = 0, 'member cannot update another member');
update public.people set phone = 'hacked' where id = '10000000-0000-0000-0000-0000000000d1';
select pg_temp.ok((select count(*) from public.people where phone = 'hacked') = 0, 'member cannot update a stranger dependent');
-- storage as B
select pg_temp.ok(not pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('avatars', '10000000-0000-0000-0000-0000000000b1.jpg')$$), 'self uploads own avatar');
select pg_temp.ok(not pg_temp.fails($$update storage.objects set name = name where bucket_id = 'avatars'$$), 'self can replace own avatar');
select pg_temp.ok(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('avatars', '10000000-0000-0000-0000-0000000000a1.jpg')$$), 'member cannot upload another member avatar');
select pg_temp.ok(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('avatars', '10000000-0000-0000-0000-0000000000b1.png')$$), 'only <person_id>.jpg names');
select pg_temp.ok(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('avatars', 'b1/x.jpg')$$), 'malformed avatar name refused');

-- C: read-only carer of PB, still a family member
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
update public.people set phone = 'hacked' where id = '10000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select count(*) from public.people where phone = 'hacked') = 0, 'read-only carer cannot update the profile');
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'avatars') = 1, 'any family member reads avatars');
select pg_temp.ok(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('avatars', '10000000-0000-0000-0000-0000000000b1.jpg')$$), 'read-only carer cannot upload');

-- D: creator and writer of the no-login PD
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok(not pg_temp.fails($$update public.people set phone = '0917', conditions = '{Asthma}' where id = '10000000-0000-0000-0000-0000000000d1'$$), 'writer carer updates the dependent');
select pg_temp.ok((select phone = '0917' from public.people where id = '10000000-0000-0000-0000-0000000000d1'), 'writer update landed');
select pg_temp.ok(not pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('avatars', '10000000-0000-0000-0000-0000000000d1.jpg')$$), 'writer carer uploads the dependent avatar');
select pg_temp.ok(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('avatars', '10000000-0000-0000-0000-0000000000b1.jpg')$$), 'writer carer cannot upload for a stranger');

-- A: admin. RLS shows an admin only their own and carer rows (select stays as 0001), so the admin-members function (service role) does the cross-member edits.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok(not pg_temp.fails($$update public.people set phone = '0999' where id = '10000000-0000-0000-0000-0000000000a1'$$), 'admin updates own profile');
select pg_temp.ok(not pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('avatars', '10000000-0000-0000-0000-0000000000a1.jpg')$$), 'admin uploads an avatar');
select pg_temp.ok(not pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('avatars', '10000000-0000-0000-0000-0000000000c1.jpg')$$), 'admin uploads for any person id');
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'avatars') >= 3, 'admin reads avatars');

-- family_profiles() (0011): returns photo_path and keeps its columns; anon is refused
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select photo_path = '10000000-0000-0000-0000-0000000000b1.jpg' from public.family_profiles() where person_id = '10000000-0000-0000-0000-0000000000b1'), 'family_profiles returns photo_path');
select pg_temp.ok((select count(*) from public.family_profiles() where display_name is not null and provider is not null) >= 2, 'family_profiles keeps name and provider');
select pg_temp.ok((select count(*) from pg_proc where proname = 'family_profiles' and pronamespace = 'public'::regnamespace and prosecdef) = 1, 'family_profiles is security definer, one overload');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000f';
select pg_temp.ok((select count(*) from public.family_profiles()) = 0, 'disabled member gets no family list');

-- F: disabled member reads nothing; anon nothing
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000f';
select pg_temp.ok((select count(*) from storage.objects where bucket_id = 'avatars') = 0, 'disabled member reads no avatars');
set role anon; set request.jwt.claim.sub = '';
select pg_temp.ok(pg_temp.fails($$select * from storage.objects where bucket_id = 'avatars'$$), 'anon has no storage access');
select pg_temp.ok(pg_temp.fails($$update public.people set phone = 'x'$$), 'anon cannot update people');
select pg_temp.ok(pg_temp.fails($$select * from public.family_profiles()$$), 'anon cannot call family_profiles');
reset role;
\echo PEOPLE PROFILE REHEARSAL DONE
