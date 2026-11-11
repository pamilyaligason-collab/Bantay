-- Family Bantay S33 (lane L1): watch_videos, the fresh videos behind the Discover Watch shelves (Be prepared, Farming and DIY, Recipe videos).
-- Needs nothing earlier. Written only; applied ONLY when the owner says "apply 0067". The app never requires it (a missing table leaves the shelves on the checked list in ready.json). Safe to run twice. Undo: 0067_watch_videos.down.sql.
--
-- * One row per YouTube video: a rerun of the watch-feed function upserts the same row. Public video titles only: no person's data, no location.
-- * Readers: any signed-in user. Writer: the watch-feed edge function with the service role. The 60-day purge runs in that function (ML-06); the CHECKs cap field sizes and name the three shelves.
-- * No client insert/update/delete policy exists, and the grants below give the client select only.
-- * The daily schedule (05:00 Manila) is applied by the owner after the deploy (ops/sql/watch_feed_cron.sql), not here.

create table if not exists public.watch_videos (
  video_id text primary key check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  shelf text not null check (shelf in ('prepping', 'farm-diy', 'recipes')),
  channel_id text not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  channel text not null check (length(channel) between 1 and 80),
  title text not null check (length(title) between 1 and 300),
  published_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
create index if not exists watch_videos_shelf_newest on public.watch_videos (shelf, published_at desc);
create index if not exists watch_videos_newest on public.watch_videos (published_at desc);

alter table public.watch_videos enable row level security;
revoke all on public.watch_videos from anon, authenticated;
grant select on public.watch_videos to authenticated;
grant select, insert, update, delete on public.watch_videos to service_role;
drop policy if exists watch_videos_read on public.watch_videos;
create policy watch_videos_read on public.watch_videos for select to authenticated using (true);
