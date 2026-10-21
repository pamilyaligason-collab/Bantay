-- Rehearsal for 0024_nutrition.sql on a THROWAWAY Postgres (never the live project), with the real helpers from 0001, 0002, 0003, 0006, 0008, 0010, 0011, 0013, 0021, 0022.
-- Run (WSL Postgres or any local Postgres 15+), from supabase/tests:
--   su postgres -c 'dropdb --if-exists bantay_nutrition; createdb bantay_nutrition; psql -X -q -v ON_ERROR_STOP=1 -d bantay_nutrition -f nutrition_rehearsal.sql'
-- Actors: A admin (person PA); B member and writer carer (person PB); F read-only carer of PC; E a stranger (no link to anyone).
-- Person PC is a child with no login, created by B (B becomes its writer through link_creator). All rows are synthetic.
-- anon gets the table grants Supabase gives it by default (the stub schema grants usage; the migration revokes the tables).
-- The checks run inside begin ... rollback; the up/down/up check follows.
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
-- Supabase's default privileges give anon and authenticated every right on new public tables; the migration must take them back.
alter default privileges in schema public grant all on tables to anon, authenticated;
grant select, delete on auth.sessions to service_role;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000e', 'e@example.com', '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-00000000000f', 'f@example.com', '{"provider":"google"}', '{}');
\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
\ir ../migrations/0006_family_profiles.sql
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
\ir ../migrations/0008_records.sql
insert into public.app_roles (user_id, role, disabled, handle) values
 ('00000000-0000-0000-0000-00000000000a', 'admin', false, null), ('00000000-0000-0000-0000-00000000000b', 'member', false, null),
 ('00000000-0000-0000-0000-00000000000e', 'member', false, null), ('00000000-0000-0000-0000-00000000000f', 'member', false, null);
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Test A', '00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Test B', '00000000-0000-0000-0000-00000000000b'),
 ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000e', 'Test E', '00000000-0000-0000-0000-00000000000e');
\ir ../migrations/0010_people_profile.sql
\ir ../migrations/0011_family_profiles_photo.sql
\ir ../migrations/0013_records_autoconfirm.sql
\ir ../migrations/0021_admin_audit.sql
\ir ../migrations/0022_people_archive.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
create function pg_temp.affected(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on function pg_temp.fails(text), pg_temp.affected(text), pg_temp.ok(boolean, text) to authenticated, anon, service_role;

\ir ../migrations/0024_nutrition.sql
-- 0024 must be safe to run twice
\ir ../migrations/0024_nutrition.sql

-- === checks ===
begin;
-- seed as the service role (no auth.uid())
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000c1', null, 'Test Child', '00000000-0000-0000-0000-00000000000b');
insert into public.carers (carer_id, person_id, can_write) values ('00000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-0000000000c1', false);

-- tables exist, RLS on, anon has nothing
select pg_temp.ok((select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('food_entries', 'water_entries', 'nutrition_goals') and relrowsecurity) = 3, 'RLS is on for all three tables');
set role anon;
select pg_temp.ok(pg_temp.fails($$select count(*) from public.food_entries$$), 'anon cannot read food_entries');
select pg_temp.ok(pg_temp.fails($$insert into public.water_entries (person_id, drunk_at, ml) values ('10000000-0000-0000-0000-0000000000b1', now(), 250)$$), 'anon cannot insert water_entries');
select pg_temp.ok(pg_temp.fails($$select count(*) from public.nutrition_goals$$), 'anon cannot read nutrition_goals');
reset role;
select pg_temp.ok(not has_table_privilege('authenticated', 'public.food_entries', 'delete') and not has_table_privilege('authenticated', 'public.water_entries', 'delete'), 'authenticated has no hard delete on the entry tables');

-- self writes own rows; unknown nutrients stay null, never 0
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.affected($$insert into public.food_entries (client_id, person_id, eaten_at, meal, food_key, name, portion, serving_label, kcal, sodium_mg, potassium_mg, protein_g)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', now(), 'lunch', 'chicken_adobo', 'Chicken adobo', 1.5, '1 serving', 310, 1806, 528, 35.4)$$) = 1, 'self inserts a food row');
select pg_temp.ok(pg_temp.affected($$insert into public.food_entries (person_id, eaten_at, meal, name) values ('10000000-0000-0000-0000-0000000000b1', now(), 'snack', 'Test snack')$$) = 1, 'a row with no nutrient numbers is accepted');
select pg_temp.ok((select kcal is null and sodium_mg is null and potassium_mg is null and protein_g is null and portion = 1 from public.food_entries where name = 'Test snack'), 'unknown nutrients are null, portion defaults to 1');
select pg_temp.ok(pg_temp.affected($$insert into public.water_entries (client_id, person_id, drunk_at, ml) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', now(), 250)$$) = 1, 'self inserts a water row');
select pg_temp.ok(pg_temp.fails($$insert into public.food_entries (person_id, eaten_at, meal, name) values ('10000000-0000-0000-0000-0000000000a1', now(), 'lunch', 'Test other')$$), 'self cannot write food for an unrelated person');
select pg_temp.ok(pg_temp.fails($$insert into public.water_entries (person_id, drunk_at, ml) values ('10000000-0000-0000-0000-0000000000a1', now(), 250)$$), 'self cannot write water for an unrelated person');
-- checks
select pg_temp.ok(pg_temp.fails($$insert into public.food_entries (person_id, eaten_at, meal, name) values ('10000000-0000-0000-0000-0000000000b1', now(), 'brunch', 'x')$$), 'meal must be breakfast, lunch, dinner or snack');
select pg_temp.ok(pg_temp.fails($$insert into public.food_entries (person_id, eaten_at, meal, name, portion) values ('10000000-0000-0000-0000-0000000000b1', now(), 'lunch', 'x', 0)$$), 'portion 0 refused');
select pg_temp.ok(pg_temp.fails($$insert into public.food_entries (person_id, eaten_at, meal, name, sodium_mg) values ('10000000-0000-0000-0000-0000000000b1', now(), 'lunch', 'x', -1)$$), 'negative sodium refused');
select pg_temp.ok(pg_temp.fails($$insert into public.food_entries (person_id, eaten_at, meal, name) values ('10000000-0000-0000-0000-0000000000b1', now(), 'lunch', '')$$), 'empty name refused');
select pg_temp.ok(pg_temp.fails($$insert into public.water_entries (person_id, drunk_at, ml) values ('10000000-0000-0000-0000-0000000000b1', now(), 0)$$), 'water 0 ml refused');
-- merge-duplicates upsert on client_id (what the app sends) edits in place, no second row
select pg_temp.ok(pg_temp.affected($$insert into public.food_entries (client_id, person_id, eaten_at, meal, food_key, name, portion, kcal, sodium_mg, deleted_at)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', now(), 'lunch', 'chicken_adobo', 'Chicken adobo', 0.5, 103, 602, null)
  on conflict (client_id) do update set eaten_at = excluded.eaten_at, meal = excluded.meal, food_key = excluded.food_key, name = excluded.name, portion = excluded.portion, kcal = excluded.kcal, sodium_mg = excluded.sodium_mg, deleted_at = excluded.deleted_at$$) = 1, 'upsert on client_id edits the row');
select pg_temp.ok((select count(*) from public.food_entries where client_id = '20000000-0000-0000-0000-000000000001') = 1 and (select portion from public.food_entries where client_id = '20000000-0000-0000-0000-000000000001') = 0.5, 'still one row, new portion');
select pg_temp.ok(pg_temp.affected($$insert into public.food_entries (client_id, person_id, eaten_at, meal, name) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', now(), 'lunch', 'Dup') on conflict (client_id) do nothing$$) = 0, 'ignore-duplicates keeps the first row');
-- updated_at moves, created_at and client_id do not
reset role;
create table pg_temp.stamp as select created_at, updated_at from public.food_entries where client_id = '20000000-0000-0000-0000-000000000001';
select pg_sleep(0.05);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.affected($$update public.food_entries set name = 'Chicken adobo (edited)' where client_id = '20000000-0000-0000-0000-000000000001'$$) = 1, 'self edits own row');
reset role;
select pg_temp.ok((select f.updated_at > s.updated_at and f.created_at = s.created_at from public.food_entries f, pg_temp.stamp s where f.client_id = '20000000-0000-0000-0000-000000000001'), 'updated_at advances, created_at stays');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.fails($$update public.food_entries set client_id = gen_random_uuid() where client_id = '20000000-0000-0000-0000-000000000001'$$), 'client_id cannot change');
select pg_temp.ok(pg_temp.fails($$update public.food_entries set person_id = '10000000-0000-0000-0000-0000000000c1' where client_id = '20000000-0000-0000-0000-000000000001'$$), 'a row cannot be moved to another person');
select pg_temp.ok(pg_temp.fails($$update public.water_entries set person_id = '10000000-0000-0000-0000-0000000000c1' where client_id = '30000000-0000-0000-0000-000000000001'$$), 'a water row cannot be moved either');
-- soft delete, no hard delete
select pg_temp.ok(pg_temp.affected($$update public.water_entries set deleted_at = now() where client_id = '30000000-0000-0000-0000-000000000001'$$) = 1, 'soft delete is an update of deleted_at');
select pg_temp.ok((select count(*) from public.water_entries where deleted_at is not null) = 1, 'the tombstone stays readable');
select pg_temp.ok(pg_temp.fails($$delete from public.food_entries$$), 'hard delete is refused');
reset role;

-- writer carer B writes for PC (child, no login)
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.affected($$insert into public.food_entries (person_id, eaten_at, meal, name, kcal, sodium_mg) values ('10000000-0000-0000-0000-0000000000c1', now(), 'breakfast', 'Test lugaw', 120, 480)$$) = 1, 'writer carer inserts for the child');
select pg_temp.ok(pg_temp.affected($$insert into public.nutrition_goals (person_id, sodium_mg) values ('10000000-0000-0000-0000-0000000000c1', 1500)$$) = 1, 'writer carer sets the child salt goal');
select pg_temp.ok((select sodium_mg = 1500 and water_ml = 1500 from public.nutrition_goals where person_id = '10000000-0000-0000-0000-0000000000c1'), 'goal: sodium as set, water default 1500');
reset role;
-- a goal row with defaults only
insert into public.nutrition_goals (person_id) values ('10000000-0000-0000-0000-0000000000b1');
select pg_temp.ok((select sodium_mg = 2000 and water_ml = 1500 from public.nutrition_goals where person_id = '10000000-0000-0000-0000-0000000000b1'), 'goal defaults are 2000 mg and 1500 ml');
select pg_temp.ok(pg_temp.fails($$insert into public.nutrition_goals (person_id, sodium_mg) values ('10000000-0000-0000-0000-0000000000a1', 100)$$), 'a 100 mg goal is out of range');

-- read-only carer F: reads the child, cannot write
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000f';
select pg_temp.ok((select count(*) from public.food_entries where person_id = '10000000-0000-0000-0000-0000000000c1') = 1, 'read-only carer reads the child food rows');
select pg_temp.ok((select count(*) from public.nutrition_goals where person_id = '10000000-0000-0000-0000-0000000000c1') = 1, 'read-only carer reads the child goal');
select pg_temp.ok((select count(*) from public.food_entries where person_id = '10000000-0000-0000-0000-0000000000b1') = 0, 'read-only carer does not read an unrelated person');
select pg_temp.ok(pg_temp.fails($$insert into public.food_entries (person_id, eaten_at, meal, name) values ('10000000-0000-0000-0000-0000000000c1', now(), 'lunch', 'x')$$), 'read-only carer cannot insert');
select pg_temp.ok(pg_temp.affected($$update public.food_entries set name = 'x' where person_id = '10000000-0000-0000-0000-0000000000c1'$$) = 0, 'read-only carer updates 0 rows');
select pg_temp.ok(pg_temp.affected($$update public.nutrition_goals set sodium_mg = 2500 where person_id = '10000000-0000-0000-0000-0000000000c1'$$) = 0, 'read-only carer cannot change the goal');
reset role;

-- stranger E sees and writes nothing
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select pg_temp.ok((select count(*) from public.food_entries) = 0 and (select count(*) from public.water_entries) = 0 and (select count(*) from public.nutrition_goals) = 0, 'stranger reads nothing');
select pg_temp.ok(pg_temp.fails($$insert into public.food_entries (person_id, eaten_at, meal, name) values ('10000000-0000-0000-0000-0000000000b1', now(), 'lunch', 'x')$$), 'stranger cannot insert for B');
select pg_temp.ok(pg_temp.fails($$insert into public.nutrition_goals (person_id) values ('10000000-0000-0000-0000-0000000000a1')$$), 'stranger cannot set a goal for A');
reset role;

-- admin reads and writes
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.food_entries) = 3, 'admin reads every food row (3)');
select pg_temp.ok(pg_temp.affected($$insert into public.food_entries (person_id, eaten_at, meal, name) values ('10000000-0000-0000-0000-0000000000c1', now(), 'dinner', 'Test admin row')$$) = 1, 'admin inserts for the child');
select pg_temp.ok(pg_temp.affected($$update public.nutrition_goals set sodium_mg = 2000 where person_id = '10000000-0000-0000-0000-0000000000c1'$$) = 1, 'admin updates a goal');
reset role;

-- archived people behave like activity: the person row stays, so rows stay and carer access is unchanged
insert into public.activity (person_id, kind, started_at, source) values ('10000000-0000-0000-0000-0000000000c1', 'walk', now(), 'manual');
create table pg_temp.before as select
  (select count(*) from public.activity where person_id = '10000000-0000-0000-0000-0000000000c1') as act,
  (select count(*) from public.food_entries where person_id = '10000000-0000-0000-0000-0000000000c1') as food;
grant select on pg_temp.before to authenticated;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.admin_set_archived('10000000-0000-0000-0000-0000000000c1', true);
reset role;
select pg_temp.ok((select archived_at is not null from public.people where id = '10000000-0000-0000-0000-0000000000c1'), 'the child is archived');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.activity where person_id = '10000000-0000-0000-0000-0000000000c1') = (select act from pg_temp.before)
  and (select count(*) from public.food_entries where person_id = '10000000-0000-0000-0000-0000000000c1') = (select food from pg_temp.before), 'archived: food rows stay exactly as visible as activity rows (no change)');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.admin_set_archived('10000000-0000-0000-0000-0000000000c1', false);
reset role;

-- deleting a person removes their rows (on delete cascade)
delete from public.people where id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select count(*) from public.food_entries where person_id = '10000000-0000-0000-0000-0000000000c1') = 0 and (select count(*) from public.nutrition_goals where person_id = '10000000-0000-0000-0000-0000000000c1') = 0, 'a deleted person takes their food rows and goal with them');
rollback;

-- ===== down, then up again =====
\ir ../migrations/0024_nutrition.down.sql
select pg_temp.ok(to_regclass('public.food_entries') is null and to_regclass('public.water_entries') is null and to_regclass('public.nutrition_goals') is null and to_regprocedure('public.nutrition_touch()') is null, 'down drops the three tables and the trigger function');
\ir ../migrations/0024_nutrition.down.sql
\ir ../migrations/0024_nutrition.sql
select pg_temp.ok(to_regclass('public.food_entries') is not null and to_regclass('public.water_entries') is not null and to_regclass('public.nutrition_goals') is not null, 'up again after down works');
\echo ALL PASS
