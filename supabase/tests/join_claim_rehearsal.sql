-- Rehearsal for 0038_join_claim.sql on a THROWAWAY Postgres (never the live project), on top of the chain 0001..0036 that chain_rehearsal.sql loads (it already
-- ends with \ir 0038). Run (WSL Postgres 18), same database, chain first:
--   sudo -n -u postgres createdb bantay_s12_b; psql -X -q -v ON_ERROR_STOP=1 -d bantay_s12_b -f chain_rehearsal.sql; psql ... -f join_claim_rehearsal.sql
-- Chain actors: a1 admin (Google), b1 member (Google), c1 'lola' PIN member (never signed in), d1 'kuya' disabled PIN member.
-- Added here: f1 'nene' PIN member never signed in, f2 'tata' PIN member who signed in, f3 'ana' PIN member never signed in (second link target).
\set ON_ERROR_STOP on
reset role;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
-- the real auth.users has last_sign_in_at; the chain stub does not
alter table auth.users add column if not exists last_sign_in_at timestamptz;
-- stand-in for 0037 (lane A owns it): audit_log accepts 'invite' and 'join'
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'confirm', 'reject', 'delete', 'reveal', 'view', 'pin_reset', 'share_add', 'share_remove', 'share_accept', 'invite', 'join'));
grant usage on schema public to authenticated, anon, service_role;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, last_sign_in_at) values
 ('00000000-0000-0000-0000-0000000000f1', 'm-f1@members.bantay.invalid', '{}', '{}', null),
 ('00000000-0000-0000-0000-0000000000f2', 'm-f2@members.bantay.invalid', '{}', '{}', now()),
 ('00000000-0000-0000-0000-0000000000f3', 'm-f3@members.bantay.invalid', '{}', '{}', null);
insert into public.app_roles (user_id, role, handle, disabled) values
 ('00000000-0000-0000-0000-0000000000f1', 'member', 'nene', false), ('00000000-0000-0000-0000-0000000000f2', 'member', 'tata', false),
 ('00000000-0000-0000-0000-0000000000f3', 'member', 'ana', false);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Nene Cruz', '00000000-0000-0000-0000-0000000000a1'),
 ('10000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f2', 'Tata Reyes', '00000000-0000-0000-0000-0000000000a1'),
 ('10000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f3', 'Ana', '00000000-0000-0000-0000-0000000000a1');

create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
create function pg_temp.sqlstate(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin reset role; set role authenticated; perform set_config('request.jwt.claim.sub', u, false); end $$;
create function pg_temp.as_service() returns void language plpgsql as $$ begin reset role; set role service_role; perform set_config('request.jwt.claim.sub', '', false); end $$;
create function pg_temp.hash(t text) returns text language sql as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create table pg_temp.tok (k text primary key, v text);
grant all on pg_temp.tok to public;
grant execute on function pg_temp.ok(boolean, text), pg_temp.sqlstate(text), pg_temp.hash(text) to authenticated, anon, service_role;
-- the plain token of a member, minted as the admin (kept in a temp table; the real one is shown once in the app)
create function pg_temp.mint(name text, u text) returns text language plpgsql as $$ declare t text; begin
  t := public.admin_create_invite(u::uuid);
  insert into pg_temp.tok (k, v) values (name, t) on conflict (k) do update set v = excluded.v;
  return t; end $$;
grant execute on function pg_temp.mint(text, text) to authenticated;

-- ===== grants (ML-21) =====
select pg_temp.ok(has_function_privilege('authenticated', 'public.admin_create_invite(uuid)', 'execute') and not has_function_privilege('anon', 'public.admin_create_invite(uuid)', 'execute') and not has_function_privilege('service_role', 'public.admin_create_invite(uuid)', 'execute'), 'admin_create_invite: authenticated yes, anon and service role no');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.join_claim_check(text)', 'execute') and not has_function_privilege('anon', 'public.join_claim_check(text)', 'execute') and has_function_privilege('service_role', 'public.join_claim_check(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.join_claim_use(text)', 'execute') and not has_function_privilege('anon', 'public.join_claim_use(text)', 'execute') and has_function_privilege('service_role', 'public.join_claim_use(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.join_claim_peek(text)', 'execute') and not has_function_privilege('anon', 'public.join_claim_peek(text)', 'execute') and has_function_privilege('service_role', 'public.join_claim_peek(text)', 'execute'), 'peek, check and use: service role only');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.invite_tokens', 'select') and not has_table_privilege('anon', 'public.invite_tokens', 'select') and has_table_privilege('service_role', 'public.invite_tokens', 'select')
  and (select relrowsecurity from pg_class where oid = 'public.invite_tokens'::regclass), 'invite_tokens: RLS on, no anon or authenticated grant, service role yes');

-- ===== who may make a link =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.ok(pg_temp.sqlstate($$select public.admin_create_invite('00000000-0000-0000-0000-0000000000f1')$$) = '42501', 'a member who is not an admin gets 42501');
select pg_temp.as_service();
select pg_temp.ok(pg_temp.sqlstate($$select public.admin_create_invite('00000000-0000-0000-0000-0000000000f1')$$) = '42501', 'a caller with no auth.uid() gets 42501');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(pg_temp.sqlstate($$select public.admin_create_invite('00000000-0000-0000-0000-0000000000f2')$$) = '22023', 'a member who has signed in (has a PIN) gets 22023');
select pg_temp.ok(pg_temp.sqlstate($$select public.admin_create_invite('00000000-0000-0000-0000-0000000000b1')$$) = '22023', 'a Google member gets 22023');
select pg_temp.ok(pg_temp.sqlstate($$select public.admin_create_invite('00000000-0000-0000-0000-0000000000d1')$$) = '22023', 'a disabled member gets 22023');
select pg_temp.ok(pg_temp.sqlstate($$select public.admin_create_invite('99999999-9999-9999-9999-999999999999')$$) = '22023', 'an unknown id gets 22023');
select pg_temp.ok(pg_temp.sqlstate($$select public.admin_create_invite(null)$$) = '22023', 'null gets 22023');
select pg_temp.ok((select count(*) from public.audit_log where action = 'invite') = 0, 'a refused call writes no audit row');

-- ===== a link: plain once, hash stored, one open per member =====
select pg_temp.mint('f1a', '00000000-0000-0000-0000-0000000000f1');
select pg_temp.ok((select v ~ '^[A-Za-z0-9_-]{43}$' from pg_temp.tok where k = 'f1a'), 'the token is 43 base64url characters (32 random bytes)');
select pg_temp.as_service();
select pg_temp.ok((select count(*) = 1 and bool_and(token_hash = pg_temp.hash((select v from pg_temp.tok where k = 'f1a'))) and bool_and(token_hash ~ '^[0-9a-f]{64}$') and bool_and(used_at is null and attempts = 0 and expires_at > now() + interval '6 days 23 hours' and expires_at <= now() + interval '7 days') from public.invite_tokens where user_id = '00000000-0000-0000-0000-0000000000f1'), 'one row: sha256 hex of the token, open, 0 tries, 7 day expiry');
select pg_temp.ok(not exists (select 1 from public.invite_tokens t where t::text like '%' || (select v from pg_temp.tok where k = 'f1a') || '%'), 'the plain token is nowhere in the row');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.mint('f1b', '00000000-0000-0000-0000-0000000000f1');
select pg_temp.as_service();
select pg_temp.ok((select count(*) filter (where used_at is null) = 1 and count(*) = 2 from public.invite_tokens where user_id = '00000000-0000-0000-0000-0000000000f1'), 'a second link burns the first: two rows, exactly one open');
select pg_temp.ok((select used_at is not null from public.invite_tokens where token_hash = pg_temp.hash((select v from pg_temp.tok where k = 'f1a'))), 'the burned row is the older one');
select pg_temp.ok(pg_temp.sqlstate($$insert into public.invite_tokens (user_id, token_hash, created_by) values ('00000000-0000-0000-0000-0000000000f1', 'zz', '00000000-0000-0000-0000-0000000000a1')$$) = '23505', 'the database refuses a second open token for the same member (partial unique index)');
reset role;
select pg_temp.ok((select count(*) = 2 from public.audit_log where action = 'invite' and tbl = 'invite_tokens' and person_id = '10000000-0000-0000-0000-0000000000f1' and actor = '00000000-0000-0000-0000-0000000000a1' and fields is null), 'two audit rows (invite), by the admin, for the member, no values');

-- ===== peek: no counting, states, no row for junk =====
select pg_temp.ok((select state = 'open' and handle = 'nene' and display_name = 'Nene Cruz' and user_id = '00000000-0000-0000-0000-0000000000f1' from public.join_claim_peek(pg_temp.hash((select v from pg_temp.tok where k = 'f1b')))), 'peek of the open link: open, the one name and handle');
select pg_temp.ok((select state = 'used' and user_id is null and handle is null and display_name is null from public.join_claim_peek(pg_temp.hash((select v from pg_temp.tok where k = 'f1a')))), 'peek of the burned link: used, no name');
select pg_temp.ok(not exists (select 1 from public.join_claim_peek(pg_temp.hash('not-a-real-token'))), 'peek of an unknown hash: no row');
select pg_temp.ok(not exists (select 1 from public.join_claim_peek('abc')) and not exists (select 1 from public.join_claim_peek(null)), 'peek of a malformed hash or null: no row, no error');
select public.join_claim_peek(pg_temp.hash((select v from pg_temp.tok where k = 'f1b'))) from generate_series(1, 8);
select pg_temp.ok((select attempts = 0 from public.invite_tokens where token_hash = pg_temp.hash((select v from pg_temp.tok where k = 'f1b'))), 'eight peeks counted nothing');

-- ===== check: 5 tries, the 6th gets nothing =====
select pg_temp.ok((select count(*) = 1 and bool_and(handle = 'nene' and first_name = 'Nene') from public.join_claim_check(pg_temp.hash((select v from pg_temp.tok where k = 'f1b')))), 'check 1 returns the member (user, handle, first name)');
select pg_temp.ok((select count(*) from public.join_claim_check(pg_temp.hash((select v from pg_temp.tok where k = 'f1b')))) = 1 and (select count(*) from public.join_claim_check(pg_temp.hash((select v from pg_temp.tok where k = 'f1b')))) = 1
  and (select count(*) from public.join_claim_check(pg_temp.hash((select v from pg_temp.tok where k = 'f1b')))) = 1 and (select count(*) from public.join_claim_check(pg_temp.hash((select v from pg_temp.tok where k = 'f1b')))) = 1, 'checks 2 to 5 still return the member');
select pg_temp.ok((select count(*) from public.join_claim_check(pg_temp.hash((select v from pg_temp.tok where k = 'f1b')))) = 0, 'the 6th check returns 0 rows');
select pg_temp.ok((select attempts = 5 from public.invite_tokens where token_hash = pg_temp.hash((select v from pg_temp.tok where k = 'f1b'))), 'tries stop at 5 (a refused check does not count)');
select pg_temp.ok((select state = 'tries' and user_id is null from public.join_claim_peek(pg_temp.hash((select v from pg_temp.tok where k = 'f1b')))), 'peek now says tries');
select pg_temp.ok(not exists (select 1 from public.join_claim_check('abc')) and not exists (select 1 from public.join_claim_check(null)) and not exists (select 1 from public.join_claim_check(pg_temp.hash('nope'))), 'check of malformed, null or unknown hash: no row, no error');

-- ===== use: single use enforced in SQL =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.mint('f1c', '00000000-0000-0000-0000-0000000000f1');
select pg_temp.as_service();
select pg_temp.ok((select count(*) filter (where used_at is null) = 1 and count(*) = 3 from public.invite_tokens where user_id = '00000000-0000-0000-0000-0000000000f1'), 'the exhausted link is burned by the next one: 3 rows, 1 open');
select pg_temp.ok((select count(*) = 1 from public.join_claim_check(pg_temp.hash((select v from pg_temp.tok where k = 'f1c')))), 'a fresh link checks fine');
select pg_temp.ok(public.join_claim_use(pg_temp.hash((select v from pg_temp.tok where k = 'f1c'))) = true, 'first use: true');
select pg_temp.ok(public.join_claim_use(pg_temp.hash((select v from pg_temp.tok where k = 'f1c'))) = false, 'second use: false');
select pg_temp.ok(not exists (select 1 from public.join_claim_check(pg_temp.hash((select v from pg_temp.tok where k = 'f1c')))), 'a used link checks to 0 rows');
select pg_temp.ok((select state = 'used' from public.join_claim_peek(pg_temp.hash((select v from pg_temp.tok where k = 'f1c')))), 'peek says used');
select pg_temp.ok(public.join_claim_use(pg_temp.hash('nope')) = false and public.join_claim_use('abc') = false and public.join_claim_use(null) = false, 'use of unknown, malformed or null hash: false');
select pg_temp.ok((select count(*) filter (where used_at is null) = 0 from public.invite_tokens where user_id = '00000000-0000-0000-0000-0000000000f1'), 'after the claim the member has no open link');

-- ===== expiry =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.mint('f3a', '00000000-0000-0000-0000-0000000000f3');
select pg_temp.as_service();
update public.invite_tokens set expires_at = now() - interval '1 second' where token_hash = pg_temp.hash((select v from pg_temp.tok where k = 'f3a'));
select pg_temp.ok(not exists (select 1 from public.join_claim_check(pg_temp.hash((select v from pg_temp.tok where k = 'f3a')))), 'an ended link checks to 0 rows');
select pg_temp.ok(public.join_claim_use(pg_temp.hash((select v from pg_temp.tok where k = 'f3a'))) = false, 'an ended link cannot be used');
select pg_temp.ok((select state = 'ended' and user_id is null from public.join_claim_peek(pg_temp.hash((select v from pg_temp.tok where k = 'f3a')))), 'peek says ended');
select pg_temp.ok((select attempts = 0 from public.invite_tokens where token_hash = pg_temp.hash((select v from pg_temp.tok where k = 'f3a'))), 'an ended link counts no tries');

-- ===== a member disabled after the link was made =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.mint('f3b', '00000000-0000-0000-0000-0000000000f3');
reset role;
update public.app_roles set disabled = true where user_id = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.as_service();
select pg_temp.ok(not exists (select 1 from public.join_claim_check(pg_temp.hash((select v from pg_temp.tok where k = 'f3b')))) and not exists (select 1 from public.join_claim_peek(pg_temp.hash((select v from pg_temp.tok where k = 'f3b')))), 'a disabled member: check and peek return nothing');
reset role;
update public.app_roles set disabled = false where user_id = '00000000-0000-0000-0000-0000000000f3';

-- ===== no client reads or writes the table =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(pg_temp.sqlstate($$select * from public.invite_tokens$$) = '42501', 'even an admin cannot read invite_tokens over REST');
select pg_temp.ok(pg_temp.sqlstate($$update public.invite_tokens set used_at = null$$) = '42501', 'nor write it');
select pg_temp.ok(pg_temp.sqlstate($$select * from public.join_claim_peek('abc')$$) = '42501' and pg_temp.sqlstate($$select public.join_claim_use('abc')$$) = '42501', 'nor call peek or use');

-- ===== rate limit: 20 links an hour per admin =====
reset role;
delete from public.pin_attempts where user_id = md5('invite:00000000-0000-0000-0000-0000000000a1')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
create function pg_temp.burst() returns text language plpgsql as $$ declare i int; begin
  for i in 1..20 loop perform public.admin_create_invite('00000000-0000-0000-0000-0000000000f3'); end loop;
  begin perform public.admin_create_invite('00000000-0000-0000-0000-0000000000f3'); return 'no limit';
  exception when others then return sqlstate; end; end $$;
grant execute on function pg_temp.burst() to authenticated;
select pg_temp.ok(pg_temp.burst() = '53400', '20 links in an hour work, the 21st is 53400');
select pg_temp.as_service();
select pg_temp.ok((select count(*) filter (where used_at is null) = 1 from public.invite_tokens where user_id = '00000000-0000-0000-0000-0000000000f3'), 'after the burst the member still has exactly one open link');

-- ===== export leaves the links out; erase removes them =====
reset role;
delete from public.pin_attempts where user_id = md5('invite:00000000-0000-0000-0000-0000000000a1')::uuid; -- a new hour for the admin
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(pg_temp.sqlstate($$select pg_temp.mint('f1d', '00000000-0000-0000-0000-0000000000f1')$$) = 'ok', 'a new link for f1 (for the export test)');
select pg_temp.as_service();
insert into public.invite_tokens (user_id, token_hash, created_by) values ('00000000-0000-0000-0000-0000000000f2', pg_temp.hash('x-f2'), '00000000-0000-0000-0000-0000000000a1'); -- a stray open row on f2 (service side)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.ok(not (public.export_my_data() ? 'invite_tokens') and (public.export_my_data() ? 'person') = true, 'export_my_data has no invite_tokens key and still has the person');
select pg_temp.as_service();
select pg_temp.ok(exists (select 1 from public.invite_tokens where user_id = '00000000-0000-0000-0000-0000000000f2'), 'the row exists, so the export left it out on purpose');
insert into public.erasure_requests (user_id, requested_at, cancel_until) values ('00000000-0000-0000-0000-0000000000f2', now() - interval '8 days', now() - interval '1 day');
select public.erase_user_data('00000000-0000-0000-0000-0000000000f2');
select pg_temp.ok(not exists (select 1 from public.invite_tokens where user_id = '00000000-0000-0000-0000-0000000000f2'), 'erasing a member also deletes their invite rows');

-- ===== every link has its audit row =====
reset role;
select pg_temp.ok((select count(*) from public.audit_log where action = 'invite') = 26, 'one invite audit row per link made (3 for f1, 2 for f3, 20 in the burst, 1 for the export test) and none for the refused calls');

-- ===== twice and down/up =====
reset role;
\ir ../migrations/0038_join_claim.sql
select pg_temp.ok((select count(*) from public.invite_tokens) > 0, '0038 run twice keeps its rows');
\ir ../migrations/0038_join_claim.down.sql
select pg_temp.ok(to_regclass('public.invite_tokens') is null and to_regprocedure('public.admin_create_invite(uuid)') is null and to_regprocedure('public.join_claim_check(text)') is null and to_regprocedure('public.join_claim_use(text)') is null and to_regprocedure('public.join_claim_peek(text)') is null, 'the down removes the table and the four functions');
select pg_temp.ok(to_regprocedure('public.export_my_data()') is not null and has_function_privilege('authenticated', 'public.export_my_data()', 'execute'), 'the down leaves export_my_data in place for members');
\ir ../migrations/0038_join_claim.down.sql
\ir ../migrations/0038_join_claim.sql
select pg_temp.ok(to_regclass('public.invite_tokens') is not null and to_regprocedure('public.join_claim_use(text)') is not null, 'up again after the down works');
\echo JOIN CLAIM REHEARSAL DONE
