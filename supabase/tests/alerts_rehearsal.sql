-- RLS rehearsal for 0007_safety_alerts.sql on a THROWAWAY Postgres (never the live project).
-- Run: psql -X -v ON_ERROR_STOP=1 -d <scratch db> -f supabase/tests/alerts_rehearsal.sql (the migration is included by relative path).
\set ON_ERROR_STOP on
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
             if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
grant usage on schema public to authenticated, anon;
\ir ../migrations/0007_safety_alerts.sql
create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean,text) to authenticated, anon;

-- Owner (stands in for the service role, which bypasses RLS) writes.
insert into public.safety_alerts (id, kind, title, what, where_text, when_text, do_now, source, issued_at, bulletin, expires_at)
values ('usgs-t1', 'quake', 'M 5.1', 'w', 'Ormoc', 'now', 'Drop, cover and hold on.', 'USGS', now(), 'b', null),
       ('air-t1', 'air', 'Air', 'w', 'Tagbilaran', 'now', 'x', 'Open-Meteo', now(), 'b', now() + interval '3 hours');
select pg_temp.ok((select count(*) from public.safety_alerts) = 2, 'service role writes (owner)');
select pg_temp.ok((select stale from public.safety_alerts where id = 'usgs-t1') = false and (select lat from public.safety_alerts where id = 'usgs-t1') is null, 'stale defaults to false, unknown lat stays null');
select pg_temp.ok(pg_temp.fails($$insert into public.safety_alerts (id, kind, title, what, where_text, when_text, do_now, source, issued_at, bulletin) values ('bad', 'meteor', 't','w','w','w','d','s', now(), 'b')$$), 'unknown kind refused by check constraint');
select pg_temp.ok(pg_temp.fails($$insert into public.safety_alerts (id, kind, title, what, where_text, when_text, do_now, source, issued_at, bulletin, lat) values ('bad2', 'quake', 't','w','w','w','d','s', now(), 'b', 95)$$), 'latitude out of range refused');

set role anon;
select pg_temp.ok(pg_temp.fails($$select * from public.safety_alerts$$), 'anon cannot select');
reset role;

set role authenticated;
select pg_temp.ok((select count(*) from public.safety_alerts) = 2, 'authenticated can select');
select pg_temp.ok((select count(*) from public.safety_alerts where expires_at is null or expires_at > now()) = 2, 'active filter used by the app works');
select pg_temp.ok(pg_temp.fails($$insert into public.safety_alerts (id, kind, title, what, where_text, when_text, do_now, source, issued_at, bulletin) values ('mine', 'quake', 't','w','w','w','d','s', now(), 'b')$$), 'authenticated cannot insert');
select pg_temp.ok(pg_temp.fails($$update public.safety_alerts set title = 'hijack'$$), 'authenticated has no update grant');
select pg_temp.ok(pg_temp.fails($$delete from public.safety_alerts$$), 'authenticated cannot delete');
reset role;
select pg_temp.ok((select count(*) from public.safety_alerts where title = 'hijack') = 0, 'rows are unchanged after the attempts');
\echo REHEARSAL DONE
