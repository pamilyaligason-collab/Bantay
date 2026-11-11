# S33 contract (Lloyd approved 2026-11-11: "Approve, build it")

Goal: the Discover Watch shelves (Be prepared, Farming and DIY, Recipe videos) refresh daily from trusted channels; the 55 hand-checked videos in src/data/discover/ready.json stay as the fallback. Listen stays fixed.

| Lane | Owns (only these) | PW_PORT | Migration |
|---|---|---|---|
| L1 Watch feed | supabase/functions/watch-feed/**, supabase/migrations/0067_watch_videos*.sql, ops/sql/watch_feed_cron.sql, src/features/discover/watch/** + src/features/discover/learn/ready.ts (merge fresh + curated only), admin System health JOBS row + notify/inApp JOB_LABELS 'watch-feed', e2e/s33-*.spec.ts | 5361 | 0067 |

Rules
- Reuse supabase/functions/yt-feed/feed.ts parsing (import or move shared bits to supabase/functions/_shared/ytFeed.ts; yt-feed keeps working, its tests stay green). RSS only (youtube.com/feeds/videos.xml), no API key needed; oEmbed (youtube.com/oembed) is the playable check; no other new host.
- Channels (verify each real channel ID by fetching its RSS; drop any that fails or has no upload in 60 days and list it): Be prepared: DOST-PAGASA, Philippine Red Cross, Office of Civil Defense/NDRRMC. Farming and DIY: Department of Agriculture Philippines, Agricultural Training Institute (ATI). Recipe videos: Panlasang Pinoy, Kawaling Pinoy.
- Filters: published within 30 days; not a Short (#shorts in title or /shorts/ link) nor a livestream placeholder; oEmbed 200; title matches the shelf's keyword list (en + tl). Keep at most 10 per shelf, newest first. Purge rows older than 60 days.
- Table watch_videos: video_id pk (11 chars), shelf (check in prepping|farm-diy|recipes), channel_id, channel, title, published_at, fetched_at; RLS on, select to authenticated, writes service_role only.
- Function: secret header like da-prices (WATCH_CRON_SECRET), heartbeat job 'watch-feed' with counts only, runs under 150 s (budget per fetch).
- Client: shelf = fresh rows (marked "New") first, then curated, no duplicates; offline / table missing / job failing -> curated only, no error shown to the family.
- Never deploy, push, apply SQL. Repo PUBLIC. Playwright --workers=1.
