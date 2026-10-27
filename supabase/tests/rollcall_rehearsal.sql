-- Rehearsal for 0041_rollcall.sql on a THROWAWAY Postgres (never the live project). Run AFTER chain_rehearsal.sql (which includes 0041) in the same database:
--   sudo -u postgres createdb bantay_s12b2_i; sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d bantay_s12b2_i -f chain_rehearsal.sql
--   sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d bantay_s12b2_i -f rollcall_rehearsal.sql
-- Chain actors: a1 admin (writer carer of the no-login person e1, its creator); b1 member (person b1); c1 member (person c1); d1 disabled member. f1 is added here: signed in, no app_roles row.
-- The table has no write grant: every write goes through rollcall_set / ensure_storm_tasks (fix round 2).
\set ON_ERROR_STOP on
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
create function pg_temp.state(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function pg_temp.ok(boolean, text), pg_temp.state(text) to authenticated, anon, service_role;

\ir ../migrations/0041_rollcall.sql   -- twice: must be safe to run again

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000f1', 'f1@example.com', '{"provider":"google"}', '{}') on conflict do nothing;
insert into public.people (id, auth_user_id, display_name, created_by) values ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Stranger', '00000000-0000-0000-0000-0000000000f1') on conflict do nothing;
-- live storm signals (tcws), an expired one, and a non-storm kind
insert into public.safety_alerts (id, kind, level, title, what, where_text, when_text, do_now, source, issued_at, bulletin, expires_at) values
  ('storm-1', 'tcws', 'Signal No. 2', 't', 'w', 'x', 'y', 'z', 'PAGASA', now(), 'b', now() + interval '1 day'),
  ('storm-2', 'tcws', 'Signal No. 3', 't', 'w', 'x', 'y', 'z', 'PAGASA', now(), 'b', null),
  ('storm-3', 'tsunami', null, 't', 'w', 'x', 'y', 'z', 'PHIVOLCS', now(), 'b', now() + interval '1 day'),
  ('storm-old', 'tcws', 'Signal No. 1', 't', 'w', 'x', 'y', 'z', 'PAGASA', now() - interval '3 days', 'b', now() - interval '1 day'),
  ('quake-1', 'quake', null, 't', 'w', 'x', 'y', 'z', 'PHIVOLCS', now(), 'b', now() + interval '1 day');

-- ===== grants =====
select pg_temp.ok(not has_function_privilege('authenticated', 'public.storm_gate(text)', 'execute') and not has_function_privilege('service_role', 'public.storm_gate(text)', 'execute')
  and not has_function_privilege('anon', 'public.storm_gate(text)', 'execute'), 'storm_gate is not callable by an app role (ACL restated, ML-21)');
select pg_temp.ok(has_function_privilege('authenticated', 'public.rollcall_set(uuid,text,text)', 'execute') and has_function_privilege('authenticated', 'public.ensure_storm_tasks(text)', 'execute')
  and not has_function_privilege('anon', 'public.rollcall_set(uuid,text,text)', 'execute') and not has_function_privilege('anon', 'public.ensure_storm_tasks(text)', 'execute')
  and not has_function_privilege('service_role', 'public.rollcall_set(uuid,text,text)', 'execute'), 'rollcall_set and ensure_storm_tasks: signed-in members only');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.sos_events_prune()', 'execute') and not has_function_privilege('anon', 'public.sos_events_prune()', 'execute')
  and not has_function_privilege('service_role', 'public.sos_events_prune()', 'execute'), 'sos_events_prune: nobody but the cron owner (restated)');
select pg_temp.ok(not has_table_privilege('anon', 'public.rollcall', 'select') and has_table_privilege('authenticated', 'public.rollcall', 'select')
  and not has_table_privilege('authenticated', 'public.rollcall', 'insert') and not has_table_privilege('authenticated', 'public.rollcall', 'update')
  and not has_table_privilege('authenticated', 'public.rollcall', 'delete') and not has_any_column_privilege('authenticated', 'public.rollcall', 'update'), 'table grants: select only (no direct insert, update or delete)');

-- ===== a direct insert or update is refused for everyone (42501) =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.state($$insert into public.rollcall (person_id, storm_ref, status) values ('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'ok')$$) = '42501', 'a member cannot insert directly');
reset role;

-- ===== a member answers for themself twice -> one row; ok tells nobody =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'ok');
select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'ok');
select pg_temp.ok((select count(*) from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000b1') = 1, 'b1 answers twice: one row');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'rollcall') = 0, 'ok tells nobody');
select pg_temp.ok((select user_id from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000b1') = '00000000-0000-0000-0000-0000000000b1', 'user_id is the caller');
-- the first calls made the storm checklist once: 4 tasks, deterministic ids, due today (Manila)
select pg_temp.ok((select count(*) from public.family_tasks where client_id like 'storm:storm-1:%') = 4
  and (select count(distinct title) from public.family_tasks where client_id like 'storm:storm-1:%') = 4
  and not exists (select 1 from public.family_tasks where client_id like 'storm:storm-1:%' and (due is distinct from (now() at time zone 'Asia/Manila')::date or done or deleted_at is not null)), 'storm-1: 4 tasks made once, not done');

-- ===== two members' first calls for a fresh storm -> 4 tasks in total; a ticked or deleted task is never put back =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-2', 'ok');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select public.rollcall_set('10000000-0000-0000-0000-0000000000c1', 'storm-2', 'ok');
select public.ensure_storm_tasks('storm-2');
reset role;
select pg_temp.ok((select count(*) from public.family_tasks where client_id like 'storm:storm-2:%') = 4, 'two members and an ensure call: 4 tasks in total, not 8 or 12');
update public.family_tasks set done = true where client_id = 'storm:storm-2:1';
update public.family_tasks set deleted_at = now() where client_id = 'storm:storm-2:2';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.ensure_storm_tasks('storm-2');
reset role;
select pg_temp.ok((select done from public.family_tasks where client_id = 'storm:storm-2:1') and (select deleted_at is not null from public.family_tasks where client_id = 'storm:storm-2:2')
  and (select count(*) from public.family_tasks where client_id like 'storm:storm-2:%') = 4, 'a later first call does not un-tick or restore a task');
-- the family can read them (family_tasks policy)
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select count(*) from public.family_tasks where client_id like 'storm:storm-1:%') = 4, 'a member reads the storm tasks');
reset role;

-- ===== blocker: only a real active family member that is the person or its writer =====
delete from public.carer_alerts where kind = 'rollcall';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok(pg_temp.state($$select public.rollcall_set('10000000-0000-0000-0000-0000000000f1', 'storm-1', 'need_help')$$) = '42501', 'f1 (signed in, no app_roles row) cannot answer even for their own person');
select pg_temp.ok(pg_temp.state($$select public.ensure_storm_tasks('storm-1')$$) = '42501', 'f1 cannot call ensure_storm_tasks');
select pg_temp.ok(pg_temp.state($$select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'ok')$$) = '42501', 'f1 cannot answer for b1');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.ok(pg_temp.state($$select public.rollcall_set('10000000-0000-0000-0000-0000000000d1', 'storm-1', 'need_help')$$) = '42501', 'd1 (disabled role) cannot answer for themself');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok(pg_temp.state($$select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'need_help')$$) = '42501', 'c1 (member, not b1, not a writer carer of b1) cannot answer for b1');
select pg_temp.ok(pg_temp.state($$select public.rollcall_set('10000000-0000-0000-0000-0000000000e1', 'storm-1', 'need_help')$$) = '42501', 'c1 (not a writer carer of e1) cannot answer for e1');
reset role;
set role anon;
select pg_temp.ok(pg_temp.state($$select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'ok')$$) = '42501', 'anon cannot call rollcall_set');
select pg_temp.ok(pg_temp.state($$select * from public.rollcall$$) = '42501', 'anon cannot read');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'rollcall') = 0, 'none of the refused calls raised an alert');
select pg_temp.ok(not exists (select 1 from public.rollcall where person_id in ('10000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000d1')), 'none of the refused calls left a row');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok((select count(*) from public.rollcall) = 0, 'a stranger (no app_roles row) reads nothing');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.ok((select count(*) from public.rollcall) = 0, 'a disabled member reads nothing');
reset role;

-- ===== bad status; a delete is refused =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.state($$select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'fine')$$) = '23514', 'status other than ok / need_help is refused (23514)');
select pg_temp.ok(pg_temp.state($$delete from public.rollcall$$) = '42501', 'no delete grant');
reset role;

-- ===== major: the storm must be a live storm signal =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.state($$select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'quake-1', 'ok')$$) = '22023', 'a non-storm kind (quake) is refused');
select pg_temp.ok(pg_temp.state($$select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-old', 'ok')$$) = '22023', 'an expired signal is refused');
select pg_temp.ok(pg_temp.state($$select public.ensure_storm_tasks('spam-0')$$) = '22023', 'ensure_storm_tasks refuses an unknown storm');
select count(*) as spam_refused from generate_series(1, 20) g where pg_temp.state(format('select public.rollcall_set(%L, %L, %L)', '10000000-0000-0000-0000-0000000000b1', 'spam-' || g, 'need_help')) = '22023' \gset
reset role;
select pg_temp.ok(:spam_refused = 20, '20 spam refs: all 20 refused');
select pg_temp.ok(not exists (select 1 from public.rollcall where storm_ref like 'spam-%') and not exists (select 1 from public.family_tasks where client_id like 'storm:spam-%')
  and (select count(*) from public.carer_alerts where kind = 'rollcall') = 0, 'spam refs: no row, no task, no alert');
select pg_temp.ok((select count(*) from public.rollcall where storm_ref = 'storm-3') = 0, 'a live tsunami signal is a storm kind (control: nothing written yet)');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-3', 'ok');
reset role;
select pg_temp.ok((select count(*) from public.rollcall where storm_ref = 'storm-3') = 1, 'a live tsunami signal is accepted');

-- ===== a writer carer answers for a person with no login; a second call moves nothing =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.rollcall_set('10000000-0000-0000-0000-0000000000e1', 'storm-1', 'ok');
reset role;
select pg_temp.ok((select count(*) from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000e1') = 1, 'the writer carer (creator) answers for e1');
select pg_temp.ok((select user_id from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000e1') = '00000000-0000-0000-0000-0000000000a1', 'user_id is the writer who tapped');

-- ===== the family reads all; the disabled and strangers read none =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select count(*) from public.rollcall where storm_ref = 'storm-1') = 2, 'an active member reads every member''s status (b1 and e1 on storm-1)');
reset role;

-- ===== need_help alerts the rest of the family once; again within 30 minutes adds none; after 30 minutes it alerts again =====
delete from public.carer_alerts where kind = 'rollcall';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'need_help');
reset role;
select pg_temp.ok((select count(*) from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000b1' and storm_ref = 'storm-1') = 1 and (select status from public.rollcall where person_id = '10000000-0000-0000-0000-0000000000b1' and storm_ref = 'storm-1') = 'need_help', 'ok -> need_help updates the same row');
-- hand count: active app_roles are a1, c1 and b1 (d1 disabled); b1 is the person, so a1 and c1 get one row each
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'rollcall' and template = 'rollcall_help') = 2
  and not exists (select 1 from public.carer_alerts where kind = 'rollcall' and carer_user_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1')), 'need_help: 2 family rows (a1, c1), none for b1 or the disabled d1');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'need_help');
select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'ok');
select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'need_help');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'rollcall') = 2, 'need_help twice more within 5 minutes (even via ok): still 1 alert (2 rows)');
update public.rollcall set help_alert_at = now() - interval '31 minutes' where person_id = '10000000-0000-0000-0000-0000000000b1' and storm_ref = 'storm-1';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-1', 'need_help');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'rollcall') = 4, 'after the 30-minute cooldown a new need_help alerts again');
-- a different storm for the same person is its own cooldown
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.rollcall_set('10000000-0000-0000-0000-0000000000b1', 'storm-2', 'need_help');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'rollcall') = 6, 'another storm is its own alert');

-- ===== a check-in is never blocked by the alert (notify_family broken -> the row still commits) =====
alter function public.notify_family(uuid, text, text, text, text) rename to notify_family_x;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select public.rollcall_set('10000000-0000-0000-0000-0000000000c1', 'storm-3', 'need_help');
reset role;
alter function public.notify_family_x(uuid, text, text, text, text) rename to notify_family;
select pg_temp.ok((select count(*) from public.rollcall where storm_ref = 'storm-3' and status = 'need_help' and person_id = '10000000-0000-0000-0000-0000000000c1') = 1, 'with notify_family broken the need_help row still saved');

-- ===== retention: 30 days, inside sos_events_prune (rows and storm tasks) =====
insert into public.rollcall (person_id, storm_ref, status, at) values ('10000000-0000-0000-0000-0000000000c1', 'old-a', 'ok', now() - interval '31 days'), ('10000000-0000-0000-0000-0000000000c1', 'new-a', 'ok', now() - interval '29 days');
alter table public.family_tasks disable trigger family_tasks_touch; -- the touch trigger pins created_at
update public.family_tasks set created_at = now() - interval '31 days' where client_id like 'storm:storm-1:%';
alter table public.family_tasks enable trigger family_tasks_touch;
select public.sos_events_prune();
select pg_temp.ok(not exists (select 1 from public.rollcall where storm_ref = 'old-a') and exists (select 1 from public.rollcall where storm_ref = 'new-a'), 'prune: 31-day-old row gone, 29-day-old row kept');
select pg_temp.ok((select count(*) from public.family_tasks where client_id like 'storm:storm-1:%' and deleted_at is not null) = 4 and not exists (select 1 from public.family_tasks where client_id like 'storm:storm-3:%' and deleted_at is not null), 'prune: 31-day-old storm tasks soft-deleted, newer ones kept');
select pg_temp.ok(exists (select 1 from pg_proc where proname = 'sos_events_prune' and prosrc like '%90 days%'), 'prune still keeps the 0031 sos_events line');

-- ===== per-caller rate limit (pin_try): 30 an hour =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select count(*) as limited from generate_series(1, 40) g where pg_temp.state(format('select public.rollcall_set(%L, %L, %L)', '10000000-0000-0000-0000-0000000000c1', 'storm-2', 'ok')) = '53400' \gset
reset role;
select pg_temp.ok(:limited >= 1, 'a caller who hammers rollcall_set is rate limited (53400)');

-- ===== down migration then up again =====
\ir ../migrations/0041_rollcall.down.sql
select pg_temp.ok(to_regclass('public.rollcall') is null and to_regproc('public.rollcall_set') is null and to_regproc('public.storm_gate') is null, 'down drops the table and functions');
\ir ../migrations/0041_rollcall.sql
select pg_temp.ok(to_regclass('public.rollcall') is not null and to_regproc('public.rollcall_set') is not null, 'up again after down');
\echo ROLLCALL REHEARSAL DONE
