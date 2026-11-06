-- Family Bantay session 22 (D-135), lane F: news_items gains image_url and topic, for the Discover News view. Written only; applied ONLY when the owner says "apply 0051". Safe to run twice.
-- The app reads both columns when present and works without them (a coloured tile with the source mark), so the app needs no gate. The world-news function DOES: it writes both columns, so apply 0051 before deploying world-news (order: 0051, function, then cron).
--
-- * image_url: the article picture from the feed (media:content / media:thumbnail / image enclosure), http(s) only. Null when the feed has none and always null for BBC (no BBC images).
-- * topic: where Discover files the row. Written by the world-news function; older rows stay null. 'world' is allowed for completeness; the function writes the other four.
-- * No new grant or policy: news_items keeps its public read policy and no client write grant (0005). Undo: 0051_news_images_topics.down.sql.

alter table public.news_items add column if not exists image_url text null;
alter table public.news_items add column if not exists topic text null;

alter table public.news_items drop constraint if exists news_items_image_url_check;
alter table public.news_items add constraint news_items_image_url_check check (image_url is null or (length(image_url) <= 2000 and image_url ~* '^https?://'));

alter table public.news_items drop constraint if exists news_items_topic_check;
alter table public.news_items add constraint news_items_topic_check check (topic is null or topic in ('prepping', 'health', 'national', 'wellbeing', 'world'));

create index if not exists news_items_topic_published_idx on public.news_items (topic, published_at desc);
