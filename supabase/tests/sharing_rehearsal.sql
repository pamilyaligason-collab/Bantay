-- Rehearsal for 0037_sharing.sql on a THROWAWAY Postgres (never the live project): the REAL chain 0001..0037 (chain_rehearsal.sql, which loads 0037 last), then asserts.
-- Run (WSL Postgres 18, from supabase/tests):
--   sudo -n -u postgres dropdb --if-exists bantay_s12_sharing; sudo -n -u postgres createdb bantay_s12_sharing
--   sudo -n -u postgres psql -X -q -v ON_ERROR_STOP=1 -d bantay_s12_sharing -f sharing_rehearsal.sql
-- Actors (from the chain): a1 admin (creator of the no-login person e1); b1 member with own person; c1 PIN member (Lola); d1 disabled member.
-- Added here: j1 Joy and r1 Rhea (members with a person each), k1 Kim (member whose person is archived).
\set ON_ERROR_STOP on
\ir chain_rehearsal.sql

create function pg_temp.state(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function pg_temp.state(text) to authenticated, anon;

reset role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000f1', 'joy@example.com',  '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-000000000051', 'rhea@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-0000000000e2', 'kim@example.com',  '{"provider":"google"}', '{}');
insert into public.app_roles (user_id, role) values
 ('00000000-0000-0000-0000-0000000000f1', 'member'), ('00000000-0000-0000-0000-000000000051', 'member'), ('00000000-0000-0000-0000-0000000000e2', 'member');
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Joy',  '00000000-0000-0000-0000-0000000000f1'),
 ('10000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000051', 'Rhea', '00000000-0000-0000-0000-000000000051'),
 ('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2', 'Kim',  '00000000-0000-0000-0000-0000000000e2');
update public.people set archived_at = now() where id = '10000000-0000-0000-0000-0000000000e2';
-- B's records (3 readings, 2 doses, 1 consult), E's records (1 reading), B's phone check
insert into public.readings (person_id, taken_at, test, value, unit) values
 ('10000000-0000-0000-0000-0000000000b1', now() - interval '3 day', 'sys', 120, 'mmHg'), ('10000000-0000-0000-0000-0000000000b1', now() - interval '2 day', 'sys', 124, 'mmHg'),
 ('10000000-0000-0000-0000-0000000000b1', now() - interval '1 day', 'sys', 128, 'mmHg'), ('10000000-0000-0000-0000-0000000000e1', now(), 'sys', 118, 'mmHg');
insert into public.meds_taken (person_id, name, taken_at) values ('10000000-0000-0000-0000-0000000000b1', 'Losartan', now()), ('10000000-0000-0000-0000-0000000000b1', 'Amlodipine', now());
insert into public.consults (person_id, taken_at, doctor) values ('10000000-0000-0000-0000-0000000000b1', now(), 'Dr Test');
insert into public.phone_health (user_id, platform) values ('00000000-0000-0000-0000-0000000000b1', 'android');

-- ---------- shape ----------
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'carers' and column_name = 'accepted_at'), 'no carers.accepted_at (R1)');
select pg_temp.ok((select count(*) from pg_policies where tablename = 'carers' and cmd in ('INSERT', 'UPDATE', 'DELETE')) = 0, 'no insert/update/delete policy left on carers (0001 and 0004 dropped)');
select pg_temp.ok((select count(*) from pg_policies where tablename = 'carers' and cmd = 'SELECT') = 2, 'carers_read and carers_admin_read stay');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.carers', 'insert') and not has_table_privilege('authenticated', 'public.carers', 'update') and not has_table_privilege('authenticated', 'public.carers', 'delete') and has_table_privilege('authenticated', 'public.carers', 'select'), 'authenticated can only select carers');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.share_offers', 'insert') and has_table_privilege('authenticated', 'public.share_offers', 'select'), 'authenticated can only select share_offers');
select pg_temp.ok(not has_function_privilege('anon', 'public.share_set(uuid,uuid,boolean,boolean)', 'execute') and not has_function_privilege('service_role', 'public.share_set(uuid,uuid,boolean,boolean)', 'execute') and has_function_privilege('authenticated', 'public.share_set(uuid,uuid,boolean,boolean)', 'execute'), 'grants: share_set authenticated only (ML-21)');
select pg_temp.ok(not has_function_privilege('anon', 'public.share_accept(uuid,boolean)', 'execute') and has_function_privilege('authenticated', 'public.share_accept(uuid,boolean)', 'execute'), 'grants: share_accept');
select pg_temp.ok(not has_function_privilege('anon', 'public.my_viewers()', 'execute') and has_function_privilege('authenticated', 'public.my_viewers()', 'execute'), 'grants: my_viewers');
select pg_temp.ok(not has_function_privilege('anon', 'public.share_candidates()', 'execute') and has_function_privilege('authenticated', 'public.share_candidates()', 'execute'), 'grants: share_candidates');
select pg_temp.ok(not has_function_privilege('anon', 'public.admin_share_grid()', 'execute') and has_function_privilege('authenticated', 'public.admin_share_grid()', 'execute'), 'grants: admin_share_grid');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('share_set', 'share_accept', 'my_viewers', 'share_candidates', 'admin_share_grid') and (not p.prosecdef or p.proconfig is null or not array_to_string(p.proconfig, ',') like '%search_path=""%')), 'all five are security definer with an empty search_path');
select pg_temp.ok(exists (select 1 from pg_proc where proname = 'is_carer_of') and (select prosrc from pg_proc where proname = 'is_carer_of') not like '%accepted_at%', 'is_carer_of untouched (no accepted_at)');
select pg_temp.ok(not pg_temp.fails($$insert into public.carer_alerts (person_id, carer_user_id, kind, template) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'rollcall', 'rollcall_help')$$), 'carer_alerts kind rollcall allowed');
select pg_temp.ok(not pg_temp.fails($$insert into public.carer_alerts (person_id, carer_user_id, kind, template) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'kudos', 'kudos')$$), 'carer_alerts kind kudos allowed');
select pg_temp.ok(pg_temp.fails($$insert into public.carer_alerts (person_id, carer_user_id, kind, template) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'bogus', 'x')$$), 'carer_alerts unknown kind refused');
delete from public.carer_alerts;
select pg_temp.ok(not pg_temp.fails($$insert into public.audit_log (actor, tbl, action) values (null, 'carers', 'invite'), (null, 'carers', 'join')$$), 'audit_log accepts invite and join');
select pg_temp.ok(pg_temp.fails($$insert into public.audit_log (actor, tbl, action) values (null, 'carers', 'bogus')$$), 'audit_log refuses an unknown action');
delete from public.audit_log where action in ('invite', 'join');

-- ---------- member B shares with Joy ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.state($$insert into public.carers (carer_id, person_id, can_write) values ('00000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000b1', false)$$) = '42501', 'member cannot insert carers over REST');
select pg_temp.ok(pg_temp.state($$insert into public.share_offers (person_id, carer_id) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1')$$) = '42501', 'member cannot insert share_offers over REST');
select pg_temp.ok((select count(*) from public.share_candidates()) = 3, 'candidates for B: Lola, Joy, Rhea (not self, not disabled Kuya, not archived Kim, not the no-login person)');
select pg_temp.ok((select count(*) from public.share_candidates() where display_name in ('Test B', 'Kuya Off', 'Kim', 'No login')) = 0, 'candidates exclude self, disabled, archived, no-login');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1', false, true) = 'pending', 'B offers Joy: pending');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1', false, true) = 'unchanged', 'the same offer twice is unchanged');
select pg_temp.ok((select count(*) from public.share_candidates() where display_name = 'Joy') = 0, 'Joy is no longer a candidate once offered');
select pg_temp.ok((select count(*) = 1 and bool_and(pending) and bool_and(display_name = 'Joy') and bool_and(not added_by_admin) and bool_and(added_at is not null) from public.my_viewers()), 'my_viewers: one pending row named Joy, not added by an admin');
select pg_temp.ok((select count(*) from public.share_offers) = 1, 'B reads their own offer');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000051', true, true)$$) = '42501', 'a member cannot grant can_write');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', false, true)$$) = '22023', 'cannot share with yourself');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', false, true)$$) = '22023', 'cannot share with a disabled member');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000aa', false, true)$$) = '22023', 'cannot share with a non-member');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', false, true)$$) = '42501', 'a member cannot share someone else''s records');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1', false, true)$$) in ('42501', '22023'), 'an archived person cannot be shared');

-- Joy is only pending: nothing opens
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok((select count(*) from public.readings) = 0, 'pending: Joy reads 0 readings');
select pg_temp.ok((select count(*) from public.meds_taken) = 0, 'pending: Joy reads 0 meds_taken');
select pg_temp.ok((select count(*) from public.consults) = 0, 'pending: Joy reads 0 consults');
select pg_temp.ok((select count(*) from public.phone_health where user_id = '00000000-0000-0000-0000-0000000000b1') = 0, 'pending: Joy reads 0 phone_health rows of B');
select pg_temp.ok((select count(*) from public.carers where carer_id = '00000000-0000-0000-0000-0000000000f1') = 0, 'pending: Joy has no carers row');
select pg_temp.ok((select count(*) from public.share_offers) = 1 and (select carer_id from public.share_offers) = '00000000-0000-0000-0000-0000000000f1', 'Joy reads only her own offer');
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'share' and template = 'share_offer') = 1, 'Joy got one share_offer alert (template id only)');
select pg_temp.ok((select count(*) from public.my_viewers()) = 0, 'my_viewers for Joy: nobody sees Joy''s records');
select pg_temp.ok(pg_temp.state($$select public.raise_mood_alert('10000000-0000-0000-0000-0000000000b1')$$) = '42501', 'pending: raise_mood_alert refused');
select pg_temp.ok(pg_temp.state($$select * from public.admin_share_grid()$$) = '42501', 'non-admin cannot read the grid');

-- the person and the alert recipients: a pending carer is no recipient (service role path)
reset role;
select pg_temp.ok(public.notify_family('10000000-0000-0000-0000-0000000000b1', 'dose_missed', 'dose_missed', 'b1:t1', 'carers') = 0, 'pending: notify_family(carers) for B reaches nobody');
select pg_temp.ok((select count(*) from public.carer_alerts where carer_user_id = '00000000-0000-0000-0000-0000000000f1' and kind = 'dose_missed') = 0, 'pending: Joy got 0 dose_missed alerts');

-- Joy declines nothing; she accepts
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok(public.share_accept('10000000-0000-0000-0000-0000000000b1', true) = true, 'Joy accepts');
select pg_temp.ok(public.share_accept('10000000-0000-0000-0000-0000000000b1', true) = false, 'accepting twice finds no offer');
select pg_temp.ok((select count(*) from public.readings) = 3, 'accepted: Joy reads 3 readings');
select pg_temp.ok((select count(*) from public.meds_taken) = 2, 'accepted: Joy reads 2 meds_taken');
select pg_temp.ok((select count(*) from public.consults) = 1, 'accepted: Joy reads 1 consult');
select pg_temp.ok((select count(*) from public.phone_health where user_id = '00000000-0000-0000-0000-0000000000b1') = 1, 'accepted: Joy reads B''s phone_health');
select pg_temp.ok((select can_write is false and added_by = '00000000-0000-0000-0000-0000000000b1' and added_at is not null from public.carers where carer_id = '00000000-0000-0000-0000-0000000000f1'), 'accepted row is read only, keeps added_by and added_at');
select pg_temp.ok((select count(*) from public.share_offers) = 0, 'the offer is gone');
select pg_temp.ok(pg_temp.state($$update public.carers set can_write = true where carer_id = '00000000-0000-0000-0000-0000000000f1'$$) = '42501', 'carer cannot self-escalate over REST');
select pg_temp.ok(pg_temp.state($$delete from public.carers where carer_id = '00000000-0000-0000-0000-0000000000f1'$$) = '42501', 'carer cannot delete the link over REST');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select count(*) = 1 and bool_and(not pending) and bool_and(not can_write) from public.my_viewers()), 'my_viewers for B: Joy accepted');
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'share' and template = 'share_on') = 1, 'B was told Joy can see (share_on)');
reset role;
select pg_temp.ok((select count(*) from public.audit_log where person_id = '10000000-0000-0000-0000-0000000000b1' and action like 'share%') = 2, 'audit: share_add 1 + share_accept 1 for B');
select pg_temp.ok((select count(*) from public.audit_log where person_id = '10000000-0000-0000-0000-0000000000b1' and action = 'share_add') = 1 and (select count(*) from public.audit_log where person_id = '10000000-0000-0000-0000-0000000000b1' and action = 'share_accept') = 1, 'audit: one add, one accept');
select pg_temp.ok((select bool_and(fields = array['can_write']) from public.audit_log where action like 'share%'), 'audit rows hold column names only');

-- ---------- the admin ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', true, true) = 'pending', 'admin offers Joy as a writer for the no-login person: pending');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000051', true, true)$$) = '42501', 'admin cannot grant can_write for a person with a login');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000051', false, true) = 'pending', 'admin may offer a viewer on a member (the carer must accept)');
select pg_temp.ok((select count(*) from public.admin_share_grid()) = 4, 'grid: Joy for B, Joy pending for E, Rhea pending for B, the creator link of E');
select pg_temp.ok((select count(*) from public.admin_share_grid() where pending) = 2 and (select count(*) from public.admin_share_grid() where can_write) = 2, 'grid: 2 pending, 2 writer rows (creator and Joy pending for E)');
select pg_temp.ok((select carer_name from public.admin_share_grid() where carer_user_id = '00000000-0000-0000-0000-000000000051') = 'Rhea', 'grid names the carer');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', false, false)$$) = '42501', 'admin cannot remove their own link (creator of E)');
select pg_temp.ok(pg_temp.state($$insert into public.carers (carer_id, person_id, can_write) values ('00000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-0000000000e1', false)$$) = '42501', 'admin cannot insert carers over REST (0004 policy dropped)');
select pg_temp.ok(pg_temp.state($$delete from public.carers where person_id = '10000000-0000-0000-0000-0000000000e1'$$) = '42501', 'admin cannot delete carers over REST');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000051', false, false) = 'removed', 'admin cancels the pending offer for Rhea: removed');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000051', false, false) = 'unchanged', 'removing twice is unchanged');

-- Joy accepts the writer offer for E: now she is a recipient, and pending was not
reset role;
select pg_temp.ok(public.notify_family('10000000-0000-0000-0000-0000000000e1', 'dose_missed', 'dose_missed', 'e1:t1', 'carers') = 1, 'pending: notify_family(carers) for E reaches only the creator (1 row)');
select pg_temp.ok((select count(*) from public.carer_alerts where carer_user_id = '00000000-0000-0000-0000-0000000000f1' and kind = 'dose_missed') = 0, 'pending writer: Joy got 0 dose_missed alerts');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok((select count(*) from public.readings where person_id = '10000000-0000-0000-0000-0000000000e1') = 0, 'pending writer: Joy reads 0 readings of E');
select pg_temp.ok(pg_temp.state($$select public.raise_mood_alert('10000000-0000-0000-0000-0000000000e1')$$) = '42501', 'pending writer: raise_mood_alert refused');
select pg_temp.ok(public.share_accept('10000000-0000-0000-0000-0000000000e1', true) = true, 'Joy accepts the writer offer for E');
select pg_temp.ok((select count(*) from public.readings where person_id = '10000000-0000-0000-0000-0000000000e1') = 1, 'accepted writer: Joy reads 1 reading of E');
select pg_temp.ok(pg_temp.state($$select public.raise_mood_alert('10000000-0000-0000-0000-0000000000e1')$$) = 'ok', 'accepted writer: raise_mood_alert works');
reset role;
select pg_temp.ok(public.notify_family('10000000-0000-0000-0000-0000000000e1', 'dose_missed', 'dose_missed', 'e1:t2', 'carers') = 2, 'accepted writer: notify_family(carers) for E reaches creator and Joy (2 rows)');
select pg_temp.ok((select count(*) from public.share_offers where person_id = '10000000-0000-0000-0000-0000000000e1') = 0, 'E offer consumed');

-- creator link cannot be removed, even by a writer carer
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', false, false)$$) = '42501', 'the creator link of a no-login person cannot be removed');
select pg_temp.ok((select count(*) from public.carers where person_id = '10000000-0000-0000-0000-0000000000e1' and carer_id = '00000000-0000-0000-0000-0000000000a1') = 1, 'the creator link is still there');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000051', true, true)$$) = '42501', 'a writer carer cannot add a writer (admin only)');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000051', false, true) = 'pending', 'a writer carer of a no-login person may add a viewer');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', false, false)$$) = '42501', 'nobody removes their own link through share_set');

-- Rhea declines
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000051';
select pg_temp.ok(public.share_accept('10000000-0000-0000-0000-0000000000e1', false) = true, 'Rhea declines');
select pg_temp.ok((select count(*) from public.carers where carer_id = '00000000-0000-0000-0000-000000000051') = 0 and (select count(*) from public.share_offers) = 0, 'declined: no link, no offer');
select pg_temp.ok((select count(*) from public.readings) = 0, 'declined: Rhea reads nothing');

-- B stops sharing with Joy
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1', false, false) = 'removed', 'B stops sharing with Joy: removed');
select pg_temp.ok((select count(*) from public.my_viewers()) = 0, 'B has no viewers now');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok((select count(*) from public.readings where person_id = '10000000-0000-0000-0000-0000000000b1') = 0, 'after removal Joy reads 0 readings of B');
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'share' and template = 'share_off') = 1, 'Joy was told (share_off)');
reset role;
select pg_temp.ok((select count(*) from public.audit_log where person_id = '10000000-0000-0000-0000-0000000000b1' and action = 'share_remove') = 2, 'audit: B shows share_remove for the remove and for the admin cancel of Rhea');

-- ---------- rate limit: the 31st share_set in an hour ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ declare i int; begin
  for i in 1..30 loop perform public.share_set('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', false, true); end loop;
end $$;
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', false, true)$$) = '53400', 'the 31st share_set in an hour -> 53400');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', false, false)$$) = '53400', 'a removal is limited too');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000051', false, true)$$) = 'ok', 'the limit is per caller: B is not limited');

-- ---------- disabled caller, anon ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', false, true)$$) = '42501', 'a disabled caller cannot share');
select pg_temp.ok((select count(*) from public.share_candidates()) = 0 and (select count(*) from public.my_viewers()) = 0, 'a disabled caller sees no candidates and no viewers');
reset role;
set role anon;
reset request.jwt.claim.sub;
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1', false, true)$$) = '42501', 'anon cannot call share_set (no execute)');
select pg_temp.ok(pg_temp.state($$select * from public.my_viewers()$$) = '42501', 'anon cannot call my_viewers');
reset role;

-- ---------- fix round 2: creator guard, a claimed record, an admin offer on a member ----------
reset role;
-- a no-login person whose creator (Joy) is not the admin: the admin must not downgrade or remove that writer link
insert into public.people (id, display_name, created_by) values ('10000000-0000-0000-0000-0000000000d2', 'Probe Dep', '00000000-0000-0000-0000-0000000000f1');
select pg_temp.ok((select can_write from public.carers where person_id = '10000000-0000-0000-0000-0000000000d2' and carer_id = '00000000-0000-0000-0000-0000000000f1'), 'link_creator made Joy a writer of Probe Dep');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000f1', false, true)$$) = '42501', 'MAJOR 1: an admin cannot downgrade the creator writer link of a no-login person');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000f1', false, false)$$) = '42501', 'MAJOR 1: nor remove it');
select pg_temp.ok((select can_write from public.carers where person_id = '10000000-0000-0000-0000-0000000000d2' and carer_id = '00000000-0000-0000-0000-0000000000f1'), 'MAJOR 1: the creator link is still a writer');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000f1', true, true) = 'unchanged', 'asking for writer on a writer is unchanged');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', false, true) = 'updated', 'an admin may make a non-creator writer read only: updated');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', false, true) = 'unchanged', 'the same again is unchanged');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', true, true) = 'updated', 'and back to writer: updated');
-- an admin offer on a member with a login: the member is told at offer time, and can cancel it themself
reset role;
delete from public.share_offers where person_id = '10000000-0000-0000-0000-0000000000b1'; -- B's own offer to Rhea from the rate-limit check above
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000051', false, true) = 'pending', 'admin offers Rhea on B again: pending');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where template = 'share_admin') = 1 and (select bool_and(carer_user_id = '00000000-0000-0000-0000-0000000000b1' and kind = 'share' and ref is not null) from public.carer_alerts where template = 'share_admin'), 'MAJOR 3: B got exactly one share_admin alert at offer time (none for the no-login person E)');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select count(*) from public.carer_alerts where template = 'share_admin') = 1, 'MAJOR 3: B reads the share_admin alert');
select pg_temp.ok((select count(*) = 1 and bool_and(pending) and bool_and(added_by_admin) from public.my_viewers()), 'MAJOR 3: my_viewers shows the admin offer as pending and added by an admin');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000051', false, false) = 'removed', 'MAJOR 3: B cancels the admin offer');
select pg_temp.ok((select count(*) from public.my_viewers()) = 0, 'B has no viewers or offers left');
-- a claimed record: the no-login guard no longer applies
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000051', false, true)$$) = 'ok', 'while E has no login a writer carer may add a viewer');
reset role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e5', 'e1login@example.com', '{"provider":"google"}', '{}');
insert into public.app_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000e5', 'member');
update public.people set auth_user_id = '00000000-0000-0000-0000-0000000000e5' where id = '10000000-0000-0000-0000-0000000000e1';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000051', false, false)$$) = '42501', 'a claimed record: a writer carer who is not the person or an admin can no longer change sharing');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', false, false) = 'removed', 'MAJOR 2: the person themself removes the creator link of their claimed record');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000051', false, false) = 'removed', 'the person cancels the offer a carer made while the record had no login');
reset role;
insert into public.carers (carer_id, person_id, can_write) values ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000e1', true);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', false, false) = 'removed', 'MAJOR 2: an admin removes any viewer of a claimed record, the creator link included');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', false, false) = 'removed', 'an admin removes Joy from a claimed record');
select pg_temp.ok(public.share_set('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000051', false, true) = 'pending', 'an admin offers a viewer on the claimed record (the member is told, the carer accepts)');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where template = 'share_admin' and carer_user_id = '00000000-0000-0000-0000-0000000000e5') = 1, 'the claimed member got the share_admin alert');
delete from public.share_offers;
insert into public.carers (carer_id, person_id, can_write) values ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000e1', true); -- put the creator link back for the idempotency checks below

-- ---------- the migration runs twice, then down, then up again ----------
\ir ../migrations/0037_sharing.sql
select pg_temp.ok((select count(*) from pg_policies where tablename = 'carers' and cmd in ('INSERT', 'UPDATE', 'DELETE')) = 0, 'idempotent: second run leaves no carers write policy');
select pg_temp.ok((select count(*) from public.carers where carer_id = '00000000-0000-0000-0000-0000000000a1') = 1, 'idempotent: the creator link survived');
\ir ../migrations/0037_sharing.down.sql
select pg_temp.ok((select count(*) from pg_policies where tablename = 'carers' and cmd in ('INSERT', 'UPDATE', 'DELETE')) = 6, 'down: the six 0001 and 0004 carers write policies are back');
select pg_temp.ok(to_regclass('public.share_offers') is null and to_regprocedure('public.share_set(uuid,uuid,boolean,boolean)') is null, 'down: share_offers and the functions are gone');
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'carers' and column_name in ('added_by', 'added_at')), 'down: added_by and added_at removed');
select pg_temp.ok(has_table_privilege('authenticated', 'public.carers', 'insert'), 'down: authenticated can write carers again (0001 model)');
\ir ../migrations/0037_sharing.down.sql
\ir ../migrations/0037_sharing.sql
select pg_temp.ok(to_regprocedure('public.share_set(uuid,uuid,boolean,boolean)') is not null and (select count(*) from pg_policies where tablename = 'carers' and cmd in ('INSERT', 'UPDATE', 'DELETE')) = 0, 'down twice then up: back to the new model');
\echo SHARING REHEARSAL DONE
