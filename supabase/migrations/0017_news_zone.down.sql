-- Undo 0017_news_zone.sql. Drops the zone tags (the news rows stay). Safe to run twice.
drop index if exists public.news_items_zone_published_idx;
alter table public.news_items drop column if exists zone;
