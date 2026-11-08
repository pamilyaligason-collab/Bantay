-- Family Bantay S25 (lane C): news_videos, the latest regional news videos behind the "Regional news" section on Discover (D-155, D-159).
-- Needs nothing earlier. Written only; applied ONLY when the owner says "apply 0055". The app never requires it (a missing table hides the section). Safe to run twice. Undo: 0055_news_videos.down.sql.
--
-- * One row per YouTube video: a rerun of the yt-feed function upserts the same row. Public video titles only: no person's data, no location.
-- * Readers: any signed-in user. Writer: the yt-feed edge function with the service role. The 3-day trim runs in that function (ML-06); the CHECKs cap field sizes.
-- * No client insert/update/delete policy exists, and the grants below give the client select only.
-- * The cron schedule (every 30 minutes) is applied by the owner after the deploy (ops/sql/yt_feed_cron.sql), not here.

create table if not exists public.news_videos (
  video_id text primary key check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_id text not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  channel text not null check (length(channel) between 1 and 80),
  title text not null check (length(title) between 1 and 300),
  published_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
create index if not exists news_videos_newest on public.news_videos (published_at desc);
create index if not exists news_videos_channel on public.news_videos (channel_id, published_at desc);

alter table public.news_videos enable row level security;
revoke all on public.news_videos from anon, authenticated;
grant select on public.news_videos to authenticated;
grant select, insert, update, delete on public.news_videos to service_role;
drop policy if exists news_videos_read on public.news_videos;
create policy news_videos_read on public.news_videos for select to authenticated using (true);
