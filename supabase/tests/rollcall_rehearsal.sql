-- Rehearsal for 0041_rollcall.sql on a THROWAWAY Postgres (never the live project). Run AFTER chain_rehearsal.sql (which includes 0041) in the same database:
--   sudo -u postgres createdb bantay_s12b_i; sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d bantay_s12b_i -f chain_rehearsal.sql
--   sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d bantay_s12b_i -f rollcall_rehearsal.sql
-- Chain actors: a1 admin (writer carer of the no-login person e1, its creator); b1 member (person b1); c1 member (person c1); d1 disabled member. f1 is added here: signed in, no app_roles row.
\set ON_ERROR_STOP on
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
create function pg_temp.state(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function pg_temp.ok(boolean, text), pg_temp.state(text) to authenticated, anon, service_role;

\ir ../migrations/0041_rollcall.sql   -- twice: must be safe to run again

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000f1', 'f1@example.com', '{"provider":"google"}', '{}') on conflict do nothing;
insert into public.people (id, auth_user_id, display_name, created_by) values ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Stranger', '00000000-0000-0000-0000-0000000000f1') on conflict do nothing;

-- ===== grants =====
select pg_temp.ok(not has_function_privilege('authenticated', 'public.rollcall_alert()', 'execute') and not has_function_privilege('authenticated', 'public.rollcall_stamp()', 'execute')
  and not has_function_privilege('anon', 'public.rollcall_alert()', 'execute') and not has_function_privilege('service_role', 'public.rollcall_alert()', 'execute'), 'trigger functions are not callable (ACL restated, ML-21)');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.sos_events_prune()', 'execute') and not has_function_privilege('anon', 'public.sos_events_prune()', 'execute')
  and not has_function_privilege('service_role', 'public.sos_events_prune()', 'execute'), 'sos_events_prune: nobody but the cron owner (restated)');
select pg_temp.ok(not has_table_privilege('anon', 'public.rollcall', 'select') and has_table_privilege('authenticated', 'public.rollcall', 'select')
  and not has_table_privilege('authenticated', 'public.rollcall', 'delete') and not has_column_privilege('authenticated', 'public.rollcall', 'user_id', 'update')
  and not has_column_privilege('authenticated', 'public.rollcall', 'id', 'update'), 'table grants: select + insert + update of status/at (and the two key columns for the upsert), no delete');

-- ===== a member upserts their own row twice -> one row (the exact statement PostgREST sends for an upsert) =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.rollcall (person_id, storm_ref, status, at) values ('10000000-0000-0000-0000-0000000000b1', 'pagasa-tcws-rosal-dampas', 'ok', now())
  on conflict (person_id, storm_ref) do update set person_id = excluded.person_id, storm_ref = excluded.storm_ref, status = excluded.status, at = excluded.at;
insert into public.rollcall (person_id, storm_ref, status, at) values ('10000000-0000-0000-0000-0000000000b1', 'pagasa-tcws-rosal-dampas', 'ok', now())
  on conflict (person_id, storm_ref) do update set person_id = excluded.person_id, storm_ref = excluded.storm_ref, status = excluded.status, at = excluded.at;
select pg_temp.ok((select count(*) from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000b1') = 1, 'b1 upserts twice: one row');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'rollcall') = 0, 'ok tells nobody');

-- user_id is the caller whatever the client sends
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into public.rollcall (person_id, user_id, storm_ref, status) values ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'pagasa-tcws-rosal-dampas', 'ok');
reset role;
select pg_temp.ok((select user_id from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000c1') = '00000000-0000-0000-0000-0000000000c1', 'user_id forced to auth.uid() on insert');

-- ===== strangers cannot write =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok(pg_temp.state($$insert into public.rollcall (person_id, storm_ref, status) values ('10000000-0000-0000-0000-0000000000b1', 'other-storm', 'ok')$$) = '42501', 'c1 cannot insert a row for b1 (RLS)');
update public.rollcall set status = 'need_help' where person_id = '10000000-0000-0000-0000-0000000000b1';
reset role;
select pg_temp.ok((select status from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000b1') = 'ok', 'c1 cannot update b1''s row (no row matched)');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok(pg_temp.state($$insert into public.rollcall (person_id, storm_ref, status) values ('10000000-0000-0000-0000-0000000000b1', 'other-storm', 'ok')$$) = '42501', 'a signed-in stranger cannot write for b1');
select pg_temp.ok((select count(*) from public.rollcall) = 0, 'a stranger (no app_roles row) reads nothing');
reset role;
set role anon;
select pg_temp.ok(pg_temp.state($$select * from public.rollcall$$) = '42501', 'anon cannot read');
select pg_temp.ok(pg_temp.state($$insert into public.rollcall (person_id, storm_ref, status) values ('10000000-0000-0000-0000-0000000000b1', 'x', 'ok')$$) = '42501', 'anon cannot write');
reset role;
-- bad status and a delete are refused
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.state($$insert into public.rollcall (person_id, storm_ref, status) values ('10000000-0000-0000-0000-0000000000b1', 'storm-2', 'fine')$$) = '23514', 'status other than ok / need_help is refused (23514)');
select pg_temp.ok(pg_temp.state($$delete from public.rollcall$$) = '42501', 'no delete grant');
reset role;

-- ===== a writer carer answers for a person with no login; an update never moves the row =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.rollcall (person_id, storm_ref, status) values ('10000000-0000-0000-0000-0000000000e1', 'pagasa-tcws-rosal-dampas', 'ok');
select pg_temp.ok((select count(*) from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000e1') = 1, 'the writer carer (creator) answers for e1');
update public.rollcall set person_id = '10000000-0000-0000-0000-0000000000b1', storm_ref = 'moved' where person_id = '10000000-0000-0000-0000-0000000000e1';
reset role;
select pg_temp.ok((select count(*) from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000e1' and storm_ref = 'pagasa-tcws-rosal-dampas') = 1
  and not exists (select 1 from public.rollcall where storm_ref = 'moved'), 'an update cannot change person_id or storm_ref (trigger pins them)');

-- ===== the family reads all; the disabled and strangers read none =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select count(*) from public.rollcall where storm_ref = 'pagasa-tcws-rosal-dampas') = 3, 'an active member reads every member''s status (3 rows)');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.ok((select count(*) from public.rollcall) = 0, 'a disabled member reads nothing');
reset role;

-- ===== need_help alerts the rest of the family once =====
delete from public.carer_alerts where kind = 'rollcall';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.rollcall (person_id, storm_ref, status, at) values ('10000000-0000-0000-0000-0000000000b1', 'pagasa-tcws-rosal-dampas', 'need_help', now())
  on conflict (person_id, storm_ref) do update set person_id = excluded.person_id, storm_ref = excluded.storm_ref, status = excluded.status, at = excluded.at;
reset role;
select pg_temp.ok((select count(*) from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000b1') = 1 and (select status from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000b1') = 'need_help', 'ok -> need_help updates the same row');
-- hand count: active app_roles are a1, c1 and b1 (d1 disabled); b1 is the person, so a1 and c1 get one row each
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'rollcall' and template = 'rollcall_help') = 2
  and not exists (select 1 from public.carer_alerts where kind = 'rollcall' and carer_user_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1')), 'need_help: 2 family rows (a1, c1), none for b1 or the disabled d1');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.rollcall (person_id, storm_ref, status, at) values ('10000000-0000-0000-0000-0000000000b1', 'pagasa-tcws-rosal-dampas', 'need_help', now())
  on conflict (person_id, storm_ref) do update set person_id = excluded.person_id, storm_ref = excluded.storm_ref, status = excluded.status, at = excluded.at;
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'rollcall') = 2, 'tapping need help again adds no second alert');

-- ===== a check-in is never blocked by the alert (notify_family broken -> the row still commits) =====
alter function public.notify_family(uuid, text, text, text, text) rename to notify_family_x;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into public.rollcall (person_id, storm_ref, status) values ('10000000-0000-0000-0000-0000000000c1', 'storm-b', 'need_help');
reset role;
alter function public.notify_family_x(uuid, text, text, text, text) rename to notify_family;
select pg_temp.ok((select count(*) from public.rollcall where storm_ref = 'storm-b' and status = 'need_help') = 1, 'with notify_family broken the need_help row still saved');

-- ===== retention: 30 days, inside sos_events_prune =====
insert into public.rollcall (person_id, storm_ref, status, at) values ('10000000-0000-0000-0000-0000000000c1', 'storm-old', 'ok', now() - interval '31 days'), ('10000000-0000-0000-0000-0000000000c1', 'storm-new', 'ok', now() - interval '29 days');
select public.sos_events_prune();
select pg_temp.ok(not exists (select 1 from public.rollcall where storm_ref = 'storm-old') and exists (select 1 from public.rollcall where storm_ref = 'storm-new'), 'prune: 31-day-old row gone, 29-day-old row kept');
select pg_temp.ok(exists (select 1 from pg_proc where proname = 'sos_events_prune' and prosrc like '%90 days%'), 'prune still keeps the 0031 sos_events line');

-- ===== down migration then up again =====
\ir ../migrations/0041_rollcall.down.sql
select pg_temp.ok(to_regclass('public.rollcall') is null and to_regproc('public.rollcall_alert') is null, 'down drops the table and functions');
\ir ../migrations/0041_rollcall.sql
select pg_temp.ok(to_regclass('public.rollcall') is not null, 'up again after down');
\echo ROLLCALL REHEARSAL DONE
