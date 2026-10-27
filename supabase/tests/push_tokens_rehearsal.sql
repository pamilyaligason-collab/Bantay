-- Rehearsal for 0040_push_tokens.sql on a THROWAWAY Postgres (never the live project). Loads the whole chain first (chain_rehearsal.sql, which includes 0040), then runs 0040 again (must be idempotent) and asserts.
-- Run from WSL in supabase/tests:
--   sudo -u postgres dropdb --if-exists bantay_s12_e; sudo -u postgres createdb bantay_s12_e; sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d bantay_s12_e -f push_tokens_rehearsal.sql
-- Chain actors: a1 admin; b1 member; c1 member (handle lola); d1 member, disabled.
\set ON_ERROR_STOP on
\ir chain_rehearsal.sql
\ir ../migrations/0040_push_tokens.sql

create function pg_temp.state(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function pg_temp.state(text) to authenticated, anon, service_role;

-- ===== grants and policies =====
select pg_temp.ok(has_function_privilege('authenticated', 'public.push_token_claim(text,text)', 'execute')
  and not has_function_privilege('anon', 'public.push_token_claim(text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.push_token_claim(text,text)', 'execute'), 'push_token_claim: authenticated only (ACL restated, ML-21)');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.dose_watch_prune()', 'execute') and has_function_privilege('service_role', 'public.dose_watch_prune()', 'execute')
  and not has_function_privilege('anon', 'public.dose_watch_prune()', 'execute'), 'dose_watch_prune: service_role only');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.push_tokens_cap()', 'execute'), 'the cap trigger function is not callable');
select pg_temp.ok(not has_table_privilege('anon', 'public.push_tokens', 'select') and not has_column_privilege('authenticated', 'public.push_tokens', 'token', 'update')
  and not has_column_privilege('authenticated', 'public.push_tokens', 'user_id', 'update') and has_column_privilege('authenticated', 'public.push_tokens', 'app_version', 'update'), 'column grants: only app_version and updated_at can change');

-- ===== claim =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.push_token_claim('tokenBBBBBBBBBBBBBBBBBBBB-1', '2.4.0');
select pg_temp.ok((select count(*) from public.push_tokens) = 1 and (select user_id from public.push_tokens) = '00000000-0000-0000-0000-0000000000b1', 'claim stores the caller as owner');
select public.push_token_claim('tokenBBBBBBBBBBBBBBBBBBBB-1', '2.4.1');
select pg_temp.ok((select count(*) from public.push_tokens) = 1 and (select app_version from public.push_tokens) = '2.4.1', 'claiming the same token again updates it, never duplicates');
select pg_temp.ok(pg_temp.state($$select public.push_token_claim('short', '2.4.0')$$) = '22023', 'a short token is refused (22023)');
select pg_temp.ok(pg_temp.state($$select public.push_token_claim(null, '2.4.0')$$) = '22023', 'a null token is refused');
reset role;

-- shared phone: c1 signs in on the same phone and claims the same token; b1 loses it (ML-07)
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select public.push_token_claim('tokenBBBBBBBBBBBBBBBBBBBB-1', '2.4.0');
select pg_temp.ok((select count(*) from public.push_tokens) = 1 and (select user_id from public.push_tokens) = '00000000-0000-0000-0000-0000000000c1', 'a shared phone token moves to the last user, b1 has none');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select count(*) from public.push_tokens) = 0, 'b1 cannot read c1''s token');
select pg_temp.ok(pg_temp.state($$insert into public.push_tokens (token, user_id) values ('tokenXXXXXXXXXXXXXXXXXXXX-9', '00000000-0000-0000-0000-0000000000c1')$$) = '42501', 'b1 cannot insert a row for c1 (RLS)');
select pg_temp.ok(pg_temp.state($$update public.push_tokens set user_id = '00000000-0000-0000-0000-0000000000b1'$$) = '42501', 'user_id is not updatable');
delete from public.push_tokens;
reset role;
select pg_temp.ok((select count(*) from public.push_tokens) = 1, 'b1 delete removed none of c1''s rows');

-- ===== the account cannot register when disabled, signed out, or anon =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.ok(pg_temp.state($$select public.push_token_claim('tokenDDDDDDDDDDDDDDDDDDDD-1', '2.4.0')$$) = '42501', 'a disabled account cannot register (42501)');
reset role;
set role authenticated; reset request.jwt.claim.sub;
select pg_temp.ok(pg_temp.state($$select public.push_token_claim('tokenEEEEEEEEEEEEEEEEEEEE-1', '2.4.0')$$) = '42501', 'no auth.uid() is refused');
reset role;
set role anon;
select pg_temp.ok(pg_temp.state($$select public.push_token_claim('tokenEEEEEEEEEEEEEEEEEEEE-1', '2.4.0')$$) = '42501' or pg_temp.state($$select public.push_token_claim('tokenEEEEEEEEEEEEEEEEEEEE-1', '2.4.0')$$) = '42883', 'anon cannot call the claim');
select pg_temp.ok(pg_temp.state($$select * from public.push_tokens$$) = '42501', 'anon cannot read tokens');
reset role;

-- ===== cap 3 (ML-06): the 4th insert leaves the 3 newest =====
delete from public.push_tokens;
insert into public.push_tokens (token, user_id, updated_at) values
  ('tokenCAP0000000000000001', '00000000-0000-0000-0000-0000000000b1', now() - interval '4 days'),
  ('tokenCAP0000000000000002', '00000000-0000-0000-0000-0000000000b1', now() - interval '3 days'),
  ('tokenCAP0000000000000003', '00000000-0000-0000-0000-0000000000b1', now() - interval '2 days');
insert into public.push_tokens (token, user_id, updated_at) values ('tokenCAP0000000000000004', '00000000-0000-0000-0000-0000000000b1', now() - interval '1 day');
select pg_temp.ok((select count(*) from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000b1') = 3
  and not exists (select 1 from public.push_tokens where token = 'tokenCAP0000000000000001')
  and exists (select 1 from public.push_tokens where token = 'tokenCAP0000000000000004'), 'a 4th token leaves the 3 newest, the oldest goes');
insert into public.push_tokens (token, user_id) values ('tokenCAP0000000000000005', '00000000-0000-0000-0000-0000000000c1');
select pg_temp.ok((select count(*) from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000b1') = 3 and (select count(*) from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000c1') = 1, 'the cap is per user');
-- a user's own claim path keeps the cap too, and the new token is among the kept
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.push_token_claim('tokenCAP0000000000000006', '2.4.0');
reset role;
select pg_temp.ok((select count(*) from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000b1') = 3 and exists (select 1 from public.push_tokens where token = 'tokenCAP0000000000000006'), 'claim after 3 tokens: still 3, the new one kept');

-- ===== prune: stale 60 days or failed >= 5 go; invite_tokens only when the table exists =====
delete from public.push_tokens;
insert into public.push_tokens (token, user_id, updated_at, failed) values
  ('tokenOLD0000000000000001', '00000000-0000-0000-0000-0000000000b1', now() - interval '61 days', 0),
  ('tokenBAD0000000000000001', '00000000-0000-0000-0000-0000000000c1', now(), 5),
  ('tokenOK00000000000000001', '00000000-0000-0000-0000-0000000000c1', now() - interval '59 days', 4);
select public.dose_watch_prune();
select pg_temp.ok((select count(*) from public.push_tokens) = 1 and exists (select 1 from public.push_tokens where token = 'tokenOK00000000000000001'), 'prune removes stale (61 d) and failed (5), keeps 59 d / 4 fails');
select pg_temp.ok(to_regclass('public.invite_tokens') is null, 'prune ran with no invite_tokens table (before 0038)');
create table public.invite_tokens (id int primary key, created_at timestamptz not null);
insert into public.invite_tokens values (1, now() - interval '31 days'), (2, now() - interval '29 days');
select public.dose_watch_prune();
select pg_temp.ok((select count(*) from public.invite_tokens) = 1 and exists (select 1 from public.invite_tokens where id = 2), 'prune removes invite_tokens older than 30 days only');
drop table public.invite_tokens;
-- the 0030 duties are intact
insert into public.dose_watch_sent (person_id, day, slot, sent_at) values ('10000000-0000-0000-0000-0000000000b1', '2026-10-01', '08:00', now() - interval '8 days');
select public.dose_watch_prune() as pruned \gset
select pg_temp.ok(:pruned = 1, 'prune still returns the dose_watch_sent count and forgets claims older than 7 days');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.state($$select public.dose_watch_prune()$$) = '42501', 'a signed-in user cannot prune');
reset role;

-- ===== cascade: erasing the auth user removes their tokens =====
insert into public.push_tokens (token, user_id) values ('tokenCAS0000000000000001', '00000000-0000-0000-0000-0000000000c1');
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok(not exists (select 1 from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000c1'), 'deleting the auth user removes the tokens');

-- ===== down and up again =====
\ir ../migrations/0040_push_tokens.down.sql
select pg_temp.ok(to_regclass('public.push_tokens') is null and to_regprocedure('public.push_token_claim(text,text)') is null and to_regprocedure('public.dose_watch_prune()') is not null, 'down removes the table and the claim, keeps dose_watch_prune (0030 body)');
\ir ../migrations/0040_push_tokens.down.sql
\ir ../migrations/0040_push_tokens.sql
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.push_token_claim('tokenUP00000000000000001', '2.4.0');
reset role;
select pg_temp.ok((select count(*) from public.push_tokens) = 1, 'up again after down works');
\echo ALL PASS
