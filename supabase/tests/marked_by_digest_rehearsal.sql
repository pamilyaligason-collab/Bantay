-- Rehearsal for 0039_marked_by_digest.sql on a THROWAWAY Postgres (never the live project). Loads the whole chain (which includes 0039), then proves it.
-- Run from WSL in supabase/tests: dropdb --if-exists bantay_s12_c; createdb bantay_s12_c; psql -X -q -v ON_ERROR_STOP=1 -d bantay_s12_c -f marked_by_digest_rehearsal.sql
-- Actors: b1 member (person b1); c1 writer carer of b1; d1 read-only carer of b1; a1 admin.
\set ON_ERROR_STOP on
\ir chain_rehearsal.sql
reset role;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to service_role;

-- 0039 must be safe to run twice
\ir ../migrations/0039_marked_by_digest.sql

insert into public.carers (carer_id, person_id, can_write) values
 ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000b1', true),
 ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000b1', false);

-- ===== marked_by =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into public.meds_taken (client_id, person_id, name, taken_at, marked_by) values
 ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', 'Losartan', now(), '00000000-0000-0000-0000-0000000000a1');
select marked_by::text as mb from public.meds_taken where client_id = '20000000-0000-0000-0000-000000000001' \gset
select pg_temp.ok(:'mb' = '00000000-0000-0000-0000-0000000000c1', 'a carer inserting a dose with a forged marked_by ends with their own auth.uid()');
select pg_temp.ok((select marked_by_name from public.meds_taken where client_id = '20000000-0000-0000-0000-000000000001') = 'Lola', 'the marker first name is stamped when the marker is not the owner');
select pg_temp.ok(pg_temp.fails($$update public.meds_taken set marked_by_name = 'Fake' where client_id = '20000000-0000-0000-0000-000000000001'$$), 'marked_by_name is not updatable');
select pg_temp.ok(pg_temp.fails($$update public.meds_taken set marked_by ='00000000-0000-0000-0000-0000000000a1' where client_id = '20000000-0000-0000-0000-000000000001'$$), 'marked_by is not updatable (column grant)');
select pg_temp.ok(pg_temp.fails($$insert into public.meds_taken (person_id, name, taken_at) values ('10000000-0000-0000-0000-0000000000e1', 'X', now())$$), 'the insert policy still holds');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.meds_taken (client_id, person_id, name, taken_at) values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000b1', 'Amlodipine', now());
select marked_by::text as mb2 from public.meds_taken where client_id = '20000000-0000-0000-0000-000000000002' \gset
select pg_temp.ok(:'mb2' = '00000000-0000-0000-0000-0000000000b1', 'the owner marking their own dose is stamped with their own id');
select pg_temp.ok((select marked_by_name from public.meds_taken where client_id = '20000000-0000-0000-0000-000000000002') is null, 'no marker name when the owner marked it');
update public.meds_taken set name = 'Amlodipine 5mg' where client_id = '20000000-0000-0000-0000-000000000002';
select pg_temp.ok((select name from public.meds_taken where client_id = '20000000-0000-0000-0000-000000000002') = 'Amlodipine 5mg', 'the other update grants (name) still work');
reset role;
-- a caller with no auth.uid() (the service role, here the loader) keeps what it sends
reset request.jwt.claim.sub;
insert into public.meds_taken (client_id, person_id, name, taken_at, marked_by) values
 ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-0000000000b1', 'Statin', now(), '00000000-0000-0000-0000-0000000000d1');
select pg_temp.ok((select marked_by::text from public.meds_taken where client_id = '20000000-0000-0000-0000-000000000003') = '00000000-0000-0000-0000-0000000000d1', 'a caller with no auth.uid() keeps the marked_by it sends');
update public.people set display_name = 'Roco, Lloyd Jr' where id = '10000000-0000-0000-0000-0000000000c1';
insert into public.meds_taken (client_id, person_id, name, taken_at, marked_by) values ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-0000000000b1', 'Comma', now(), '00000000-0000-0000-0000-0000000000c1');
select pg_temp.ok((select marked_by_name from public.meds_taken where client_id = '20000000-0000-0000-0000-000000000005') = 'Lloyd', 'a "Surname, Given" display name gives the given name (ML-35)');
update public.people set display_name = 'Lola' where id = '10000000-0000-0000-0000-0000000000c1';
insert into public.meds_taken (client_id, person_id, name, taken_at) values ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-0000000000b1', 'Old', now());
select pg_temp.ok((select marked_by from public.meds_taken where client_id = '20000000-0000-0000-0000-000000000004') is null, 'unknown stays null (old rows and imports)');
select pg_temp.ok((select confdeltype from pg_constraint where conrelid = 'public.meds_taken'::regclass and contype = 'f' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.meds_taken'::regclass and attname = 'marked_by')]) = 'n', 'deleting the marker sets marked_by null, it never deletes the dose');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.meds_taken_marked_by()', 'execute') and not has_function_privilege('anon', 'public.meds_taken_marked_by()', 'execute'), 'the trigger function is not callable by app roles');
select pg_temp.ok(not has_column_privilege('authenticated', 'public.meds_taken', 'marked_by', 'update') and has_column_privilege('authenticated', 'public.meds_taken', 'slot', 'update') and has_column_privilege('authenticated', 'public.meds_taken', 'skipped', 'update'), 'update grants: 0014 list kept, marked_by absent');

-- ===== carer_prefs =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select count(*) from public.carer_prefs) = 0 and not pg_temp.fails($$insert into public.carer_prefs (user_id, digest_on) values ('00000000-0000-0000-0000-0000000000c1', false)$$), 'a user may add their own opt-out row');
select pg_temp.ok(pg_temp.fails($$insert into public.carer_prefs (user_id, digest_on) values ('00000000-0000-0000-0000-0000000000d1', false)$$), 'a user cannot add a row for someone else');
update public.carer_prefs set digest_on = true, updated_at = now() where user_id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select digest_on from public.carer_prefs where user_id = '00000000-0000-0000-0000-0000000000c1') = true, 'a user may flip their own switch back');
select pg_temp.ok(pg_temp.fails($$update public.carer_prefs set user_id = '00000000-0000-0000-0000-0000000000d1'$$), 'user_id is not updatable');
insert into public.carer_prefs (user_id, digest_on) values ('00000000-0000-0000-0000-0000000000c1', false) on conflict (user_id) do update set digest_on = excluded.digest_on, updated_at = now();
select pg_temp.ok((select digest_on from public.carer_prefs) = false, 'the app upsert works');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.ok((select count(*) from public.carer_prefs) = 0, 'another user cannot read the row');
do $$ declare n int; begin update public.carer_prefs set digest_on = true; get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL another user changed the row'; end if; raise notice 'PASS another user cannot change the row'; end $$;
select pg_temp.ok(pg_temp.fails($$delete from public.carer_prefs$$), 'no delete grant');
reset role;
set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.carer_prefs$$), 'anon cannot read');
reset role;
set role service_role;
select pg_temp.ok((select count(*) from public.carer_prefs where digest_on = false) = 1, 'the service role reads who opted out');
select pg_temp.ok(pg_temp.fails($$update public.carer_prefs set digest_on = true$$), 'the service role only reads');
reset role;

-- ===== erasure / export =====
select pg_temp.ok(exists (select 1 from public.erasure_targets() where tbl = 'carer_prefs' and col = 'user_id' and kind = 'user'), 'erasure_targets() picks up carer_prefs.user_id as a user key');
select pg_temp.ok(not exists (select 1 from public.erasure_targets() where tbl = 'meds_taken' and col = 'marked_by'), 'marked_by is not an erase key (the dose belongs to the person; the FK nulls it)');

-- ===== down, and up again =====
\ir ../migrations/0039_marked_by_digest.down.sql
select pg_temp.ok(to_regclass('public.carer_prefs') is null and to_regprocedure('public.meds_taken_marked_by()') is null
  and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'meds_taken' and column_name = 'marked_by'), 'down removes the table, the trigger function and the column');
select pg_temp.ok((select count(*) from public.meds_taken) = 5 and has_column_privilege('authenticated', 'public.meds_taken', 'slot', 'update'), 'down keeps every dose and the 0014 grants');
\ir ../migrations/0039_marked_by_digest.down.sql
\ir ../migrations/0039_marked_by_digest.sql
select pg_temp.ok(to_regclass('public.carer_prefs') is not null, 'up again after down');
\echo MARKED-BY REHEARSAL DONE
