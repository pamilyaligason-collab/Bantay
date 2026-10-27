-- Rehearsal for 0030_carer_alerts.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002, 0003, 0008, 0010, 0013, 0014, 0016 and 0018.
-- Run (WSL Postgres or any local Postgres 15+):
--   su postgres -c 'dropdb --if-exists bantay_ca; createdb bantay_ca; psql -X -q -v ON_ERROR_STOP=1 -d bantay_ca -f carer_alerts_rehearsal.sql'
-- Actors: A admin (PA); B member (PB); C read-only carer of PB; D creator of PD, writer carer of PB (added below); E stranger member; F disabled member. The loader runs as postgres: RLS bypassed.
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


-- extra actors
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000e', 'e@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000f', 'f@example.com', '{"provider":"google"}', '{}');
insert into public.app_roles (user_id, role, disabled) values
 ('00000000-0000-0000-0000-00000000000e', 'member', false), ('00000000-0000-0000-0000-00000000000f', 'member', true);
insert into public.carers values ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-0000000000b1', true) on conflict do nothing;
-- a writer carer who is DISABLED must never receive alerts
insert into public.carers values ('00000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-0000000000b1', true);

\ir ../migrations/0030_carer_alerts.sql
-- 0030 must be safe to run twice
\ir ../migrations/0030_carer_alerts.sql

-- the guarded Realtime block is skipped when supabase_realtime is absent (WSL): the two runs above did not fail and nothing was created
select pg_temp.ok(not exists (select 1 from pg_publication where pubname = 'supabase_realtime'), 'WSL has no supabase_realtime publication, and the guarded block did not create one');
select pg_temp.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'documents' and column_name = 'printed_name'), 'documents.printed_name exists (S11)');

-- ===== notify_family scopes =====
select pg_temp.ok(public.notify_family('10000000-0000-0000-0000-0000000000b1', 'dose_missed', 'dose_missed', 'm1:2026-10-26', 'carers') = 1, 'carers scope: one row, for the writer carer D only (C is read-only, F is disabled, B is the person)');
select pg_temp.ok((select carer_user_id from public.carer_alerts where ref = 'm1:2026-10-26') = '00000000-0000-0000-0000-00000000000d', 'the carers row belongs to D');
select pg_temp.ok(public.notify_family('10000000-0000-0000-0000-0000000000b1', 'dose_missed', 'dose_missed', 'm1:2026-10-26', 'carers') = 0, 'duplicate ref is ignored and returns 0, not an error');
select pg_temp.ok(public.notify_family('10000000-0000-0000-0000-0000000000b1', 'dose_missed', 'dose_missed', 'm1:2026-10-27', 'carers') = 1, 'another ref inserts again');
select pg_temp.ok(public.notify_family('10000000-0000-0000-0000-0000000000b1', 'sos', 'family_sos', 'sos-1', 'family') = 4, 'family scope: A, C, D, E get it; not B (the person) and not F (disabled)');
select pg_temp.ok(not exists (select 1 from public.carer_alerts where ref = 'sos-1' and carer_user_id in ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000f')), 'the person and a disabled member are not recipients');
select pg_temp.ok(public.notify_family('10000000-0000-0000-0000-0000000000b1', 'hazard', 'storm_warning', 'sa-1', 'self') = 1, 'self scope: one row');
select pg_temp.ok((select count(*) from public.carer_alerts where ref = 'sa-1') = 1 and (select carer_user_id from public.carer_alerts where ref = 'sa-1') = '00000000-0000-0000-0000-00000000000b', 'self scope: only the person own user');
select pg_temp.ok(public.notify_family('10000000-0000-0000-0000-0000000000d1', 'hazard', 'storm_warning', 'sa-1', 'self') = 0, 'self scope for a person with no login inserts nothing');
select pg_temp.ok(pg_temp.fails($$select public.notify_family('10000000-0000-0000-0000-0000000000b1', 'dose_missed', 'dose_missed', 'x', 'everyone')$$), 'a bad scope raises');
select pg_temp.ok(pg_temp.fails($$select public.notify_family(null, 'dose_missed', 'dose_missed', 'x', 'carers')$$), 'a null person raises');
select pg_temp.ok(pg_temp.fails($$select public.notify_family('99999999-0000-0000-0000-000000000000', 'dose_missed', 'dose_missed', 'x', 'carers')$$), 'an unknown person raises');
select pg_temp.ok(pg_temp.fails($$select public.notify_family('10000000-0000-0000-0000-0000000000b1', 'nope', 'dose_missed', 'x', 'carers')$$), 'a kind outside the enum is refused by the CHECK');

-- ===== schema rules =====
select pg_temp.ok(pg_temp.fails($$insert into public.carer_alerts (person_id, carer_user_id, kind, template) values (null, '00000000-0000-0000-0000-00000000000a', 'dose_missed', 'dose_missed')$$), 'a null person is allowed only for kind system');
select pg_temp.ok(not pg_temp.fails($$insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref) values (null, '00000000-0000-0000-0000-00000000000a', 'system', 'system', 'job:1')$$), 'a system row with no person is fine');
select pg_temp.ok((select expires_at - created_at from public.carer_alerts where ref = 'job:1') = interval '7 days', 'expires_at defaults to 7 days');
select pg_temp.ok(not pg_temp.fails($$insert into public.carer_alerts (person_id, carer_user_id, kind, template) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000d', 'digest', 'digest'), ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000d', 'digest', 'digest')$$), 'rows with a null ref are not deduped');

-- ===== who can call what (ML-21: the grants are restated in the migration) =====
select pg_temp.ok(not has_function_privilege('anon', 'public.notify_family(uuid,text,text,text,text)', 'execute') and not has_function_privilege('authenticated', 'public.notify_family(uuid,text,text,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.notify_family(uuid,text,text,text,text)', 'execute'), 'notify_family: not executable as anon or authenticated; the service role may');
select pg_temp.ok(has_function_privilege('authenticated', 'public.raise_mood_alert(uuid)', 'execute') and not has_function_privilege('anon', 'public.raise_mood_alert(uuid)', 'execute'), 'raise_mood_alert: authenticated yes, anon no');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.dose_watch_prune()', 'execute') and has_function_privilege('service_role', 'public.dose_watch_prune()', 'execute'), 'dose_watch_prune keeps its grants');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok(pg_temp.fails($$select public.notify_family('10000000-0000-0000-0000-0000000000b1', 'dose_missed', 'dose_missed', 'evil', 'carers')$$), 'a signed-in writer carer cannot call notify_family');
reset role;
set role anon;
select pg_temp.ok(pg_temp.fails($$select public.notify_family('10000000-0000-0000-0000-0000000000b1', 'dose_missed', 'dose_missed', 'evil', 'carers')$$) and pg_temp.fails($$select public.raise_mood_alert('10000000-0000-0000-0000-0000000000b1')$$) and pg_temp.fails($$select * from public.carer_alerts$$), 'anon can call neither function and cannot read the table');
reset role;

-- ===== raise_mood_alert =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select public.raise_mood_alert('10000000-0000-0000-0000-0000000000b1') as m1 \gset
select pg_temp.ok(:m1 = 1, 'a writer carer may raise the mood alert for their person');
select public.raise_mood_alert('10000000-0000-0000-0000-0000000000b1') as m2 \gset
select pg_temp.ok(:m2 = 0, 'a second call the same Manila day inserts nothing (one per person per day)');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.raise_mood_alert('10000000-0000-0000-0000-0000000000b1') as m3 \gset
select pg_temp.ok(:m3 = 0, 'the person may raise it too, and the daily dedupe still holds');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select pg_temp.ok(pg_temp.fails($$select public.raise_mood_alert('10000000-0000-0000-0000-0000000000b1')$$), 'a stranger is refused (42501)');
select pg_temp.ok((select count(*) from public.carer_alerts where carer_user_id <> '00000000-0000-0000-0000-00000000000e') = 0 and (select count(*) from public.carer_alerts where kind in ('mood_unwell', 'dose_missed')) = 0, 'a stranger reads no one else rows (E only sees the family SOS row sent to E)');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok(pg_temp.fails($$select public.raise_mood_alert('10000000-0000-0000-0000-0000000000b1')$$), 'a read-only carer is refused');
reset role;
select pg_temp.ok((select template from public.carer_alerts where kind = 'mood_unwell') = 'mood_unwell' and (select count(*) from public.carer_alerts where kind = 'mood_unwell') = 1, 'one mood_unwell row, template id only');

-- ===== RLS: own rows only, seen_at only =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok((select count(*) from public.carer_alerts where carer_user_id <> '00000000-0000-0000-0000-00000000000d') = 0 and (select count(*) from public.carer_alerts) >= 4, 'a member reads their own rows and none of another member');
update public.carer_alerts set seen_at = now() where ref = 'm1:2026-10-26';
select pg_temp.ok((select seen_at is not null from public.carer_alerts where ref = 'm1:2026-10-26'), 'a member sets seen_at on their own row');
select pg_temp.ok(pg_temp.fails($$update public.carer_alerts set kind = 'sos'$$), 'no other column is updatable');
select pg_temp.ok(pg_temp.fails($$insert into public.carer_alerts (person_id, carer_user_id, kind, template) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000d', 'sos', 'family_sos')$$), 'a member cannot insert a row (no SOS from an app caller)');
select pg_temp.ok(pg_temp.fails($$delete from public.carer_alerts$$), 'a member cannot delete');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
update public.carer_alerts set seen_at = now();
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where seen_at is not null and carer_user_id <> '00000000-0000-0000-0000-00000000000e') = 1, 'E updating seen_at touched only E own rows: the only other seen row is still D one (RLS filters)');

-- ===== prune (30 days) =====
update public.carer_alerts set created_at = now() - interval '31 days' where ref = 'm1:2026-10-27';
update public.carer_alerts set created_at = now() - interval '29 days' where ref = 'sos-1' and carer_user_id = '00000000-0000-0000-0000-00000000000a';
select public.dose_watch_prune() as pr \gset
select pg_temp.ok(not exists (select 1 from public.carer_alerts where ref = 'm1:2026-10-27') and exists (select 1 from public.carer_alerts where ref = 'sos-1' and carer_user_id = '00000000-0000-0000-0000-00000000000a'), 'prune deletes rows older than 30 days and keeps newer ones');

-- ===== the cascade =====
select count(*) as before_cnt from public.carer_alerts where person_id = '10000000-0000-0000-0000-0000000000b1' \gset
select pg_temp.ok(:before_cnt > 0, 'rows exist for PB before the delete');
delete from public.people where id = '10000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select count(*) from public.carer_alerts where person_id = '10000000-0000-0000-0000-0000000000b1') = 0, 'alert rows go with the person');

-- ===== Realtime: when the publication exists the table joins it once; the down removes it =====
create publication supabase_realtime;
\ir ../migrations/0030_carer_alerts.sql
\ir ../migrations/0030_carer_alerts.sql
select pg_temp.ok((select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'carer_alerts') = 1, 'with the publication present the table is added exactly once');
\ir ../migrations/0030_carer_alerts.down.sql
select pg_temp.ok((select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'carer_alerts') = 0, 'the down removes the table from the publication');
drop publication supabase_realtime;

-- ===== down =====
select pg_temp.ok(to_regclass('public.carer_alerts') is null and to_regprocedure('public.notify_family(uuid,text,text,text,text)') is null and to_regprocedure('public.raise_mood_alert(uuid)') is null, 'down removes the table and both functions');
select pg_temp.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'documents' and column_name = 'printed_name'), 'the down keeps documents.printed_name');
select pg_temp.ok(to_regprocedure('public.dose_watch_prune()') is not null, 'the down restores dose_watch_prune');
\ir ../migrations/0030_carer_alerts.down.sql
\ir ../migrations/0030_carer_alerts.sql
select pg_temp.ok(to_regclass('public.carer_alerts') is not null, 'up again after down works');
\echo ALL PASS
