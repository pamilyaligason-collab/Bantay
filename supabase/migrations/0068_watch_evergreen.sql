-- Family Bantay S34 (lane L1): watch_videos.evergreen, the older videos of the trusted channels (the back catalogue) shown on the Discover Watch shelves under "More from these channels".
-- Needs 0067 (watch_videos). Written only; applied ONLY when the owner says "apply 0068", BEFORE the watch-feed function is redeployed (the daily purge now filters on this column). Safe to run twice. Undo: 0068_watch_evergreen.down.sql.
--
-- * evergreen = true marks a row the monthly backfill added; the daily 60-day purge (in the watch-feed function) keeps those rows. A row published in the last 30 days is never evergreen.
-- * No new grant, policy or index: the table's select-only client grant and the service-role writer from 0067 cover the new column. The backfill keeps at most 30 evergreen rows per shelf (ML-06).

alter table public.watch_videos add column if not exists evergreen boolean not null default false;
create index if not exists watch_videos_evergreen_shelf on public.watch_videos (shelf, published_at desc) where evergreen;
