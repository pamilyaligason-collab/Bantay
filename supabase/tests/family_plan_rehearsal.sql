-- Rehearsal for 0012_family_plan.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002 and 0003.
-- Run (WSL Postgres 18):
--   wsl -d Ubuntu -- bash -c "service postgresql start >/dev/null; cd /mnt/d/Claude/Bantay/supabase/tests && su postgres -c 'dropdb --if-exists bantay_fp; createdb bantay_fp; psql -X -q -v ON_ERROR_STOP=1 -d bantay_fp -f family_plan_rehearsal.sql'"
-- Actors: A admin (person PA); B member (person PB); C member (read-only carer of PB); F disabled member; anon.
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
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon, service_role;
grant select, delete on auth.sessions to service_role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000f', 'f@example.com', '{"provider":"google"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
insert into public.app_roles (user_id, role, disabled) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false), ('00000000-0000-0000-0000-00000000000b', 'member', false),
 ('00000000-0000-0000-0000-00000000000c', 'member', false), ('00000000-0000-0000-0000-00000000000f', 'member', true);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Test A', '00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Test B', '00000000-0000-0000-0000-00000000000b');
insert into public.carers values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-0000000000b1', false);
\ir ../migrations/0012_family_plan.sql
-- 0012 must be safe to run twice
\ir ../migrations/0012_family_plan.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon;

select pg_temp.ok((select count(*) from pg_class where relname in ('family_tasks', 'family_events', 'family_notes') and relrowsecurity) = 3, 'RLS is on for all three tables');
select pg_temp.ok((select count(*) from pg_indexes where indexname in ('family_events_starts', 'family_tasks_due')) = 2, 'starts_at and due are indexed');

-- B: ordinary member
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(not pg_temp.fails($$insert into public.family_tasks (client_id, title, due, assignee_person_id) values ('t1', 'Buy medicines', '2026-10-23', '10000000-0000-0000-0000-0000000000b1')$$), 'member adds a task');
select pg_temp.ok(not pg_temp.fails($$insert into public.family_events (client_id, title, starts_at) values ('e1', 'Family dinner', '2026-10-20 18:30+08')$$), 'member adds a whole-family event');
select pg_temp.ok(not pg_temp.fails($$insert into public.family_events (client_id, title, starts_at, ends_at, person_id) values ('e2', 'Clinic', '2026-10-29 09:00+08', '2026-10-29 10:00+08', '10000000-0000-0000-0000-0000000000b1')$$), 'member adds a personal event');
select pg_temp.ok(not pg_temp.fails($$insert into public.family_notes (client_id, body, pinned) values ('n1', 'Gate code 1234', true)$$), 'member adds a note');
select pg_temp.ok((select created_by = '00000000-0000-0000-0000-00000000000b' from public.family_tasks where client_id = 't1'), 'created_by is stamped from the login');
select pg_temp.ok(pg_temp.fails($$insert into public.family_tasks (client_id, title, created_by) values ('t-fake', 'x', '00000000-0000-0000-0000-00000000000a')$$), 'cannot add a row as someone else');
select pg_temp.ok(pg_temp.fails($$insert into public.family_tasks (client_id, title) values ('t-empty', '')$$), 'empty title refused');
select pg_temp.ok(pg_temp.fails($$insert into public.family_events (client_id, title, starts_at, ends_at) values ('e-bad', 'x', '2026-10-20 10:00+08', '2026-10-20 09:00+08')$$), 'end before start refused');
select pg_temp.ok(pg_temp.fails($$insert into public.family_tasks (client_id, title) values ('t1', 'duplicate key')$$), 'client_id is unique');
select pg_temp.ok(not pg_temp.fails($$update public.family_tasks set done = true where client_id = 't1'$$), 'member ticks a task');
select pg_temp.ok((select done and updated_at > now() - interval '1 minute' from public.family_tasks where client_id = 't1'), 'tick landed and updated_at is stamped');
-- the phone's upsert: POST ... on_conflict=client_id merge-duplicates (edit and soft delete both go this way)
select pg_temp.ok(not pg_temp.fails($$insert into public.family_tasks (client_id, title, due, done, deleted_at) values ('t1', 'Buy medicines', '2026-10-23', true, now()) on conflict (client_id) do update set title = excluded.title, due = excluded.due, done = excluded.done, deleted_at = excluded.deleted_at$$), 'upsert as soft delete works');
select pg_temp.ok((select deleted_at is not null from public.family_tasks where client_id = 't1'), 'soft delete landed');
select pg_temp.ok((select count(*) from public.family_tasks where client_id = 't1') = 1, 'tombstone stays readable so other phones learn of it');
select pg_temp.ok(pg_temp.fails($$update public.family_tasks set client_id = 'moved' where client_id = 't1'$$), 'client_id cannot change');
update public.family_tasks set created_by = '00000000-0000-0000-0000-00000000000a' where client_id = 't1';
select pg_temp.ok((select created_by = '00000000-0000-0000-0000-00000000000b' from public.family_tasks where client_id = 't1'), 'created_by cannot change');
select pg_temp.ok(pg_temp.fails($$delete from public.family_tasks where client_id = 't1'$$), 'no hard delete over REST');

-- C: another member sees and edits the same plan
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.ok((select count(*) from public.family_events) = 2 and (select count(*) from public.family_notes) = 1, 'another member reads events and notes');
select pg_temp.ok(not pg_temp.fails($$update public.family_notes set pinned = false where client_id = 'n1'$$), 'another member edits a note');
select pg_temp.ok((select pinned = false and created_by = '00000000-0000-0000-0000-00000000000b' from public.family_notes where client_id = 'n1'), 'edit landed, author kept');
select pg_temp.ok(not pg_temp.fails($$insert into public.family_events (client_id, title, starts_at) values ('e1', 'Family dinner at Lola''s', '2026-10-20 18:30+08') on conflict (client_id) do update set title = excluded.title$$), 'another member upserts over an existing event');

-- A: admin
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.family_events) = 2, 'admin reads the plan');
select pg_temp.ok(not pg_temp.fails($$insert into public.family_notes (client_id, body) values ('n2', 'Admin note')$$), 'admin adds a note');

-- F: disabled member reads and writes nothing
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000f';
select pg_temp.ok((select count(*) from public.family_tasks) = 0 and (select count(*) from public.family_events) = 0 and (select count(*) from public.family_notes) = 0, 'disabled member reads nothing');
select pg_temp.ok(pg_temp.fails($$insert into public.family_tasks (client_id, title) values ('t-f', 'x')$$), 'disabled member cannot insert');
update public.family_events set title = 'hacked';
select pg_temp.ok((select count(*) from public.family_events where title = 'hacked') = 0, 'disabled member cannot update');
select pg_temp.ok(pg_temp.fails($$insert into public.family_notes (client_id, body) values ('n-f', 'x') on conflict (client_id) do update set body = 'hacked'$$), 'disabled member cannot upsert');

-- anon: nothing
set role anon; set request.jwt.claim.sub = '';
select pg_temp.ok(pg_temp.fails($$select * from public.family_tasks$$), 'anon cannot read tasks');
select pg_temp.ok(pg_temp.fails($$select * from public.family_events$$), 'anon cannot read events');
select pg_temp.ok(pg_temp.fails($$select * from public.family_notes$$), 'anon cannot read notes');
select pg_temp.ok(pg_temp.fails($$insert into public.family_notes (client_id, body) values ('n-a', 'x')$$), 'anon cannot insert');
select pg_temp.ok(pg_temp.fails($$select public.family_member()$$), 'anon cannot call family_member');
reset role;
\echo FAMILY PLAN REHEARSAL DONE
