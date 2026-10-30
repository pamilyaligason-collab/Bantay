-- Rehearsal for 0034_pin_reset_erasure.sql on a THROWAWAY Postgres (never the live project), with the REAL full chain 0001..0033 (0028 does not exist), then 0034 twice, then 0035.
-- Run (WSL Postgres, throwaway database):
--   wsl -u postgres createdb bantay_pr ; wsl -u postgres psql -X -q -v ON_ERROR_STOP=1 -d bantay_pr -f supabase/tests/pin_reset_erasure_rehearsal.sql
-- Actors: A admin; B the requester (PIN member, has data); C and D active members holding the pin_approve row; E disabled member holding a row;
-- F signed in with no app_roles row; G active member WITHOUT the pin_approve row. The loader runs as postgres (RLS bypassed); roles are switched with set role.
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
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null, provider text, identity_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon, supabase_auth_admin, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant usage on schema public to authenticated, anon, service_role;
grant select, delete on auth.sessions to service_role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000b', 'm-b@members.bantay.invalid', '{}', '{}'),
 ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000d', 'd@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000e', 'e@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000f', 'f@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-000000000010', 'g@example.com', '{"provider":"google"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
\ir ../migrations/0004_admin.sql
\ir ../migrations/0005_news_assistant.sql
\ir ../migrations/0006_family_profiles.sql
\ir ../migrations/0007_safety_alerts.sql
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
 ('00000000-0000-0000-0000-00000000000e', 'member', true), ('00000000-0000-0000-0000-000000000010', 'member', false);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Bee', '00000000-0000-0000-0000-00000000000b'),
 ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000c', 'Cee', '00000000-0000-0000-0000-00000000000c');
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

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon, service_role;

\ir ../migrations/0034_pin_reset_erasure.sql
-- 0034 must be safe to run twice
\ir ../migrations/0034_pin_reset_erasure.sql
\ir ../migrations/0035_reading_alerts.sql
\ir ../migrations/0043_s15_security.sql

-- ===== grants (ML-21) =====
select pg_temp.ok(not has_function_privilege('anon', 'public.request_pin_reset(text)', 'execute') and not has_function_privilege('authenticated', 'public.request_pin_reset(text)', 'execute'), 'request_pin_reset is revoked from anon and authenticated (admin flow retired)');
select pg_temp.ok(not has_function_privilege('service_role', 'public.request_pin_reset(text)', 'execute'), 'request_pin_reset is revoked from the service role too');
select pg_temp.ok(has_function_privilege('authenticated', 'public.approve_pin_reset(uuid,text)', 'execute') and not has_function_privilege('anon', 'public.approve_pin_reset(uuid,text)', 'execute'), 'approve_pin_reset: authenticated yes, anon no');
select pg_temp.ok(has_function_privilege('authenticated', 'public.export_my_data()', 'execute') and has_function_privilege('authenticated', 'public.request_erasure()', 'execute') and has_function_privilege('authenticated', 'public.cancel_erasure()', 'execute')
  and not has_function_privilege('anon', 'public.export_my_data()', 'execute') and not has_function_privilege('anon', 'public.request_erasure()', 'execute') and not has_function_privilege('anon', 'public.cancel_erasure()', 'execute'), 'export/erasure RPCs: authenticated yes, anon no');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.erase_user_data(uuid)', 'execute') and not has_function_privilege('anon', 'public.erase_user_data(uuid)', 'execute') and has_function_privilege('service_role', 'public.erase_user_data(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.erasure_due()', 'execute') and not has_function_privilege('authenticated', 'public.erasure_paths(uuid)', 'execute'), 'erase_user_data, erasure_due, erasure_paths: service role only');
select pg_temp.ok(not has_table_privilege('anon', 'public.pin_reset_requests', 'select') and not has_table_privilege('authenticated', 'public.pin_reset_requests', 'select') and not has_table_privilege('authenticated', 'public.erasure_requests', 'select'), 'the two new tables have no anon or authenticated grant');

-- ===== approve_pin_reset =====
insert into public.pin_reset_requests (id, user_id, method, code, secret_hash) values
 ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'family', '4821', 'h1'),
 ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'family', '1111', 'h2');
insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
select '10000000-0000-0000-0000-0000000000b1', u, 'pin_approve', 'pin_approve', r
  from unnest(array['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000e']::uuid[]) u,
       unnest(array['a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002']) r;
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;
grant execute on function pg_temp.as_user(text) to authenticated, anon, service_role;
create function pg_temp.approve(u text, code text, rid text default 'a0000000-0000-0000-0000-000000000001') returns boolean language plpgsql as $$
declare r boolean; begin perform set_config('request.jwt.claim.sub', u, false); set local role authenticated; r := public.approve_pin_reset(rid::uuid, code); reset role; return r; end $$;

select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-000000000010', '4821') = false, 'G (active member without the pin_approve row) cannot approve, even with the right code');
select pg_temp.ok((select attempts from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') = 0, 'a refused caller costs the request no attempt');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000f', '4821') = false, 'F (no app_roles row) cannot approve');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000e', '4821') = false, 'E (disabled) cannot approve even holding a row');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000b', '4821') = false, 'the requester cannot approve their own reset');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000c', '4821') = false, 'C (a non-admin member holding the pin_approve row) cannot approve, even with the right code (SEC-1)');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000c', '0000') = false and (select attempts from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') = 0, 'a non-admin with a wrong code costs the request no attempt (SEC-1 refuses before the counter)');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-000000000010', '4821') = false and pg_temp.approve('00000000-0000-0000-0000-00000000000d', '4821') = false, 'other non-admin members are refused too');
select pg_temp.ok((select attempts from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') = 0, 'none of the refusals counted an attempt');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000a', '0000') = false, 'a wrong code is refused');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000a', 'abcd') = false, 'a malformed code is refused');
select pg_temp.ok((select attempts from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') = 2 and (select approved_at from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') is null, 'two wrong tries counted, still unapproved');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000a', '4821') = true, 'the admin A approves with the right code');
select pg_temp.ok((select approved_by from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000a', 'approved_by is the admin A');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000a', '4821') = false, 'first approval wins: a second approval is refused');
select pg_temp.ok((select approved_by from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000a', 'approved_by is still the admin A');
-- 5 wrong codes burn the request
select pg_temp.approve('00000000-0000-0000-0000-00000000000a', '0000', 'a0000000-0000-0000-0000-000000000002') from generate_series(1, 4);
select pg_temp.ok((select used_at from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000002') is null, 'four wrong codes do not burn it yet');
select pg_temp.approve('00000000-0000-0000-0000-00000000000a', '0000', 'a0000000-0000-0000-0000-000000000002');
select pg_temp.ok((select used_at is not null and attempts = 5 from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000002'), 'the fifth wrong code burns the request (used_at set)');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000a', '1111', 'a0000000-0000-0000-0000-000000000002') = false, 'after burning, even the right code is refused');
select pg_temp.ok((select attempts from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000002') = 5 and (select approved_at from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000002') is null, 'attempts stay at 5 and it was never approved');
-- expired, used, google
insert into public.pin_reset_requests (id, user_id, method, code, secret_hash, expires_at) values ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'family', '2222', 'h3', now() - interval '1 minute');
insert into public.pin_reset_requests (id, user_id, method, code, secret_hash, used_at) values ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', 'family', '3333', 'h4', now());
insert into public.pin_reset_requests (id, user_id, method, code, secret_hash) values ('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000b', 'google', '4444', 'h5');
insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
select '10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', 'pin_approve', 'pin_approve', r from unnest(array['a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005']) r;
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000a', '2222', 'a0000000-0000-0000-0000-000000000003') = false, 'an expired request cannot be approved');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000a', '3333', 'a0000000-0000-0000-0000-000000000004') = false, 'a used request cannot be approved');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000a', '4444', 'a0000000-0000-0000-0000-000000000005') = false, 'a google-method request is never approved by a family member');
select pg_temp.ok(not pg_temp.fails($$select public.approve_pin_reset(null, '1234')$$) , 'null id as postgres is a quiet false');
set role anon;
select pg_temp.ok(pg_temp.fails($$select public.approve_pin_reset('a0000000-0000-0000-0000-000000000001', '4821')$$), 'anon cannot call approve_pin_reset');
select pg_temp.ok(pg_temp.fails($$select * from public.pin_reset_requests$$), 'anon cannot read the requests');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select pg_temp.ok(pg_temp.fails($$select * from public.pin_reset_requests$$) and pg_temp.fails($$insert into public.pin_reset_requests (user_id, method, code, secret_hash) values (auth.uid(), 'family', '1234', 'x')$$), 'a signed-in member can neither read nor write the requests table');
reset role;
insert into public.audit_log (actor, tbl, action) values (null, 'app_roles', 'pin_reset');
select pg_temp.ok(exists (select 1 from public.audit_log where action = 'pin_reset'), 'audit_log accepts the pin_reset action');
select pg_temp.ok(not pg_temp.fails($$insert into public.audit_log (actor, tbl, action) values (null, 'people', 'view')$$), 'the view action from 0029 is still allowed');

-- ===== consent columns =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
update public.people set consent_at = now(), consent_version = '2026-10' where id = '10000000-0000-0000-0000-0000000000b1';
update public.people set consent_by = '00000000-0000-0000-0000-00000000000c' where id = '10000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.fails($$update public.people set erased_at = now() where id = '10000000-0000-0000-0000-0000000000b1'$$), 'a member cannot write erased_at');
reset role;
select pg_temp.ok((select consent_version = '2026-10' and consent_at is not null and consent_by = '00000000-0000-0000-0000-00000000000b' from public.people where id = '10000000-0000-0000-0000-0000000000b1'), 'consent is stored and consent_by is the caller, even when the client tries to set another');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
update public.people set consent_at = now(), consent_version = 'x' where id = '10000000-0000-0000-0000-0000000000b1';
reset role;
select pg_temp.ok((select consent_version from public.people where id = '10000000-0000-0000-0000-0000000000b1') = '2026-10', 'a member cannot write another member consent (people policy)');

-- ===== fixtures for export and erasure: B has data, C has data =====
insert into public.readings (person_id, taken_at, test, value) values
 ('10000000-0000-0000-0000-0000000000b1', now(), 'bp_systolic', 120), ('10000000-0000-0000-0000-0000000000b1', now() - interval '1 day', 'bp_systolic', 125),
 ('10000000-0000-0000-0000-0000000000c1', now(), 'bp_systolic', 118);
insert into public.meds_taken (person_id, name, taken_at) values ('10000000-0000-0000-0000-0000000000b1', 'Losartan', now()), ('10000000-0000-0000-0000-0000000000c1', 'Metformin', now());
insert into public.activity (person_id, kind, started_at, source) values ('10000000-0000-0000-0000-0000000000b1', 'walk', now(), 'manual'), ('10000000-0000-0000-0000-0000000000c1', 'walk', now(), 'manual');
insert into public.medications (person_id, name) values ('10000000-0000-0000-0000-0000000000b1', 'Losartan'), ('10000000-0000-0000-0000-0000000000c1', 'Metformin');
insert into public.documents (id, person_id, kind) values ('d0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'lab'), ('d0000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'lab');
insert into public.source_files (person_id, name, mime, storage_path, document_id) values
 ('10000000-0000-0000-0000-0000000000b1', 'lab.pdf', 'application/pdf', '10000000-0000-0000-0000-0000000000b1/f1.pdf', 'd0000000-0000-0000-0000-0000000000b1'),
 ('10000000-0000-0000-0000-0000000000c1', 'lab.pdf', 'application/pdf', '10000000-0000-0000-0000-0000000000c1/f2.pdf', 'd0000000-0000-0000-0000-0000000000c1');
update public.people set photo_path = '10000000-0000-0000-0000-0000000000b1.jpg', phone = '0917', blood_type = 'O+', birthdate = '1950-01-02', sex = 'female', address = '1 Rizal St',
  allergies = '{peanut}', conditions = '{htn}', medicines = '{losartan}', aliases = '{Bebe}', consent_at = now(), consent_version = '2026-10', consent_by = '00000000-0000-0000-0000-00000000000b'
 where id = '10000000-0000-0000-0000-0000000000b1';
update public.people set address = '2 Mabini St', aliases = '{Cece}', sex = 'male' where id = '10000000-0000-0000-0000-0000000000c1';
insert into public.carers (carer_id, person_id, can_write) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-0000000000b1', true),   -- C cares for B
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-0000000000c1', false),                                                                 -- B cares for C
  ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-0000000000c1', false)                                                                  -- D cares for C (stays)
 on conflict do nothing;
insert into public.invites (email, invited_by) values ('m-b@members.bantay.invalid', '00000000-0000-0000-0000-00000000000a'), ('keep@example.com', '00000000-0000-0000-0000-00000000000a');
insert into public.sos_events (id, person_id, user_id, at) values ('e0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', now());
insert into public.sos_acks (event_id, user_id) values ('e0000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000c');
insert into public.family_messages (client_id, sender_id, kind, body) values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'text', 'hi'), (gen_random_uuid(), '00000000-0000-0000-0000-00000000000c', 'text', 'hello');
insert into public.push_subscriptions (user_id, endpoint) values ('00000000-0000-0000-0000-00000000000b', 'https://push.example/b'), ('00000000-0000-0000-0000-00000000000c', 'https://push.example/c');
insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000d', 'dose_missed', 'dose_missed', 'dm1'), ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'dose_missed', 'dose_missed', 'dm2');
insert into public.food_entries (person_id, eaten_at, meal, name) values ('10000000-0000-0000-0000-0000000000b1', now(), 'lunch', 'rice');
-- one row for B in EVERY other table the erase must reach (the expected list below is hand-written, not read from the discovery function)
insert into public.usage_events (user_id, kind, name) values ('00000000-0000-0000-0000-00000000000b', 'screen', 'home'), ('00000000-0000-0000-0000-00000000000c', 'screen', 'home');
insert into public.assistant_usage (user_id, day) values ('00000000-0000-0000-0000-00000000000b', current_date), ('00000000-0000-0000-0000-00000000000c', current_date);
insert into public.client_errors (user_id, where_, message_hash, day) values ('00000000-0000-0000-0000-00000000000b', 'app', 'abc', current_date);
insert into public.admin_requests (kind, handle, user_id) values ('pin_reset', 'bee', '00000000-0000-0000-0000-00000000000b');
insert into public.phone_health (user_id) values ('00000000-0000-0000-0000-00000000000b');
insert into public.pin_attempts (user_id) values ('00000000-0000-0000-0000-00000000000b');
insert into public.family_photos (id, client_id, storage_path, uploaded_by) values ('f0000000-0000-0000-0000-0000000000b1', gen_random_uuid(), '00000000-0000-0000-0000-00000000000b/f0000000-0000-0000-0000-0000000000b1.jpg', '00000000-0000-0000-0000-00000000000b');
insert into public.dose_watch_sent (person_id, day, slot) values ('10000000-0000-0000-0000-0000000000b1', current_date, '08:00');
insert into public.family_events (client_id, title, starts_at, person_id) values ('ev-b1', 'Checkup', now(), '10000000-0000-0000-0000-0000000000b1');
insert into public.allergies (person_id, substance) values ('10000000-0000-0000-0000-0000000000b1', 'peanut');
insert into public.appointments (person_id, starts_at) values ('10000000-0000-0000-0000-0000000000b1', now());
insert into public.conditions (person_id, name) values ('10000000-0000-0000-0000-0000000000b1', 'hypertension');
insert into public.consults (person_id, taken_at) values ('10000000-0000-0000-0000-0000000000b1', now());
insert into public.encounters (person_id, kind) values ('10000000-0000-0000-0000-0000000000b1', 'consult');
insert into public.imaging_reports (person_id) values ('10000000-0000-0000-0000-0000000000b1');
insert into public.insurance_policies (person_id) values ('10000000-0000-0000-0000-0000000000b1');
insert into public.lab_panels (person_id, document_id, name) values ('10000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-0000000000b1', 'CBC');
insert into public.lab_results (person_id, name_raw, value_num) values ('10000000-0000-0000-0000-0000000000b1', 'HGB', 13.5);
insert into public.medication_changes (medication_id, person_id, field) select id, person_id, 'dose' from public.medications where person_id = '10000000-0000-0000-0000-0000000000b1';
insert into public.nutrition_goals (person_id) values ('10000000-0000-0000-0000-0000000000b1');
insert into public.person_aliases (person_id, alias) values ('10000000-0000-0000-0000-0000000000b1', 'bebe');
insert into public.person_identifiers (person_id, id_type, id_number) values ('10000000-0000-0000-0000-0000000000b1', 'philhealth', '12-345');
with rx as (insert into public.prescriptions (person_id) values ('10000000-0000-0000-0000-0000000000b1') returning id)
  insert into public.prescription_items (person_id, prescription_id, line_no) select '10000000-0000-0000-0000-0000000000b1', id, 1 from rx;
insert into public.vaccinations (person_id, vaccine) values ('10000000-0000-0000-0000-0000000000b1', 'flu');
insert into public.water_entries (person_id, drunk_at, ml) values ('10000000-0000-0000-0000-0000000000b1', now(), 250);
-- B acknowledged an SOS of C (sos_acks.user_id = B, and the event is C's, so only the user id reaches it)
insert into public.sos_events (id, person_id, user_id, at) values ('e0000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000c', now());
insert into public.sos_acks (event_id, user_id) values ('e0000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000b');
-- Google-like profile on B and C: GoTrue merges user_metadata key by key, so only the SQL scrub can empty it
update auth.users set raw_user_meta_data = '{"full_name":"Bee B","name":"Bee B","avatar_url":"https://x/a.png","picture":"https://x/a.png","email":"b@gmail.com","display_name":"Bee"}',
  raw_app_meta_data = '{"provider":"google","providers":["google"],"email":"b@gmail.com"}' where id in ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');
insert into auth.identities (user_id, provider, identity_data) values ('00000000-0000-0000-0000-00000000000b', 'google', '{"name":"Bee"}'), ('00000000-0000-0000-0000-00000000000c', 'google', '{"name":"Cee"}');

-- ===== the expected covered set, written by hand (a table added later must be classified here: the test fails until it is) =====
create temp table expected_targets (t text primary key) on commit preserve rows;
insert into expected_targets select unnest(string_to_array(
 'activity.person_id admin_requests.user_id allergies.person_id appointments.person_id assistant_usage.user_id carer_alerts.carer_user_id carer_alerts.person_id carers.carer_id carers.person_id '
 'client_errors.user_id conditions.person_id consults.person_id documents.person_id dose_watch_sent.person_id encounters.person_id family_events.person_id family_messages.sender_id '
 'family_photos.uploaded_by food_entries.person_id imaging_reports.person_id insurance_policies.person_id lab_panels.person_id lab_results.person_id medication_changes.person_id '
 'medications.person_id meds_taken.person_id nutrition_goals.person_id person_aliases.person_id person_identifiers.person_id phone_health.user_id pin_attempts.user_id '
 'pin_reset_requests.user_id prescription_items.person_id prescriptions.person_id push_subscriptions.user_id readings.person_id sos_acks.user_id sos_events.person_id sos_events.user_id '
 'source_files.person_id usage_events.user_id vaccinations.person_id water_entries.person_id', ' '));
grant select on expected_targets to service_role, authenticated;
select pg_temp.ok((select count(*) from expected_targets) = 43, 'the hand-written list has 43 table.column entries');
select pg_temp.ok(not exists (select tbl || '.' || col from public.erasure_targets() except select t from expected_targets)
  and not exists (select t from expected_targets except select tbl || '.' || col from public.erasure_targets()), 'the discovery finds exactly the hand-written list (no table is missed, none is extra)');
-- a helper: how many rows reference B (person key or user key) in one table.column of the hand-written list
create function pg_temp.refs(tc text) returns bigint language plpgsql as $$
declare n bigint; t text := split_part(tc, '.', 1); c text := split_part(tc, '.', 2);
begin
  execute format('select count(*) from public.%I where %I = $1', t, c) into n
    using case when c = 'person_id' then '10000000-0000-0000-0000-0000000000b1'::uuid else '00000000-0000-0000-0000-00000000000b'::uuid end;
  return n; end $$;
grant execute on function pg_temp.refs(text) to service_role, authenticated;
select pg_temp.ok(not exists (select 1 from expected_targets where pg_temp.refs(t) = 0), 'before the erase, B has at least one row in every one of the 43 table.column entries (the seed covers them all)');

-- ===== export_my_data =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select public.export_my_data() as ex \gset
reset role;
select pg_temp.ok((:'ex'::jsonb -> 'person' ->> 'display_name') = 'Bee' and jsonb_array_length(:'ex'::jsonb -> 'readings') = 2 and jsonb_array_length(:'ex'::jsonb -> 'meds_taken') = 1, 'export returns the caller own person and rows (2 readings, 1 dose), not C''s');
select pg_temp.ok(not (:'ex'::text like '%Metformin%') and not (:'ex'::text like '%Cee%'), 'export holds nothing of another member');
select pg_temp.ok(not exists (select 1 from (select distinct split_part(t, '.', 1) as tbl from expected_targets) x
    where x.tbl not in ('pin_reset_requests', 'pin_attempts') and (not (:'ex'::jsonb ? x.tbl) or jsonb_array_length(:'ex'::jsonb -> x.tbl) = 0)),
  'export carries a non-empty array for every table of the hand-written list (carers, phone_health, usage_events, assistant_usage, client_errors, admin_requests, family_photos included)');
select pg_temp.ok(not (:'ex'::jsonb ? 'pin_reset_requests') and not (:'ex'::jsonb ? 'pin_attempts') and not (:'ex'::text like '%secret_hash%') and not (:'ex'::text like '%p256dh%'), 'export leaves out reset codes and lock rows, and strips push keys');
select pg_temp.ok((:'ex'::jsonb -> 'family_photos' -> 0 ->> 'uploaded_by') = '00000000-0000-0000-0000-00000000000b' and jsonb_array_length(:'ex'::jsonb -> 'carers') = 2, 'export holds the family photo B uploaded and both carers rows (as carer and as cared-for)');
select pg_temp.ok((:'ex'::jsonb ? 'food_entries') and jsonb_array_length(:'ex'::jsonb -> 'food_entries') = 1 and (:'ex'::jsonb ? 'sos_events') and (:'ex'::jsonb ? 'family_messages') and (:'ex'::jsonb ? 'carer_alerts'), 'export also carries nutrition, SOS, messages and alerts');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
set role authenticated;
select public.export_my_data() as ex2 \gset
reset role;
select pg_temp.ok(:'ex2'::jsonb = '{}'::jsonb, 'a signed-in user with no person gets an empty export');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select pg_temp.fails($$select public.export_my_data()$$) from generate_series(1, 4);
select pg_temp.ok(pg_temp.fails($$select public.export_my_data()$$), 'the sixth export in an hour is refused (rate limit)');
reset role;
set role anon;
select pg_temp.ok(pg_temp.fails($$select public.export_my_data()$$), 'anon cannot export');
reset role;

-- an active member can still write his own readings
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000b1', now() - interval '2 days', 'bp_systolic', 130);
reset role;
select pg_temp.ok((select count(*) from public.readings where person_id = '10000000-0000-0000-0000-0000000000b1') = 3, 'before the erase, B can insert his own reading (is_self)');
delete from public.readings where person_id = '10000000-0000-0000-0000-0000000000b1' and value = 130;

-- ===== request_erasure / cancel_erasure =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
set role authenticated;
select pg_temp.ok(pg_temp.fails($$select public.request_erasure()$$), 'a user with no person cannot request erasure');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select public.request_erasure() as c1 \gset
select public.request_erasure() as c2 \gset
reset role;
select pg_temp.ok(:'c1' = :'c2' and :'c1'::timestamptz between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour', 'request_erasure returns cancel_until about 7 days out, and a second call returns the same one open request');
select pg_temp.ok((select count(*) from public.erasure_requests) = 1, 'one open erasure per user');
select pg_temp.ok(not exists (select 1 from public.erasure_due()), 'nothing is due inside the undo window');
select pg_temp.ok(pg_temp.fails($$select public.erase_user_data('00000000-0000-0000-0000-00000000000b')$$), 'erase_user_data refuses before cancel_until');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select public.cancel_erasure();
reset role;
select pg_temp.ok((select count(*) from public.erasure_requests) = 0, 'cancel inside the window removes the request');
set role authenticated;
select public.request_erasure();
reset role;
update public.erasure_requests set cancel_until = now() - interval '1 minute', requested_at = now() - interval '7 days 1 minute';
set role authenticated;
select pg_temp.ok(pg_temp.fails($$select public.cancel_erasure()$$), 'cancel after cancel_until is refused');
select pg_temp.ok(pg_temp.fails($$select public.erase_user_data('00000000-0000-0000-0000-00000000000b')$$), 'authenticated cannot run erase_user_data');
reset role;

-- ===== erase_user_data (as the service role) =====
select pg_temp.ok((select user_id from public.erasure_due()) = '00000000-0000-0000-0000-00000000000b', 'erasure_due lists B once the window has passed');
select pg_temp.ok((select count(*) from public.erasure_paths('00000000-0000-0000-0000-00000000000b')) = 2 and exists (select 1 from public.erasure_paths('00000000-0000-0000-0000-00000000000b') where bucket = 'records' and path like '%f1.pdf') and exists (select 1 from public.erasure_paths('00000000-0000-0000-0000-00000000000b') where bucket = 'avatars'), 'erasure_paths lists B''s records object and avatar, not C''s');
select count(*) as audit_before from public.audit_log \gset
set role service_role;
select pg_temp.ok(pg_temp.fails($$select public.erasure_scrub_identities('00000000-0000-0000-0000-00000000000b')$$), 'erasure_scrub_identities is refused before the erase is done');
select public.erase_user_data('00000000-0000-0000-0000-00000000000b');
reset role;
select pg_temp.ok(not exists (select 1 from expected_targets where t <> 'family_photos.uploaded_by' and pg_temp.refs(t) > 0), 'after the erase, no row references B in any of the hand-written table.column entries');
select pg_temp.ok(pg_temp.refs('family_photos.uploaded_by') = 0 and (select uploaded_by is null from public.family_photos where id = 'f0000000-0000-0000-0000-0000000000b1'), 'the family photo stays with the family, uploaded_by set null');
select pg_temp.ok((select count(*) from public.usage_events where user_id = '00000000-0000-0000-0000-00000000000c') = 1 and (select count(*) from public.assistant_usage where user_id = '00000000-0000-0000-0000-00000000000c') = 1
  and exists (select 1 from public.sos_events where id = 'e0000000-0000-0000-0000-0000000000c1'), 'C''s usage rows and SOS event are untouched');
select pg_temp.ok(exists (select 1 from public.app_roles where user_id = '00000000-0000-0000-0000-00000000000b') and exists (select 1 from public.erasure_requests where user_id = '00000000-0000-0000-0000-00000000000b'), 'app_roles and the erasure marker are kept');
-- the disabled login can no longer write: is_self() refuses a disabled user even with a live token
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select pg_temp.ok(pg_temp.fails($$insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000b1', now(), 'bp_systolic', 140)$$), 'an erased (disabled) member cannot insert a reading: readings_insert is refused');
select pg_temp.ok(not public.is_self('10000000-0000-0000-0000-0000000000b1'), 'is_self is false for a disabled member');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select pg_temp.ok(public.is_self('10000000-0000-0000-0000-0000000000c1'), 'is_self is still true for an active member');
reset role;
-- the auth side: the person is still due until the function has scrubbed the email (retry), and the identities go through the service-role function
select pg_temp.ok((select erased from public.erasure_due() where user_id = '00000000-0000-0000-0000-00000000000b'), 'erasure_due keeps listing B with erased = true until the auth email is scrubbed (the retry path)');
set role service_role;
select public.erasure_scrub_identities('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok(pg_temp.fails($$select public.erasure_scrub_identities('00000000-0000-0000-0000-00000000000c')$$), 'erasure_scrub_identities is refused for a user with no finished erasure');
reset role;
select pg_temp.ok(not exists (select 1 from auth.identities where user_id = '00000000-0000-0000-0000-00000000000b') and exists (select 1 from auth.identities where user_id = '00000000-0000-0000-0000-00000000000c'), 'B''s login identities are dropped, C''s stay');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.erasure_scrub_identities(uuid)', 'execute') and not has_function_privilege('anon', 'public.erasure_scrub_identities(uuid)', 'execute') and has_function_privilege('service_role', 'public.erasure_scrub_identities(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.erasure_targets()', 'execute') and has_function_privilege('authenticated', 'public.is_self(uuid)', 'execute') and not has_function_privilege('anon', 'public.is_self(uuid)', 'execute'), 'grants: scrub and targets service role only; is_self authenticated only as in 0001');
select pg_temp.ok((select raw_user_meta_data = '{}'::jsonb and raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb from auth.users where id = '00000000-0000-0000-0000-00000000000b'), 'B''s user metadata is empty after the scrub (full_name, name, avatar_url, picture, email, display_name gone); app_metadata keeps provider/providers and loses the email');
select pg_temp.ok((select raw_user_meta_data ? 'full_name' and raw_app_meta_data ? 'email' from auth.users where id = '00000000-0000-0000-0000-00000000000c'), 'C''s metadata is untouched');
update auth.users set email = 'erased-00000000-0000-0000-0000-00000000000b@members.bantay.invalid' where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(not exists (select 1 from public.erasure_due()), 'once the email is the erased value, nothing is due any more');
select pg_temp.ok(not exists (select 1 from public.readings where person_id = '10000000-0000-0000-0000-0000000000b1')
  and not exists (select 1 from public.meds_taken where person_id = '10000000-0000-0000-0000-0000000000b1')
  and not exists (select 1 from public.activity where person_id = '10000000-0000-0000-0000-0000000000b1')
  and not exists (select 1 from public.medications where person_id = '10000000-0000-0000-0000-0000000000b1')
  and not exists (select 1 from public.documents where person_id = '10000000-0000-0000-0000-0000000000b1')
  and not exists (select 1 from public.source_files where person_id = '10000000-0000-0000-0000-0000000000b1'), 'B''s readings, doses, activity, medicines, documents and source files are gone');
select pg_temp.ok(not exists (select 1 from public.sos_events where person_id = '10000000-0000-0000-0000-0000000000b1') and not exists (select 1 from public.sos_acks where event_id = 'e0000000-0000-0000-0000-0000000000b1'), 'B''s SOS rows and their acks are gone');
select pg_temp.ok(not exists (select 1 from public.family_messages where sender_id = '00000000-0000-0000-0000-00000000000b') and not exists (select 1 from public.push_subscriptions where user_id = '00000000-0000-0000-0000-00000000000b'), 'B''s messages and push subscriptions are gone');
select pg_temp.ok(not exists (select 1 from public.carer_alerts where person_id = '10000000-0000-0000-0000-0000000000b1' or carer_user_id = '00000000-0000-0000-0000-00000000000b'), 'carer_alerts about B and to B are gone (including the pin_approve and dose_missed rows)');
select pg_temp.ok(not exists (select 1 from public.food_entries where person_id = '10000000-0000-0000-0000-0000000000b1'), 'rows in other tables with a person_id (nutrition) are found and removed too');
select pg_temp.ok((select count(*) from public.readings where person_id = '10000000-0000-0000-0000-0000000000c1') = 1 and (select count(*) from public.medications where person_id = '10000000-0000-0000-0000-0000000000c1') = 1
  and (select count(*) from public.documents where person_id = '10000000-0000-0000-0000-0000000000c1') = 1 and (select count(*) from public.family_messages) = 1 and (select count(*) from public.push_subscriptions) = 1
  and (select count(*) from public.carer_alerts where ref = 'dm2') = 1, 'C''s rows are untouched');
select pg_temp.ok((select count(*) from public.audit_log) >= :audit_before and exists (select 1 from public.audit_log where action = 'pin_reset'), 'audit_log is kept');
select pg_temp.ok((select erased_at is not null and display_name = 'Former member' and photo_path is null and phone is null and blood_type is null from public.people where id = '10000000-0000-0000-0000-0000000000b1'), 'the people row is kept but blanked, with erased_at set');
-- every personal column of people is blanked: the column count is pinned, so a column added by any migration must be classified here and in erase_user_data
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'people' and column_name <> all (array['id', 'auth_user_id', 'created_by', 'created_at', 'updated_at', 'archived_at', 'archived_by', 'display_name', 'photo_path', 'phone', 'birthdate', 'blood_type', 'allergies', 'conditions', 'medicines', 'aliases', 'sex', 'address', 'consent_at', 'consent_version', 'consent_by', 'erased_at'])), 'people has the columns this rehearsal knows (a new column must be classified here and in erase_user_data)');
select pg_temp.ok((select p.display_name = 'Former member' and p.photo_path is null and p.phone is null and p.birthdate is null and p.blood_type is null and p.sex is null and p.address is null
    and p.allergies = '{}' and p.conditions = '{}' and p.medicines = '{}' and p.aliases = '{}' and p.consent_at is null and p.consent_version is null and p.consent_by is null
    and p.erased_at is not null from public.people p where p.id = '10000000-0000-0000-0000-0000000000b1'), 'every personal column of B''s people row is blank (aliases, sex, address, birthdate, lists, consent included)');
select pg_temp.ok((select address = '2 Mabini St' and aliases = '{Cece}' and sex = 'male' from public.people where id = '10000000-0000-0000-0000-0000000000c1'), 'C''s profile is untouched');
select pg_temp.ok((select disabled from public.app_roles where user_id = '00000000-0000-0000-0000-00000000000b'), 'B''s app_roles row is disabled (the sign-in gate refuses a disabled user)');
select pg_temp.ok(not exists (select 1 from public.carers where carer_id = '00000000-0000-0000-0000-00000000000b' or person_id = '10000000-0000-0000-0000-0000000000b1'), 'carers rows are gone both ways: B as carer and B as the cared-for');
select pg_temp.ok((select count(*) from public.carers where person_id = '10000000-0000-0000-0000-0000000000c1' and carer_id = '00000000-0000-0000-0000-00000000000d') = 1 and (select disabled from public.app_roles where user_id = '00000000-0000-0000-0000-00000000000c') = false, 'other carers rows and C''s login are untouched');
select pg_temp.ok(not exists (select 1 from public.invites where email = 'm-b@members.bantay.invalid') and exists (select 1 from public.invites where email = 'keep@example.com'), 'B''s invite row is gone, another stays');
select pg_temp.ok((select done_at is not null from public.erasure_requests where user_id = '00000000-0000-0000-0000-00000000000b'), 'the request is marked done');
select pg_temp.ok(pg_temp.fails($$select public.erase_user_data('00000000-0000-0000-0000-00000000000b')$$), 'a second erase run for the same user is refused');

-- ===== erasure_due does not starve (ML-23): 6 due users, the first five keep failing, the sixth is still served in the second run =====
insert into auth.users (id, email) select ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'q' || n || '@example.com' from generate_series(1, 6) n;
insert into public.people (id, auth_user_id, display_name, created_by)
  select ('10000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'Q' || n, ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 6) n;
insert into public.erasure_requests (user_id, requested_at, cancel_until)
  select ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, now() - interval '9 days', now() - interval '2 days' + n * interval '1 minute' from generate_series(1, 6) n;
create temp table run1 as select user_id from public.erasure_due();
create temp table run2 as select row_number() over () as rn, user_id from (select user_id from public.erasure_due()) x;
select pg_temp.ok((select count(*) from run1) = 5 and not exists (select 1 from run1 where user_id = '00000000-0000-0000-0000-000000000106'), 'run 1 hands out five users, oldest window first, not the sixth');
select pg_temp.ok((select user_id from run2 where rn = 1) = '00000000-0000-0000-0000-000000000106', 'run 2 serves the never-tried sixth user first although the five earlier ones are still failing');
select pg_temp.ok((select min(attempts) = 1 and max(attempts) = 2 from public.erasure_requests where user_id::text like '00000000-0000-0000-0000-0000000001%') and (select attempts from public.erasure_requests where user_id = '00000000-0000-0000-0000-000000000106') = 1, 'attempts counts the hand-outs: 1 or 2 for the first five, exactly 1 for the sixth');
delete from public.erasure_requests where user_id::text like '00000000-0000-0000-0000-0000000001%';

\echo ALL PASS
