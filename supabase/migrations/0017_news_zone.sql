-- News by place (Session 6 lane M5, PART-3 section 4). Adds a nullable `zone` to news_items so the app can show news for the
-- person's area. zone is a Quick dial area id (gensan, tagbilaran, davao, cebu, manila, texas); null = news for everyone.
-- n8n sets it (Lloyd's block). Existing rows keep null. RLS and grants are unchanged. Written only; never applied from a lane.
-- Safe to run twice.
alter table public.news_items add column if not exists zone text;
create index if not exists news_items_zone_published_idx on public.news_items (zone, published_at desc);
