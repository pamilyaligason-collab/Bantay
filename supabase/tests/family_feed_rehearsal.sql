-- Rehearsal for 0050_family_feed.sql (D-127, D-134) on a THROWAWAY Postgres (never the live project): the REAL chain 0001..0050 (chain_rehearsal.sql), then asserts.
-- Run (WSL Postgres, from supabase/tests):
--   sudo -n -u postgres dropdb --if-exists s_feed; sudo -n -u postgres createdb s_feed
--   sudo -n -u postgres psql -X -q -v ON_ERROR_STOP=1 -d s_feed -f family_feed_rehearsal.sql
-- Actors (invented): o Rey Villar, the family owner (admin); a another admin (not the owner); b Test B (member, has the records); j Joy (viewer linked to b);
-- w Wen, writer carer of the no-login person n; r Rhea (stranger member); x Xia (member, used for the hourly limit); d Kuya (disabled member); s the shared family account; anon.
-- Persons: e/z/n have no login (z is archived), s is the shared account (people.kind 'shared').
\set ON_ERROR_STOP on
\ir chain_rehearsal.sql

-- ---------- helpers ----------
create function pg_temp.state(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
create function pg_temp.u(k text) returns uuid language sql immutable as $$ select case k
  when 'o' then '00000000-0000-0000-0000-0000000000a0' when 'a' then '00000000-0000-0000-0000-0000000000a1' when 'b' then '00000000-0000-0000-0000-0000000000b1'
  when 'd' then '00000000-0000-0000-0000-0000000000d1' when 'j' then '00000000-0000-0000-0000-0000000000f1' when 'r' then '00000000-0000-0000-0000-000000000051'
  when 'w' then '00000000-0000-0000-0000-0000000000c7' when 'x' then '00000000-0000-0000-0000-0000000000c8' when 's' then '00000000-0000-0000-0000-0000000000c9' end::uuid $$;
create function pg_temp.p(k text) returns uuid language sql immutable as $$ select case k
  when 'o' then '10000000-0000-0000-0000-0000000000a0' when 'b' then '10000000-0000-0000-0000-0000000000b1' when 'd' then '10000000-0000-0000-0000-0000000000d1'
  when 'j' then '10000000-0000-0000-0000-0000000000f1' when 'r' then '10000000-0000-0000-0000-000000000051' when 'w' then '10000000-0000-0000-0000-0000000000c7'
  when 'x' then '10000000-0000-0000-0000-0000000000c8' when 's' then '10000000-0000-0000-0000-0000000000c9' when 'n' then '10000000-0000-0000-0000-0000000000e2'
  when 'z' then '10000000-0000-0000-0000-0000000000e9' end::uuid $$;
create function pg_temp.as(k text) returns void language sql as $$ select set_config('request.jwt.claim.sub', pg_temp.u(k)::text, false) $$;
-- feed_share_set as the signed-in actor: 'ok' or E:<sqlstate>
create function pg_temp.fs(person text, cat text, o boolean) returns text language plpgsql as $$
begin perform public.feed_share_set(pg_temp.p(person), cat, o); return 'ok'; exception when others then return 'E:' || sqlstate; end $$;
-- the feed as the signed-in actor, as "kind:person" tokens, sorted
create function pg_temp.feed(since timestamptz default null) returns text language sql as $$
  select coalesce(string_agg(f.kind || ':' || coalesce(f.person_id::text, '-'), ',' order by f.kind, f.person_id), '') from public.family_feed(since) f $$;
create function pg_temp.fcount(k text) returns bigint language sql as $$ select count(*) from public.family_feed(null) f where f.kind = k $$;
grant execute on function pg_temp.state(text), pg_temp.u(text), pg_temp.p(text), pg_temp.as(text), pg_temp.fs(text, text, boolean), pg_temp.feed(timestamptz), pg_temp.fcount(text) to authenticated, anon;

-- ---------- setup (as the loader, RLS bypassed) ----------
reset role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 (pg_temp.u('o'), 'rey@example.com',  '{"provider":"google"}', '{}'),
 (pg_temp.u('j'), 'joy@example.com',  '{"provider":"google"}', '{}'),
 (pg_temp.u('r'), 'rhea@example.com', '{"provider":"google"}', '{}'),
 (pg_temp.u('w'), 'wen@example.com',  '{"provider":"google"}', '{}'),
 (pg_temp.u('x'), 'xia@example.com',  '{"provider":"google"}', '{}'),
 (pg_temp.u('s'), 'family@example.com', '{"provider":"google"}', '{}');
insert into public.app_roles (user_id, role) values (pg_temp.u('o'), 'admin'), (pg_temp.u('j'), 'member'), (pg_temp.u('r'), 'member'),
 (pg_temp.u('w'), 'member'), (pg_temp.u('x'), 'member'), (pg_temp.u('s'), 'member');
update public.app_roles set is_owner = true where user_id = pg_temp.u('o'); -- the apply-time owner line of 0046
insert into public.people (id, auth_user_id, display_name, created_by) values
 (pg_temp.p('o'), pg_temp.u('o'), 'Rey Villar', pg_temp.u('o')), (pg_temp.p('j'), pg_temp.u('j'), 'Joy', pg_temp.u('j')),
 (pg_temp.p('r'), pg_temp.u('r'), 'Rhea', pg_temp.u('r')), (pg_temp.p('w'), pg_temp.u('w'), 'Wen', pg_temp.u('w')),
 (pg_temp.p('x'), pg_temp.u('x'), 'Xia', pg_temp.u('x'));
insert into public.people (id, auth_user_id, display_name, created_by, kind) values (pg_temp.p('s'), pg_temp.u('s'), 'Family account', pg_temp.u('o'), 'shared');
-- no-login persons made by Wen (the creator link makes Wen their writer carer); z is archived
insert into public.people (id, display_name, created_by) values (pg_temp.p('n'), 'Lolo Nando', pg_temp.u('w'));
insert into public.people (id, display_name, created_by, archived_at) values (pg_temp.p('z'), 'Old Kin', pg_temp.u('w'), now());
-- Joy is a linked viewer of B (a plain carers row: the link itself is not under test)
insert into public.carers (carer_id, person_id, can_write) values (pg_temp.u('j'), pg_temp.p('b'), false);
select pg_temp.ok((select can_write from public.carers where carer_id = pg_temp.u('w') and person_id = pg_temp.p('n')), 'setup: Wen is the writer carer of the no-login person n');

-- B's data (30-day window around now): one BP pair, a lone systolic, an old pair, a deleted pair, 3 labs, 2 photos, check-in and a walk
insert into public.readings (person_id, taken_at, test, value, unit, deleted_at) values
 (pg_temp.p('b'), now() - interval '1 day',  'bp_systolic', 148, 'mmHg', null), (pg_temp.p('b'), now() - interval '1 day',  'bp_diastolic', 90, 'mmHg', null),
 (pg_temp.p('b'), now() - interval '3 day',  'bp_systolic', 130, 'mmHg', null),
 (pg_temp.p('b'), now() - interval '40 day', 'bp_systolic', 120, 'mmHg', null), (pg_temp.p('b'), now() - interval '40 day', 'bp_diastolic', 80, 'mmHg', null),
 (pg_temp.p('b'), now() - interval '2 day',  'bp_systolic', 160, 'mmHg', now()), (pg_temp.p('b'), now() - interval '2 day',  'bp_diastolic', 100, 'mmHg', now());
create temp table t_sys as select s.id::text id from public.readings s where s.person_id = pg_temp.p('b') and s.test = 'bp_systolic' and s.value = 148;
grant select on t_sys to authenticated;
select pg_temp.as('b'); -- the records triggers stamp the signed-in user
insert into public.lab_results (person_id, name_raw, value_num, unit_raw, flag, status) values
 (pg_temp.p('b'), 'Cholesterol', 210, 'mg/dL', 'H', 'confirmed'), (pg_temp.p('b'), 'Draft test', 5, 'u', 'N', 'draft'), (pg_temp.p('b'), 'Rejected test', 6, 'u', 'N', 'rejected');
reset request.jwt.claim.sub;
insert into public.family_photos (client_id, uploaded_by, storage_path, caption, deleted_at) values
 ('aaaaaaaa-0000-0000-0000-000000000001', pg_temp.u('b'), '00000000-0000-0000-0000-0000000000b1/aaaaaaaa-0000-0000-0000-000000000001.jpg', 'Birthday cake', null),
 ('aaaaaaaa-0000-0000-0000-000000000002', pg_temp.u('b'), '00000000-0000-0000-0000-0000000000b1/aaaaaaaa-0000-0000-0000-000000000002.jpg', 'Deleted one', now());
insert into public.activity (person_id, kind, started_at, source) values
 (pg_temp.p('b'), 'check-in', now() - interval '2 hour', 'manual'), (pg_temp.p('b'), 'walk', now() - interval '1 hour', 'manual');
-- the other sharers' data, switched on by the loader only where a case needs it
insert into public.readings (person_id, taken_at, test, value, unit) values
 (pg_temp.p('r'), now(), 'bp_systolic', 118, 'mmHg'), (pg_temp.p('r'), now(), 'bp_diastolic', 76, 'mmHg'),
 (pg_temp.p('n'), now(), 'bp_systolic', 140, 'mmHg'), (pg_temp.p('n'), now(), 'bp_diastolic', 85, 'mmHg');
insert into public.activity (person_id, kind, started_at, source) values
 (pg_temp.p('r'), 'check-in', now(), 'manual'), (pg_temp.p('z'), 'check-in', now(), 'manual'), (pg_temp.p('s'), 'check-in', now(), 'manual'), (pg_temp.p('d'), 'check-in', now(), 'manual');
insert into public.readings (person_id, taken_at, test, value, unit) values
 (pg_temp.p('z'), now(), 'bp_systolic', 111, 'mmHg'), (pg_temp.p('z'), now(), 'bp_diastolic', 71, 'mmHg');
select pg_temp.ok((select count(*) from public.feed_shares) = 0, 'setup: no switch exists, so every category is off');

-- ===== 1. all off: nobody sees anything, the owner included =====
set role authenticated;
select pg_temp.as('o'); select pg_temp.ok(pg_temp.feed() = '', '1: all off: the owner gets no rows');
select pg_temp.as('j'); select pg_temp.ok(pg_temp.feed() = '', '1: all off: the linked viewer gets no rows');
select pg_temp.as('r'); select pg_temp.ok(pg_temp.feed() = '', '1: all off: a stranger gets no rows');
select pg_temp.as('b'); select pg_temp.ok(pg_temp.feed() = '', '1: all off: the person gets no rows of their own either');
select pg_temp.as('a'); select pg_temp.ok(pg_temp.feed() = '', '1: all off: another admin gets no rows');

-- ===== 2. who may switch (login person) =====
select pg_temp.as('o');
select pg_temp.ok(pg_temp.fs('b', 'bp', true) = 'E:42501', '2: the owner cannot switch ON a category of a person with a login');
select pg_temp.as('a');
select pg_temp.ok(pg_temp.fs('b', 'bp', true) = 'E:42501', '2: another admin cannot switch ON for B');
select pg_temp.as('j');
select pg_temp.ok(pg_temp.fs('b', 'bp', true) = 'E:42501', '2: a linked viewer cannot switch ON for B');
select pg_temp.as('r');
select pg_temp.ok(pg_temp.fs('b', 'bp', true) = 'E:42501', '2: a stranger gets 42501 on B (on)');
select pg_temp.ok(pg_temp.fs('b', 'bp', false) = 'E:42501', '2: a stranger gets 42501 on B (off)');
reset role;
select pg_temp.ok((select count(*) from public.feed_shares) = 0, '2: none of those wrote a row');
set role authenticated;
select pg_temp.as('b');
select pg_temp.ok(pg_temp.fs('b', 'bp', true) = 'ok', '2: B switches their own blood pressure ON');
select pg_temp.ok(pg_temp.fs('b', 'nope', true) = 'E:22023', '2: a bad category is 22023');
select pg_temp.ok(pg_temp.fs('b', null, true) = 'E:22023', '2: a null category is 22023');
select pg_temp.ok(pg_temp.fs('b', 'bp', null) = 'E:22023', '2: a null switch is 22023');
select pg_temp.ok(pg_temp.state($$select public.feed_share_set(null, 'bp', true)$$) = '22023', '2: a null person is 22023');
select pg_temp.ok(pg_temp.state($$select public.feed_share_set('10000000-0000-0000-0000-0000000000ff', 'bp', true)$$) = '22023', '2: an unknown person is 22023');
reset role;
select pg_temp.ok((select enabled and agreed_at is not null and agreed_text = 'feed-2026-11' and updated_by = pg_temp.u('b') from public.feed_shares where person_id = pg_temp.p('b') and category = 'bp'), '2: the row holds enabled, agreed_at, agreed_text feed-2026-11 and who set it');
select pg_temp.ok((select count(*) from public.feed_shares) = 1, '2: exactly one row');

-- ===== 3. BP on: everyone in the family sees B''s pair and nothing else =====
set role authenticated;
select pg_temp.as('o'); select pg_temp.ok(pg_temp.feed() = 'bp:' || pg_temp.p('b'), '3: owner sees B''s one BP pair only');
select pg_temp.as('j'); select pg_temp.ok(pg_temp.feed() = 'bp:' || pg_temp.p('b'), '3: the linked viewer sees it');
select pg_temp.as('r'); select pg_temp.ok(pg_temp.feed() = 'bp:' || pg_temp.p('b'), '3: a stranger member sees it (the whole family)');
select pg_temp.as('w'); select pg_temp.ok(pg_temp.feed() = 'bp:' || pg_temp.p('b'), '3: Wen sees it');
select pg_temp.ok((select f.value_text = '148/90 mmHg' and f.title_key = 'feed_bp' and f.chip is null and f.photo_path is null and f.at between now() - interval '25 hour' and now() - interval '23 hour'
                   from public.family_feed(null) f), '3: the row is 148/90 mmHg, feed_bp, no chip, no path, taken a day ago');
select pg_temp.ok((select count(*) = 1 from public.family_feed(null) f where f.row_id = (select id from t_sys)), '3: row_id is the systolic reading id');
select pg_temp.ok(pg_temp.fcount('lab') = 0 and pg_temp.fcount('photo') = 0 and pg_temp.fcount('status') = 0, '3: no lab, photo or check-in rows while those are off');
select pg_temp.ok(pg_temp.feed(now() - interval '2 hour') = '', '3: p_since after the pair hides it');
select pg_temp.ok(pg_temp.feed(now() - interval '3 day') = 'bp:' || pg_temp.p('b'), '3: p_since before it keeps it');
select pg_temp.as('d'); select pg_temp.ok(pg_temp.feed() = '', '3: the disabled member gets nothing');

-- ===== 4. lab, photo, status =====
select pg_temp.as('b');
select pg_temp.ok(pg_temp.fs('b', 'lab', true) = 'ok' and pg_temp.fs('b', 'photo', true) = 'ok' and pg_temp.fs('b', 'status', true) = 'ok', '4: B switches lab, photo and check-in ON');
select pg_temp.as('r');
select pg_temp.ok(pg_temp.fcount('lab') = 1, '4: one lab row: the confirmed one (draft and rejected stay out)');
select pg_temp.ok((select f.value_text = 'Cholesterol 210 mg/dL' and f.chip = 'H' and f.title_key = 'feed_lab' and f.person_id = pg_temp.p('b') from public.family_feed(null) f where f.kind = 'lab'), '4: the lab row reads Cholesterol 210 mg/dL with chip H');
select pg_temp.ok(pg_temp.fcount('photo') = 1 and (select f.value_text = 'Birthday cake' and f.person_id = pg_temp.p('b')
   and f.photo_path = '00000000-0000-0000-0000-0000000000b1/aaaaaaaa-0000-0000-0000-000000000001.jpg' from public.family_feed(null) f where f.kind = 'photo'), '4: one photo row with caption, the path and B as author; the deleted photo is out');
select pg_temp.ok(pg_temp.fcount('status') = 1 and (select f.title_key = 'feed_status' and f.value_text is null from public.family_feed(null) f where f.kind = 'status'), '4: one check-in row; the walk is not a post');
select pg_temp.ok(pg_temp.fcount('bp') = 1, '4: still one BP pair (the lone systolic, the 40-day pair and the deleted pair are out)');
select pg_temp.ok((select count(*) from public.family_feed(null)) = 4, '4: four rows in all');
select pg_temp.ok((select array_agg(f.at) = array_agg(f.at order by f.at desc) from public.family_feed(null) f), '4: newest first');
-- 0008 allows flag 'A' (abnormal): it reaches the feed as chip A; N (normal) carries no chip
reset role;
update public.lab_results set flag = 'A' where person_id = pg_temp.p('b') and name_raw = 'Cholesterol';
set role authenticated; select pg_temp.as('r');
select pg_temp.ok((select f.chip = 'A' from public.family_feed(null) f where f.kind = 'lab'), '4: a lab flagged A (abnormal) carries chip A');
reset role; update public.lab_results set flag = 'N' where person_id = pg_temp.p('b') and name_raw = 'Cholesterol';
set role authenticated; select pg_temp.as('r');
select pg_temp.ok((select f.chip is null from public.family_feed(null) f where f.kind = 'lab'), '4: a lab flagged N carries no chip');
reset role; update public.lab_results set flag = 'H' where person_id = pg_temp.p('b') and name_raw = 'Cholesterol';
set role authenticated; select pg_temp.as('r');
-- a lab that is rejected after being shown leaves the feed
reset role;
update public.lab_results set status = 'rejected' where person_id = pg_temp.p('b') and name_raw = 'Cholesterol';
set role authenticated; select pg_temp.as('r');
select pg_temp.ok(pg_temp.fcount('lab') = 0, '4: a lab rejected later leaves the feed');
reset role; update public.lab_results set status = 'confirmed' where person_id = pg_temp.p('b') and name_raw = 'Cholesterol';
update public.family_photos set deleted_at = now() where client_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated; select pg_temp.as('r');
select pg_temp.ok(pg_temp.fcount('photo') = 0, '4: a photo deleted later leaves the feed');
reset role; update public.family_photos set deleted_at = null where client_id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.readings set deleted_at = now() where person_id = pg_temp.p('b') and test = 'bp_diastolic' and value = 90;
set role authenticated; select pg_temp.as('r');
select pg_temp.ok(pg_temp.fcount('bp') = 0, '4: a pair whose diastolic is deleted leaves the feed');
reset role; update public.readings set deleted_at = null where person_id = pg_temp.p('b') and test = 'bp_diastolic' and value = 90;

-- ===== 5. the owner may switch OFF but sees nothing extra =====
set role authenticated; select pg_temp.as('o');
select pg_temp.ok(pg_temp.fs('b', 'lab', false) = 'ok', '5: the owner switches B''s lab OFF');
select pg_temp.ok(pg_temp.fcount('lab') = 0 and pg_temp.fcount('bp') = 1, '5: the owner now sees no lab rows although the owner can read lab_results');
reset role;
select pg_temp.ok((select enabled = false and agreed_at is not null and updated_by = pg_temp.u('o') from public.feed_shares where person_id = pg_temp.p('b') and category = 'lab'), '5: off keeps agreed_at and records the owner as the changer');
set role authenticated; select pg_temp.as('b');
select pg_temp.ok(pg_temp.fs('b', 'bp', false) = 'ok' and pg_temp.fs('b', 'photo', false) = 'ok' and pg_temp.fs('b', 'status', false) = 'ok', '5: B switches the rest OFF');
select pg_temp.as('r'); select pg_temp.ok(pg_temp.feed() = '', '5: all off again: the stranger sees none');
select pg_temp.as('o'); select pg_temp.ok(pg_temp.feed() = '', '5: all off again: the owner sees none');
-- r's own rows stay out while r has no switch, for everyone including the owner
select pg_temp.ok(pg_temp.feed() = '', '5: Rhea''s reading and check-in are not listed (no switch)');
-- an off-to-on again re-stamps agreed_at
reset role; select pg_temp.ok((select agreed_at from public.feed_shares where person_id = pg_temp.p('b') and category = 'bp') is not null, '5: agreed_at is kept after off');
create temp table t_first as select agreed_at from public.feed_shares where person_id = pg_temp.p('b') and category = 'bp';
select pg_sleep(0.05);
set role authenticated; select pg_temp.as('b'); select pg_temp.fs('b', 'bp', true);
reset role;
select pg_temp.ok((select fs.agreed_at > t.agreed_at from public.feed_shares fs, t_first t where fs.person_id = pg_temp.p('b') and fs.category = 'bp'), '5: switching ON again stamps a new agreed_at');
set role authenticated; select pg_temp.as('b'); select pg_temp.fs('b', 'bp', true); reset role;
select pg_temp.ok((select count(*) from public.feed_shares fs, t_first t where fs.person_id = pg_temp.p('b') and fs.category = 'bp' and fs.enabled) = 1, '5: ON when already ON keeps one row');
set role authenticated; select pg_temp.as('b'); select pg_temp.fs('b', 'bp', false); reset role;

-- ===== 6. no-login person: the owner may, the writer carer may not =====
set role authenticated; select pg_temp.as('w');
select pg_temp.ok(pg_temp.fs('n', 'bp', true) = 'E:42501', '6: the writer carer cannot switch ON for the no-login person');
select pg_temp.ok(pg_temp.fs('n', 'bp', false) = 'E:42501', '6: nor OFF');
select pg_temp.as('r');
select pg_temp.ok(pg_temp.fs('n', 'bp', true) = 'E:42501', '6: a stranger cannot');
select pg_temp.as('a');
select pg_temp.ok(pg_temp.fs('n', 'bp', true) = 'E:42501', '6: another admin cannot');
select pg_temp.as('o');
select pg_temp.ok(pg_temp.fs('n', 'bp', true) = 'ok', '6: the owner switches ON for the no-login person');
select pg_temp.as('r'); select pg_temp.ok(pg_temp.feed() = 'bp:' || pg_temp.p('n'), '6: the family sees that person''s pair');
select pg_temp.as('o'); select pg_temp.ok(pg_temp.fs('n', 'bp', false) = 'ok', '6: the owner switches it OFF');
select pg_temp.as('r'); select pg_temp.ok(pg_temp.feed() = '', '6: gone again');

-- ===== 7. feed_shares reads =====
select pg_temp.as('b'); select pg_temp.fs('b', 'bp', true);
select pg_temp.as('o'); select pg_temp.fs('n', 'bp', true);
select pg_temp.as('b');
select pg_temp.ok((select count(*) from public.feed_shares where person_id <> pg_temp.p('b')) = 0 and (select count(*) from public.feed_shares) = 4, '7: B reads only their own four rows');
select pg_temp.as('o'); select pg_temp.ok((select count(*) from public.feed_shares) = 5, '7: the owner reads every row');
select pg_temp.as('w'); select pg_temp.ok((select count(*) from public.feed_shares) = 1 and (select person_id from public.feed_shares) = pg_temp.p('n'), '7: the writer carer reads only n''s row');
select pg_temp.as('r'); select pg_temp.ok((select count(*) from public.feed_shares) = 0, '7: a stranger reads none');
select pg_temp.as('j'); select pg_temp.ok((select count(*) from public.feed_shares) = 0, '7: the linked viewer reads none');
select pg_temp.as('a'); select pg_temp.ok((select count(*) from public.feed_shares) = 0, '7: another admin reads none');
select pg_temp.as('b');
select pg_temp.ok(pg_temp.state($$insert into public.feed_shares (person_id, category, enabled) values ('10000000-0000-0000-0000-0000000000b1', 'lab', true)$$) = '42501', '7: no direct insert');
select pg_temp.ok(pg_temp.state($$update public.feed_shares set enabled = true$$) = '42501', '7: no direct update');
select pg_temp.ok(pg_temp.state($$delete from public.feed_shares$$) = '42501', '7: no direct delete');
-- reset B's and n's switches for the next cases
select pg_temp.fs('b', 'bp', false);
select pg_temp.as('o'); select pg_temp.fs('n', 'bp', false);

-- ===== 8. archived, shared account, disabled sharer =====
select pg_temp.as('o');
select pg_temp.ok(pg_temp.fs('z', 'bp', true) = 'E:22023', '8: an archived person is refused 22023');
select pg_temp.ok(pg_temp.fs('s', 'status', true) = 'E:22023', '8: the shared family account is refused 22023');
select pg_temp.as('w'); select pg_temp.ok(pg_temp.fs('z', 'bp', true) = 'E:22023', '8: the creator of the archived person gets 22023 too');
reset role;
-- rows that exist anyway (the loader writes them) are never listed
insert into public.feed_shares (person_id, category, enabled) values (pg_temp.p('z'), 'bp', true), (pg_temp.p('z'), 'status', true), (pg_temp.p('s'), 'status', true), (pg_temp.p('d'), 'status', true);
set role authenticated; select pg_temp.as('r');
select pg_temp.ok(pg_temp.feed() = '', '8: archived, shared and disabled people are never listed, even with an enabled row');
select pg_temp.as('o');
select pg_temp.ok(pg_temp.feed() = '', '8: the owner sees none of them either');
reset role;
-- archiving a person who was sharing takes their posts out
insert into public.feed_shares (person_id, category, enabled) values (pg_temp.p('r'), 'status', true);
set role authenticated; select pg_temp.as('o');
select pg_temp.ok(pg_temp.feed() = 'status:' || pg_temp.p('r'), '8: Rhea''s check-in is listed once her switch is on');
reset role; update public.people set archived_at = now() where id = pg_temp.p('r');
set role authenticated; select pg_temp.as('o');
select pg_temp.ok(pg_temp.feed() = '', '8: archived later: her post leaves');
reset role; update public.people set archived_at = null where id = pg_temp.p('r');
-- a sharer who is disabled later: posts leave at once (ML-33)
set role authenticated; select pg_temp.as('o');
select pg_temp.ok(pg_temp.feed() = 'status:' || pg_temp.p('r'), '8: restored: the post is back');
reset role; update public.app_roles set disabled = true where user_id = pg_temp.u('r');
set role authenticated; select pg_temp.as('o');
select pg_temp.ok(pg_temp.feed() = '', '8: Rhea disabled later: her post leaves at once');
select pg_temp.as('r');
select pg_temp.ok(pg_temp.fs('r', 'status', false) = 'E:42501' and pg_temp.feed() = '', '8: a disabled caller cannot switch and gets no feed');
reset role; update public.app_roles set disabled = false where user_id = pg_temp.u('r');
delete from public.feed_shares where person_id in (pg_temp.p('z'), pg_temp.p('s'), pg_temp.p('d'), pg_temp.p('r'));

-- ===== 9. disabled and anon =====
set role authenticated; select pg_temp.as('d');
select pg_temp.ok(pg_temp.fs('d', 'status', true) = 'E:42501', '9: the disabled member cannot switch even their own');
select pg_temp.ok(pg_temp.feed() = '' and (select count(*) from public.family_feed(null)) = 0, '9: the disabled member gets no rows');
reset role; set role anon;
select pg_temp.ok(pg_temp.state($$select * from public.family_feed(null)$$) = '42501', '9: anon cannot call family_feed');
select pg_temp.ok(pg_temp.state($$select public.feed_share_set('10000000-0000-0000-0000-0000000000b1', 'bp', true)$$) = '42501', '9: anon cannot call feed_share_set');
select pg_temp.ok(pg_temp.state($$select * from public.feed_shares$$) = '42501', '9: anon cannot read feed_shares');
reset role;
-- a signed-in token with no sub (auth.uid() null) gets nothing
set role authenticated; reset request.jwt.claim.sub;
select pg_temp.ok((select count(*) from public.family_feed(null)) = 0, '9: no uid, no rows');
select pg_temp.ok(pg_temp.state($$select public.feed_share_set('10000000-0000-0000-0000-0000000000b1', 'bp', true)$$) = '42501', '9: no uid cannot switch');
reset role;

-- ===== 10. 500 rows and the 30-day floor =====
insert into public.feed_shares (person_id, category, enabled) values (pg_temp.p('r'), 'status', true);
insert into public.activity (person_id, kind, started_at, source) select pg_temp.p('r'), 'check-in', now() - (g || ' minutes')::interval - interval '1 hour', 'manual' from generate_series(1, 520) g;
insert into public.activity (person_id, kind, started_at, source) values (pg_temp.p('r'), 'check-in', now() - interval '31 day', 'manual');
set role authenticated; select pg_temp.as('o');
select pg_temp.ok((select count(*) from public.family_feed(null)) = 500, '10: at most 500 rows');
select pg_temp.ok((select count(*) from public.family_feed(now() - interval '100 day') f where f.at < now() - interval '30 day') = 0, '10: nothing older than 30 days even when p_since asks for more');
select pg_temp.ok((select min(f.at) > now() - interval '10 hour' from public.family_feed(null) f), '10: nothing returned is older than the seeded window');
-- 521 rows are inside the window (520 a minute apart plus Rhea's check-in from setup): an oldest-first or unordered limit returns the wrong 500 and fails here
select pg_temp.ok((select count(*) from public.family_feed(null) f where f.at <= (select a.started_at from public.activity a where a.person_id = pg_temp.p('r') and a.kind = 'check-in' order by a.started_at desc offset 500 limit 1)) = 0, '10: the 500 are the newest ones: none is as old as the 501st newest');
select pg_temp.ok((select count(*) from public.family_feed(null) f where f.at >= (select a.started_at from public.activity a where a.person_id = pg_temp.p('r') and a.kind = 'check-in' order by a.started_at desc offset 499 limit 1)) = 500, '10: and all 500 of the newest are there');
reset role;
delete from public.activity where person_id = pg_temp.p('r'); delete from public.feed_shares where person_id = pg_temp.p('r');

-- ===== 11. the hourly limit =====
set role authenticated; select pg_temp.as('x');
select pg_temp.ok((select bool_and(pg_temp.fs('x', 'status', i % 2 = 1) = 'ok') from generate_series(1, 30) i), '11: 30 changes in an hour all work');
select pg_temp.ok(pg_temp.fs('x', 'status', true) = 'E:53400', '11: the 31st change is 53400');
reset role;
select pg_temp.ok((select enabled = false from public.feed_shares where person_id = pg_temp.p('x') and category = 'status'), '11: the refused 31st change did not apply');
delete from public.pin_attempts where user_id = md5('feed:' || pg_temp.u('x')::text)::uuid;

-- ===== 12. audit and no notifications =====
select pg_temp.ok((select count(*) from public.audit_log where action = 'feed_share' and tbl = 'feed_shares' and fields = array['enabled']) > 0, '12: switch changes leave audit rows holding only the column name enabled');
select pg_temp.ok((select count(*) from public.audit_log where action = 'feed_share' and (fields is distinct from array['enabled'] or row_id is not null)) = 0, '12: no audit row holds anything else');
create temp table t_alerts as select count(*) n from public.carer_alerts;
create temp table t_aud as select count(*) n from public.audit_log where action = 'feed_share';
set role authenticated; select pg_temp.as('b'); select pg_temp.fs('b', 'lab', true); select pg_temp.fs('b', 'lab', false);
select pg_temp.as('o'); select pg_temp.fs('n', 'photo', true); select pg_temp.fs('n', 'photo', false);
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts) = (select n from t_alerts), '12: switching writes no carer_alerts row (no notification path)');
select pg_temp.ok((select count(*) from public.audit_log where action = 'feed_share') = (select n from t_aud) + 4, '12: one audit row per change');

-- ===== 13. function hygiene (ML-21) =====
select pg_temp.ok((select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('feed_share_set', 'family_feed')), '13: both are security definer with an empty search_path');
select pg_temp.ok(has_function_privilege('authenticated', 'public.feed_share_set(uuid,text,boolean)', 'execute') and has_function_privilege('authenticated', 'public.family_feed(timestamptz)', 'execute'), '13: authenticated may execute both');
select pg_temp.ok(not has_function_privilege('anon', 'public.feed_share_set(uuid,text,boolean)', 'execute') and not has_function_privilege('anon', 'public.family_feed(timestamptz)', 'execute'), '13: anon may not');
select pg_temp.ok(not has_function_privilege('service_role', 'public.feed_share_set(uuid,text,boolean)', 'execute') and not has_function_privilege('service_role', 'public.family_feed(timestamptz)', 'execute'), '13: service_role may not');
select pg_temp.ok((select count(*) from information_schema.routine_privileges where routine_schema = 'public' and routine_name in ('feed_share_set', 'family_feed') and grantee = 'PUBLIC') = 0, '13: nothing is granted to PUBLIC');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.feed_shares', 'insert') and not has_table_privilege('authenticated', 'public.feed_shares', 'update') and not has_table_privilege('authenticated', 'public.feed_shares', 'delete') and has_table_privilege('authenticated', 'public.feed_shares', 'select'), '13: authenticated has select on feed_shares and no write');
select pg_temp.ok(not has_table_privilege('anon', 'public.feed_shares', 'select'), '13: anon has no access to feed_shares');
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.feed_shares'::regclass), '13: row level security is on');

-- ===== 14. down restores the 0049 state, and up runs again =====
create temp table t_ref (action text check (action in ('insert', 'update', 'confirm', 'reject', 'delete', 'reveal', 'view', 'pin_reset', 'share_add', 'share_remove', 'share_accept', 'invite', 'join')));
create temp table t_ref2 as select pg_get_constraintdef(c.oid) d from pg_constraint c where c.conrelid = 't_ref'::regclass and c.contype = 'c';
\ir ../migrations/0050_family_feed.down.sql
select pg_temp.ok(to_regclass('public.feed_shares') is null, '14: down drops feed_shares');
select pg_temp.ok(not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('feed_share_set', 'family_feed')), '14: down drops both functions');
select pg_temp.ok((select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.audit_log'::regclass and c.conname = 'audit_log_action_check') = (select d from t_ref2), '14: the audit action list is exactly the 0037 list again');
select pg_temp.ok((select count(*) from public.audit_log where action = 'feed_share') = 0, '14: no feed_share audit rows remain');
select pg_temp.ok(to_regprocedure('public.share_set(uuid,uuid,boolean,boolean)') is not null and to_regprocedure('public.is_owner()') is not null and to_regclass('public.world_news') is not null, '14: the 0046 and 0049 objects are untouched');
\ir ../migrations/0050_family_feed.down.sql
select pg_temp.ok(true, '14: down runs twice');
\ir ../migrations/0050_family_feed.sql
\ir ../migrations/0050_family_feed.sql
select pg_temp.ok(to_regclass('public.feed_shares') is not null and (select count(*) from public.feed_shares) = 0, '14: up again (twice) restores an empty feed_shares');
set role authenticated; select pg_temp.as('b');
select pg_temp.ok(pg_temp.fs('b', 'bp', true) = 'ok' and pg_temp.fcount('bp') = 1, '14: after up again the switch and the feed work');
reset role;
\echo REHEARSAL DONE
