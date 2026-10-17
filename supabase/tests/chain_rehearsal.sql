-- Chain rehearsal: 0001 -> 0002 -> 0003 -> 0004 in order on a THROWAWAY Postgres, with the REAL is_admin() from 0002
-- (lane rehearsals each stub it). Never the live project.
-- Run from WSL in supabase/tests: createdb bantay_chain; psql -X -v ON_ERROR_STOP=1 -d bantay_chain -f chain_rehearsal.sql
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
 ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com',  '{"provider":"google"}', '{}'),
 ('00000000-0000-0000-0000-0000000000b1', 'member@example.com', '{"provider":"google"}', '{}');

\ir ../migrations/0001_health.sql
\ir ../migrations/0002_auth.sql
\ir ../migrations/0003_sync.sql
\ir ../migrations/0004_admin.sql

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text) to authenticated, anon;

insert into public.app_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'admin'), ('00000000-0000-0000-0000-0000000000b1', 'member');
insert into public.people (id, auth_user_id, display_name, created_by) values
 ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Test B', '00000000-0000-0000-0000-0000000000b1');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(not public.is_admin(), 'member is not admin (real is_admin)');
select pg_temp.ok(pg_temp.fails($$select * from public.admin_usage_summary(7)$$), 'member cannot call admin_usage_summary');
select pg_temp.ok(not pg_temp.fails($$insert into public.usage_events (kind, name, app_version, client_id) values ('screen', 'today', '1.0.0', '20000000-0000-0000-0000-000000000001') on conflict (client_id) do nothing$$), 'member logs a usage event');
select pg_temp.ok(not pg_temp.fails($$insert into public.usage_events (kind, name, app_version, client_id) values ('screen', 'today', '1.0.0', '20000000-0000-0000-0000-000000000001') on conflict (client_id) do nothing$$), 'retried usage event is a no-op');
select pg_temp.ok(not pg_temp.fails($$insert into public.activity (person_id, kind, minutes, started_at, source) values ('10000000-0000-0000-0000-0000000000b1', 'walk', 20, now(), 'manual')$$), 'member syncs own activity (0003 on 0001)');
select pg_temp.ok(pg_temp.fails($$insert into public.safety_overrides (kind, key, data) values ('hotline', 'hl-911', '{}')$$), 'member cannot write safety_overrides (real is_admin)');

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.ok(public.is_admin(), 'admin is admin (real is_admin)');
select pg_temp.ok(not pg_temp.fails($$select * from public.admin_usage_summary(7)$$), 'admin calls admin_usage_summary');
select pg_temp.ok(not pg_temp.fails($$insert into public.safety_overrides (kind, key, data) values ('hotline', 'hl-911', '{"phone":"911"}')$$), 'admin writes safety_overrides');
select pg_temp.ok(pg_temp.fails($$insert into public.carers (carer_id, person_id, can_write) values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', true)$$), 'admin cannot grant edit access (D-22)');
select pg_temp.ok((select count(*) from public.readings) = 0, 'admin role alone reads no readings');
reset role;
\echo REHEARSAL DONE
