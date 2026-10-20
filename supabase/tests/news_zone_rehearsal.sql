-- Rehearsal for 0017_news_zone.sql on a THROWAWAY Postgres (never the live project).
-- Run: psql -X -q -v ON_ERROR_STOP=1 -d <scratch db> -f supabase/tests/news_zone_rehearsal.sql (migrations are included by relative path).
\set ON_ERROR_STOP on
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
             if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
-- 0005 also makes assistant_usage, which needs auth.users and auth.uid()
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;
\ir ../migrations/0005_news_assistant.sql
create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean,text) to authenticated, anon;

-- A row that exists before the migration keeps working and gets zone null.
insert into public.news_items (id, title, url, source, kind, published_at) values ('old1', 'Old item', 'https://a.test/old', 'PIA', 'article', now());

\ir ../migrations/0017_news_zone.sql
select pg_temp.ok((select zone is null from public.news_items where id = 'old1'), 'existing rows get zone null');
select pg_temp.ok((select is_nullable = 'YES' and data_type = 'text' from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='zone'), 'zone is a nullable text column');
select pg_temp.ok(exists (select 1 from pg_indexes where schemaname='public' and tablename='news_items' and indexname='news_items_zone_published_idx'), 'zone index exists');
\ir ../migrations/0017_news_zone.sql
select pg_temp.ok((select count(*) from pg_indexes where tablename='news_items' and indexname='news_items_zone_published_idx') = 1, 'migration is idempotent (second run changes nothing)');

insert into public.news_items (id, title, url, source, kind, published_at, zone) values
  ('d1', 'Davao item', 'https://a.test/d1', 'PIA', 'article', now(), 'davao'),
  ('c1', 'Cebu item', 'https://a.test/c1', 'PIA', 'article', now(), 'cebu');

set role anon;
select pg_temp.ok((select count(*) from public.news_items where zone is null or zone = 'davao') = 2, 'anon reads the app filter: zone null or my zone');
select pg_temp.ok((select count(*) from public.news_items) = 3, 'RLS unchanged: anon still reads every row');
select pg_temp.ok(pg_temp.fails($$insert into public.news_items (id,title,url,source,kind,published_at,zone) values ('x','t','https://a.test','s','article',now(),'davao')$$), 'anon cannot insert');
select pg_temp.ok(pg_temp.fails($$update public.news_items set zone = 'cebu'$$), 'anon cannot retag');
reset role;
set role authenticated;
select pg_temp.ok(pg_temp.fails($$update public.news_items set zone = 'cebu'$$), 'authenticated cannot retag');
select pg_temp.ok(pg_temp.fails($$delete from public.news_items$$), 'authenticated cannot delete');
reset role;

\ir ../migrations/0017_news_zone.down.sql
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='zone'), 'down drops the column');
select pg_temp.ok((select count(*) from public.news_items) = 3, 'down keeps the news rows');
\ir ../migrations/0017_news_zone.down.sql
\echo REHEARSAL DONE
