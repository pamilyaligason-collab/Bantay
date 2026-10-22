-- Rehearsal for 0025_knowledge.sql on a THROWAWAY Postgres (never the live project). The migration needs nothing from earlier ones, so only the Supabase roles and auth.uid() are stubbed.
-- Run (WSL Postgres or any local Postgres 15+), from supabase/tests:
--   su postgres -c 'dropdb --if-exists bantay_knowledge; createdb bantay_knowledge; psql -X -q -v ON_ERROR_STOP=1 -d bantay_knowledge -f knowledge_rehearsal.sql'
-- Actors: M a signed-in member (any authenticated user may read; nobody may write); anon.
-- The checks run inside begin ... rollback; the up/down/up check follows.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant usage on schema public to authenticated, anon, service_role;
-- Supabase's default privileges give anon and authenticated every right on new public tables and functions; the migration must take them back.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

create function pg_temp.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c then raise notice 'PASS %', msg; else raise exception 'FAIL %', msg; end if; end $$;
-- first slug returned for a question, as the caller; null when nothing matches
create function pg_temp.top(q text) returns text language sql as $$ select slug from public.search_knowledge(q) limit 1 $$;
grant execute on function pg_temp.fails(text), pg_temp.ok(boolean, text), pg_temp.top(text) to authenticated, anon, service_role;

\ir ../migrations/0025_knowledge.sql
-- 0025 must be safe to run twice (and re-seeding must not duplicate rows)
\ir ../migrations/0025_knowledge.sql

-- === checks ===
begin;
select pg_temp.ok((select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('knowledge_topics', 'knowledge_synonyms') and relrowsecurity) = 2, 'RLS is on for both tables');
select pg_temp.ok((select count(*) from public.knowledge_topics) >= 40, 'at least 40 topics are seeded');
select pg_temp.ok((select count(*) from public.knowledge_topics t where not exists (select 1 from public.knowledge_synonyms y where y.topic_slug = t.slug)) = 0, 'every topic has at least one synonym');
select pg_temp.ok((select count(*) from public.knowledge_topics where source_url !~ '^https://' or summary = '' or reviewed_at is null) = 0, 'every topic has a source and a review date');
select pg_temp.ok((select count(*) from public.knowledge_topics) = (select count(distinct slug) from public.knowledge_topics), 'slugs are unique');

-- anon gets nothing: not the tables, not the function
set role anon;
select pg_temp.ok(pg_temp.fails($$select count(*) from public.knowledge_topics$$), 'anon cannot read topics');
select pg_temp.ok(pg_temp.fails($$select count(*) from public.knowledge_synonyms$$), 'anon cannot read synonyms');
select pg_temp.ok(pg_temp.fails($$select * from public.search_knowledge('altapresyon')$$), 'anon cannot call search_knowledge');
reset role;
select pg_temp.ok(not has_function_privilege('anon', 'public.search_knowledge(text, integer)', 'execute') and not has_function_privilege('public', 'public.search_knowledge(text, integer)', 'execute'), 'execute is not granted to anon or PUBLIC');
select pg_temp.ok(not exists (select 1 from pg_proc where proname = 'search_knowledge' and pronamespace = 'public'::regnamespace and prosecdef), 'search_knowledge is security invoker');

-- authenticated reads and searches, and cannot write
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.knowledge_topics) >= 40, 'authenticated reads topics');
select pg_temp.ok((select count(*) from public.knowledge_synonyms) > 40, 'authenticated reads synonyms');
select pg_temp.ok(pg_temp.fails($$insert into public.knowledge_topics (slug, title_en, title_tl, summary, source_name, source_url, reviewed_at) values ('zz-test', 'x', 'x', 'A plain summary that is long enough to pass the check.', 'NHS', 'https://www.nhs.uk/', current_date)$$), 'authenticated cannot insert a topic');
select pg_temp.ok(pg_temp.fails($$update public.knowledge_topics set summary = 'A plain summary that is long enough to pass the check.' where slug = 'dizziness'$$), 'authenticated cannot update a topic');
select pg_temp.ok(pg_temp.fails($$delete from public.knowledge_topics$$), 'authenticated cannot delete topics');
select pg_temp.ok(pg_temp.fails($$insert into public.knowledge_synonyms (term, topic_slug) values ('zz', 'dizziness')$$), 'authenticated cannot add a synonym');
select pg_temp.ok(pg_temp.fails($$delete from public.knowledge_synonyms$$), 'authenticated cannot delete synonyms');

-- search: synonyms in English, Tagalog and Taglish; English full text; the shape of the result
select pg_temp.ok(pg_temp.top('altapresyon') = 'high-blood-pressure', 'Tagalog altapresyon finds high blood pressure');
select pg_temp.ok(pg_temp.top('Mataas ang BP ko') in ('high-blood-pressure', 'bp-reading'), 'Taglish "Mataas ang BP ko" finds blood pressure');
select pg_temp.ok(pg_temp.top('nahihilo ako paggising') = 'dizziness', 'Taglish nahihilo finds dizziness');
select pg_temp.ok(pg_temp.top('stroke') = 'stroke-fast', 'stroke finds the FAST card first');
select pg_temp.ok(pg_temp.top('face drooping, slurred speech') = 'stroke-fast', 'English words in the text find the FAST card');
select pg_temp.ok(pg_temp.top('metformin') = 'med-metformin', 'a medicine name finds its card');
select pg_temp.ok(pg_temp.top('Lasix') = 'med-furosemide', 'a brand name finds the generic card');
select pg_temp.ok(pg_temp.top('hypertension') = 'high-blood-pressure', 'English hypertension finds high blood pressure');
select pg_temp.ok(pg_temp.top('bagoong at patis') = 'low-salt-eating', 'Tagalog food words find low-salt eating');
select pg_temp.ok(pg_temp.top('hindi makatulog') = 'insomnia', 'hindi makatulog finds insomnia');
select pg_temp.ok(pg_temp.top('ALTAPRESYON!!!') = 'high-blood-pressure', 'case and punctuation do not matter');
select pg_temp.ok((select count(*) from public.search_knowledge('')) = 0 and (select count(*) from public.search_knowledge(null)) = 0 and (select count(*) from public.search_knowledge('   ')) = 0, 'empty, blank and null questions return nothing');
select pg_temp.ok((select count(*) from public.search_knowledge('qwxzv plmok')) = 0, 'nonsense returns nothing');
select pg_temp.ok((select count(*) from public.search_knowledge('blood pressure salt sugar heart', 3)) = 3, 'max_rows limits the result');
select pg_temp.ok((select count(*) from public.search_knowledge('blood pressure salt sugar heart', 500)) <= 10 and (select count(*) from public.search_knowledge('blood pressure salt sugar heart', 0)) = 1 and (select count(*) from public.search_knowledge('blood pressure salt sugar heart', null)) <= 5, 'max_rows is held between 1 and 10 (null means 5)');
select pg_temp.ok((select count(*) from public.search_knowledge(repeat('altapresyon ', 500))) >= 1, 'a very long question is cut, not refused');
select pg_temp.ok((select bool_and(source_url ~ '^https://' and reviewed_at is not null and rank > 0) from public.search_knowledge('dehydration init uhaw', 10)), 'every hit carries its source, review date and a positive rank');
select pg_temp.ok(pg_temp.fails($$select * from public.search_knowledge('x'' or 1=1 --')$$) = false, 'a quote in the question is just text');
reset role;

-- the owner (what the migration and the service role act as) can still reseed
update public.knowledge_topics set reviewed_at = current_date where slug = 'dizziness';
select pg_temp.ok((select reviewed_at = current_date from public.knowledge_topics where slug = 'dizziness'), 'the owner can update a topic');
rollback;

-- ===== down, then up again =====
\ir ../migrations/0025_knowledge.down.sql
select pg_temp.ok(to_regclass('public.knowledge_topics') is null and to_regclass('public.knowledge_synonyms') is null and to_regprocedure('public.search_knowledge(text, integer)') is null, 'down drops both tables and the function');
\ir ../migrations/0025_knowledge.down.sql
\ir ../migrations/0025_knowledge.sql
select pg_temp.ok(to_regclass('public.knowledge_topics') is not null and to_regprocedure('public.search_knowledge(text, integer)') is not null and (select count(*) from public.knowledge_topics) >= 40, 'up again after down works and reseeds');
\echo ALL PASS
