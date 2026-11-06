-- Undo 0051: drop the Discover news columns. Safe to run twice.
drop index if exists public.news_items_topic_published_idx;
alter table public.news_items drop constraint if exists news_items_topic_check;
alter table public.news_items drop constraint if exists news_items_image_url_check;
alter table public.news_items drop column if exists topic;
alter table public.news_items drop column if exists image_url;
