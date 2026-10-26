-- Rehearsal for 0034_pin_reset_erasure.sql on a THROWAWAY Postgres (never the live project), with the real migrations 0001, 0002, 0003, 0008, 0010, 0013, 0014, 0016, 0018, 0021, 0029, 0023, 0024, 0027, 0030, 0031.
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
\ir ../migrations/0013_records_autoconfirm.sql
\ir ../migrations/0014_medications_live.sql
\ir ../migrations/0016_medications_softdelete.sql
\ir ../migrations/0018_dose_watch.sql
\ir ../migrations/0021_admin_audit.sql
\ir ../migrations/0029_admin_view_as.sql
\ir ../migrations/0023_family_memories.sql
\ir ../migrations/0024_nutrition.sql
\ir ../migrations/0027_family_messages.sql
\ir ../migrations/0030_carer_alerts.sql
\ir ../migrations/0031_sos.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon, service_role;

\ir ../migrations/0034_pin_reset_erasure.sql
-- 0034 must be safe to run twice
\ir ../migrations/0034_pin_reset_erasure.sql

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
  from unnest(array['00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000e']::uuid[]) u,
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
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000a', '4821') = false, 'the admin cannot approve without the pin_approve row');
select pg_temp.ok((select attempts from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') = 0, 'none of the refusals counted an attempt');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000c', '0000') = false, 'a wrong code is refused');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000c', 'abcd') = false, 'a malformed code is refused');
select pg_temp.ok((select attempts from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') = 2 and (select approved_at from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') is null, 'two wrong tries counted, still unapproved');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000c', '4821') = true, 'C approves with the right code');
select pg_temp.ok((select approved_by from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000c', 'approved_by is C');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000d', '4821') = false, 'first approval wins: D is refused');
select pg_temp.ok((select approved_by from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000c', 'approved_by is still C');
-- 5 wrong codes burn the request
select pg_temp.approve('00000000-0000-0000-0000-00000000000c', '0000', 'a0000000-0000-0000-0000-000000000002') from generate_series(1, 4);
select pg_temp.ok((select used_at from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000002') is null, 'four wrong codes do not burn it yet');
select pg_temp.approve('00000000-0000-0000-0000-00000000000d', '0000', 'a0000000-0000-0000-0000-000000000002');
select pg_temp.ok((select used_at is not null and attempts = 5 from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000002'), 'the fifth wrong code burns the request (used_at set)');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000c', '1111', 'a0000000-0000-0000-0000-000000000002') = false, 'after burning, even the right code is refused');
select pg_temp.ok((select attempts from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000002') = 5 and (select approved_at from public.pin_reset_requests where id = 'a0000000-0000-0000-0000-000000000002') is null, 'attempts stay at 5 and it was never approved');
-- expired, used, google
insert into public.pin_reset_requests (id, user_id, method, code, secret_hash, expires_at) values ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'family', '2222', 'h3', now() - interval '1 minute');
insert into public.pin_reset_requests (id, user_id, method, code, secret_hash, used_at) values ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', 'family', '3333', 'h4', now());
insert into public.pin_reset_requests (id, user_id, method, code, secret_hash) values ('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000b', 'google', '4444', 'h5');
insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
select '10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000c', 'pin_approve', 'pin_approve', r from unnest(array['a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005']) r;
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000c', '2222', 'a0000000-0000-0000-0000-000000000003') = false, 'an expired request cannot be approved');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000c', '3333', 'a0000000-0000-0000-0000-000000000004') = false, 'a used request cannot be approved');
select pg_temp.ok(pg_temp.approve('00000000-0000-0000-0000-00000000000c', '4444', 'a0000000-0000-0000-0000-000000000005') = false, 'a google-method request is never approved by a family member');
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
update public.people set photo_path = '10000000-0000-0000-0000-0000000000b1.jpg', phone = '0917', blood_type = 'O+' where id = '10000000-0000-0000-0000-0000000000b1';
insert into public.sos_events (id, person_id, user_id, at) values ('e0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', now());
insert into public.sos_acks (event_id, user_id) values ('e0000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000c');
insert into public.family_messages (client_id, sender_id, kind, body) values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'text', 'hi'), (gen_random_uuid(), '00000000-0000-0000-0000-00000000000c', 'text', 'hello');
insert into public.push_subscriptions (user_id, endpoint) values ('00000000-0000-0000-0000-00000000000b', 'https://push.example/b'), ('00000000-0000-0000-0000-00000000000c', 'https://push.example/c');
insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000d', 'dose_missed', 'dose_missed', 'dm1'), ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'dose_missed', 'dose_missed', 'dm2');
insert into public.food_entries (person_id, eaten_at, meal, name) values ('10000000-0000-0000-0000-0000000000b1', now(), 'lunch', 'rice');

-- ===== export_my_data =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select public.export_my_data() as ex \gset
reset role;
select pg_temp.ok((:'ex'::jsonb -> 'person' ->> 'display_name') = 'Bee' and jsonb_array_length(:'ex'::jsonb -> 'readings') = 2 and jsonb_array_length(:'ex'::jsonb -> 'meds_taken') = 1, 'export returns the caller own person and rows (2 readings, 1 dose), not C''s');
select pg_temp.ok(not (:'ex'::text like '%Metformin%') and not (:'ex'::text like '%Cee%'), 'export holds nothing of another member');
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
select public.erase_user_data('00000000-0000-0000-0000-00000000000b');
reset role;
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
select pg_temp.ok((select done_at is not null from public.erasure_requests where user_id = '00000000-0000-0000-0000-00000000000b') and not exists (select 1 from public.erasure_due()), 'the request is marked done and no longer due');
select pg_temp.ok(pg_temp.fails($$select public.erase_user_data('00000000-0000-0000-0000-00000000000b')$$), 'a second erase run for the same user is refused');

\echo ALL PASS
