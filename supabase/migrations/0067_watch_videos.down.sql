-- Undo 0067_watch_videos.sql. Safe to run twice. Drops the watch video table (public video titles only; the next watch-feed run would refill it, and the Watch shelves fall back to the checked list meanwhile).
drop policy if exists watch_videos_read on public.watch_videos;
drop index if exists public.watch_videos_newest;
drop index if exists public.watch_videos_shelf_newest;
drop table if exists public.watch_videos;
