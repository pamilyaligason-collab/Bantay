-- Rehearsal for 0052_live_location.sql (D-136, D-138) on a THROWAWAY Postgres (never the live project): the REAL chain 0001..0050 (chain_rehearsal.sql), then 0052, then asserts.
-- Run (WSL Postgres, from supabase/tests):
--   sudo -n -u postgres dropdb --if-exists s_place; sudo -n -u postgres createdb s_place
--   sudo -n -u postgres psql -X -q -v ON_ERROR_STOP=1 -d s_place -f live_location_rehearsal.sql
-- Actors (invented): o Rey Villar, the family owner (admin); b Test B (member); r Rhea (member); w Wen (member, writer carer of the no-login person n); x Xia (member with no person row);
-- d Kuya (member whose account is disabled later); s the shared family account. Persons: n has no login, z is archived, s is the shared account (people.kind 'shared').
\set ON_ERROR_STOP on
\ir chain_rehearsal.sql
\ir ../migrations/0052_live_location.sql

-- ---------- helpers ----------
create function pg_temp.state(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
create function pg_temp.u(k text) returns uuid language sql immutable as $$ select case k
  when 'o' then '00000000-0000-0000-0000-0000000000a0' when 'b' then '00000000-0000-0000-0000-0000000000b1' when 'r' then '00000000-0000-0000-0000-000000000051'
  when 'w' then '00000000-0000-0000-0000-0000000000c7' when 'x' then '00000000-0000-0000-0000-0000000000c8' when 's' then '00000000-0000-0000-0000-0000000000c9'
  when 'd' then '00000000-0000-0000-0000-0000000000d7' end::uuid $$;
create function pg_temp.p(k text) returns uuid language sql immutable as $$ select case k
  when 'o' then '10000000-0000-0000-0000-0000000000a0' when 'b' then '10000000-0000-0000-0000-0000000000b1' when 'r' then '10000000-0000-0000-0000-000000000051'
  when 'w' then '10000000-0000-0000-0000-0000000000c7' when 's' then '10000000-0000-0000-0000-0000000000c9' when 'n' then '10000000-0000-0000-0000-0000000000e2'
  when 'z' then '10000000-0000-0000-0000-0000000000e9' when 'd' then '10000000-0000-0000-0000-0000000000d7' end::uuid $$;
create function pg_temp.as(k text) returns void language sql as $$ select set_config('request.jwt.claim.sub', pg_temp.u(k)::text, false) $$;
-- pg_temp.ok comes from chain_rehearsal.sql (defined once there); not redefined here.
-- feed_share_set 'place' as the signed-in actor: 'ok' or E:<sqlstate>
create function pg_temp.sw(person text, o boolean) returns text language plpgsql as $$
begin perform public.feed_share_set(pg_temp.p(person), 'place', o); return 'ok'; exception when others then return 'E:' || sqlstate; end $$;
-- live_location_put as the signed-in actor at Manila-ish coordinates: 'ok' or E:<sqlstate>
create function pg_temp.put(lat double precision, lon double precision, fixed timestamptz default now(), bat integer default 80) returns text language plpgsql as $$
begin perform public.live_location_put(lat, lon, 20, fixed, bat, false); return 'ok'; exception when others then return 'E:' || sqlstate; end $$;
-- who the signed-in actor sees on the map, sorted
create function pg_temp.seen() returns text language sql as $$ select coalesce(string_agg(f.person_id::text, ',' order by f.person_id), '') from public.family_places() f $$;
grant execute on function pg_temp.state(text), pg_temp.u(text), pg_temp.p(text), pg_temp.as(text), pg_temp.ok(boolean, text), pg_temp.sw(text, boolean),
  pg_temp.put(double precision, double precision, timestamptz, integer), pg_temp.seen() to authenticated, anon;

create function pg_temp.exp(variadic ks text[]) returns text language sql as $$ select coalesce(string_agg(pg_temp.p(k)::text, ',' order by pg_temp.p(k)), '') from unnest(ks) k $$;
grant execute on function pg_temp.exp(text[]) to authenticated, anon;

-- ---------- setup (as the loader, RLS bypassed) ----------
reset role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 (pg_temp.u('o'), 'rey@example.com',  '{"provider":"google"}', '{}'),
 (pg_temp.u('r'), 'rhea@example.com', '{"provider":"google"}', '{}'),
 (pg_temp.u('w'), 'wen@example.com',  '{"provider":"google"}', '{}'),
 (pg_temp.u('x'), 'xia@example.com',  '{"provider":"google"}', '{}'),
 (pg_temp.u('d'), 'kuya@example.com', '{"provider":"google"}', '{}'),
 (pg_temp.u('s'), 'family@example.com', '{"provider":"google"}', '{}');
insert into public.app_roles (user_id, role) values (pg_temp.u('o'), 'admin'), (pg_temp.u('r'), 'member'), (pg_temp.u('w'), 'member'),
 (pg_temp.u('x'), 'member'), (pg_temp.u('d'), 'member'), (pg_temp.u('s'), 'member');
update public.app_roles set is_owner = true where user_id = pg_temp.u('o');
insert into public.people (id, auth_user_id, display_name, created_by) values
 (pg_temp.p('o'), pg_temp.u('o'), 'Rey Villar', pg_temp.u('o')), (pg_temp.p('r'), pg_temp.u('r'), 'Rhea', pg_temp.u('r')),
 (pg_temp.p('w'), pg_temp.u('w'), 'Wen', pg_temp.u('w')), (pg_temp.p('d'), pg_temp.u('d'), 'Kuya', pg_temp.u('d'));
insert into public.people (id, auth_user_id, display_name, created_by, kind) values (pg_temp.p('s'), pg_temp.u('s'), 'Family account', pg_temp.u('o'), 'shared');
insert into public.people (id, display_name, created_by) values (pg_temp.p('n'), 'Lolo Nando', pg_temp.u('w'));
insert into public.people (id, display_name, created_by, archived_at) values (pg_temp.p('z'), 'Old Kin', pg_temp.u('w'), now());
select pg_temp.ok((select count(*) from public.live_locations) = 0 and (select count(*) from public.feed_shares where category = 'place') = 0, 'setup: no point and no place switch exists');

-- ===== 1. on by default: no switch row means sharing =====
set role authenticated;
select pg_temp.as('b'); select pg_temp.ok(pg_temp.put(14.5995, 120.9842) = 'ok', '1: a signed-in person with no switch row writes their point (on by default)');
select pg_temp.as('r'); select pg_temp.ok(pg_temp.put(14.6001, 120.9850, now(), 18) = 'ok', '1: a second person writes theirs');
select pg_temp.ok(pg_temp.seen() = pg_temp.exp('b', 'r'), '1: a member sees both people, and only them');
select pg_temp.ok((select f.accuracy_m = 20 and f.battery_pct = 18 and f.charging = false and f.lat = 14.6001 and f.lon = 120.985 from public.family_places() f where f.person_id = pg_temp.p('r')), '1: the row holds the point, accuracy, battery and charging as written');
reset role;
select pg_temp.ok((select count(*) from public.live_locations) = 2, '1: one row per person');

-- ===== 2. bad values and the one-row rule =====
set role authenticated; select pg_temp.as('b');
select pg_temp.ok(pg_temp.put(0, 0) = 'E:22023', '2: 0,0 is refused');
select pg_temp.ok(pg_temp.put(91, 10) = 'E:22023' and pg_temp.put(-91, 10) = 'E:22023', '2: latitude off the globe is refused');
select pg_temp.ok(pg_temp.put(10, 181) = 'E:22023' and pg_temp.put(10, -181) = 'E:22023', '2: longitude off the globe is refused');
select pg_temp.ok(pg_temp.put(null, 10) = 'E:22023' and pg_temp.put(10, null) = 'E:22023', '2: a missing coordinate is refused');
select pg_temp.ok(pg_temp.put('NaN'::double precision, 10) = 'E:22023', '2: NaN is refused');
select pg_temp.ok(pg_temp.put(14.5, 121.0, now() + interval '1 hour') = 'E:22023', '2: a fix from the future is refused');
select pg_temp.ok(pg_temp.state($$select public.live_location_put(14.5, 121.0, -1, now(), 50, false)$$) = '22023', '2: a negative accuracy is refused');
select pg_temp.ok(pg_temp.put(14.5, 121.0, now(), 150) = 'ok', '2: a battery over 100 is stored as unknown, not refused and not clamped');
select pg_temp.ok((select f.battery_pct is null from public.family_places() f where f.person_id = pg_temp.p('b')), '2: battery 150 is null');
select pg_temp.ok(pg_temp.put(14.7, 121.1, now() - interval '1 hour', 40) = 'ok', '2: an older fix is accepted by the call');
select pg_temp.ok(pg_temp.put(14.5, 121.0, now() - interval '7 days 1 minute') = 'E:22023', '2: a fix older than 7 days is refused');
select pg_temp.ok(pg_temp.put(14.5, 121.0, now() + interval '5 minutes 30 seconds') = 'E:22023', '2: a fix more than 5 minutes in the future is refused');
select pg_temp.ok((select f.lat = 14.5 from public.family_places() f where f.person_id = pg_temp.p('b')), '2: but it does not replace the newer point');
select pg_temp.ok(pg_temp.put(14.9, 121.2, now(), 60) = 'ok', '2: a newer fix is accepted');
-- a separate statement: family_places() is stable, so inside the statement that writes it would still show the old row
select pg_temp.ok((select f.lat = 14.9 and f.battery_pct = 60 from public.family_places() f where f.person_id = pg_temp.p('b')), '2: a newer fix replaces it');
reset role;
select pg_temp.ok((select count(*) from public.live_locations where person_id = pg_temp.p('b')) = 1, '2: still exactly one row for B (latest point only)');

-- ===== 3. switch off: refused writes, deleted row =====
set role authenticated;
select pg_temp.as('r'); select pg_temp.ok(pg_temp.sw('b', false) = 'E:42501', '3: a stranger cannot switch B off');
select pg_temp.as('b'); select pg_temp.ok(pg_temp.sw('b', false) = 'ok', '3: B switches place off');
reset role;
select pg_temp.ok((select count(*) from public.live_locations where person_id = pg_temp.p('b')) = 0, '3: switching off deletes B''s row at once');
set role authenticated;
select pg_temp.as('r'); select pg_temp.ok(pg_temp.seen() = pg_temp.exp('r'), '3: the family no longer sees B');
select pg_temp.as('b'); select pg_temp.ok(pg_temp.put(14.5, 121.0) = 'E:42501', '3: with the switch off, a write is refused with 42501');
reset role;
select pg_temp.ok((select count(*) from public.live_locations where person_id = pg_temp.p('b')) = 0, '3: and nothing was stored');
-- a row that somehow exists for an off person is still not returned
insert into public.live_locations (person_id, lat, lon, fixed_at) values (pg_temp.p('b'), 14.5, 121.0, now());
set role authenticated; select pg_temp.as('r');
select pg_temp.ok(pg_temp.seen() = pg_temp.exp('r'), '3: a leftover row of an off person is never returned');
reset role; delete from public.live_locations where person_id = pg_temp.p('b');
set role authenticated;
select pg_temp.as('b'); select pg_temp.ok(pg_temp.sw('b', true) = 'ok' and pg_temp.put(14.5, 121.0) = 'ok', '3: B switches it back on and writes again');
select pg_temp.as('r'); select pg_temp.ok(pg_temp.seen() = pg_temp.exp('b', 'r'), '3: the family sees B again');
-- the owner may switch anyone OFF, not ON
select pg_temp.as('o'); select pg_temp.ok(pg_temp.sw('r', false) = 'ok', '3: the owner can switch Rhea off');
select pg_temp.as('r'); select pg_temp.ok(pg_temp.sw('r', true) = 'ok' and pg_temp.put(14.6001, 120.985, now(), 18) = 'ok', '3: Rhea switches herself back on and writes again');
select pg_temp.as('o'); select pg_temp.ok(pg_temp.sw('b', true) = 'E:42501' and pg_temp.sw('r', true) = 'E:42501', '3: the owner cannot switch ON for a person with a login');
select pg_temp.as('b'); select pg_temp.ok(pg_temp.state($$select public.feed_share_set(null, 'place', true)$$) = '22023', '3: a null person is 22023');
reset role;
select pg_temp.ok((select agreed_text = 'place-2026-11' from public.feed_shares where person_id = pg_temp.p('b') and category = 'place'), '3: an ON switch records the place agreement text');
select pg_temp.ok((select count(*) from public.audit_log where tbl = 'feed_shares' and action = 'feed_share' and fields is distinct from array['enabled']) = 0, '3: audit rows hold only the column name enabled, never a coordinate');

-- ===== 4. nobody without a login, nobody archived, nobody shared, nobody without a person =====
set role authenticated;
select pg_temp.as('o'); select pg_temp.ok(pg_temp.sw('n', true) = 'E:22023', '4: place cannot be switched on for a person with no login');
select pg_temp.ok(pg_temp.sw('s', true) = 'E:22023' and pg_temp.sw('z', true) = 'E:22023', '4: nor for the shared account or an archived person');
select pg_temp.as('w'); select pg_temp.ok(pg_temp.sw('n', true) = 'E:22023', '4: a writer carer cannot either');
select pg_temp.as('x'); select pg_temp.ok(pg_temp.put(14.5, 121.0) = 'E:42501', '4: a member with no person row cannot write');
select pg_temp.as('s'); select pg_temp.ok(pg_temp.put(14.5, 121.0) = 'E:42501', '4: the shared family account cannot write');
reset role;
insert into public.live_locations (person_id, lat, lon, fixed_at) values (pg_temp.p('n'), 14.5, 121.0, now()), (pg_temp.p('z'), 14.5, 121.0, now()), (pg_temp.p('s'), 14.5, 121.0, now());
set role authenticated; select pg_temp.as('r');
select pg_temp.ok(pg_temp.seen() = pg_temp.exp('b', 'r'), '4: rows of a no-login, an archived and the shared person are never returned');
reset role; delete from public.live_locations where person_id in (pg_temp.p('n'), pg_temp.p('z'), pg_temp.p('s'));

-- ===== 5. disabled account hidden (ML-33) =====
set role authenticated; select pg_temp.as('d'); select pg_temp.ok(pg_temp.put(14.55, 121.05) = 'ok', '5: Kuya writes while enabled');
select pg_temp.as('r'); select pg_temp.ok(pg_temp.seen() like '%' || pg_temp.p('d')::text || '%', '5: and is on the map');
reset role; update public.app_roles set disabled = true where user_id = pg_temp.u('d');
set role authenticated; select pg_temp.as('r');
select pg_temp.ok(pg_temp.seen() = pg_temp.exp('b', 'r'), '5: once disabled, Kuya leaves the map at once');
select pg_temp.as('d');
select pg_temp.ok(pg_temp.seen() = '' and pg_temp.put(14.55, 121.05) = 'E:42501', '5: a disabled account reads nothing and cannot write');
reset role; update public.app_roles set disabled = false where user_id = pg_temp.u('d');

-- ===== 6. direct access is closed; the owner sees no more than the family =====
set role authenticated; select pg_temp.as('r');
select pg_temp.ok(pg_temp.state($$select * from public.live_locations$$) = '42501', '6: a direct select on live_locations fails');
select pg_temp.ok(pg_temp.state($$insert into public.live_locations (person_id, lat, lon, fixed_at) values (gen_random_uuid(), 1, 1, now())$$) = '42501', '6: a direct insert fails');
select pg_temp.ok(pg_temp.state($$update public.live_locations set lat = 1$$) = '42501' and pg_temp.state($$delete from public.live_locations$$) = '42501', '6: a direct update and delete fail');
select pg_temp.ok(pg_temp.seen() = pg_temp.exp('b', 'd', 'r'), '6: a member sees B, Kuya and Rhea');
select pg_temp.as('o');
select pg_temp.ok(pg_temp.state($$select * from public.live_locations$$) = '42501', '6: the owner cannot read the table directly either');
select pg_temp.ok(pg_temp.seen() = pg_temp.exp('b', 'd', 'r'), '6: the owner sees exactly what a member sees (the owner has no row of their own yet)');
select pg_temp.ok(pg_temp.sw('r', false) = 'ok' and pg_temp.seen() = pg_temp.exp('b', 'd'), '6: the owner switches Rhea off and then sees no more than the family (Rhea gone)');
select pg_temp.as('r'); select pg_temp.ok(pg_temp.sw('r', true) = 'ok' and pg_temp.put(14.6001, 121.0, now(), 18) = 'ok', '6: Rhea switches herself back on and writes again');
reset role; set role anon;
select pg_temp.ok(pg_temp.state($$select * from public.family_places()$$) = '42501' and pg_temp.state($$select public.live_location_put(14.5, 121.0, 10, now(), 50, false)$$) = '42501', '6: anon cannot call either function');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.ok(pg_temp.seen() = '' and pg_temp.put(14.5, 121.0) = 'E:42501', '6: a caller with no user id reads nothing and writes nothing');
reset role;

-- ===== 7. hourly limit and the 7-day prune (ML-08, ML-06) =====
set role authenticated; select pg_temp.as('w');
select pg_temp.ok((select count(*) filter (where t.r = 'ok') = 60 and count(*) filter (where t.r = 'E:53400') = 10 from (select pg_temp.put(14.5, 121.0) as r from generate_series(1, 70)) t), '7: 60 writes an hour pass, the 61st on is 53400');
reset role;
update public.live_locations set updated_at = now() - interval '8 days' where person_id = pg_temp.p('b');
set role authenticated; select pg_temp.as('r');
select pg_temp.ok(pg_temp.seen() not like '%' || pg_temp.p('b')::text || '%', '7: a point idle 8 days is not returned even before the prune runs');
reset role;
select pg_temp.ok((select count(*) from public.live_locations where person_id = pg_temp.p('b')) = 1, '7: but the row is still there until the prune');
select public.live_locations_prune();
select pg_temp.ok((select count(*) from public.live_locations where person_id = pg_temp.p('b')) = 0 and (select count(*) from public.live_locations where person_id = pg_temp.p('r')) = 1, '7: the prune deletes the 8-day row and keeps fresh ones');

-- ===== 8. function and table hygiene (ML-21) =====
select pg_temp.ok((select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('feed_share_set', 'live_location_put', 'family_places', 'live_locations_prune')), '8: all four are security definer with an empty search_path');
select pg_temp.ok(has_function_privilege('authenticated', 'public.live_location_put(double precision,double precision,integer,timestamptz,integer,boolean)', 'execute') and has_function_privilege('authenticated', 'public.family_places()', 'execute') and has_function_privilege('authenticated', 'public.feed_share_set(uuid,text,boolean)', 'execute'), '8: authenticated may execute put, places and the switch');
select pg_temp.ok(not has_function_privilege('anon', 'public.live_location_put(double precision,double precision,integer,timestamptz,integer,boolean)', 'execute') and not has_function_privilege('anon', 'public.family_places()', 'execute') and not has_function_privilege('anon', 'public.feed_share_set(uuid,text,boolean)', 'execute'), '8: anon may not');
select pg_temp.ok(not has_function_privilege('service_role', 'public.live_location_put(double precision,double precision,integer,timestamptz,integer,boolean)', 'execute') and not has_function_privilege('service_role', 'public.family_places()', 'execute') and not has_function_privilege('service_role', 'public.feed_share_set(uuid,text,boolean)', 'execute'), '8: service_role may not');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.live_locations_prune()', 'execute') and not has_function_privilege('anon', 'public.live_locations_prune()', 'execute'), '8: the prune is never callable by an app role');
select pg_temp.ok((select count(*) from information_schema.routine_privileges where routine_schema = 'public' and routine_name in ('live_location_put', 'family_places', 'live_locations_prune', 'feed_share_set') and grantee = 'PUBLIC') = 0, '8: nothing is granted to PUBLIC');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.live_locations', 'select') and not has_table_privilege('authenticated', 'public.live_locations', 'insert') and not has_table_privilege('anon', 'public.live_locations', 'select'), '8: no app role has any table privilege on live_locations');
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.live_locations'::regclass), '8: row level security is on');
select pg_temp.ok((select count(*) from pg_attribute where attrelid = 'public.live_locations'::regclass and attnum > 0 and not attisdropped) = 8, '8: the table has no history or free-text column (8 columns)');

-- ===== 9. down restores 0050, and up runs again =====
\ir ../migrations/0052_live_location.down.sql
select pg_temp.ok(to_regclass('public.live_locations') is null and to_regprocedure('public.family_places()') is null and to_regprocedure('public.live_locations_prune()') is null, '9: down drops the table and the read and prune functions');
select pg_temp.ok(to_regprocedure('public.live_location_put(double precision,double precision,integer,timestamptz,integer,boolean)') is null, '9: down drops the writer');
select pg_temp.ok(not exists (select 1 from public.feed_shares where category = 'place') and (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.feed_shares'::regclass and c.conname = 'feed_shares_category_check') not like '%place%', '9: place switch rows are gone and the category list is the four again');
set role authenticated; select pg_temp.as('b');
select pg_temp.ok(pg_temp.sw('b', true) = 'E:22023', '9: after down, feed_share_set refuses place again');
select pg_temp.ok(pg_temp.state(format($$select public.feed_share_set(%L, 'bp', true)$$, pg_temp.p('b'))) = 'ok', '9: and still switches the four feed categories');
reset role;
\ir ../migrations/0052_live_location.down.sql
select pg_temp.ok(true, '9: down runs twice');
\ir ../migrations/0052_live_location.sql
\ir ../migrations/0052_live_location.sql
set role authenticated; select pg_temp.as('b');
select pg_temp.ok(pg_temp.put(14.5, 121.0) = 'ok' and pg_temp.seen() = pg_temp.exp('b'), '9: after up again (twice) the writer and the map work');
reset role;
\echo REHEARSAL DONE
