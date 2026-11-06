-- Rehearsal for 0046_who_sees_whom.sql (D-109) on a THROWAWAY Postgres (never the live project): the REAL chain 0001..0050 (chain_rehearsal.sql loads 0045 to 0050 after 0044), then asserts.
-- Covers plan section 7 items 1 to 14 and the section 11 tests. Item 15 (part 2, other admins narrowed) is NOT built: the owner chose option A.
-- Run (WSL Postgres 18, from supabase/tests):
--   sudo -n -u postgres dropdb --if-exists s_d109; sudo -n -u postgres createdb s_d109
--   sudo -n -u postgres psql -X -q -v ON_ERROR_STOP=1 -d s_d109 -f d109_rehearsal.sql
-- Actors (invented): o Rey Villar, the family owner (admin); a another admin, creator of the no-login person e; b Test B (member, has the records); c Lola (PIN member);
-- d Kuya (disabled member); j Joy and r Rhea (members). The owner mark is set here by the same one-line UPDATE the release runs by hand.
\set ON_ERROR_STOP on
\ir chain_rehearsal.sql

-- ---------- helpers ----------
create function pg_temp.state(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
create function pg_temp.msg(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create function pg_temp.u(k text) returns uuid language sql immutable as $$ select case k
  when 'o' then '00000000-0000-0000-0000-0000000000a0' when 'a' then '00000000-0000-0000-0000-0000000000a1' when 'b' then '00000000-0000-0000-0000-0000000000b1'
  when 'c' then '00000000-0000-0000-0000-0000000000c1' when 'd' then '00000000-0000-0000-0000-0000000000d1' when 'j' then '00000000-0000-0000-0000-0000000000f1'
  when 'r' then '00000000-0000-0000-0000-000000000051' end::uuid $$;
create function pg_temp.p(k text) returns uuid language sql immutable as $$ select case k
  when 'o' then '10000000-0000-0000-0000-0000000000a0' when 'b' then '10000000-0000-0000-0000-0000000000b1' when 'c' then '10000000-0000-0000-0000-0000000000c1'
  when 'd' then '10000000-0000-0000-0000-0000000000d1' when 'e' then '10000000-0000-0000-0000-0000000000e1' when 'j' then '10000000-0000-0000-0000-0000000000f1'
  when 'r' then '10000000-0000-0000-0000-000000000051' when 'z' then '10000000-0000-0000-0000-0000000000e9' end::uuid $$;
-- sign in as an actor (the role stays whatever the script set); returns the share_set word or E:<sqlstate>
create function pg_temp.as(k text) returns void language sql as $$ select set_config('request.jwt.claim.sub', pg_temp.u(k)::text, false) $$;
create function pg_temp.ss(person text, carer text, w boolean, o boolean) returns text language plpgsql as $$
begin return public.share_set(pg_temp.p(person), pg_temp.u(carer), w, o); exception when others then return 'E:' || sqlstate; end $$;
grant execute on function pg_temp.state(text), pg_temp.msg(text), pg_temp.u(text), pg_temp.p(text), pg_temp.as(text), pg_temp.ss(text, text, boolean, boolean) to authenticated, anon;

-- ---------- setup (as the loader, RLS bypassed) ----------
reset role;
grant select, insert, update, delete on public.app_roles to service_role; -- a rehearsal database has no Supabase default privileges (ML-21)
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 (pg_temp.u('o'), 'rey@example.com',  '{"provider":"google"}', '{}'),
 (pg_temp.u('j'), 'joy@example.com',  '{"provider":"google"}', '{}'),
 (pg_temp.u('r'), 'rhea@example.com', '{"provider":"google"}', '{}');
insert into public.app_roles (user_id, role) values (pg_temp.u('o'), 'admin'), (pg_temp.u('j'), 'member'), (pg_temp.u('r'), 'member');
insert into public.people (id, auth_user_id, display_name, created_by) values
 (pg_temp.p('o'), pg_temp.u('o'), 'Rey Villar', pg_temp.u('o')),
 (pg_temp.p('j'), pg_temp.u('j'), 'Joy',        pg_temp.u('j')),
 (pg_temp.p('r'), pg_temp.u('r'), 'Rhea',       pg_temp.u('r'));
-- an archived no-login person, created by the other admin
insert into public.people (id, display_name, created_by, archived_at) values (pg_temp.p('z'), 'Old Kin', pg_temp.u('a'), now());
-- B's records: 3 readings, 2 doses, 1 consult, 2 activity rows, a phone check, a confirmed paper, a draft paper, a confirmed ID card, an identifier. E has 1 reading.
insert into public.readings (person_id, taken_at, test, value, unit) values
 (pg_temp.p('b'), now() - interval '3 day', 'sys', 120, 'mmHg'), (pg_temp.p('b'), now() - interval '2 day', 'sys', 124, 'mmHg'),
 (pg_temp.p('b'), now() - interval '1 day', 'sys', 128, 'mmHg'), (pg_temp.p('e'), now(), 'sys', 118, 'mmHg');
insert into public.meds_taken (person_id, name, taken_at) values (pg_temp.p('b'), 'Losartan', now()), (pg_temp.p('b'), 'Amlodipine', now());
insert into public.consults (person_id, taken_at, doctor) values (pg_temp.p('b'), now(), 'Dr Test');
insert into public.activity (person_id, kind, steps, started_at, source) values (pg_temp.p('b'), 'd109walk', 4000, now() - interval '2 hour', 'manual'), (pg_temp.p('b'), 'd109walk', 800, now() - interval '1 hour', 'manual');
insert into public.phone_health (user_id, platform) values (pg_temp.u('b'), 'android');
select pg_temp.as('b'); -- the records trigger stamps a confirmed row with the signed-in user
insert into public.documents (person_id, kind, status) values (pg_temp.p('b'), 'lab', 'confirmed'), (pg_temp.p('b'), 'lab', 'draft'), (pg_temp.p('b'), 'id_card', 'confirmed');
reset request.jwt.claim.sub;
insert into public.person_identifiers (person_id, id_type, id_number) values (pg_temp.p('b'), 'tin', '000-000-000');
-- the apply-time owner line (not in the migration file): one UPDATE by user id
update public.app_roles set is_owner = true where user_id = pg_temp.u('o');
select pg_temp.ok((select count(*) from public.app_roles where is_owner) = 1, 'setup: exactly one owner');
select pg_temp.ok((select count(*) from public.carers) = 2, 'setup: the only links are the creator links of the no-login persons e and the archived one');

-- ===== 1. is_owner() =====
set role authenticated;
select pg_temp.as('o');
select pg_temp.ok(public.is_owner(), '1: true for the owner');
select pg_temp.as('a');
select pg_temp.ok(not public.is_owner() and public.is_admin(), '1: false for another admin');
select pg_temp.as('b');
select pg_temp.ok(not public.is_owner(), '1: false for a member');
select pg_temp.as('d');
select pg_temp.ok(not public.is_owner(), '1: false for a disabled member');
reset role;
-- a disabled owner cannot exist (the guard), so switch the trigger off for this one statement pair
set session_replication_role = replica;
update public.app_roles set disabled = true where user_id = pg_temp.u('o');
set session_replication_role = origin;
set role authenticated;
select pg_temp.as('o');
select pg_temp.ok(not public.is_owner(), '1: false for a disabled owner row');
reset role;
set session_replication_role = replica;
update public.app_roles set disabled = false where user_id = pg_temp.u('o');
set session_replication_role = origin;
set role anon;
select pg_temp.ok(pg_temp.state($$select public.is_owner()$$) = '42501', '1: anon cannot call is_owner');
reset role;
select pg_temp.ok(not has_function_privilege('service_role', 'public.is_owner()', 'execute'), '1: service_role has no execute on is_owner (ML-21)');

-- ===== 2. one owner, and the owner row is guarded =====
select pg_temp.ok(pg_temp.state($$update public.app_roles set is_owner = true where user_id = '00000000-0000-0000-0000-0000000000a1'$$) = '23505', '2: a second owner is refused (unique index)');
select pg_temp.ok((select count(*) from public.app_roles where is_owner) = 1, '2: still exactly one owner');
select pg_temp.ok(pg_temp.msg($$update public.app_roles set disabled = true where user_id = '00000000-0000-0000-0000-0000000000a0'$$) like '%family owner%', '2: the owner cannot be disabled (loader)');
select pg_temp.ok(pg_temp.msg($$update public.app_roles set role = 'member' where user_id = '00000000-0000-0000-0000-0000000000a0'$$) like '%family owner%', '2: nor demoted');
select pg_temp.ok(pg_temp.msg($$update public.app_roles set is_owner = false where user_id = '00000000-0000-0000-0000-0000000000a0'$$) like '%family owner%', '2: nor un-owned');
select pg_temp.ok(pg_temp.msg($$delete from public.app_roles where user_id = '00000000-0000-0000-0000-0000000000a0'$$) like '%family owner%', '2: nor deleted');
set role service_role;
select pg_temp.ok(pg_temp.msg($$update public.app_roles set disabled = true where user_id = '00000000-0000-0000-0000-0000000000a0'$$) like '%family owner%', '2: the service role cannot disable the owner');
select pg_temp.ok(pg_temp.msg($$update public.app_roles set role = 'member', is_owner = false where user_id = '00000000-0000-0000-0000-0000000000a0'$$) like '%family owner%', '2: the service role cannot demote or un-own the owner');
select pg_temp.ok(pg_temp.msg($$delete from public.app_roles where user_id = '00000000-0000-0000-0000-0000000000a0'$$) like '%family owner%', '2: the service role cannot delete the owner');
select pg_temp.ok(pg_temp.state($$update public.app_roles set handle = 'rey' where user_id = '00000000-0000-0000-0000-0000000000a0'$$) = 'ok', '11: the service role can change the owner''s handle');
reset role;
select pg_temp.ok((select handle = 'rey' and role = 'admin' and not disabled and is_owner from public.app_roles where user_id = pg_temp.u('o')), '11: the handle changed and nothing else on the owner row');
select pg_temp.ok(pg_temp.state($$update public.app_roles set handle = 'rey2' where user_id = '00000000-0000-0000-0000-0000000000a0'$$) = 'ok', '11: a handle change works as the loader too');
select pg_temp.ok(pg_temp.state($$update public.app_roles set disabled = true where user_id = '00000000-0000-0000-0000-0000000000a1'$$) = 'ok', '2: another admin can still be disabled (only the owner row is guarded)');
select pg_temp.ok(pg_temp.msg($$update public.app_roles set is_owner = true where user_id = '00000000-0000-0000-0000-0000000000a1'$$) like '%enabled admin%', '2: a disabled admin row cannot be made the owner');
select pg_temp.ok(pg_temp.msg($$update public.app_roles set is_owner = true where user_id = '00000000-0000-0000-0000-0000000000b1'$$) like '%enabled admin%', '2: nor a member row');
select pg_temp.ok(pg_temp.msg($$update public.app_roles set is_owner = true where user_id = '00000000-0000-0000-0000-0000000000d1'$$) like '%enabled admin%', '2: nor a disabled member row');
select pg_temp.ok(pg_temp.msg($$insert into public.app_roles (user_id, role, is_owner) values ('00000000-0000-0000-0000-0000000000aa', 'member', true)$$) like '%enabled admin%', '2: nor an inserted non-admin owner row');
update public.app_roles set disabled = false where user_id = pg_temp.u('a');

-- ===== 3. what the owner reads, and what another admin does not =====
set role authenticated;
select pg_temp.as('o');
select pg_temp.ok((select count(*) from public.meds_taken where person_id = pg_temp.p('b')) = 2, '3: owner reads B''s meds_taken');
select pg_temp.ok((select count(*) from public.activity where person_id = pg_temp.p('b') and kind = 'd109walk') = 2, '3: owner reads B''s activity');
select pg_temp.ok((select count(*) from public.consults where person_id = pg_temp.p('b')) = 1, '3: owner reads B''s consults');
select pg_temp.ok((select count(*) from public.readings where person_id = pg_temp.p('b')) = 3, '3: owner reads B''s readings');
select pg_temp.as('a');
select pg_temp.ok((select count(*) from public.meds_taken) = 0, '3: another admin reads no meds_taken');
select pg_temp.ok((select count(*) from public.activity) = 0, '3: another admin reads no activity');
select pg_temp.ok((select count(*) from public.consults) = 0, '3: another admin reads no consults');
select pg_temp.as('j');
select pg_temp.ok((select count(*) from public.meds_taken) = 0 and (select count(*) from public.activity) = 0 and (select count(*) from public.consults) = 0, '3: an unlinked member reads none of them');
select pg_temp.as('b');
select pg_temp.ok((select count(*) from public.meds_taken) = 2 and (select count(*) from public.consults) = 1, '3: B still reads their own');

-- ===== 4. the owner sets J to see B: at once =====
select pg_temp.as('o');
select pg_temp.ok(pg_temp.ss('b', 'j', false, true) = 'added', '4: owner sets Joy to see B: added');
select pg_temp.ok(pg_temp.ss('b', 'j', false, true) = 'unchanged', '4: the same again is unchanged');
select pg_temp.ok((select count(*) from public.share_offers) = 0, '4: 0 offers written');
select pg_temp.as('j');
select pg_temp.ok((select count(*) from public.readings where person_id = pg_temp.p('b')) = 3 and (select count(*) from public.meds_taken) = 2 and (select count(*) from public.consults) = 1
  and (select count(*) from public.activity where kind = 'd109walk') = 2, '4: Joy reads B''s readings, doses, consult and activity at once');
select pg_temp.ok((select count(*) from public.phone_health where user_id = pg_temp.u('b')) = 1, '4: and B''s phone_health');
select pg_temp.ok((select count(*) from public.carer_alerts where carer_user_id = pg_temp.u('j') and template = 'share_given') = 1, '4: Joy was told (share_given)');
select pg_temp.as('b');
select pg_temp.ok((select count(*) from public.carer_alerts where carer_user_id = pg_temp.u('b') and template = 'share_added') = 1, '4: B was told someone new can see (share_added)');
select pg_temp.ok((select bool_and(expires_at > now() + interval '29 days') from public.carer_alerts where template in ('share_added', 'share_added_carer')), 'F2: share_added and share_added_carer live 30 days, so a member away over a week is still told');
reset role;
select pg_temp.ok((select can_write is false and added_by = pg_temp.u('o') and added_at is not null from public.carers where person_id = pg_temp.p('b') and carer_id = pg_temp.u('j')), '4: the carers row is read only and keeps added_by and added_at');
select pg_temp.ok((select count(*) from public.audit_log where person_id = pg_temp.p('b') and action = 'share_add' and actor = pg_temp.u('o') and fields = array['can_write']) = 1, '4: one audit row, column names only');
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'share') = 2, '4: exactly two share alerts so far');
select pg_temp.ok((select bool_and(kind = 'share' and template in ('share_given', 'share_added', 'share_added_carer', 'share_off') and ref ~ '^[0-9a-f-]{36}:[0-9a-f-]{36}:(given|added|off):[0-9.]+$') from public.carer_alerts where kind = 'share'),
  '4: alerts hold a template id and a ref of ids and a time, no name and no value (B-7)');
select pg_temp.ok((select ref from public.carer_alerts where template = 'share_added') like '%:added:%' and (select ref from public.carer_alerts where template = 'share_given') like '%:given:%', '4: refs carry the link''s added_at');

-- ===== 5. who may not =====
set role authenticated;
select pg_temp.as('b');
select pg_temp.ok(pg_temp.ss('e', 'r', false, true) = 'E:42501', '5: a member who is not a writer of the no-login person e cannot set links on e (null-safe gate)');
select pg_temp.ok(pg_temp.ss('e', 'b', false, false) = 'E:42501', '5: nor stop one');
select pg_temp.as('a');
select pg_temp.ok(pg_temp.ss('b', 'r', false, true) = 'E:42501', '5: another admin setting Rhea to see B: 42501');
select pg_temp.ok(pg_temp.ss('b', 'a', false, true) = 'E:42501', '5: another admin making themself a viewer of B: 42501');
select pg_temp.ok(pg_temp.ss('b', 'j', false, false) = 'E:42501', '5: another admin cannot stop a link either');
select pg_temp.as('r');
select pg_temp.ok(pg_temp.ss('b', 'r', false, true) = 'E:42501', '5: a member on someone else''s record: 42501');
select pg_temp.as('b');
select pg_temp.ok(pg_temp.ss('b', 'r', false, true) = 'added', '5: a member on their own record: added at once');
select pg_temp.as('r');
select pg_temp.ok((select count(*) from public.readings where person_id = pg_temp.p('b')) = 3, '5: Rhea reads B''s readings at once');
select pg_temp.as('b');
select pg_temp.ok((select count(*) from public.carer_alerts where carer_user_id = pg_temp.u('b') and template = 'share_added') = 1, '12: B added their own viewer and got no share_added');
select pg_temp.as('r');
select pg_temp.ok((select count(*) from public.carer_alerts where carer_user_id = pg_temp.u('r') and template = 'share_given') = 1, '12: Rhea was told (share_given)');

-- ===== 6. targets and can_write =====
select pg_temp.as('o');
select pg_temp.ok(pg_temp.ss('b', 'o', false, true) = 'E:22023', '6: p_carer = me is refused for the owner');
select pg_temp.ok(pg_temp.ss('b', 'b', false, true) = 'E:22023', '6: nobody is made a viewer of their own record');
select pg_temp.ok(pg_temp.ss('b', 'd', false, true) = 'E:22023', '6: nor a disabled member');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000aa', false, true)$$) = '22023', '6: nor a non-member');
select pg_temp.ok(pg_temp.state($$select public.share_set('10000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000f1', false, true)$$) = '22023', '6: nor on an archived person');
select pg_temp.ok(pg_temp.ss('b', 'c', true, true) = 'E:42501', '6: can_write is refused for the owner on a person with a login');
select pg_temp.as('b');
select pg_temp.ok(pg_temp.ss('b', 'c', true, true) = 'E:42501', '6: can_write is refused for a member on their own record');
select pg_temp.as('o');
select pg_temp.ok(pg_temp.ss('e', 'j', true, true) = 'added', '6: the owner may add Joy as a writer for the no-login person e');
select pg_temp.as('a');
select pg_temp.ok(pg_temp.ss('e', 'r', true, true) = 'E:42501', '6: the creator writer cannot add a writer (owner only)');

-- ===== 7. a no-login person: the writer carers are told, nobody else =====
reset role;
select pg_temp.ok((select count(*) = 1 and bool_and(carer_user_id = pg_temp.u('a')) from public.carer_alerts where person_id = pg_temp.p('e') and template = 'share_added_carer'), '7: adding Joy as a writer told the creator writer a1, not Joy, not the owner');
set role authenticated;
select pg_temp.as('o');
select pg_temp.ok(pg_temp.ss('e', 'r', false, true) = 'added', '7: the owner adds Rhea as a viewer of e');
select pg_temp.as('j');
select pg_temp.ok(pg_temp.ss('e', 'c', false, true) = 'added', '7: a writer carer of a no-login person adds a viewer');
select pg_temp.ok(pg_temp.ss('e', 'c', true, true) = 'E:42501', '7: a writer carer cannot add a writer');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where person_id = pg_temp.p('e') and template = 'share_added_carer' and carer_user_id = pg_temp.u('a')) = 3
  and (select count(*) from public.carer_alerts where person_id = pg_temp.p('e') and template = 'share_added_carer' and carer_user_id = pg_temp.u('j')) = 1
  and (select count(*) from public.carer_alerts where person_id = pg_temp.p('e') and template = 'share_added_carer') = 4 and (select count(*) from public.carer_alerts where person_id = pg_temp.p('e') and template = 'share_added') = 0, '7: share_added_carer (not share_added) for e went to the writer carers a1 (3 times) and Joy (once, not when she added it herself), to nobody else');
select pg_temp.ok((select count(*) from public.carer_alerts where person_id = pg_temp.p('e') and template = 'share_given') = 3, '7: each new viewer of e got share_given (Joy, Rhea, Lola)');
select pg_temp.ok((select count(*) > 0 and bool_and(expires_at > now() + interval '29 days') from public.carer_alerts where template = 'share_added_carer'), 'F2: share_added_carer rows also live 30 days (a writer carer away over a week is still told)');
set role authenticated;
select pg_temp.as('j');
select pg_temp.ok(pg_temp.ss('e', 'a', false, false) = 'E:42501', '7: a writer carer cannot remove the creator link');
select pg_temp.as('o');
select pg_temp.ok(pg_temp.ss('e', 'a', false, false) = 'E:42501', '7: nor can the owner');
select pg_temp.as('a');
select pg_temp.ok(pg_temp.ss('e', 'a', false, false) = 'E:42501', '7: nor can the creator remove their own');
select pg_temp.ok((select count(*) from public.carers where person_id = pg_temp.p('e') and carer_id = pg_temp.u('a')) = 1, '7: the creator link is still there');

-- ===== 8 and 12. stop, add again: told again =====
select pg_temp.as('b');
select pg_temp.ok(pg_temp.ss('b', 'j', false, false) = 'removed', '8: B stops Joy');
select pg_temp.as('j');
select pg_temp.ok((select count(*) from public.readings where person_id = pg_temp.p('b')) = 0 and (select count(*) from public.meds_taken) = 0 and (select count(*) from public.consults) = 0
  and (select count(*) from public.phone_health where user_id = pg_temp.u('b')) = 0, '8: Joy reads 0 rows of B at once');
select pg_temp.ok((select count(*) from public.carer_alerts where template = 'share_off' and carer_user_id = pg_temp.u('j')) = 1, '8: Joy was told it stopped (share_off)');
select pg_temp.as('o');
select pg_temp.ok(pg_temp.ss('b', 'j', false, true) = 'added', '8: the owner adds Joy again');
select pg_temp.as('b');
select pg_temp.ok((select count(*) from public.carer_alerts where carer_user_id = pg_temp.u('b') and template = 'share_added') = 2, '8, 12: add, stop, add inside one hour tells B again (2 share_added)');
select pg_temp.as('j');
select pg_temp.ok((select count(*) from public.carer_alerts where carer_user_id = pg_temp.u('j') and template = 'share_given' and person_id = pg_temp.p('b')) = 2, '12: and Joy again (2 share_given for B)');
select pg_temp.ok((select count(*) from public.readings where person_id = pg_temp.p('b')) = 3, '8: Joy reads B''s rows again at once');
select pg_temp.as('o');
select pg_temp.ok(pg_temp.ss('b', 'c', false, false) = 'unchanged', '8: removing a link that is not there is unchanged');

-- ===== 9. read-only viewers and the owner get no flags =====
reset role;
select pg_temp.ok(public.notify_family(pg_temp.p('e'), 'dose_missed', 'dose_missed', 'e:t1', 'carers') = 2, '9: notify_family(carers) for e reaches the two writers (a1 and Joy)');
select pg_temp.ok(public.notify_family(pg_temp.p('b'), 'dose_missed', 'dose_missed', 'b:t1', 'carers') = 0, '9: notify_family(carers) for B reaches nobody (B has no writer carer)');
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'dose_missed' and carer_user_id in (pg_temp.u('r'), pg_temp.u('c'), pg_temp.u('o'))) = 0, '9: read-only viewers (Rhea, Lola) and the owner got no dose_missed');
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'dose_missed' and person_id = pg_temp.p('b')) = 0, '9: nobody got a dose_missed for B');

-- ===== 10. grants, writes and the migration twice =====
select pg_temp.ok(has_function_privilege('authenticated', 'public.is_owner()', 'execute') and not has_function_privilege('anon', 'public.is_owner()', 'execute'), '10: is_owner is authenticated only');
select pg_temp.ok(not has_function_privilege('anon', 'public.share_set(uuid,uuid,boolean,boolean)', 'execute') and not has_function_privilege('service_role', 'public.share_set(uuid,uuid,boolean,boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.share_set(uuid,uuid,boolean,boolean)', 'execute'), '10: share_set authenticated only (ML-21)');
select pg_temp.ok(not has_function_privilege('anon', 'public.person_viewers(uuid)', 'execute') and not has_function_privilege('service_role', 'public.person_viewers(uuid)', 'execute') and has_function_privilege('authenticated', 'public.person_viewers(uuid)', 'execute'), '10: person_viewers authenticated only');
select pg_temp.ok(not has_function_privilege('anon', 'public.share_candidates(uuid)', 'execute') and not has_function_privilege('service_role', 'public.share_candidates(uuid)', 'execute') and has_function_privilege('authenticated', 'public.share_candidates(uuid)', 'execute'), '10: share_candidates(uuid) authenticated only');
select pg_temp.ok(not has_function_privilege('anon', 'public.request_erasure()', 'execute') and not has_function_privilege('service_role', 'public.request_erasure()', 'execute') and has_function_privilege('authenticated', 'public.request_erasure()', 'execute'), '10: request_erasure grants restated');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.app_roles_owner_guard()', 'execute') and not has_function_privilege('authenticated', 'public.activity_stamp_updated_at()', 'execute'), '10: the two trigger functions cannot be called');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('is_owner', 'share_set', 'person_viewers', 'share_candidates', 'request_erasure')
  and p.prosecdef and (p.proconfig is null or not array_to_string(p.proconfig, ',') like '%search_path=""%')), '10: every security definer function here has an empty search_path');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.app_roles', 'insert') and not has_table_privilege('authenticated', 'public.app_roles', 'update') and not has_table_privilege('authenticated', 'public.app_roles', 'delete')
  and not has_column_privilege('authenticated', 'public.app_roles', 'is_owner', 'update'), '10: no REST write to app_roles, is_owner included');
set role authenticated;
select pg_temp.as('a');
select pg_temp.ok(pg_temp.state($$update public.app_roles set is_owner = true where user_id = '00000000-0000-0000-0000-0000000000a1'$$) = '42501', '10: another admin cannot make themself owner over REST');
select pg_temp.as('b');
select pg_temp.ok(pg_temp.state($$update public.app_roles set is_owner = true where user_id = '00000000-0000-0000-0000-0000000000b1'$$) = '42501', '10: a member cannot either');
select pg_temp.ok(pg_temp.state($$insert into public.app_roles (user_id, role, is_owner) values ('00000000-0000-0000-0000-0000000000b1', 'admin', true)$$) = '42501', '10: nor insert an owner row');
reset role;

-- ===== 11. erasure, handles, can_write =====
set role authenticated;
select pg_temp.as('o');
select pg_temp.ok(pg_temp.msg($$select public.request_erasure()$$) like '%hand over ownership%', '11: the owner''s erasure request is refused');
select pg_temp.as('b');
select pg_temp.ok(pg_temp.state($$select public.request_erasure()$$) = 'ok', '11: a member''s erasure request still works');
select public.cancel_erasure();
reset role;
select pg_temp.ok((select count(*) from public.erasure_requests where user_id = pg_temp.u('o')) = 0, '11: and no request row was written for the owner');
-- if an erasure request for the owner ever existed (written by hand), the erase would still not disable the owner
insert into public.erasure_requests (user_id, cancel_until) values (pg_temp.u('o'), now() - interval '1 hour');
select pg_temp.ok(pg_temp.msg($$select public.erase_user_data('00000000-0000-0000-0000-0000000000a0')$$) like '%family owner%', '11: erase_user_data cannot disable the owner either');
select pg_temp.ok((select display_name = 'Rey Villar' from public.people where id = pg_temp.p('o')) and not (select disabled from public.app_roles where user_id = pg_temp.u('o')), '11: and it rolled back whole (the owner''s person row is intact)');
delete from public.erasure_requests where user_id = pg_temp.u('o');
set role authenticated;
select pg_temp.as('a');
select pg_temp.ok(pg_temp.ss('e', 'j', false, true) = 'unchanged', '11: a non-owner admin asking to lower Joy''s edit access changes nothing');
select pg_temp.ok(pg_temp.ss('e', 'j', true, true) = 'E:42501', '11: and asking for edit access is refused (owner only)');
reset role;
select pg_temp.ok((select can_write from public.carers where person_id = pg_temp.p('e') and carer_id = pg_temp.u('j')), '11: Joy is still a writer of e');
set role authenticated;
select pg_temp.as('o');
select pg_temp.ok(pg_temp.ss('e', 'j', false, true) = 'updated', '11: the owner lowers Joy to read only: updated');
select pg_temp.ok(pg_temp.ss('e', 'a', false, true) = 'E:42501', '11: the owner cannot lower the creator link of e');
select pg_temp.ok(pg_temp.ss('e', 'j', true, true) = 'updated', '11: and raises Joy again: updated');
reset role;

-- ===== 13. a read-only link gives the record but not drafts, identifiers or ID cards =====
set role authenticated;
select pg_temp.as('r');
select pg_temp.ok((select count(*) from public.documents where person_id = pg_temp.p('b') and status = 'confirmed' and kind = 'lab') = 1, '13: Rhea (read only) reads the confirmed paper');
select pg_temp.ok((select count(*) from public.documents where person_id = pg_temp.p('b') and status = 'draft') = 0, '13: 0 drafts');
select pg_temp.ok((select count(*) from public.documents where person_id = pg_temp.p('b') and kind in ('id_card', 'insurance_card')) = 0, '13: 0 ID-card documents');
select pg_temp.ok((select count(*) from public.person_identifiers where person_id = pg_temp.p('b')) = 0, '13: 0 identifiers');
select pg_temp.ok((select count(*) from public.phone_health where user_id = pg_temp.u('b')) = 1, '13: phone_health is readable');
select pg_temp.ok((select count(*) from public.meds_taken) = 2 and (select count(*) from public.activity where kind = 'd109walk') = 2, '13: doses and activity are readable');
reset role;

-- ===== 14. person_viewers and share_candidates(p) =====
set role authenticated;
select pg_temp.as('o');
select pg_temp.ok((select count(*) = 2 and bool_and(not pending) and bool_and(added_at is not null) from public.person_viewers(pg_temp.p('b'))), '14: owner reads B''s viewers (Joy, Rhea), none pending');
select pg_temp.ok((select string_agg(display_name, ',' order by display_name) from public.person_viewers(pg_temp.p('b'))) = 'Joy,Rhea', '14: with names');
select pg_temp.ok((select count(*) from public.person_viewers(pg_temp.p('e'))) = 4, '14: owner reads e''s viewers (creator, Joy, Rhea, Lola)');
select pg_temp.ok((select count(*) from public.person_viewers(pg_temp.p('o'))) = 0, '14: the owner''s own list is empty');
select pg_temp.ok((select string_agg(display_name, ',') from public.share_candidates(pg_temp.p('b'))) = 'Lola', '14: owner''s candidates for B: Lola only (not B, not the viewers, not the owner, not the disabled Kuya)');
select pg_temp.ok((select string_agg(display_name, ',') from public.share_candidates(pg_temp.p('e'))) = 'Test B', '14: owner''s candidates for e: Test B only');
select pg_temp.ok(pg_temp.state($$select * from public.person_viewers('10000000-0000-0000-0000-0000000000e9')$$) = '22023', '14: an archived person is a bad target');
select pg_temp.as('b');
select pg_temp.ok((select count(*) = 2 and bool_or(added_by_admin and display_name = 'Joy') and bool_or(not added_by_admin and display_name = 'Rhea') from public.person_viewers(pg_temp.p('b'))), '14: B reads their viewers; Joy was added by the owner, Rhea by B');
select pg_temp.ok((select string_agg(display_name, ',' order by display_name) from public.share_candidates(pg_temp.p('b'))) = 'Lola', '14: B''s candidates for B: Lola only (the owner is never offered, for any caller)');
select pg_temp.ok(pg_temp.state($$select * from public.person_viewers('10000000-0000-0000-0000-0000000000a0')$$) = '42501', '14: a member is refused on someone else');
select pg_temp.ok(pg_temp.state($$select * from public.share_candidates('10000000-0000-0000-0000-0000000000e1')$$) = '42501', '14: and for candidates');
select pg_temp.as('a');
select pg_temp.ok(pg_temp.state($$select * from public.person_viewers('10000000-0000-0000-0000-0000000000b1')$$) = '42501', '14: another admin is refused on B');
select pg_temp.ok(pg_temp.state($$select * from public.share_candidates('10000000-0000-0000-0000-0000000000b1')$$) = '42501', '14: and for candidates');
select pg_temp.ok((select count(*) from public.person_viewers(pg_temp.p('e'))) = 4, '14: but as a writer carer of e, a1 reads e''s list');
select pg_temp.as('r');
select pg_temp.ok(pg_temp.state($$select * from public.person_viewers('10000000-0000-0000-0000-0000000000b1')$$) = '42501', '14: a read-only viewer cannot read the list');
select pg_temp.as('d');
select pg_temp.ok(pg_temp.state($$select * from public.person_viewers('10000000-0000-0000-0000-0000000000d1')$$) = '42501', '14: a disabled caller is refused on their own record');
reset role;
set role anon;
select pg_temp.ok(pg_temp.state($$select * from public.person_viewers('10000000-0000-0000-0000-0000000000b1')$$) = '42501', '14: anon cannot call person_viewers');
reset role;

-- ===== section 11: people.kind and activity.updated_at =====
select pg_temp.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'people' and column_name = 'kind' and is_nullable = 'YES'), '11: people.kind exists and is null by default');
select pg_temp.ok((select count(*) from public.people where kind is not null) = 0, '11: nobody is marked shared by the migration');
set role authenticated;
select pg_temp.as('b');
select pg_temp.ok(pg_temp.state($$update public.people set kind = 'shared' where id = '10000000-0000-0000-0000-0000000000b1'$$) = '42501', '11: a client cannot set people.kind (update)');
select pg_temp.ok(pg_temp.state($$insert into public.people (display_name, created_by, kind) values ('Probe', '00000000-0000-0000-0000-0000000000b1', 'shared')$$) = '42501', '11: nor insert a row with a kind');
select pg_temp.ok(pg_temp.state($$insert into public.people (display_name, created_by) values ('Probe Ok', '00000000-0000-0000-0000-0000000000b1')$$) = 'ok', '11: a normal insert still works');
select pg_temp.ok(pg_temp.state($$update public.people set display_name = 'Test B' where id = '10000000-0000-0000-0000-0000000000b1'$$) = 'ok', '11: and so does a name update');
select pg_temp.as('a');
select pg_temp.ok(pg_temp.state($$update public.people set kind = 'shared' where id = '10000000-0000-0000-0000-0000000000b1'$$) = '42501', '11: an admin cannot set it either');
reset role;
delete from public.people where display_name = 'Probe Ok'; -- its creator link goes with it
select pg_temp.ok(pg_temp.state($$update public.people set kind = 'shared' where id = '10000000-0000-0000-0000-0000000000c1'$$) = 'ok', '11: the apply-time line marks the shared account');
select pg_temp.ok((select kind = 'shared' from public.people where id = pg_temp.p('c')), '11: Lola is marked shared (invented stand-in for the shared family account)');
-- the shared account never gets a link and is never offered
set role authenticated;
select pg_temp.as('o');
select pg_temp.ok(pg_temp.ss('b', 'c', false, true) = 'E:22023', '11: the shared account cannot be made a viewer (22023)');
select pg_temp.ok((select count(*) from public.share_candidates(pg_temp.p('b')) where display_name = 'Lola') = 0, '11: and is not a candidate');
reset role;
update public.people set kind = null where id = pg_temp.p('c');
set role authenticated;
select pg_temp.as('o');
select pg_temp.ok((select count(*) from public.share_candidates(pg_temp.p('b')) where display_name = 'Lola') = 1, '11: unmarked, Lola is a candidate again (the filter is the kind)');
reset role;
-- updated_at
select pg_temp.ok((select count(*) from public.activity where updated_at is null) = 0, '11: every activity row has updated_at');
set role authenticated;
select pg_temp.as('b');
insert into public.activity (person_id, kind, steps, started_at, source, updated_at) values (pg_temp.p('b'), 'd109stamp', 100, now(), 'manual', '2000-01-01');
reset role;
select pg_temp.ok((select updated_at > now() - interval '1 minute' from public.activity where kind = 'd109stamp'), '11: an insert stamps updated_at itself (a client value is ignored)');
select updated_at as t0 from public.activity where kind = 'd109stamp' \gset
select pg_sleep(0.05);
set role authenticated;
select pg_temp.as('b');
update public.activity set steps = 150 where kind = 'd109stamp';
select pg_temp.ok(pg_temp.state($$update public.activity set updated_at = '2000-01-01' where kind = 'd109stamp'$$) = '42501', '11: a client cannot write updated_at');
reset role;
select pg_temp.ok((select updated_at > :'t0'::timestamptz from public.activity where kind = 'd109stamp'), '11: the trigger stamps updated_at on update');
select pg_temp.ok(exists (select 1 from pg_indexes where tablename = 'activity' and indexname = 'activity_updated_at'), '11: activity_updated_at index for the cursor');

-- ===== a writer carer of a no-login person removes read-only viewers only =====
set role authenticated;
select pg_temp.as('a');
select pg_temp.ok(pg_temp.ss('e', 'j', false, false) = 'E:42501', '3: a writer carer cannot remove a link that has edit access (Joy)');
select pg_temp.as('j');
select pg_temp.ok(pg_temp.ss('e', 'c', false, false) = 'removed', '3: a writer carer removes a read-only viewer (Lola)');
select pg_temp.ok(pg_temp.ss('e', 'c', false, true) = 'added', '3: and adds it back');
select pg_temp.as('o');
select pg_temp.ok(pg_temp.ss('e', 'j', false, false) = 'removed', '3: the owner removes a link that has edit access');
select pg_temp.ok(pg_temp.ss('e', 'j', true, true) = 'added', '3: and sets it again');
reset role;
select pg_temp.ok((select can_write from public.carers where person_id = pg_temp.p('e') and carer_id = pg_temp.u('j')) and (select count(*) from public.carers where person_id = pg_temp.p('e')) = 4, '3: e is back to its four links');

-- ===== the migration runs twice, then down, then up =====
\ir ../migrations/0046_who_sees_whom.sql
select pg_temp.ok((select count(*) from public.app_roles where is_owner) = 1 and (select count(*) from pg_policies where policyname in ('meds_taken_owner_read', 'activity_owner_read', 'consults_owner_read')) = 3, '10: second run: one owner, three policies');
select pg_temp.ok((select count(*) from pg_trigger where tgname = 'app_roles_owner_guard') = 1 and (select count(*) from pg_trigger where tgname = 'activity_updated_at') = 1, '10: second run: one of each trigger');
select pg_temp.ok(pg_temp.msg($$update public.app_roles set disabled = true where user_id = '00000000-0000-0000-0000-0000000000a0'$$) like '%family owner%', '10: second run: the guard still holds');
select pg_temp.ok((select count(*) from public.carers) = 7, '10: second run: links untouched (e: creator, Joy, Rhea, Lola; B: Joy, Rhea; the archived person''s creator link)');
-- 0050's feed_shares policy uses is_owner(), so 0050 goes down first
\ir ../migrations/0050_family_feed.down.sql
\ir ../migrations/0046_who_sees_whom.down.sql
select pg_temp.ok(to_regprocedure('public.is_owner()') is null and to_regprocedure('public.person_viewers(uuid)') is null and to_regprocedure('public.share_candidates(uuid)') is null, 'down: the new functions are gone');
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and ((table_name = 'app_roles' and column_name = 'is_owner') or (table_name = 'people' and column_name = 'kind') or (table_name = 'activity' and column_name = 'updated_at'))), 'down: the three columns are gone');
select pg_temp.ok((select pg_get_functiondef(to_regprocedure('public.share_set(uuid,uuid,boolean,boolean)'))) like '%share_offers%', 'down: share_set is the 0037 offer model again');
select pg_temp.ok((select count(*) from pg_policies where policyname in ('meds_taken_owner_read', 'activity_owner_read', 'consults_owner_read')) = 0 and (select count(*) from pg_trigger where tgname in ('app_roles_owner_guard', 'activity_updated_at')) = 0, 'down: policies and triggers are gone');
select pg_temp.ok((select count(*) from public.carers) = 7, 'down: links made stay in carers');
select pg_temp.ok((select pg_get_functiondef(to_regprocedure('public.request_erasure()'))) not like '%is_owner%', 'down: request_erasure is the 0034 body');
-- 0050's feed_shares policy uses is_owner(), so 0050 goes down first
\ir ../migrations/0050_family_feed.down.sql
\ir ../migrations/0046_who_sees_whom.down.sql
\ir ../migrations/0046_who_sees_whom.sql
select pg_temp.ok(to_regprocedure('public.is_owner()') is not null and (select count(*) from public.activity where updated_at is null) = 0 and (select count(*) from public.activity) = 4, 'down twice then up: back to the new model, every activity row has updated_at (the backfill)');
select pg_temp.ok((select count(*) from public.app_roles where is_owner) = 0, 'up after down: no owner until the apply-time line runs again');
update public.app_roles set is_owner = true where user_id = pg_temp.u('o');
set role authenticated;
select pg_temp.as('o');
select pg_temp.ok(public.is_owner() and pg_temp.ss('b', 'c', false, true) = 'added', 'up after down and the owner line: the owner sets a link at once');
select pg_temp.ok(pg_temp.ss('b', 'c', false, false) = 'removed', 'and stops it');
reset role;

-- ===== the owner hands over (the runbook in the migration), as the loader =====
begin;
alter table public.app_roles disable trigger app_roles_owner_guard;
update public.app_roles set is_owner = false where is_owner;
update public.app_roles set is_owner = true where user_id = pg_temp.u('a');
alter table public.app_roles enable trigger app_roles_owner_guard;
commit;
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = pg_temp.u('a')) from public.app_roles where is_owner), 'runbook: the flag moved to the other admin, still exactly one owner');
select pg_temp.ok(pg_temp.msg($$update public.app_roles set disabled = true where user_id = '00000000-0000-0000-0000-0000000000a1'$$) like '%family owner%', 'runbook: the guard is back on (the new owner is protected)');
begin;
alter table public.app_roles disable trigger app_roles_owner_guard;
update public.app_roles set is_owner = false where is_owner;
update public.app_roles set is_owner = true where user_id = pg_temp.u('o');
alter table public.app_roles enable trigger app_roles_owner_guard;
commit;
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = pg_temp.u('o')) from public.app_roles where is_owner), 'runbook: and back');

-- ===== the owner as a writer carer of a no-login person (live shape): the link stays, the lists leave the owner out =====
insert into public.carers (carer_id, person_id, can_write) values (pg_temp.u('o'), pg_temp.p('e'), true);
set role authenticated;
select pg_temp.as('o');
select pg_temp.ok((select count(*) from public.person_viewers(pg_temp.p('e')) where display_name = 'Rey Villar') = 0 and (select count(*) from public.person_viewers(pg_temp.p('e'))) = 4, '8: person_viewers leaves the owner out (the four others stay)');
select pg_temp.ok((select count(*) from public.share_candidates(pg_temp.p('e')) where display_name = 'Rey Villar') = 0, '8: the owner is not a candidate for the owner');
select pg_temp.as('a');
select pg_temp.ok((select count(*) from public.person_viewers(pg_temp.p('e')) where display_name = 'Rey Villar') = 0, '8: nor in a writer carer''s list');
select pg_temp.ok((select count(*) from public.share_candidates(pg_temp.p('e')) where display_name = 'Rey Villar') = 0, '8: nor a candidate for a writer carer');
select pg_temp.as('o');
select pg_temp.ok(pg_temp.ss('e', 'o', false, true) = 'E:22023', '13: the owner cannot re-add their own existing link (p_carer = me)');
select pg_temp.as('a');
select pg_temp.ok(pg_temp.ss('e', 'o', false, true) = 'unchanged', '13: an existing owner link is left alone by a new add');
select pg_temp.as('b');
select pg_temp.ok(pg_temp.ss('b', 'o', false, true) = 'E:22023', '13: a member cannot make the owner a viewer of their own record');
reset role;
select pg_temp.ok((select can_write from public.carers where person_id = pg_temp.p('e') and carer_id = pg_temp.u('o')), '8: the owner''s real writer link is untouched in carers');
select pg_temp.ok(public.notify_family(pg_temp.p('e'), 'dose_missed', 'dose_missed', 'e:own', 'carers') = 3, '8: and still counts as a writer carer for the missed-dose scope (Joy, a1, the owner)');
delete from public.carers where carer_id = pg_temp.u('o') and person_id = pg_temp.p('e');
set role authenticated;
select pg_temp.as('a');
select pg_temp.ok(pg_temp.ss('e', 'o', false, true) = 'E:22023', '13: a writer carer cannot add the owner as a new viewer');
reset role;
select pg_temp.ok((select count(*) from public.carers where carer_id = pg_temp.u('o')) = 0, '13: and no owner link was made');

-- ===== activity.updated_at on a table of more than 1000 rows: the page cursor moves on and reaches a later row =====
-- 0050's feed_shares policy uses is_owner(), so 0050 goes down first
\ir ../migrations/0050_family_feed.down.sql
\ir ../migrations/0046_who_sees_whom.down.sql
insert into public.activity (person_id, kind, steps, started_at, source, created_at)
  select pg_temp.p('b'), 'd109page', g, now(), 'manual', now() - (g || ' seconds')::interval from generate_series(1, 1200) g;
\ir ../migrations/0046_who_sees_whom.sql
update public.app_roles set is_owner = true where user_id = pg_temp.u('o');
select pg_temp.ok((select count(distinct updated_at) = 1200 and bool_and(updated_at = created_at) from public.activity where kind = 'd109page'), '2: the backfill gave each old row its own created_at, not one shared time');
create temp table pg_seen (id uuid primary key);
do $$
declare cur timestamptz := '-infinity'; nxt timestamptz; n int; i int := 0; total int; late uuid; got boolean;
begin
  -- the client's page: order by updated_at, limit 1000, next page from updated_at >= the last one (merge keys on client_id, so a repeat is harmless)
  loop
    i := i + 1;
    if i > 10 then raise exception 'FAIL 2: the cursor never reached the end'; end if;
    with page as (select id, updated_at from public.activity where updated_at >= cur order by updated_at, id limit 1000),
         ins as (insert into pg_seen select id from page on conflict do nothing returning 1)
      select max(updated_at), count(*) into nxt, n from page;
    exit when n < 1000;
    if nxt = cur then raise exception 'FAIL 2: a full page that did not move the cursor (stalled)'; end if;
    cur := nxt;
  end loop;
  select count(*) into total from public.activity;
  if (select count(*) from pg_seen) <> total then raise exception 'FAIL 2: the walk saw % of % rows', (select count(*) from pg_seen), total; end if;
  -- a row added after the walk is reached from the last cursor
  insert into public.activity (person_id, kind, steps, started_at, source) values (pg_temp.p('b'), 'd109late', 1, now(), 'manual') returning id into late;
  select exists (select 1 from (select id from public.activity where updated_at >= nxt order by updated_at, id limit 1000) q where q.id = late) into got;
  if not got then raise exception 'FAIL 2: a row added later was not reached'; end if;
  raise notice 'PASS 2: the 1000-row page walk saw all % rows in % pages and reached a row added later', total, i;
end $$;
delete from public.activity where kind in ('d109page', 'd109late');

\echo D109 REHEARSAL DONE
