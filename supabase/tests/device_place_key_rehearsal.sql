-- Rehearsal for 0053_device_place_key.sql (D-150) on a THROWAWAY Postgres (never the live project): the REAL chain 0001..0050 (chain_rehearsal.sql), then 0052, then 0053, then asserts.
-- Run (WSL Postgres, from supabase/tests):
--   sudo -n -u postgres dropdb --if-exists s_pkey; sudo -n -u postgres createdb s_pkey
--   sudo -n -u postgres psql -X -q -v ON_ERROR_STOP=1 -d s_pkey -f device_place_key_rehearsal.sql
-- Actors (invented): o Rey Villar, the family owner (admin); b Test B and r Rhea (members); d Kuya (member whose account is disabled later); a Ana (member archived later); x Xia (member, no person row); s the shared family account.
-- Keys are kept in session settings (rehearsal.k_*), so no raw key is ever written to a table.
\set ON_ERROR_STOP on
\ir chain_rehearsal.sql
\ir ../migrations/0052_live_location.sql
\ir ../migrations/0053_device_place_key.sql

-- ---------- helpers ----------
create function pg_temp.state(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
create function pg_temp.u(k text) returns uuid language sql immutable as $$ select case k
  when 'o' then '00000000-0000-0000-0000-0000000000a0' when 'b' then '00000000-0000-0000-0000-0000000000b1' when 'r' then '00000000-0000-0000-0000-000000000051'
  when 'x' then '00000000-0000-0000-0000-0000000000c8' when 's' then '00000000-0000-0000-0000-0000000000c9' when 'd' then '00000000-0000-0000-0000-0000000000d7'
  when 'a' then '00000000-0000-0000-0000-0000000000a7' end::uuid $$;
create function pg_temp.p(k text) returns uuid language sql immutable as $$ select case k
  when 'o' then '10000000-0000-0000-0000-0000000000a0' when 'b' then '10000000-0000-0000-0000-0000000000b1' when 'r' then '10000000-0000-0000-0000-000000000051'
  when 's' then '10000000-0000-0000-0000-0000000000c9' when 'd' then '10000000-0000-0000-0000-0000000000d7' when 'a' then '10000000-0000-0000-0000-0000000000a7' end::uuid $$;
create function pg_temp.as(k text) returns void language sql as $$ select set_config('request.jwt.claim.sub', pg_temp.u(k)::text, false) $$;
-- issue a key as the signed-in actor and keep it in a session setting: 'ok' or E:<sqlstate>
create function pg_temp.issue(slot text, device text) returns text language plpgsql as $$
begin perform set_config('rehearsal.k_' || slot, public.device_place_key_issue(device, 'android'), false); return 'ok'; exception when others then return 'E:' || sqlstate; end $$;
create function pg_temp.k(slot text) returns text language sql as $$ select current_setting('rehearsal.k_' || slot, true) $$;
-- live_location_put_device (anon, no session) with the key in a slot: the check-in (D-151: battery and a time, never a place). 'true' / 'false' / E:<sqlstate>
create function pg_temp.dput(key text, bat integer default 80, chg boolean default false) returns text language plpgsql as $$
begin return public.live_location_put_device(key, bat, chg)::text; exception when others then return 'E:' || sqlstate; end $$;
-- a stored point put in place by the loader (the key can never create one): person, lat, lon, fixed_at, battery
create function pg_temp.seed(person text, lat double precision, lon double precision, fixed timestamptz, bat integer default 80) returns void language sql security definer as $$
  insert into public.live_locations (person_id, lat, lon, accuracy_m, fixed_at, battery_pct, charging, updated_at) values (pg_temp.p(person), lat, lon, 20, fixed, bat, false, fixed)
  on conflict (person_id) do update set lat = excluded.lat, lon = excluded.lon, accuracy_m = 20, fixed_at = excluded.fixed_at, battery_pct = excluded.battery_pct, charging = false, updated_at = excluded.updated_at, checked_at = null, battery_checked_at = null $$;
-- live_location_put as the signed-in actor (the foreground writer, for the same-answer checks)
create function pg_temp.put(lat double precision, lon double precision, fixed timestamptz default now(), bat integer default 80, acc integer default 20) returns text language plpgsql as $$
begin perform public.live_location_put(lat, lon, acc, fixed, bat, false); return 'ok'; exception when others then return 'E:' || sqlstate; end $$;
create function pg_temp.sw(person text, o boolean) returns text language plpgsql as $$
begin perform public.feed_share_set(pg_temp.p(person), 'place', o); return 'ok'; exception when others then return 'E:' || sqlstate; end $$;
create function pg_temp.seen() returns text language sql as $$ select coalesce(string_agg(f.person_id::text, ',' order by f.person_id), '') from public.family_places() f $$;
-- active() counts as the loader (security definer), so it also works while acting as an app role
create function pg_temp.active(person text) returns bigint language sql security definer as $$ select count(*) from public.device_place_keys where person_id = pg_temp.p(person) and revoked_at is null $$;
grant execute on function pg_temp.state(text), pg_temp.u(text), pg_temp.p(text), pg_temp.as(text), pg_temp.issue(text, text), pg_temp.k(text),
  pg_temp.dput(text, integer, boolean), pg_temp.seed(text, double precision, double precision, timestamptz, integer), pg_temp.put(double precision, double precision, timestamptz, integer, integer),
  pg_temp.sw(text, boolean), pg_temp.seen(), pg_temp.active(text), pg_temp.ok(boolean, text) to authenticated, anon;

-- ---------- setup (as the loader, RLS bypassed) ----------
reset role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 (pg_temp.u('o'), 'rey@example.com',  '{"provider":"google"}', '{}'), (pg_temp.u('b'), 'testb@example.com', '{"provider":"google"}', '{}'),
 (pg_temp.u('r'), 'rhea@example.com', '{"provider":"google"}', '{}'), (pg_temp.u('x'), 'xia@example.com',  '{"provider":"google"}', '{}'),
 (pg_temp.u('d'), 'kuya@example.com', '{"provider":"google"}', '{}'), (pg_temp.u('a'), 'ana@example.com',  '{"provider":"google"}', '{}'),
 (pg_temp.u('s'), 'family@example.com', '{"provider":"google"}', '{}')
on conflict (id) do nothing;
insert into public.app_roles (user_id, role) values (pg_temp.u('o'), 'admin'), (pg_temp.u('r'), 'member'), (pg_temp.u('x'), 'member'), (pg_temp.u('d'), 'member'), (pg_temp.u('a'), 'member'), (pg_temp.u('s'), 'member')
on conflict (user_id) do nothing;
update public.app_roles set is_owner = true where user_id = pg_temp.u('o');
insert into public.people (id, auth_user_id, display_name, created_by) values
 (pg_temp.p('o'), pg_temp.u('o'), 'Rey Villar', pg_temp.u('o')), (pg_temp.p('r'), pg_temp.u('r'), 'Rhea', pg_temp.u('r')),
 (pg_temp.p('d'), pg_temp.u('d'), 'Kuya', pg_temp.u('d')), (pg_temp.p('a'), pg_temp.u('a'), 'Ana', pg_temp.u('a'))
on conflict (id) do nothing;
insert into public.people (id, auth_user_id, display_name, created_by, kind) values (pg_temp.p('s'), pg_temp.u('s'), 'Family account', pg_temp.u('o'), 'shared') on conflict (id) do nothing;
-- the chain already holds a person row for b (Test B); find it by login
update public.people set id = id where auth_user_id = pg_temp.u('b');
select pg_temp.ok(exists (select 1 from public.people where auth_user_id = pg_temp.u('b') and id = pg_temp.p('b')), 'setup: Test B has the person row the helpers expect');
select pg_temp.ok((select count(*) from public.device_place_keys) = 0 and (select count(*) from public.live_locations) = 0, 'setup: no key and no point exists');

-- ===== 1. issue =====
set role anon;
select pg_temp.ok(pg_temp.state($$select public.device_place_key_issue('device-b-001', 'android')$$) = '42501', '1: anon cannot issue (no execute grant)');
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.ok(pg_temp.issue('n', 'device-n-001') = 'E:42501', '1: a caller with no user id cannot issue');
select pg_temp.as('x'); select pg_temp.ok(pg_temp.issue('x', 'device-x-001') = 'E:42501', '1: a member with no person row cannot issue');
select pg_temp.as('s'); select pg_temp.ok(pg_temp.issue('s', 'device-s-001') = 'E:42501', '1: the shared family account cannot issue');
select pg_temp.as('b'); select pg_temp.ok(pg_temp.issue('b1', 'short') = 'E:22023' and pg_temp.state($$select public.device_place_key_issue(null)$$) = '22023', '1: a short or null device id is 22023');
select pg_temp.ok(pg_temp.issue('b1', 'device-b-001') = 'ok', '1: a signed-in person with no switch row (on by default) gets a key');
select pg_temp.ok(pg_temp.k('b1') like 'bpk\_%' and length(pg_temp.k('b1')) = 4 + 64, '1: the raw key is bpk_ plus 64 hex characters (244 random bits)');
reset role;
select pg_temp.ok((select count(*) from public.device_place_keys where person_id = pg_temp.p('b')) = 1
  and (select key_hash from public.device_place_keys where person_id = pg_temp.p('b')) = encode(sha256(convert_to(pg_temp.k('b1'), 'UTF8')), 'hex')
  and not exists (select 1 from public.device_place_keys d where d::text like '%' || pg_temp.k('b1') || '%'), '1: only the SHA-256 is stored, the raw key is nowhere in the row');
select pg_temp.ok((select label = 'android' and device_id = 'device-b-001' and revoked_at is null from public.device_place_keys where person_id = pg_temp.p('b')), '1: the row holds the label, the device id, and is active');

-- ===== 2. the key checks in: battery and a time, never a place (D-151) =====
-- (a) with no point stored the key creates none
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), 40) = 'true', '2: a good key checks in even when the person has no point yet');
select pg_temp.ok((select count(*) from public.live_locations) = 0, '2: and it created no point (a key cannot make a place)');
-- (b) the old seven-argument writer with coordinates no longer exists
select pg_temp.ok(pg_temp.state($$select public.live_location_put_device('bpk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 14.5, 121.0, 20, now(), 50, false)$$) = '42883', '2: a call that carries a place (lat, lon, accuracy, fixed_at) has no function to land on');
update public.device_place_keys set last_put_at = null;
-- (c) the foreground writer stores B's point; a check-in changes only battery and the check-in time
set role authenticated; select pg_temp.as('b'); select pg_temp.ok(pg_temp.put(14.5995, 120.9842, now() - interval '2 hours', 18, 20) = 'ok', '2: the signed-in app stores B''s point');
reset role;
create temp table snap as select lat, lon, accuracy_m, fixed_at, updated_at, checked_at from public.live_locations where person_id = pg_temp.p('b');
grant select on snap to authenticated, anon;
select pg_temp.ok((select checked_at is null from snap), '2: a point written by the app has no check-in time');
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), 55, true) = 'true', '2: anon with the key checks in with battery 55, charging');
select pg_temp.ok((select l.lat = s.lat and l.lon = s.lon and l.accuracy_m = s.accuracy_m and l.fixed_at = s.fixed_at and l.updated_at = s.updated_at from public.live_locations l, snap s where l.person_id = pg_temp.p('b')),
  '2: place, accuracy, fixed_at and updated_at are exactly as before the check-in (it cannot move or re-date a place)');
select pg_temp.ok((select battery_pct = 55 and charging and checked_at > now() - interval '1 minute' from public.live_locations where person_id = pg_temp.p('b')), '2: battery, charging and the check-in time are stored');
select pg_temp.ok((select count(*) from public.live_locations) = 1, '2: exactly one row, B''s (the key has no way to name another person)');
set role authenticated; select pg_temp.as('r'); select pg_temp.ok(pg_temp.seen() = pg_temp.p('b')::text, '2: the family map shows B''s point');
select pg_temp.ok((select f.fixed_at = s.fixed_at and f.battery_pct = 55 and f.battery_at > now() - interval '1 minute' from public.family_places() f, snap s where f.person_id = pg_temp.p('b')), '2: the map shows the old fix time and the battery with its own, newer check-in time');
reset role;
-- a null or out-of-range battery keeps the known battery and charging: not unknown, not clamped, battery_checked_at unmoved; checked_at always moves
reset role;
create temp table bsnap as select battery_pct, charging, battery_checked_at, checked_at, updated_at from public.live_locations where person_id = pg_temp.p('b');
grant select on bsnap to authenticated, anon;
select pg_temp.ok((select battery_pct = 55 and charging and battery_checked_at > now() - interval '1 minute' from bsnap), '1: a valid check-in set battery_checked_at');
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), 150, false) = 'true', '1: a battery over 100 is accepted as a check-in');
select pg_temp.ok((select l.battery_pct = 55 and l.charging and l.battery_checked_at = s.battery_checked_at and l.checked_at > s.checked_at from public.live_locations l, bsnap s where l.person_id = pg_temp.p('b')), '1: a battery over 100 keeps 55 and charging, leaves battery_checked_at, moves checked_at');
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), -1, false) = 'true', '1: a negative battery is accepted as a check-in');
select pg_temp.ok((select l.battery_pct = 55 and l.charging and l.battery_checked_at = s.battery_checked_at from public.live_locations l, bsnap s where l.person_id = pg_temp.p('b')), '1: a negative battery keeps 55 and charging');
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), null, false) = 'true', '1: a null battery is accepted as a check-in');
select pg_temp.ok((select l.battery_pct = 55 and l.charging and l.battery_checked_at = s.battery_checked_at and l.checked_at > s.checked_at from public.live_locations l, bsnap s where l.person_id = pg_temp.p('b')), '1: a null battery keeps 55 and charging, moves checked_at');
set role authenticated; select pg_temp.as('r');
select pg_temp.ok((select f.battery_pct = 55 and f.battery_at = greatest(s.battery_checked_at, s.updated_at) and f.checked_at > s.checked_at from public.family_places() f, bsnap s where f.person_id = pg_temp.p('b')), '1: family_places battery_at follows the last valid battery and checked_at the last check-in');
reset role;
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), 42, false) = 'true', '1: a valid battery after that is accepted');
select pg_temp.ok((select battery_pct = 42 and not charging and battery_checked_at > (select battery_checked_at from bsnap) from public.live_locations where person_id = pg_temp.p('b')), '1: a valid battery after that replaces the old one and moves battery_checked_at');
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), null) = 'true', '2: and a null battery again');
select pg_temp.ok((select battery_pct = 42 and lat = 14.5995 from public.live_locations where person_id = pg_temp.p('b')), '2: a null battery keeps 42 and the place');
-- a newer app point after a check-in: the place moves with the app
set role authenticated; select pg_temp.as('b'); select pg_temp.ok(pg_temp.put(14.6, 121.1, now() - interval '1 hour', 70, 20) = 'ok', '2: a newer app point is accepted');
reset role;
select pg_temp.ok((select lat = 14.6 and battery_pct = 70 and fixed_at > (select fixed_at from snap) from public.live_locations where person_id = pg_temp.p('b')), '2: the app still moves the place');

-- ===== 3. wrong key, no key, other person =====
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput('bpk_' || repeat('0', 64)) = 'false', '3: a wrong key of the right shape is refused (false)');
select pg_temp.ok(pg_temp.dput(null) = 'false' and pg_temp.dput('') = 'false' and pg_temp.dput('short') = 'false' and pg_temp.dput(repeat('x', 300)) = 'false', '3: null, empty, short and over-long keys are refused the same way');
select pg_temp.ok(pg_temp.dput(upper(pg_temp.k('b1'))) = 'false', '3: the right key in the wrong case is wrong');
select pg_temp.ok(pg_temp.dput(encode(sha256(convert_to(pg_temp.k('b1'), 'UTF8')), 'hex')) = 'false', '3: the stored hash is not a key');
set role authenticated; select pg_temp.as('r'); select pg_temp.ok(pg_temp.issue('r1', 'device-r-001') = 'ok', '3: Rhea gets her own key');
reset role;
select pg_temp.seed('r', 14.7, 121.2, now() - interval '5 minutes', 60);
select pg_temp.ok(pg_temp.dput(pg_temp.k('r1'), 33) = 'true', '3: Rhea''s key checks Rhea in');
select pg_temp.ok((select battery_pct = 33 and checked_at is not null from public.live_locations where person_id = pg_temp.p('r')) and (select battery_pct = 70 and checked_at is not null from public.live_locations where person_id = pg_temp.p('b')), '3: and did not touch B''s row (a key checks in only its own person)');
select pg_temp.ok(pg_temp.state($$select public.live_location_put_device(null, 1, false)$$) = 'ok', '3: a null key is an answer, not an error');

-- ===== 4. rate limit: one check-in per key per 30 minutes =====
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), 51) = 'true', '4: the first check-in passes');
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), 52) = 'E:53400', '4: a second one inside 30 minutes is 53400');
select pg_temp.ok((select battery_pct = 51 from public.live_locations where person_id = pg_temp.p('b')), '4: and nothing was stored by it');
update public.device_place_keys set last_put_at = null where person_id = pg_temp.p('r');
select pg_temp.ok(pg_temp.dput(pg_temp.k('r1'), 31) = 'true', '4: another key has its own allowance');
update public.device_place_keys set last_put_at = now() - interval '29 minutes' where person_id = pg_temp.p('b');
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), 53) = 'E:53400', '4: 29 minutes after is still too soon');
update public.device_place_keys set last_put_at = now() - interval '31 minutes' where person_id = pg_temp.p('b');
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), 54) = 'true', '4: 31 minutes after passes');

-- ===== 4b. a check-in extends neither the grey pin nor the 7-day removal (D-151); both stay on fixed_at =====
select pg_temp.seed('b', 14.55, 121.05, now() - interval '8 days', 40);
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), 41) = 'true', '4b: B checks in on a point whose fix is 8 days old');
select pg_temp.ok((select fixed_at < now() - interval '7 days 23 hours' and updated_at < now() - interval '7 days 23 hours' and checked_at > now() - interval '1 minute' from public.live_locations where person_id = pg_temp.p('b')), '4b: the fix time and updated_at are untouched, only checked_at is recent');
set role authenticated; select pg_temp.as('r'); select pg_temp.ok(pg_temp.seen() = pg_temp.p('r')::text, '4b: the family map no longer returns B (cut on fixed_at, not on the check-in)');
reset role;
select public.live_locations_prune();
select pg_temp.ok((select count(*) from public.live_locations where person_id = pg_temp.p('b')) = 0 and (select count(*) from public.live_locations where person_id = pg_temp.p('r')) = 1, '4b: the prune removes the 8-day-old fix although it checked in a moment ago, and keeps Rhea''s');
select pg_temp.seed('b', 14.55, 121.05, now() - interval '6 days 23 hours', 40);
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1'), 42) = 'true', '4b: a point 6 days 23 hours old checks in');
set role authenticated; select pg_temp.as('r'); select pg_temp.ok(pg_temp.seen() like '%' || pg_temp.p('b')::text || '%', '4b: and is still returned by the map');
reset role;
select public.live_locations_prune();
select pg_temp.ok((select count(*) from public.live_locations where person_id = pg_temp.p('b')) = 1, '4b: and survives the prune');
-- the grey pin is read client-side from fixed_at: the map returns the place time and the battery time separately
select pg_temp.ok((select pg_get_function_result('public.family_places()'::regprocedure) like '%fixed_at timestamp with time zone%battery_at timestamp with time zone%'), '4b: family_places returns fixed_at (place time) and battery_at (battery time) separately');
select pg_temp.seed('b', 14.6, 121.1, now() - interval '1 hour', 70);

-- ===== 5. rotate, two phones, the cap, revoke by key =====
set role authenticated; select pg_temp.as('b');
select pg_temp.ok(pg_temp.issue('b2', 'device-b-001') = 'ok' and pg_temp.k('b2') <> pg_temp.k('b1'), '5: issuing again for the same phone gives a new key');
select pg_temp.ok(pg_temp.active('b') = 1, '5: one active key per phone');
reset role;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b1')) = 'false', '5: the rotated-out key is refused');
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b2')) = 'true', '5: the new key works');
set role authenticated; select pg_temp.as('b');
select pg_temp.ok(pg_temp.issue('b3', 'device-b-002') = 'ok' and pg_temp.active('b') = 2, '5: a second phone has its own active key');
reset role;
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b2')) = 'true', '5: the first phone''s key still works with the second issued');
-- revoke by key, no session
set role anon;
select pg_temp.ok(pg_temp.state(format($$select public.device_place_key_revoke(%L)$$, pg_temp.k('b3'))) = 'ok', '5: anon revokes with the key alone');
select pg_temp.ok(pg_temp.state(format($$select public.device_place_key_revoke(%L)$$, pg_temp.k('b3'))) = 'ok', '5: revoking twice is fine');
select pg_temp.ok(pg_temp.state($$select public.device_place_key_revoke('bpk_neverexisted0000000000000000000000000000000000000000000000000')$$) = 'ok' and pg_temp.state($$select public.device_place_key_revoke(null)$$) = 'ok', '5: revoking a key that never existed, or null, is silent');
reset role;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b3')) = 'false', '5: a revoked key is refused');
select pg_temp.ok(pg_temp.active('b') = 1 and pg_temp.dput(pg_temp.k('b2')) <> 'false', '5: revoking one phone''s key leaves the other phone''s key');
-- cap of 5 active keys per person (ML-06): oldest are revoked
set role authenticated; select pg_temp.as('r');
select pg_temp.ok(pg_temp.issue('r2', 'device-r-002') = 'ok' and pg_temp.issue('r3', 'device-r-003') = 'ok' and pg_temp.issue('r4', 'device-r-004') = 'ok' and pg_temp.issue('r5', 'device-r-005') = 'ok' and pg_temp.active('r') = 5, '5: five phones are allowed');
set role authenticated; select pg_temp.as('r');
select pg_temp.ok(pg_temp.issue('r6', 'device-r-006') = 'ok' and pg_temp.active('r') = 5, '5: a sixth phone keeps five active keys');
reset role;
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('r1')) = 'false' and pg_temp.dput(pg_temp.k('r6')) = 'true', '5: the oldest key was the one revoked, the newest works');

-- ===== 6. sharing off (own switch or owner) revokes every key at once; back on needs a new key =====
set role authenticated; select pg_temp.as('b'); select pg_temp.ok(pg_temp.issue('b4', 'device-b-002') = 'ok', '6: B has two phones again');
select pg_temp.ok(pg_temp.active('b') = 2, '6: two active keys');
select pg_temp.ok(pg_temp.sw('b', false) = 'ok', '6: B switches place off');
reset role;
select pg_temp.ok(pg_temp.active('b') = 0, '6: every key of B was revoked by that switch (trigger)');
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b2')) = 'false' and pg_temp.dput(pg_temp.k('b4')) = 'false', '6: and both keys are refused');
select pg_temp.ok((select count(*) from public.live_locations where person_id = pg_temp.p('b')) = 0, '6: B''s point is deleted by the switch (0052) and nothing re-created it (a key cannot create one)');
set role authenticated; select pg_temp.as('b');
select pg_temp.ok(pg_temp.issue('b5', 'device-b-001') = 'E:42501', '6: with sharing off a new key cannot be issued');
select pg_temp.ok(pg_temp.sw('b', true) = 'ok', '6: B switches it back on');
reset role;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b2')) = 'false', '6: the old key stays dead after switching back on');
set role authenticated; select pg_temp.as('b');
select pg_temp.ok(pg_temp.issue('b5', 'device-b-001') = 'ok', '6: a new key can be issued once sharing is on');
reset role;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b5')) = 'true', '6: and it writes');
-- the owner switches Rhea off
set role authenticated; select pg_temp.as('o'); select pg_temp.ok(pg_temp.sw('r', false) = 'ok', '6: the owner switches Rhea off');
reset role;
select pg_temp.ok(pg_temp.active('r') = 0 and pg_temp.dput(pg_temp.k('r6')) = 'false', '6: all Rhea''s keys are dead at once');
set role authenticated; select pg_temp.as('o'); select pg_temp.ok(pg_temp.sw('r', true) = 'E:42501', '6: the owner cannot switch her back on');
select pg_temp.as('r'); select pg_temp.ok(pg_temp.sw('r', true) = 'ok' and pg_temp.issue('r7', 'device-r-007') = 'ok', '6: she switches herself on and gets a new key');
reset role;
-- a switch row written by any other path is caught too (ML-11): a direct insert/update as the loader
update public.feed_shares set enabled = true where person_id = pg_temp.p('b') and category = 'place';
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b5')) = 'true', '6: a direct switch to ON revokes nothing');
update public.feed_shares set enabled = false where person_id = pg_temp.p('b') and category = 'place';
select pg_temp.ok(pg_temp.active('b') = 0, '6: a direct write of an OFF row (any writer) revokes the keys through the trigger');
update public.feed_shares set enabled = true where person_id = pg_temp.p('b') and category = 'place';
delete from public.feed_shares where person_id = pg_temp.p('b') and category = 'place';
select pg_temp.ok(pg_temp.active('b') = 0 and pg_temp.dput(pg_temp.k('b5')) = 'false', '6: back on, the revoked key is still dead');
set role authenticated; select pg_temp.as('b'); select pg_temp.ok(pg_temp.issue('b6', 'device-b-001') = 'ok', '6: with no switch row (on by default) B can issue again');
reset role;
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b6')) = 'true', '6: and the key writes');
select pg_temp.ok((select count(*) from public.feed_shares where category = 'place' and person_id = pg_temp.p('b')) = 0 and (select count(*) from public.audit_log where tbl = 'device_place_keys') = 0, '6: the trigger and the key functions write no audit row');

-- ===== 7. disabled account, archived person, expired key =====
set role authenticated; select pg_temp.as('d'); select pg_temp.ok(pg_temp.issue('d1', 'device-d-001') = 'ok', '7: Kuya has a key while enabled');
select pg_temp.as('a'); select pg_temp.ok(pg_temp.issue('a1', 'device-a-001') = 'ok', '7: Ana has a key while active');
reset role;
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('d1')) = 'true' and pg_temp.dput(pg_temp.k('a1')) = 'true', '7: both write');
update public.app_roles set disabled = true where user_id = pg_temp.u('d');
update public.people set archived_at = now() where id = pg_temp.p('a');
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('d1')) = 'false', '7: a disabled account''s key stops working at once (ML-33)');
select pg_temp.ok(pg_temp.dput(pg_temp.k('a1')) = 'false', '7: an archived person''s key stops working at once');
update public.app_roles set disabled = false where user_id = pg_temp.u('d');
select pg_temp.ok(pg_temp.dput(pg_temp.k('d1')) = 'true', '7: re-enabled, Kuya''s key (still within 30 days, not revoked) works again');
-- idle 30 days
update public.device_place_keys set last_used_at = now() - interval '30 days 1 minute' where person_id = pg_temp.p('d');
select pg_temp.ok(pg_temp.dput(pg_temp.k('d1')) = 'false', '7: a key idle for 30 days is expired');
update public.device_place_keys set last_used_at = now() - interval '29 days 23 hours' where person_id = pg_temp.p('d');
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('d1')) = 'true', '7: 29 days 23 hours idle still works, and use refreshes the clock');
select pg_temp.ok((select last_used_at > now() - interval '1 minute' from public.device_place_keys where person_id = pg_temp.p('d')), '7: last_used_at moved to now');
-- a key that was never used counts from its creation
update public.device_place_keys set last_used_at = null, created_at = now() - interval '31 days' where person_id = pg_temp.p('d');
select pg_temp.ok(pg_temp.dput(pg_temp.k('d1')) = 'false', '7: a key never used and issued 31 days ago is expired');
-- prune (ML-06)
update public.device_place_keys set revoked_at = now() - interval '8 days' where person_id = pg_temp.p('a');
update public.device_place_keys set last_used_at = now() - interval '38 days' where person_id = pg_temp.p('d');
select public.device_place_keys_prune();
select pg_temp.ok((select count(*) from public.device_place_keys where person_id in (pg_temp.p('a'), pg_temp.p('d'))) = 0, '7: the prune deletes keys revoked 8 days ago and keys idle 38 days');
select pg_temp.ok((select count(*) from public.device_place_keys where person_id = pg_temp.p('b') and revoked_at > now() - interval '1 day') > 0, '7: a key revoked today survives the prune');
update public.people set archived_at = null where id = pg_temp.p('a');

-- ===== 8. direct access is closed; the key reads nothing =====
set role authenticated; select pg_temp.as('b');
select pg_temp.ok(pg_temp.state($$select * from public.device_place_keys$$) = '42501', '8: a signed-in member cannot read the key table');
select pg_temp.ok(pg_temp.state($$insert into public.device_place_keys (person_id, device_id, key_hash) values (gen_random_uuid(), 'device-zzz-1', repeat('a', 64))$$) = '42501' and pg_temp.state($$update public.device_place_keys set revoked_at = null$$) = '42501' and pg_temp.state($$delete from public.device_place_keys$$) = '42501', '8: nor insert, update or delete in it');
select pg_temp.as('o'); select pg_temp.ok(pg_temp.state($$select * from public.device_place_keys$$) = '42501', '8: the owner cannot read it either');
select pg_temp.ok(pg_temp.state($$select public.live_location_put_device('x', 1, false)$$) = 'ok', '8: an authenticated session may call the writer too (it is the key that decides)');
reset role; set role anon;
select pg_temp.ok(pg_temp.state($$select * from public.device_place_keys$$) = '42501' and pg_temp.state($$select * from public.live_locations$$) = '42501' and pg_temp.state($$select * from public.family_places()$$) = '42501', '8: anon reads nothing: not the keys, not the points, not the map');
select pg_temp.ok(pg_temp.state($$select public.live_location_put(14.5, 121.0, 10, now(), 50, false)$$) = '42501', '8: anon still cannot call the signed-in writer');
select pg_temp.ok(pg_temp.state($$select public.device_place_keys_prune()$$) = '42501' and pg_temp.state($$select public.device_place_keys_on_off()$$) = '42501', '8: anon cannot call the prune or the trigger function');
reset role;

-- ===== 9. wrong keys share one hourly budget (ML-08); a right key is never blocked by it =====
delete from public.pin_attempts where user_id = md5('pkbad')::uuid;
select pg_temp.ok((select count(*) filter (where t.r = 'false') = 300 and count(*) filter (where t.r = 'E:53400') = 5 from (select pg_temp.dput('bpk_' || md5(g::text) || md5((g + 1)::text)) as r from generate_series(1, 305) g) t), '9: 300 wrong keys an hour answer false, the 301st on are 53400');
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput(pg_temp.k('b6')) = 'true', '9: a right key still works while the wrong-key budget is spent');
select pg_temp.ok(pg_temp.state($$select public.device_place_key_revoke('bpk_neverexisted0000000000000000000000000000000000000000000000001')$$) = '53400', '9: revoking unknown keys draws on the same budget');
select pg_temp.ok(pg_temp.state(format($$select public.device_place_key_revoke(%L)$$, pg_temp.k('b6'))) = 'ok', '9: but revoking a real key does not');
delete from public.pin_attempts where user_id = md5('pkbad')::uuid;
-- issue is limited to 10 an hour per person
set role authenticated; select pg_temp.as('x'); select pg_temp.ok(pg_temp.issue('xx', 'device-x-001') = 'E:42501', '9: (Xia has no person row)');
select pg_temp.as('r');
select pg_temp.ok((select count(*) filter (where t.r = 'ok') = 3 and count(*) filter (where t.r = 'E:53400') = 5 from (select pg_temp.issue('rr', 'device-r-00' || (g % 3)) as r from generate_series(1, 8) g) t), '9: issuing is 10 an hour per person (7 already used above this run: 3 more pass, the rest are 53400)');
reset role;

-- ===== 10. hygiene (ML-21) =====
select pg_temp.ok((select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('device_place_key_issue', 'device_place_key_revoke', 'live_location_put_device', 'device_place_keys_on_off', 'device_place_keys_prune')), '10: all five are security definer with an empty search_path');
select pg_temp.ok(has_function_privilege('anon', 'public.live_location_put_device(text,integer,boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.live_location_put_device(text,integer,boolean)', 'execute')
  and has_function_privilege('anon', 'public.device_place_key_revoke(text)', 'execute') and has_function_privilege('authenticated', 'public.device_place_key_revoke(text)', 'execute')
  and has_function_privilege('authenticated', 'public.device_place_key_issue(text,text)', 'execute'), '10: put_device and revoke are open to anon and authenticated, issue to authenticated');
select pg_temp.ok(not has_function_privilege('anon', 'public.device_place_key_issue(text,text)', 'execute') and not has_function_privilege('service_role', 'public.device_place_key_issue(text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.live_location_put_device(text,integer,boolean)', 'execute')
  and not has_function_privilege('service_role', 'public.device_place_key_revoke(text)', 'execute'), '10: anon may not issue; service_role holds none of the three');
select pg_temp.ok(not has_function_privilege('anon', 'public.device_place_keys_prune()', 'execute') and not has_function_privilege('authenticated', 'public.device_place_keys_prune()', 'execute')
  and not has_function_privilege('authenticated', 'public.device_place_keys_on_off()', 'execute') and not has_function_privilege('anon', 'public.device_place_keys_on_off()', 'execute'), '10: the prune and the trigger function are never callable by an app role');
select pg_temp.ok((select count(*) from information_schema.routine_privileges where routine_schema = 'public' and routine_name in ('device_place_key_issue', 'device_place_key_revoke', 'live_location_put_device', 'device_place_keys_prune', 'device_place_keys_on_off') and grantee = 'PUBLIC') = 0, '10: nothing is granted to PUBLIC');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.device_place_keys', 'select') and not has_table_privilege('anon', 'public.device_place_keys', 'select') and not has_table_privilege('authenticated', 'public.device_place_keys', 'insert'), '10: no app role has any table privilege on the key table');
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.device_place_keys'::regclass) and (select count(*) from pg_policy where polrelid = 'public.device_place_keys'::regclass) = 0, '10: row level security is on with no policy');
select pg_temp.ok((select count(*) from pg_attribute where attrelid = 'public.device_place_keys'::regclass and attnum > 0 and not attisdropped) = 10, '10: the key table has 10 columns (user_id added) and no coordinate');

-- ===== 10b. total age cap (2) and the issuing login (3) =====
reset role;
insert into public.device_place_keys (person_id, user_id, device_id, key_hash) values (pg_temp.p('b'), pg_temp.u('b'), 'device-b-cap1', encode(sha256(convert_to('bpk_rehearsal_capkey_000001', 'UTF8')), 'hex'));
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput('bpk_rehearsal_capkey_000001') = 'true', '2: a fresh key works');
update public.device_place_keys set created_at = now() - interval '31 days', last_used_at = now(), last_put_at = null where device_id = 'device-b-cap1';
select pg_temp.ok(pg_temp.dput('bpk_rehearsal_capkey_000001') = 'false', '2: a key issued 31 days ago is dead although it was used a minute ago (total age cap)');
update public.device_place_keys set created_at = now() - interval '29 days 23 hours', last_used_at = now(), last_put_at = null where device_id = 'device-b-cap1';
select pg_temp.ok(pg_temp.dput('bpk_rehearsal_capkey_000001') = 'true', '2: 29 days 23 hours after issue it still works (daily app rotation stays inside the cap)');
update public.device_place_keys set last_put_at = null;
update public.people set auth_user_id = pg_temp.u('x') where id = pg_temp.p('b');
select pg_temp.ok(pg_temp.dput('bpk_rehearsal_capkey_000001') = 'false' and pg_temp.dput(pg_temp.k('b1')) = 'false', '3: person re-linked to another login (Xia, an active member): the old keys return false');
update public.people set auth_user_id = pg_temp.u('b') where id = pg_temp.p('b');
update public.device_place_keys set last_put_at = null;
select pg_temp.ok(pg_temp.dput('bpk_rehearsal_capkey_000001') = 'true', '3: linked back to the issuing login, the key works again');
select pg_temp.ok((select count(*) from public.device_place_keys where person_id = pg_temp.p('b') and user_id = pg_temp.u('b')) >= 1 and not exists (select 1 from public.device_place_keys where person_id = pg_temp.p('b') and user_id <> pg_temp.u('b')), '3: every key issued through device_place_key_issue for B stored B''s login as user_id');
update public.device_place_keys set revoked_at = now() where device_id = 'device-b-cap1';

-- ===== 11. down, then up twice =====
\ir ../migrations/0053_device_place_key.down.sql
select pg_temp.ok(to_regclass('public.device_place_keys') is null and to_regprocedure('public.live_location_put_device(text,integer,boolean)') is null
  and to_regprocedure('public.device_place_key_issue(text,text)') is null and to_regprocedure('public.device_place_key_revoke(text)') is null and to_regprocedure('public.device_place_keys_on_off()') is null, '11: down drops the table, the three functions and the trigger function');
select pg_temp.ok(not exists (select 1 from pg_trigger where tgname = 'device_place_keys_on_off') and to_regprocedure('public.live_location_put(double precision,double precision,integer,timestamptz,integer,boolean)') is not null, '11: the trigger is gone and 0052 is untouched');
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'live_locations' and column_name = 'checked_at')
  and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'live_locations' and column_name = 'battery_checked_at')
  and pg_get_function_result('public.family_places()'::regprocedure) not like '%battery_at%' and pg_get_functiondef('public.live_locations_prune()'::regprocedure) like '%updated_at <%', '11: down removes checked_at and battery_checked_at and returns family_places and the prune to their 0052 form');
\ir ../migrations/0053_device_place_key.down.sql
select pg_temp.ok(true, '11: down runs twice');
\ir ../migrations/0053_device_place_key.sql
\ir ../migrations/0053_device_place_key.sql
set role authenticated; select pg_temp.as('b');
select pg_temp.ok(pg_temp.issue('z', 'device-b-001') = 'ok', '11: after up twice a key can be issued');
reset role;
select pg_temp.ok(pg_temp.dput(pg_temp.k('z')) = 'true', '11: and it writes');
\echo REHEARSAL DONE
