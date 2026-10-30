-- Rehearsal for 0044_logged_by.sql on a THROWAWAY Postgres (never the live project). Loads the chain (0001-0042), 0043, then 0044 twice, then proves it.
-- Run from WSL in supabase/tests: dropdb --if-exists bantay_s16_l6; createdb bantay_s16_l6; psql -X -q -v ON_ERROR_STOP=1 -d bantay_s16_l6 -f logged_by_rehearsal.sql
-- Actors: b1 member (person b1); c1 writer carer of b1; d1 read-only carer of b1; a1 admin.
\set ON_ERROR_STOP on
\ir chain_rehearsal.sql
reset role;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to service_role;
\ir ../migrations/0043_s15_security.sql
\ir ../migrations/0044_logged_by.sql
\ir ../migrations/0044_logged_by.sql

insert into public.carers (carer_id, person_id, can_write) values
 ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000b1', true),
 ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000b1', false);

-- a writer carer logs FOR b1, forging logged_by = admin: the trigger stamps the carer
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into public.readings (person_id, taken_at, test, value, unit, logged_by) values ('10000000-0000-0000-0000-0000000000b1', now(), 'weight', 60, 'kg', '00000000-0000-0000-0000-0000000000a1');
insert into public.activity (client_id, person_id, kind, started_at, source, logged_by) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', 'check-in', now(), 'manual', '00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok((select logged_by::text from public.readings where test = 'weight') = '00000000-0000-0000-0000-0000000000c1', 'a carer logging a reading for b1 is stamped logged_by = the carer, not a forged id');
select pg_temp.ok((select logged_by::text from public.activity where client_id = '30000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-0000000000c1', 'same for activity');
-- no rewriting who logged it
update public.readings set logged_by = '00000000-0000-0000-0000-0000000000a1', value = 61 where test = 'weight';
select pg_temp.ok((select logged_by::text from public.readings where test = 'weight') = '00000000-0000-0000-0000-0000000000c1' and (select value from public.readings where test = 'weight') = 61, 'an update keeps logged_by and still changes the value');
reset role;

-- the owner logging for themselves is stamped with their own id
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.readings (person_id, taken_at, test, value, unit) values ('10000000-0000-0000-0000-0000000000b1', now(), 'bp_systolic', 120, 'mmHg');
select pg_temp.ok((select logged_by::text from public.readings where test = 'bp_systolic') = '00000000-0000-0000-0000-0000000000b1', 'self logging is stamped with the owner');
reset role;

-- a read-only carer still cannot insert (RLS unchanged)
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.ok(pg_temp.fails($$insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000b1', now(), 'weight', 1)$$), 'a read-only carer is still refused by RLS');
reset role;

-- no auth.uid() (service role / import) keeps what it sends; unknown stays null
reset request.jwt.claim.sub;
insert into public.readings (person_id, taken_at, test, value, logged_by) values ('10000000-0000-0000-0000-0000000000b1', now(), 'glucose', 90, '00000000-0000-0000-0000-0000000000d1');
insert into public.readings (person_id, taken_at, test, value) values ('10000000-0000-0000-0000-0000000000b1', now(), 'glucose', 91);
select pg_temp.ok((select count(*) from public.readings where test = 'glucose' and logged_by::text = '00000000-0000-0000-0000-0000000000d1') = 1 and (select count(*) from public.readings where test = 'glucose' and logged_by is null) = 1, 'a caller with no auth.uid() keeps what it sends; unknown stays null');

-- ML-21: nobody can execute the trigger function directly
select pg_temp.ok(not has_function_privilege('authenticated', 'public.stamp_logged_by()', 'execute') and not has_function_privilege('anon', 'public.stamp_logged_by()', 'execute') and not has_function_privilege('service_role', 'public.stamp_logged_by()', 'execute'), 'stamp_logged_by is not executable by any API role');

-- the user delete sets null, the row stays
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select count(*) from public.readings where test = 'weight') = 1 and (select logged_by from public.readings where test = 'weight') is null, 'deleting the logger nulls logged_by and keeps the row');

-- down file runs twice and removes everything
\ir ../migrations/0044_logged_by.down.sql
\ir ../migrations/0044_logged_by.down.sql
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and column_name = 'logged_by') and to_regproc('public.stamp_logged_by') is null, 'the down file removes the columns and the function');
\echo L6 REHEARSAL DONE
