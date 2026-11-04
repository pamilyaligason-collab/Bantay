-- Undo 0049_world_news.sql. Safe to run twice. Drops the headlines table (public news only; the next world-news run would refill it).
drop policy if exists world_news_read on public.world_news;
drop index if exists public.world_news_seen;
drop table if exists public.world_news;
