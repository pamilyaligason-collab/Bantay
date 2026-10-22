-- Rehearsal for 0026_nutrition_v2.sql on a THROWAWAY Postgres (never the live project). Same stub and helpers as nutrition_rehearsal.sql; 0024 is applied first.
-- Run (WSL Postgres or any local Postgres 15+), from supabase/tests:
--   su postgres -c 'dropdb --if-exists bantay_nutrition_v2; createdb bantay_nutrition_v2; psql -X -q -v ON_ERROR_STOP=1 -d bantay_nutrition_v2 -f nutrition_v2_rehearsal.sql'
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
-- seed before 0026 so the "old row" check below is real
insert into public.food_entries (client_id, person_id, eaten_at, meal, name, kcal) values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000b1', now(), 'lunch', 'Old row', 100);
insert into public.nutrition_goals (person_id) values ('10000000-0000-0000-0000-0000000000b1');
\ir ../migrations/0026_nutrition_v2.sql
-- 0026 must be safe to run twice
\ir ../migrations/0026_nutrition_v2.sql

begin;
select pg_temp.ok((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'food_entries' and column_name in ('carbs_g','fat_g','sat_fat_g','fiber_g','sugars_g','calcium_mg','iron_mg','magnesium_mg','vitd_ug','b12_ug') and is_nullable = 'YES') = 10, 'ten nullable nutrient columns on food_entries');
select pg_temp.ok((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'nutrition_goals' and column_name in ('potassium_mg','sex') and is_nullable = 'YES') = 2, 'potassium_mg and sex are nullable on nutrition_goals');
select pg_temp.ok((select carbs_g is null and vitd_ug is null and b12_ug is null from public.food_entries where name = 'Old row'), 'an old row gets null, never 0, for the new nutrients');
select pg_temp.ok((select potassium_mg is null and sex is null from public.nutrition_goals where person_id = '10000000-0000-0000-0000-0000000000b1'), 'an old goal has no potassium limit and no sex');

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok(pg_temp.affected($$insert into public.food_entries (client_id, person_id, eaten_at, meal, name, kcal, carbs_g, fat_g, sat_fat_g, fiber_g, sugars_g, calcium_mg, iron_mg, magnesium_mg, vitd_ug, b12_ug)
  values ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000b1', now(), 'dinner', 'New row', 200, 30.5, 5, 1.2, 3, 4, 120, 2.5, 60, 1.5, 0.75)$$) = 1, 'self inserts a row with the new nutrients');
select pg_temp.ok(pg_temp.affected($$update public.food_entries set carbs_g = null, vitd_ug = null where client_id = '20000000-0000-0000-0000-0000000000a2'$$) = 1, 'a nutrient can go back to unknown (null)');
select pg_temp.ok(pg_temp.fails($$insert into public.food_entries (person_id, eaten_at, meal, name, iron_mg) values ('10000000-0000-0000-0000-0000000000b1', now(), 'lunch', 'x', -1)$$), 'a negative nutrient is refused');
select pg_temp.ok(pg_temp.fails($$insert into public.food_entries (person_id, eaten_at, meal, name, b12_ug) values ('10000000-0000-0000-0000-0000000000e1', now(), 'lunch', 'x', 1)$$), 'RLS unchanged: self cannot write for an unrelated person');
select pg_temp.ok(pg_temp.affected($$update public.nutrition_goals set potassium_mg = 2500, sex = 'female' where person_id = '10000000-0000-0000-0000-0000000000b1'$$) = 1, 'self sets a potassium limit and sex');
select pg_temp.ok(pg_temp.affected($$update public.nutrition_goals set potassium_mg = null where person_id = '10000000-0000-0000-0000-0000000000b1'$$) = 1, 'the potassium limit can be cleared to null');
select pg_temp.ok(pg_temp.fails($$update public.nutrition_goals set potassium_mg = 100 where person_id = '10000000-0000-0000-0000-0000000000b1'$$), 'a 100 mg potassium limit is out of range');
select pg_temp.ok(pg_temp.fails($$update public.nutrition_goals set sex = 'other' where person_id = '10000000-0000-0000-0000-0000000000b1'$$), 'sex is female, male or null');
reset role;
rollback;

-- ===== down, then up again =====
\ir ../migrations/0026_nutrition_v2.down.sql
select pg_temp.ok((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'food_entries' and column_name in ('carbs_g','b12_ug')) = 0 and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'nutrition_goals' and column_name in ('potassium_mg','sex')) = 0, 'down drops the new columns');
select pg_temp.ok(to_regclass('public.food_entries') is not null and (select count(*) from public.food_entries where name = 'Old row') = 1, 'down keeps the meal rows');
\ir ../migrations/0026_nutrition_v2.down.sql
\ir ../migrations/0026_nutrition_v2.sql
select pg_temp.ok((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'food_entries' and column_name = 'vitd_ug') = 1, 'up again restores the columns');
\echo ALL PASS
