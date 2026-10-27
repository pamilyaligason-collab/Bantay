-- Rehearsal for 0042_kudos.sql on a THROWAWAY Postgres (never the live project). Run AFTER chain_rehearsal.sql (which already includes 0042) in the same database; it runs 0042 again (idempotent), asserts, runs the down file twice and the up file again.
-- Run from WSL in supabase/tests:
--   sudo -u postgres dropdb --if-exists bantay_s12b_g; sudo -u postgres createdb bantay_s12b_g
--   sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d bantay_s12b_g -f chain_rehearsal.sql
--   sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d bantay_s12b_g -f kudos_rehearsal.sql
-- Chain actors: a1 admin; b1 member (person ...b1); c1 member (Lola, person ...c1); d1 member, disabled; e1 is a person with no login.
\set ON_ERROR_STOP on
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
create function pg_temp.state(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function pg_temp.ok(boolean, text), pg_temp.state(text) to authenticated, anon, service_role;
\ir ../migrations/0042_kudos.sql

-- ===== shape =====
select pg_temp.ok(not has_function_privilege('authenticated', 'public.family_messages_kudos_alert()', 'execute') and not has_function_privilege('anon', 'public.family_messages_kudos_alert()', 'execute'), 'the kudos trigger function is not callable (ACL restated, ML-21)');
select pg_temp.ok((select count(*) from pg_trigger where tgrelid = 'public.family_messages'::regclass and tgname = 'family_messages_kudos_alert') = 1, 'one kudos alert trigger, not doubled by a second run');

-- ===== old kinds still behave =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body) values ('61000000-0000-0000-0000-000000000001', 'text', 'Kumain na?')$$) = 'ok', 'text still works');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, attachment_path) values ('61000000-0000-0000-0000-000000000002', 'voice', '00000000-0000-0000-0000-0000000000b1/51000000-0000-0000-0000-000000000002.webm')$$) = 'ok', 'voice still works');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind) values ('61000000-0000-0000-0000-000000000003', 'file')$$) <> 'ok', 'a file without an attachment is still refused');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body, about_person) values ('61000000-0000-0000-0000-000000000004', 'text', 'hi', '10000000-0000-0000-0000-0000000000c1')$$) <> 'ok', 'about_person only on kudos');

-- ===== kudos =====
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body, about_person) values ('61000000-0000-0000-0000-000000000010', 'kudos', 'heart', '10000000-0000-0000-0000-0000000000c1')$$) = 'ok', 'a heart for Lola is accepted');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body, about_person) values ('61000000-0000-0000-0000-000000000011', 'kudos', 'heart', '10000000-0000-0000-0000-0000000000b1')$$) <> 'ok', 'a heart for yourself is refused');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body) values ('61000000-0000-0000-0000-000000000012', 'kudos', 'heart')$$) <> 'ok', 'a heart needs a person');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body, about_person) values ('61000000-0000-0000-0000-000000000013', 'kudos', 'you are great', '10000000-0000-0000-0000-0000000000c1')$$) <> 'ok', 'a heart body is exactly heart (no free text)');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, attachment_path, duration_s, about_person) values ('61000000-0000-0000-0000-000000000014', 'kudos', '00000000-0000-0000-0000-0000000000b1/51000000-0000-0000-0000-000000000014.webm', 15, '10000000-0000-0000-0000-0000000000c1')$$) = 'ok', 'a 15 second voice note heart is accepted');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, attachment_path, duration_s, about_person) values ('61000000-0000-0000-0000-000000000015', 'kudos', '00000000-0000-0000-0000-0000000000b1/51000000-0000-0000-0000-000000000015.webm', 16, '10000000-0000-0000-0000-0000000000c1')$$) <> 'ok', 'a 16 second voice note heart is refused');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, attachment_path, about_person) values ('61000000-0000-0000-0000-000000000016', 'kudos', '00000000-0000-0000-0000-0000000000b1/51000000-0000-0000-0000-000000000016.webm', '10000000-0000-0000-0000-0000000000c1')$$) <> 'ok', 'a voice note heart needs its length');
reset role;
-- two accepted hearts from b1 to c1 inside 10 minutes (heart, then the voice one): exactly 1 alert, for Lola only
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'kudos') = 1, 'a flurry of hearts from one sender raises one alert');
select pg_temp.ok((select carer_user_id = '00000000-0000-0000-0000-0000000000c1' and person_id = '10000000-0000-0000-0000-0000000000c1' and template = 'kudos' from public.carer_alerts where kind = 'kudos'), 'the alert is for Lola alone');
-- another sender gets their own alert
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.family_messages (client_id, kind, body, about_person) values ('61000000-0000-0000-0000-000000000020', 'kudos', 'heart', '10000000-0000-0000-0000-0000000000c1');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'kudos') = 2, 'a second sender raises a second alert');
-- a heart for a person with no login raises nothing and does not fail
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body, about_person) values ('61000000-0000-0000-0000-000000000021', 'kudos', 'heart', '10000000-0000-0000-0000-0000000000e1')$$) = 'ok', 'a heart for a person with no login is stored');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'kudos') = 2, 'and raises no alert');

-- the alert path failing never loses the heart
alter function public.notify_family(uuid, text, text, text, text) rename to notify_family_off;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body, about_person) values ('61000000-0000-0000-0000-000000000022', 'kudos', 'heart', '10000000-0000-0000-0000-0000000000b1')$$) = 'ok', 'a broken alert function does not fail the insert');
reset role;
alter function public.notify_family_off(uuid, text, text, text, text) rename to notify_family;
select pg_temp.ok((select count(*) from public.family_messages where client_id = '61000000-0000-0000-0000-000000000022') = 1, 'the heart is stored');

-- ===== recap =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body) values ('61000000-0000-0000-0000-000000000030', 'recap', 'This week: 7 of 7 morning checks, medicines on 5 of 7 days.')$$) = 'ok', 'a counts recap is accepted');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body) values ('61000000-0000-0000-0000-000000000031', 'recap', 'Average 133/83 this week')$$) <> 'ok', 'a recap with a reading pair is refused');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body) values ('61000000-0000-0000-0000-000000000032', 'recap', 'Average 133 / 83 this week')$$) <> 'ok', 'spaces around the slash do not get past it');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body) values ('61000000-0000-0000-0000-000000000033', 'recap', repeat('a', 201))$$) <> 'ok', 'a recap is 200 characters at most');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, attachment_path) values ('61000000-0000-0000-0000-000000000034', 'recap', '00000000-0000-0000-0000-0000000000b1/51000000-0000-0000-0000-000000000034.webm')$$) <> 'ok', 'a recap has no attachment');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, kind, body) values ('61000000-0000-0000-0000-000000000035', 'recap', null)$$) <> 'ok', 'a recap needs its text');
reset role;
select pg_temp.ok((select count(*) from public.carer_alerts where kind = 'kudos') = 2, 'a recap raises no alert');

-- ===== family read =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select count(*) from public.family_messages where kind in ('kudos', 'recap')) >= 5, 'the family thread shows hearts and recaps to a member');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.ok((select count(*) from public.family_messages) = 0, 'a disabled member reads nothing');
reset role;

-- ===== down, then up again =====
\ir ../migrations/0042_kudos.down.sql
select pg_temp.ok((select count(*) from public.family_messages where kind in ('kudos', 'recap')) = 0, 'down removes kudos and recap rows');
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'family_messages' and column_name = 'about_person'), 'down drops about_person');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, sender_id, kind, body) values ('61000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-0000000000b1', 'recap', 'x')$$) <> 'ok', 'after down the old kind list is back');
select pg_temp.ok(pg_temp.state($$insert into public.family_messages (client_id, sender_id, kind, body) values ('61000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-0000000000b1', 'text', 'x')$$) = 'ok', 'after down text still works');
\ir ../migrations/0042_kudos.down.sql
\ir ../migrations/0042_kudos.sql
select pg_temp.ok((select count(*) from pg_constraint where conrelid = 'public.family_messages'::regclass and contype = 'c' and conname in ('family_messages_kind_check', 'family_messages_body_attachment_check', 'family_messages_about_check')) = 3, 'up after down restores the three checks');
\echo KUDOS REHEARSAL DONE
