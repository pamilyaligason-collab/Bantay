# S34 contract (Lloyd 2026-11-11: "search and re run also previous unfeatured videos even if its old from the list of featured channels")

Goal: the Watch shelves also show older videos from the same 7 verified channels, not only the last 30 days.

| Lane | Owns | PW_PORT | Migration |
|---|---|---|---|
| L1 Backfill | supabase/functions/watch-feed/**, supabase/migrations/0068_watch_evergreen*.sql, ops/sql/watch_backfill_cron.sql, src/features/discover/watch/** + src/features/discover/learn/ready.ts (merge order only), e2e/s34-*.spec.ts | 5371 | 0068 |

Behaviour
- 0068: watch_videos gets `evergreen boolean not null default false`. The daily purge removes only non-evergreen rows older than 60 days.
- watch-feed accepts body {"mode":"backfill"} (same secret). Backfill pages each channel's uploads playlist with YT_API_KEY (YouTube Data API playlistItems, 50 per page, at most 4 pages per channel), applies the existing filters EXCEPT the 30-day age limit (no Shorts/live, shelf keywords + not-words, oEmbed playable, max 5 per channel per run is lifted to 10 for backfill), keeps at most 30 evergreen per shelf (newest first), upserts with evergreen=true but never flips a fresh row (published within 30 days) to evergreen, and re-checks existing evergreen rows with oEmbed, deleting ones that no longer play. Under 150 s (parallel oEmbed 10 at a time, per-fetch timeouts, page budget). Heartbeat job 'watch-backfill' with counts only. No API key -> ok:false with reason flag, nothing written.
- Daily mode is unchanged.
- Client order per shelf: New (fresh, last 30 days, tag "New") -> "More from these channels" (evergreen, no tag) -> hand-checked list; de-duplicated by video id; failures fall back exactly as now.
- ops/sql/watch_backfill_cron.sql: monthly, 1st of the month 05:30 Manila (21:30 UTC on the last day... use '30 21 1 * *' and state it is the 2nd 05:30 Manila), written not applied.
Rules: never deploy, push, apply SQL. Repo PUBLIC. Playwright --workers=1.
