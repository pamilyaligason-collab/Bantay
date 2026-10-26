-- Rehearsal for 0031_sos.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002, 0003 and 0023.
-- Run (WSL Postgres, throwaway database):
--   wsl -u postgres psql -X -v ON_ERROR_STOP=1 -d <throwaway> -f supabase/tests/sos_rehearsal.sql
-- notify_family belongs to 0030 (lane S1, not in this branch): a STUB with the contract's behaviour stands in for it here
-- (rows go to a stub carer_alerts: 'family' scope = every active member except the person; unique (kind, ref, carer_user_id)).
-- Actors: A admin and active member; B elder (person pB); C active member; D disabled member; E signed in with no app_roles row;
-- F writer carer of a dependent person pX (no login); G signed in, no relation to anyone.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb, raw_user_meta_data jsonb);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon, supabase_auth_admin, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant usage on schema public to authenticated, anon, service_role;
grant select, delete on auth.sessions to service_role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000d', 'd@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000e', 'e@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000f', 'f@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-000000000010', 'g@example.com', '{"provider":"google"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
insert into public.app_roles (user_id, role, disabled) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false), ('00000000-0000-0000-0000-00000000000b', 'member', false),
 ('00000000-0000-0000-0000-00000000000c', 'member', false), ('00000000-0000-0000-0000-00000000000d', 'member', true);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('70000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Bee', '00000000-0000-0000-0000-00000000000b'),
 ('70000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'Cee', '00000000-0000-0000-0000-00000000000c');
-- a dependent with no login: its creator F becomes the writer carer (people_link_creator)
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('70000000-0000-0000-0000-0000000000f1', null, 'Dependent', '00000000-0000-0000-0000-00000000000f');
-- 0023 (is_family_member) also makes a storage bucket: stub the storage schema as the family_messages rehearsal does
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
\ir ../migrations/0023_family_memories.sql

-- ===== STUB of 0030 notify_family (contract shape; the real one is S1's) =====
create table public.carer_alerts (
  id uuid primary key default gen_random_uuid(), person_id uuid, carer_user_id uuid not null, kind text not null, template text not null,
  ref text, created_at timestamptz not null default now());
create unique index carer_alerts_ref on public.carer_alerts (kind, ref, carer_user_id) where ref is not null;
create function public.notify_family(p_person uuid, p_kind text, p_template text, p_ref text, p_scope text) returns int
  language plpgsql security definer set search_path = '' as
  $$ declare n int; begin
       insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
         select p_person, r.user_id, p_kind, p_template, p_ref from public.app_roles r
          where not r.disabled and r.user_id is distinct from (select auth_user_id from public.people where id = p_person)
       on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
       get diagnostics n = row_count; return n;
     end $$;
revoke execute on function public.notify_family(uuid, text, text, text, text) from public, anon, authenticated;

-- ===== stubs for pg_net and vault so the guarded flush path runs (WSL has neither) =====
create schema net;
create table public.flush_log (url text, headers jsonb, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int default 5000) returns bigint
  language plpgsql as $$ begin insert into public.flush_log values (url, headers, body); return 1; end $$;
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);

-- ===== apply 0031 twice (must be safe to run twice) =====
\ir ../migrations/0031_sos.sql
\ir ../migrations/0031_sos.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
create function pg_temp.n(q text) returns int language plpgsql as $$ declare c int; begin execute 'with u as (' || q || ' returning 1) select count(*) from u' into c; return c; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text), pg_temp.n(text) to authenticated, anon, service_role;
grant select on public.carer_alerts, public.flush_log to authenticated;

select pg_temp.ok(not has_function_privilege('authenticated', 'public.sos_events_alert()', 'execute') and not has_function_privilege('anon', 'public.sos_events_late()', 'execute')
  and not has_function_privilege('authenticated', 'public.sos_events_prune()', 'execute') and not has_function_privilege('service_role', 'public.sos_events_cancel()', 'execute'), 'the trigger functions and the prune job are not executable by app roles (ML-21)');

-- ===== BEFORE trigger: late =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
-- live: sent 1 minute after the hold; fan-out: A and C (D disabled, B is the person)
insert into public.sos_events (id, person_id, at, sent_at, lat, lon, gps, call_to)
  values ('e0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-00000000000b', now() - interval '1 minute', now(), 9.65, 123.85, true, 'family');
select pg_temp.ok((select not late and user_id = '00000000-0000-0000-0000-00000000000b' from public.sos_events where id = 'e0000000-0000-0000-0000-000000000001'), 'sent a minute after the hold is live; user_id comes from auth.uid()');
reset role;
select pg_temp.ok((select count(*) = 2 and count(*) filter (where carer_user_id = '00000000-0000-0000-0000-00000000000a') = 1 and count(*) filter (where carer_user_id = '00000000-0000-0000-0000-00000000000c') = 1
  and bool_and(kind = 'sos' and template = 'family_sos' and ref = 'e0000000-0000-0000-0000-000000000001') from public.carer_alerts), 'AFTER trigger: one sos family_sos row per active member except the person (not the disabled one, not the elder)');
select pg_temp.ok((select count(*) = 0 from public.flush_log), 'no flush while the vault secret is missing');
insert into vault.decrypted_secrets values ('dose_watch_cron_secret', 'rehearsal-secret');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
-- late: sent 31 minutes after the hold
insert into public.sos_events (id, person_id, at, sent_at, gps, call_to)
  values ('e0000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-00000000000b', now() - interval '31 minutes', now(), false, 'family');
select pg_temp.ok((select late from public.sos_events where id = 'e0000000-0000-0000-0000-000000000002'), 'sent 31 minutes after the hold is late');
select pg_temp.ok((select lat is null and lon is null from public.sos_events where id = 'e0000000-0000-0000-0000-000000000002'), 'unknown location stays null, never 0');
reset role;
select pg_temp.ok((select count(*) = 2 and bool_and(kind = 'sos' and template = 'sos_late') from public.carer_alerts where ref = 'e0000000-0000-0000-0000-000000000002'), 'a late insert writes sos_late rows');
select pg_temp.ok((select count(*) = 1 and (min(body::text) = '{"mode": "flush"}') and (min(headers ->> 'x-dose-watch-secret') = 'rehearsal-secret') and min(url) like 'https://%/functions/v1/dose-watch' from public.flush_log), 'pg_net flush called once with the vault secret header (the late one; the first ran before the secret existed)');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
-- exactly 30 minutes is not late; a null sent_at and a future at are live; a client-sent late = true is overridden
insert into public.sos_events (id, person_id, at, sent_at) values ('e0000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-00000000000b', '2026-01-01 10:00:00+00', '2026-01-01 10:30:00+00');
select pg_temp.ok((select not late from public.sos_events where id = 'e0000000-0000-0000-0000-000000000003'), 'exactly 30 minutes is not late (strictly more)');
reset role;
-- throttle test needs a clean slate for B: move earlier rows out of the 10-minute window
update public.sos_events set created_at = now() - interval '2 hours';
delete from public.carer_alerts; delete from public.flush_log;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.sos_events (id, person_id, at, sent_at) values ('e0000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-00000000000b', now() + interval '1 hour', now());
select pg_temp.ok((select not late from public.sos_events where id = 'e0000000-0000-0000-0000-000000000004'), 'an at in the future counts as live');
insert into public.sos_events (id, person_id, at, sent_at) values ('e0000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-00000000000b', now(), null);
select pg_temp.ok((select not late from public.sos_events where id = 'e0000000-0000-0000-0000-000000000005'), 'a null sent_at counts as live');
-- the hold-3 insert is the third in the window (4 and 5 above plus this one)
insert into public.sos_events (id, person_id, at, sent_at, late) values ('e0000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-00000000000b', now() - interval '1 hour', now(), false);
select pg_temp.ok((select late from public.sos_events where id = 'e0000000-0000-0000-0000-000000000006'), 'the server decides late: a client false is overridden for a stale row');
insert into public.sos_events (id, person_id, at, sent_at, late) values ('e0000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-00000000000b', now(), now(), true);
select pg_temp.ok((select not late from public.sos_events where id = 'e0000000-0000-0000-0000-000000000007'), 'a client late = true is overridden for a live row');
reset role;

-- ===== throttle: the 4th in 10 minutes is stored and writes no new rows =====
select pg_temp.ok((select count(*) = 4 from public.sos_events where created_at > now() - interval '10 minutes'), 'four rows from B are inside the window (all stored, none refused)');
select pg_temp.ok((select count(*) = 6 from public.carer_alerts), 'fan-out stopped after the third: events 4, 5, 6 wrote 2 rows each (6); event 7, the fourth in the window, wrote none');
select pg_temp.ok((select count(distinct ref) = 3 from public.carer_alerts), 'three events fanned out');
select pg_temp.ok((select count(*) = 3 from public.flush_log), 'one flush per fanned-out event, none for throttled ones');

-- ===== cancel after 3 events succeeds, writes sos_cancel once =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.n($$update public.sos_events set cancelled_at = now() where id = 'e0000000-0000-0000-0000-000000000007'$$) = 1, 'cancel works after more than 3 events in the window');
update public.sos_events set cancelled_at = now() + interval '1 second' where id = 'e0000000-0000-0000-0000-000000000007';
update public.sos_events set sms_opened = true, call_to = '911' where id = 'e0000000-0000-0000-0000-000000000007';
reset role;
select pg_temp.ok((select count(*) = 2 and bool_and(kind = 'sos_cancel' and template = 'sos_cancel' and ref = 'e0000000-0000-0000-0000-000000000007:cancel') from public.carer_alerts where kind = 'sos_cancel'), 'sos_cancel is written once per member, and not again on a second cancelled_at change');

-- ===== a raising notify_family still lets the insert commit =====
create or replace function public.notify_family(p_person uuid, p_kind text, p_template text, p_ref text, p_scope text) returns int
  language plpgsql security definer set search_path = '' as $$ begin raise exception 'notify_family is broken'; end $$;
update public.sos_events set created_at = now() - interval '3 hours';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.sos_events (id, person_id, at, sent_at) values ('e0000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-00000000000b', now(), now());
select pg_temp.ok((select count(*) = 1 from public.sos_events where id = 'e0000000-0000-0000-0000-000000000008'), 'a raising notify_family does not block the SOS insert');
update public.sos_events set cancelled_at = now() where id = 'e0000000-0000-0000-0000-000000000008';
select pg_temp.ok((select cancelled_at is not null from public.sos_events where id = 'e0000000-0000-0000-0000-000000000008'), 'nor the cancel update');
reset role;
-- a missing notify_family (0030 not applied) is the same
drop function public.notify_family(uuid, text, text, text, text);
update public.sos_events set created_at = now() - interval '4 hours';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.sos_events (id, person_id, at, sent_at) values ('e0000000-0000-0000-0000-000000000009', '70000000-0000-0000-0000-00000000000b', now(), now());
select pg_temp.ok((select count(*) = 1 from public.sos_events where id = 'e0000000-0000-0000-0000-000000000009'), 'with 0030 not applied the SOS is still stored');
reset role;

-- ===== RLS: who can write =====
update public.sos_events set created_at = now() - interval '5 hours';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.fails($$insert into public.sos_events (id, person_id, at, user_id) values ('e0000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-00000000000b', now(), '00000000-0000-0000-0000-00000000000c')$$), 'an insert with another user''s user_id is refused');
select pg_temp.ok(pg_temp.fails($$insert into public.sos_events (id, person_id, at) values ('e0000000-0000-0000-0000-0000000000a2', '70000000-0000-0000-0000-00000000000c', now())$$), 'the elder cannot raise an SOS for someone else''s person');
select pg_temp.ok(pg_temp.fails($$insert into public.sos_events (id, person_id, at, call_to) values ('e0000000-0000-0000-0000-0000000000a3', '70000000-0000-0000-0000-00000000000b', now(), 'mobile')$$), 'call_to is one of family, 911, none');
select pg_temp.ok(pg_temp.fails($$update public.sos_events set late = true$$), 'late cannot be updated by the app (no column grant)');
select pg_temp.ok(pg_temp.fails($$update public.sos_events set at = now()$$), 'at cannot be updated');
select pg_temp.ok(pg_temp.fails($$delete from public.sos_events$$), 'no delete over REST');
-- the same id again (outbox retry) is a no-op with ignore-duplicates
insert into public.sos_events (id, person_id, at) values ('e0000000-0000-0000-0000-000000000009', '70000000-0000-0000-0000-00000000000b', now()) on conflict (id) do nothing;
select pg_temp.ok((select count(*) = 1 from public.sos_events where id = 'e0000000-0000-0000-0000-000000000009'), 'a retried insert with the same id stores one row');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000f';
insert into public.sos_events (id, person_id, at, call_to) values ('e0000000-0000-0000-0000-0000000000f1', '70000000-0000-0000-0000-0000000000f1', now(), 'none');
select pg_temp.ok((select user_id = '00000000-0000-0000-0000-00000000000f' from public.sos_events where id = 'e0000000-0000-0000-0000-0000000000f1'), 'a writer carer can raise an SOS for a person with no login');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000010';
select pg_temp.ok(pg_temp.fails($$insert into public.sos_events (id, person_id, at) values ('e0000000-0000-0000-0000-0000000000a4', '70000000-0000-0000-0000-0000000000f1', now())$$), 'a stranger cannot raise an SOS for a dependent');
select pg_temp.ok(pg_temp.fails($$insert into public.sos_events (id, person_id, at) values ('e0000000-0000-0000-0000-0000000000a5', '70000000-0000-0000-0000-00000000000b', now())$$), 'a stranger cannot raise an SOS for the elder');
select pg_temp.ok((select count(*) = 0 from public.sos_events), 'a stranger reads nothing');

-- ===== reads and updates =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) >= 8 from public.sos_events), 'an active family member reads the SOS rows');
select pg_temp.ok(pg_temp.n($$update public.sos_events set cancelled_at = now() where id = 'e0000000-0000-0000-0000-000000000009'$$) = 0, 'a family member cannot cancel someone else''s SOS');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok((select count(*) = 0 from public.sos_events), 'a disabled member reads nothing');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select pg_temp.ok((select count(*) = 0 from public.sos_events), 'a member with no role reads nothing');
reset role; set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.sos_events$$), 'anon has no access');
reset role;

-- ===== acks =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into public.sos_acks (event_id) values ('e0000000-0000-0000-0000-000000000009');
select pg_temp.ok((select user_id = '00000000-0000-0000-0000-00000000000c' from public.sos_acks), 'an ack stamps the caller');
select pg_temp.ok(pg_temp.fails($$insert into public.sos_acks (event_id) values ('e0000000-0000-0000-0000-000000000009')$$), 'one ack per member and event');
insert into public.sos_acks (event_id) values ('e0000000-0000-0000-0000-000000000009') on conflict (event_id, user_id) do nothing;
select pg_temp.ok((select count(*) = 1 from public.sos_acks), 'a retried ack (ignore-duplicates) keeps one row');
select pg_temp.ok(pg_temp.fails($$insert into public.sos_acks (event_id, user_id) values ('e0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000a')$$), 'an ack cannot be written as someone else');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) = 1 from public.sos_acks), 'another member sees who has seen the event');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000010';
select pg_temp.ok(pg_temp.fails($$insert into public.sos_acks (event_id) values ('e0000000-0000-0000-0000-000000000009')$$), 'a stranger cannot ack an event they cannot see');
select pg_temp.ok((select count(*) = 0 from public.sos_acks), 'a stranger sees no acks');
reset role;

-- ===== retention: 90 days, acks cascade =====
insert into public.sos_events (id, person_id, at, created_at) values ('e0000000-0000-0000-0000-0000000000b1', '70000000-0000-0000-0000-00000000000b', now() - interval '91 days', now() - interval '91 days');
insert into public.sos_acks (event_id, user_id) values ('e0000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000c');
insert into public.sos_events (id, person_id, at, created_at) values ('e0000000-0000-0000-0000-0000000000b2', '70000000-0000-0000-0000-00000000000b', now() - interval '89 days', now() - interval '89 days');
select public.sos_events_prune();
select pg_temp.ok((select count(*) = 0 from public.sos_events where id = 'e0000000-0000-0000-0000-0000000000b1') and (select count(*) = 1 from public.sos_events where id = 'e0000000-0000-0000-0000-0000000000b2'), 'prune deletes rows older than 90 days only');
select pg_temp.ok((select count(*) = 0 from public.sos_acks where event_id = 'e0000000-0000-0000-0000-0000000000b1'), 'their acks cascade');
set role authenticated;
select pg_temp.ok(pg_temp.fails($$select public.sos_events_prune()$$), 'an app role cannot run the prune');
reset role;

-- ===== Realtime and cron blocks are guarded: nothing to add on this database =====
select pg_temp.ok(not exists (select 1 from pg_publication where pubname = 'supabase_realtime'), 'no supabase_realtime publication here, so the guarded block did nothing and did not fail');

-- ===== down, then up again =====
\ir ../migrations/0031_sos.down.sql
\ir ../migrations/0031_sos.down.sql
select pg_temp.ok(to_regclass('public.sos_events') is null and to_regclass('public.sos_acks') is null and to_regproc('public.sos_events_alert') is null and to_regproc('public.sos_events_prune') is null, 'down removes tables and functions, and runs twice');
\ir ../migrations/0031_sos.sql
select pg_temp.ok(to_regclass('public.sos_events') is not null, 'up works again after down');
\echo REHEARSAL DONE
