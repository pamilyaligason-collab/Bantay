-- Rehearsal for 0018_dose_watch.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002, 0003, 0008, 0010, 0013, 0014 and 0016.
-- Run (WSL Postgres or any local Postgres 15+):
--   su postgres -c 'dropdb --if-exists bantay_dw; createdb bantay_dw; psql -X -q -v ON_ERROR_STOP=1 -d bantay_dw -f dose_watch_rehearsal.sql'
-- Actors: A admin (own person PA); B member (own person PB); C read-only carer of PB; D creator + writer of no-login PD.
-- The loader runs as the postgres role: no auth.uid(), RLS bypassed (superuser).
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
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
\ir ../migrations/0008_records.sql
insert into public.app_roles (user_id, role, disabled) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false), ('00000000-0000-0000-0000-00000000000b', 'member', false),
 ('00000000-0000-0000-0000-00000000000c', 'member', false), ('00000000-0000-0000-0000-00000000000d', 'member', false);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Test A', '00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Test B', '00000000-0000-0000-0000-00000000000b'),
 ('10000000-0000-0000-0000-0000000000d1', null, 'Test Dependent', '00000000-0000-0000-0000-00000000000d');
insert into public.carers values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-0000000000b1', false);
\ir ../migrations/0010_people_profile.sql
\ir ../migrations/0013_records_autoconfirm.sql
\ir ../migrations/0014_medications_live.sql
\ir ../migrations/0016_medications_softdelete.sql
\ir ../migrations/0018_dose_watch.sql
-- 0018 must be safe to run twice
\ir ../migrations/0018_dose_watch.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon, service_role;

-- ===== the claim: one push per person, day and slot =====
select pg_temp.ok(public.dose_watch_claim('10000000-0000-0000-0000-0000000000b1', '2026-10-20', '08:00'), 'first claim of a slot wins');
select pg_temp.ok(not public.dose_watch_claim('10000000-0000-0000-0000-0000000000b1', '2026-10-20', '08:00'), 'the same person, day and slot cannot be claimed twice (idempotent)');
select pg_temp.ok(public.dose_watch_claim('10000000-0000-0000-0000-0000000000b1', '2026-10-20', '20:00') and public.dose_watch_claim('10000000-0000-0000-0000-0000000000b1', '2026-10-21', '08:00') and public.dose_watch_claim('10000000-0000-0000-0000-0000000000a1', '2026-10-20', '08:00'),
  'another slot, another day and another person each claim once');
select pg_temp.ok(pg_temp.fails($$select public.dose_watch_claim('10000000-0000-0000-0000-0000000000b1', '2026-10-20', '8am')$$), 'slot must be HH:MM');
select pg_temp.ok((select count(*) from public.dose_watch_sent) = 4, 'four claims are stored');
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dose_watch_sent' and column_name ~ 'name|med|dose|value'), 'the log holds no medicine name or value (B-7)');

-- ===== who can touch it =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.fails($$select * from public.dose_watch_sent$$), 'a signed-in user cannot read the log');
select pg_temp.ok(pg_temp.fails($$insert into public.dose_watch_sent (person_id, day, slot) values ('10000000-0000-0000-0000-0000000000b1', '2026-10-22', '08:00')$$), 'a signed-in user cannot write the log');
select pg_temp.ok(pg_temp.fails($$select public.dose_watch_claim('10000000-0000-0000-0000-0000000000b1', '2026-10-22', '08:00')$$), 'a signed-in user cannot claim');
select pg_temp.ok(pg_temp.fails($$select public.dose_watch_prune()$$), 'a signed-in user cannot prune');
reset role;
set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.dose_watch_sent$$) and pg_temp.fails($$select public.dose_watch_claim('10000000-0000-0000-0000-0000000000b1', '2026-10-22', '08:00')$$), 'anon cannot read or claim');
reset role;
set role service_role;
select pg_temp.ok(not pg_temp.fails($$select public.dose_watch_claim('10000000-0000-0000-0000-0000000000b1', '2026-10-22', '08:00')$$), 'the service role claims');
select pg_temp.ok((select count(*) from public.dose_watch_sent) = 5, 'the service role reads');
reset role;

-- ===== prune: only claims older than 7 days go =====
update public.dose_watch_sent set sent_at = now() - interval '8 days' where day = '2026-10-21';
select public.dose_watch_prune() as pruned \gset
select pg_temp.ok(:pruned = 1 and (select count(*) from public.dose_watch_sent) = 4,'prune forgets claims older than 7 days only');

-- ===== the cascade: deleting a person removes their claims =====
delete from public.people where id = '10000000-0000-0000-0000-0000000000a1';
select pg_temp.ok((select count(*) from public.dose_watch_sent where person_id = '10000000-0000-0000-0000-0000000000a1') = 0, 'claims go with the person');

-- ===== down =====
\ir ../migrations/0018_dose_watch.down.sql
select pg_temp.ok(to_regclass('public.dose_watch_sent') is null and to_regprocedure('public.dose_watch_claim(uuid,date,text)') is null and to_regprocedure('public.dose_watch_prune()') is null, 'down removes the table and both functions');
\ir ../migrations/0018_dose_watch.down.sql
\ir ../migrations/0018_dose_watch.sql
select pg_temp.ok(public.dose_watch_claim('10000000-0000-0000-0000-0000000000b1', '2026-10-20', '08:00'), 'up again after down works');
\echo ALL PASS
