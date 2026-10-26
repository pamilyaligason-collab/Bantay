-- Undo 0025_knowledge.sql. Safe to run twice. Drops the search function and both reference tables; no person data is touched.
begin;
drop function if exists public.search_knowledge(text, integer);
drop table if exists public.knowledge_synonyms;
drop table if exists public.knowledge_topics;
commit;
