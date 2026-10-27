-- Chain rehearsal: 0001 -> 0002 -> 0003 -> 0004 -> 0005 in order on a THROWAWAY Postgres, with the REAL is_admin() from 0002
-- (lane rehearsals each stub it). Never the live project.
-- Run from WSL in supabase/tests: createdb bantay_chain; psql -X -v ON_ERROR_STOP=1 -d bantay_chain -f chain_rehearsal.sql
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
 ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com',  '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-0000000000b1', 'member@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-0000000000c1', 'm-c1@members.bantay.invalid', '{"created_by_admin":true}', '{}'),
 ('00000000-0000-0000-0000-0000000000d1', 'm-d1@members.bantay.invalid', '{"created_by_admin":true}', '{}');

\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
\ir ../migrations/0004_admin.sql
\ir ../migrations/0005_news_assistant.sql
\ir ../migrations/0006_family_profiles.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon;

insert into public.news_items (id, title, url, source, kind, published_at) values ('https://example.org/a', 'T', 'https://example.org/a', 'example.org', 'article', now());
insert into public.app_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'admin'), ('00000000-0000-0000-0000-0000000000b1', 'member');
insert into public.app_roles (user_id, role, handle, disabled) values ('00000000-0000-0000-0000-0000000000c1', 'member', 'lola', false), ('00000000-0000-0000-0000-0000000000d1', 'member', 'kuya', true);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Test B', '00000000-0000-0000-0000-0000000000b1'),
 ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Lola', '00000000-0000-0000-0000-0000000000a1'),
 ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'Kuya Off', '00000000-0000-0000-0000-0000000000a1'),
 ('10000000-0000-0000-0000-0000000000e1', null, 'No login', '00000000-0000-0000-0000-0000000000a1');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(not public.is_admin(), 'member is not admin (real is_admin)');
select pg_temp.ok(pg_temp.fails($$select * from public.admin_usage_summary(7)$$), 'member cannot call admin_usage_summary');
select pg_temp.ok(not pg_temp.fails($$insert into public.usage_events (kind, name, app_version, client_id) values ('screen', 'today', '1.0.0', '20000000-0000-0000-0000-000000000001') on conflict (client_id) do nothing$$), 'member logs a usage event');
select pg_temp.ok(not pg_temp.fails($$insert into public.usage_events (kind, name, app_version, client_id) values ('screen', 'today', '1.0.0', '20000000-0000-0000-0000-000000000001') on conflict (client_id) do nothing$$), 'retried usage event is a no-op');
select pg_temp.ok(not pg_temp.fails($$insert into public.activity (person_id, kind, minutes, started_at, source) values ('10000000-0000-0000-0000-0000000000b1', 'walk', 20, now(), 'manual')$$), 'member syncs own activity (0003 on 0001)');
select pg_temp.ok(pg_temp.fails($$insert into public.safety_overrides (kind, key, data) values ('hotline', 'hl-911', '{}')$$), 'member cannot write safety_overrides (real is_admin)');
select pg_temp.ok((select count(*) from public.news_items) = 1, 'member reads news_items');
select pg_temp.ok(pg_temp.fails($$insert into public.news_items (id, title, url, source, kind, published_at) values ('x', 'T', 'https://e.org', 'e.org', 'article', now())$$), 'member cannot insert news_items');
select pg_temp.ok((select allowed and used = 1 from public.assistant_take(2)), 'member assistant_take first call allowed, used 1');
select pg_temp.ok((select allowed and used = 2 from public.assistant_take(2)), 'member assistant_take second call allowed, used 2');
select pg_temp.ok((select not allowed and used = 2 from public.assistant_take(2)), 'member assistant_take refused past the cap');
select pg_temp.ok(pg_temp.fails($$select * from public.assistant_usage$$), 'member cannot read assistant_usage directly');

select pg_temp.ok((select count(*) from public.family_profiles()) = 2, 'member family_profiles: only non-disabled members with a login (admin has no people row here, so Test B + Lola)');
select pg_temp.ok((select provider = 'pin' and handle = 'lola' from public.family_profiles() where display_name = 'Lola'), 'family_profiles: PIN member shows handle and kind pin');
select pg_temp.ok((select provider = 'google' and handle is null from public.family_profiles() where display_name = 'Test B'), 'family_profiles: Google member has kind google, no handle');
select pg_temp.ok(not exists (select 1 from public.family_profiles() where display_name in ('Kuya Off', 'No login')), 'family_profiles: disabled and no-login people excluded');
select pg_temp.ok(not exists (select 1 from information_schema.parameters where specific_schema = 'public' and specific_name like 'family_profiles%' and parameter_mode = 'OUT' and parameter_name ~* 'mail|user_id'), 'family_profiles: no email or auth user id column');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.ok((select count(*) from public.family_profiles()) = 0, 'family_profiles: a disabled caller gets nothing');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok(public.is_admin(), 'admin is admin (real is_admin)');
select pg_temp.ok(not pg_temp.fails($$select * from public.admin_usage_summary(7)$$), 'admin calls admin_usage_summary');
select pg_temp.ok(not pg_temp.fails($$insert into public.safety_overrides (kind, key, data) values ('hotline', 'hl-911', '{"phone":"911"}')$$), 'admin writes safety_overrides');
select pg_temp.ok(pg_temp.fails($$insert into public.carers (carer_id, person_id, can_write) values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', true)$$), 'admin cannot grant edit access (D-22)');
select pg_temp.ok((select count(*) from public.readings) = 0, 'admin role alone reads no readings');
reset role;
set role anon;
reset request.jwt.claim.sub;
select pg_temp.ok((select count(*) from public.news_items) = 1, 'anon reads news_items');
select pg_temp.ok(pg_temp.fails($$select * from public.assistant_take(5)$$), 'anon cannot call assistant_take');
select pg_temp.ok(pg_temp.fails($$select * from public.family_profiles()$$), 'anon cannot call family_profiles');
reset role;
-- Session 12 (R11): the rest of the live chain, applied AFTER the 0006-state asserts above (0028 was never applied live). Phase 3 lanes append theirs here.
\ir ../migrations/0007_safety_alerts.sql
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
\ir ../migrations/0008_records.sql
\ir ../migrations/0009_pin_reset_requests.sql
\ir ../migrations/0010_people_profile.sql
\ir ../migrations/0011_family_profiles_photo.sql
\ir ../migrations/0012_family_plan.sql
\ir ../migrations/0013_records_autoconfirm.sql
\ir ../migrations/0014_medications_live.sql
\ir ../migrations/0015_usage_client_at.sql
\ir ../migrations/0016_medications_softdelete.sql
\ir ../migrations/0017_news_zone.sql
\ir ../migrations/0018_dose_watch.sql
\ir ../migrations/0019_records_dedupe.sql
\ir ../migrations/0020_scan_extract.sql
\ir ../migrations/0021_admin_audit.sql
\ir ../migrations/0022_people_archive.sql
\ir ../migrations/0023_family_memories.sql
\ir ../migrations/0024_nutrition.sql
\ir ../migrations/0025_knowledge.sql
\ir ../migrations/0026_nutrition_v2.sql
\ir ../migrations/0027_family_messages.sql
\ir ../migrations/0029_admin_view_as.sql
\ir ../migrations/0030_carer_alerts.sql
\ir ../migrations/0031_sos.sql
\ir ../migrations/0032_phone_health.sql
\ir ../migrations/0033_job_runs.sql
\ir ../migrations/0034_pin_reset_erasure.sql
\ir ../migrations/0035_reading_alerts.sql
\ir ../migrations/0036_scan_skip.sql
\ir ../migrations/0037_sharing.sql
\ir ../migrations/0040_push_tokens.sql
\echo REHEARSAL DONE
