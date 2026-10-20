-- Rehearsal for 0014_medications_live.sql on a THROWAWAY Postgres (never the live project), with the real helpers from
-- 0001, 0002, 0003, 0008, 0010 and 0013.
-- Run (WSL Postgres or any local Postgres 15+):
--   su postgres -c 'dropdb --if-exists bantay_m0; createdb bantay_m0; psql -X -q -v ON_ERROR_STOP=1 -d bantay_m0 -f medications_rehearsal.sql'
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

-- ===== data that exists before 0014 (made-up sample values) =====
-- PB: prescription 1 (2024-11-10), prescription 2 (2023-01-05). PD: one profile medicine with a time.
insert into public.prescriptions (id, person_id, rx_date) values
 ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', '2024-11-10'),
 ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000b1', '2023-01-05'),
 ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-0000000000b1', null);
insert into public.prescription_items (id, person_id, prescription_id, line_no, drug_raw, frequency, duration, quantity, unclear, status) values
 ('21000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000001', 1, 'Metformin 500mg tab', 'once a day', null, '30', false, 'draft'),
 ('21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000001', 2, 'Amlodipine 5 mg', 'BID', null, null, false, 'draft'),
 ('21000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000001', 3, 'Paracetamol 500mg', 'every 4 hours as needed', null, null, false, 'draft'),
 ('21000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000001', 4, 'Atorvastatin 20mg', null, null, null, false, 'draft'),
 ('21000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000001', 5, 'Unreadable drug', 'OD', null, null, true, 'draft'),
 ('21000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000001', 6, 'Amoxicillin 500mg cap', 'TID', '7 days', null, false, 'draft'),
 ('21000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000002', 1, 'METFORMIN 500 MG', 'BID', null, null, false, 'draft'),
 ('21000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000002', 2, 'Losartan 50mg', 'at bedtime', null, null, false, 'draft'),
 ('21000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000002', 3, 'Rejected drug', 'OD', null, null, false, 'rejected'),
 ('21000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000003', 1, 'Cefalexin 500mg cap', 'every 6 hours', '5 days', null, false, 'draft');
-- the confirmed item needs the auto stamp to be inserted by the loader
update public.prescription_items set confidence = 1, confirmed_source = 'auto', status = 'confirmed' where id = '21000000-0000-0000-0000-000000000006';
update public.people set medicines = '{"Vitamin D 1000IU 8:00 PM"}' where id = '10000000-0000-0000-0000-0000000000d1';

\ir ../migrations/0014_medications_live.sql
-- 0014 must be safe to run twice
\ir ../migrations/0014_medications_live.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon;
create function pg_temp.med(k text) returns public.medications language sql as $$ select * from public.medications where public.normalise_drug(name) = k order by deleted_at nulls first limit 1 $$;
create function pg_temp.times(k text) returns text language sql as $$ select (schedule -> 'times')::text from public.medications where public.normalise_drug(name) = k and deleted_at is null $$;

-- ===== conversion (run by the migration as the postgres role) =====
select pg_temp.ok(public.normalise_drug('METFORMIN 500 MG') = 'metformin' and public.normalise_drug('Metformin 500mg tab') = 'metformin', 'normalise_drug strips strength, form and case');
select pg_temp.ok(public.rx_times('3x a day then as needed for difficulty of breathing (6am-12nn-6pm)') = '{08:00,14:00,20:00}', 'a fixed pattern wins over "as needed"');
select pg_temp.ok(public.rx_times('every 8 hours') = '{08:00,14:00,20:00}' and public.rx_times('every 12 hours') = '{08:00,20:00}', 'every 8 / every 12 hours');
select pg_temp.ok(public.rx_times('once a day after lunch') = '{12:00}' and public.rx_times('od') = '{08:00}' and public.rx_times('2x a day') = '{08:00,20:00}', 'after lunch -> 12:00; od; 2x a day');
select pg_temp.ok(public.rx_times('a day from monday to friday only') is null and public.rx_times('single dose') is null, 'patterns it cannot read stay unknown (needs_time), never guessed');
select pg_temp.ok(public.rx_days('3 days') = 3 and public.rx_days('2 weeks') = 14 and public.rx_days(null) is null, 'course length in days');
select pg_temp.ok((select count(*) from public.medications where deleted_at is null) = 9, '9 live items + 1 profile medicine -> 9 medications (duplicate merged, rejected skipped)');
select pg_temp.ok((select count(*) from public.medications where origin = 'rx') = 8 and (select count(*) from public.medications where origin = 'profile') = 1, 'origins: 8 rx, 1 profile');
select pg_temp.ok(pg_temp.times('metformin') = '["08:00"]' and (pg_temp.med('metformin')).per_day = 1 and (pg_temp.med('metformin')).stock_qty = 30, 'newest prescription wins: once a day -> 08:00, per_day 1, stock from quantity');
select pg_temp.ok((select count(*) from public.medication_sources s join public.medications m on m.id = s.medication_id where public.normalise_drug(m.name) = 'metformin') = 2, 'both metformin items are linked as sources');
select pg_temp.ok(pg_temp.times('amlodipine') = '["08:00", "20:00"]' and (pg_temp.med('amlodipine')).per_day = 2, 'BID -> 08:00 and 20:00');
select pg_temp.ok((pg_temp.med('paracetamol')).as_needed and pg_temp.times('paracetamol') = '[]', 'as needed -> as_needed, no times');
select pg_temp.ok(((pg_temp.med('atorvastatin')).schedule ->> 'needs_time')::boolean and pg_temp.times('atorvastatin') = '[]', 'no frequency -> needs_time, no invented time');
select pg_temp.ok(((pg_temp.med('unreadable drug')).schedule ->> 'needs_check')::boolean, 'unclear item -> needs_check');
select pg_temp.ok((pg_temp.med('amoxicillin')).med_status = 'stopped' and (pg_temp.med('amoxicillin')).stopped_on = '2024-11-17' and not coalesce(((pg_temp.med('amoxicillin')).schedule ->> 'review')::boolean, false), 'ended 7-day course -> stopped on 2024-11-17, no review');
select pg_temp.ok((pg_temp.med('cefalexin')).med_status = 'paused' and pg_temp.times('cefalexin') = '["08:00", "12:00", "16:00", "20:00"]' and ((pg_temp.med('cefalexin')).schedule ->> 'review')::boolean, 'a 5-day course with no prescription date -> paused (no reminder), asks "still taking it?", every 6 hours -> 4 times');
select pg_temp.ok(pg_temp.times('losartan') = '["21:00"]', 'at bedtime -> 21:00');
select pg_temp.ok((select count(*) from public.medications where public.normalise_drug(name) = 'rejected drug') = 0, 'a rejected item is never converted');
select pg_temp.ok(pg_temp.times('vitamin d') = '["20:00"]' and (pg_temp.med('vitamin d')).name = 'Vitamin D 1000IU', 'profile text "8:00 PM" -> 20:00, time removed from the name');
select pg_temp.ok((select bool_and(status = 'confirmed' and confirmed_source = 'auto' and confidence = 1 and confirmed_by is null) from public.medications), 'converted rows are confirmed by the system actor (auto, confidence 1, no user)');
select pg_temp.ok((select bool_and((schedule ->> 'review')::boolean and schedule ? 'review_since' and (schedule ->> 'v')::int = 1) from public.medications where med_status <> 'stopped'), 'every active or paused converted row asks "still taking it?" with a review_since date, schedule v1');

-- idempotent: a second run changes nothing
create temp table snap as select id, name, schedule, med_status, source_item_id from public.medications;
select public.rx_to_medications();
select pg_temp.ok((select count(*) from public.medications) = (select count(*) from snap)
  and not exists (select 1 from public.medications m join snap s using (id) where (m.name, m.schedule, m.med_status, m.source_item_id) is distinct from (s.name, s.schedule, s.med_status, s.source_item_id)), 'running the converter again changes nothing');

-- ===== B: member edits own medicines =====
select id as dmed from public.medications where person_id = '10000000-0000-0000-0000-0000000000d1' \gset
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update public.medications set schedule = jsonb_set(schedule, '{times}', '["09:00"]') where public.normalise_drug(name) = 'amlodipine';
update public.medications set deleted_at = now() where public.normalise_drug(name) = 'paracetamol';
select pg_temp.ok(not pg_temp.fails($$insert into public.meds_taken (person_id, name, taken_at, medication_id, slot) select person_id, name, now(), id, '08:00' from public.medications where public.normalise_drug(name) = 'losartan'$$), 'self logs a dose by medication id and slot');
select pg_temp.ok(not pg_temp.fails($$insert into public.meds_taken (person_id, name, taken_at, medication_id, slot, skipped) select person_id, name, now(), id, '20:00', true from public.medications where public.normalise_drug(name) = 'amlodipine'$$), 'self records a skip (syncs, unlike the old per-device skip)');
select pg_temp.ok(not pg_temp.fails($$update public.meds_taken set slot = '21:00' where skipped$$), 'the widened column grant lets self fix a slot');
select pg_temp.ok(pg_temp.fails(format('insert into public.meds_taken (person_id, name, taken_at, medication_id) values (%L, %L, now(), %L)', '10000000-0000-0000-0000-0000000000b1', 'x', :'dmed')), 'a dose cannot point at another person''s medicine');
select pg_temp.ok(pg_temp.fails($$insert into public.meds_taken (person_id, name, taken_at, slot) values ('10000000-0000-0000-0000-0000000000b1', 'x', now(), '8am')$$), 'slot must be HH:MM');
select pg_temp.ok(not pg_temp.fails($$insert into public.medications (person_id, name, status) values ('10000000-0000-0000-0000-0000000000b1', 'Omega 3', 'confirmed')$$), 'self adds a manual medicine');
select pg_temp.ok((select origin = 'manual' and schedule = '{"v": 1, "times": []}'::jsonb and confirmed_source = 'user' from public.medications where name = 'Omega 3'), 'manual: origin manual, schedule default v1, stamped as the user');
select pg_temp.ok(pg_temp.fails($$insert into public.medications (person_id, name, status) values ('10000000-0000-0000-0000-0000000000b1', 'Metformin 850 mg', 'confirmed')$$), 'a second active row for the same drug is refused (one medication per drug)');
reset role;
select pg_temp.ok((pg_temp.med('amlodipine')).edited_at is not null and (pg_temp.med('amlodipine')).confirmed_source = 'user', 'an edit sets edited_at and re-stamps the row as the editor''s');
select pg_temp.ok((select count(*) from public.medication_changes c join public.medications m on m.id = c.medication_id where public.normalise_drug(m.name) = 'amlodipine' and c.field = 'schedule' and c.by = '00000000-0000-0000-0000-00000000000b') = 1, 'the edit is in medication_changes with who and which field');
select public.rx_to_medications();
select pg_temp.ok(pg_temp.times('amlodipine') = '["09:00"]', 're-running the converter never overwrites an edited row');
select pg_temp.ok((select count(*) from public.medications where public.normalise_drug(name) = 'paracetamol') = 1 and (pg_temp.med('paracetamol')).deleted_at is not null, 'a deleted medicine stays deleted (tombstone), not recreated');

-- ===== new imports and rejects (the trigger) =====
insert into public.prescription_items (id, person_id, prescription_id, line_no, drug_raw, frequency, status) values
 ('21000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000001', 7, 'Omeprazole 20mg cap', 'OD', 'draft');
select pg_temp.ok(pg_temp.times('omeprazole') = '["08:00"]', 'a newly imported item becomes a medication at once (trigger)');
update public.prescription_items set status = 'rejected' where id = '21000000-0000-0000-0000-000000000010';
select pg_temp.ok((select count(*) from public.medications where public.normalise_drug(name) = 'omeprazole') = 0, 'rejecting its only source removes an unedited converted medication');
update public.prescription_items set status = 'rejected' where id = '21000000-0000-0000-0000-000000000002';
select pg_temp.ok(pg_temp.times('amlodipine') = '["09:00"]', 'an EDITED medication survives its source being rejected');

-- ===== C: read-only carer of PB =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.medications where person_id = '10000000-0000-0000-0000-0000000000b1') >= 9, 'read-only carer sees the converted (confirmed) medicines');
select pg_temp.ok((select count(*) from public.medication_changes) >= 1, 'read-only carer sees the change history of confirmed medicines');
update public.medications set name = 'hacked' where person_id = '10000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.fails($$insert into public.medication_changes (medication_id, person_id, field) select id, person_id, 'x' from public.medications limit 1$$), 'nobody writes history directly');
reset role;
select pg_temp.ok((select count(*) from public.medications where name = 'hacked') = 0, 'read-only carer cannot edit');

-- ===== D: writer of PD, stranger to PB =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok((select count(*) from public.medications where person_id = '10000000-0000-0000-0000-0000000000b1') = 0, 'stranger sees none of PB''s medicines');
select pg_temp.ok(not pg_temp.fails($$update public.medications set med_status = 'paused' where person_id = '10000000-0000-0000-0000-0000000000d1'$$), 'writer may update a medicine of their dependent');
select pg_temp.ok((select med_status = 'paused' from public.medications where person_id = '10000000-0000-0000-0000-0000000000d1'), 'and the pause is stored');

-- ===== A: admin =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.medications) = 10, 'admin sees every medicine (9 converted + 1 manual, incl. the deleted one)');

-- ===== anon =====
set role anon;
select pg_temp.ok(pg_temp.fails($$select count(*) from public.medications$$) and pg_temp.fails($$select count(*) from public.medication_changes$$), 'anon has no access');
reset role;

-- ===== down, then up again =====
\ir ../migrations/0014_medications_live.down.sql
select pg_temp.ok(to_regclass('public.medication_sources') is null and to_regclass('public.medication_changes') is null, 'down drops the new tables');
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'medications' and column_name in ('origin', 'deleted_at', 'edited_at'))
  and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'meds_taken' and column_name in ('medication_id', 'slot', 'skipped')), 'down drops the new columns');
select pg_temp.ok((select count(*) from public.medications) = 3, 'down removes unedited converted rows and user-deleted rows, keeps the 3 a person wrote (2 edited, 1 manual)');
\ir ../migrations/0014_medications_live.sql
select pg_temp.ok((select count(*) from public.medications where deleted_at is null) >= 9, 'up again after down converts again');
\echo MEDICATIONS REHEARSAL DONE
