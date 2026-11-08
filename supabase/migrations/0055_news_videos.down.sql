-- Undo 0055_news_videos.sql. Safe to run twice. Drops the news video table (public video titles only; the next yt-feed run would refill it).
drop policy if exists news_videos_read on public.news_videos;
drop index if exists public.news_videos_channel;
drop index if exists public.news_videos_newest;
drop table if exists public.news_videos;
