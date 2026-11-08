# Session 24 release contract

Base: the commit that adds this file (on origin/main 5a0bd179). One owner per file. Boards: canvas "Bantay v13 refresh" v44, row "Session 24 plans" (S24Discover, S24Today, S24Health, S24Family, S24Calm). Decision D-152: hand-picked videos only, no live channel feed.

| Lane | Owns (only these files plus their own tests) | Must not touch |
|---|---|---|
| A DISCOVER | src/features/discover/Overview.tsx, discover.css, today.css, Tabs.tsx, watch/Screen.tsx, learn/ready.ts, src/data/discover/ready.json, src/data/videos.json (append only; existing entries keep id/title/topic) | health/, today/, family/, calm/ |
| C TODAY-NEWS | src/features/today/TodayNews.tsx (+ new today/Lotto*.tsx, today/lottoApi.ts), supabase/migrations/0054_lotto.sql + .down.sql, new supabase/functions/lotto-pcso/, src/features/admin/desk/migrations.json + systemApi test list (0054 row only) | discover/, world-news function, screens/Today.tsx except one hook line |
| D HEALTH-CALM | src/features/health/PinnedTiles.tsx, HealthBrowse.tsx, health.css, ForYou.tsx, new public/img/browse/*, src/features/calm/CalmScreen.tsx | data/videos.json (read only), discover/ |
| E FAMILY | src/features/family/TogetherList.tsx, Papers.tsx, family.css, screens/Family.tsx (routes only), new family/PlanPage.tsx, family/CalendarPage.tsx | records/ server code, docs/ screens |

## Shared names
- Video shelves (lane A): ready.json `topics` gains ids `farm-diy` (title "Farming and DIY", replaces "repairs" in the UI; old "Repairs and improvements" videos move under it), `listen` (title "Listen"), `recipes-video` (title "Recipe videos"); `prepping` stays. Each video keeps the shape `{id, placeholder:false, title, topic, source, minutes}`; `source` = the channel name exactly as YouTube oEmbed `author_name` reports it.
- `READY_VIDEOS` gets passed through `playable()` everywhere it is shown (lane A).
- Lane D reads health videos only through `VIDEOS` / `playable` from health/library/videosLogic.ts (unchanged API).
- Lotto (lane C): table `public.lotto_results(game text, draw_date date, combination text, jackpot_php numeric null, winners integer null, fetched_at timestamptz default now(), primary key (game, draw_date))`, read for authenticated only, no client writes; function `lotto-pcso` (service role writes, idempotent upsert, keeps 30 days, trims older). Client `useLotto(): { rows: LottoRow[] | null }` in today/lottoApi.ts. Cron is owner-applied after deploy (not in the migration).
- Papers review count (lane E): `useQueue()` from records/useRecordsServer (existing). No new review flag.
- Calm (lane D): AfterScare moves to directly after CalmHero's breathing card; CrisisCard text and numbers unchanged (D-114 rule).

## Videos (lane A data; every id must pass oEmbed in the lane: HTTP 200, author_name equals source, then a health-wording Opus check)
Prepping: CvsJhNvDytU 89pzRA4bScc ETTgtj7yYK4 5WPv0FsIvkY (City Prepping); 2JihPYiSOac fnl_-oBQF9M 7WxUgGfiHb4 IEN3GJap2Kc (Knowledge Channel); 3oRx8JDns2E (GMA News, quake drill).
Health (videos.json append, topic from existing set): X8Q2W50NsKU 5R1ORrDOrn4 NbaU_DqwULw (Doc Willie Ong); NUxdxoIdlA8 r5XTTeP039Q nxIJeHWlhF4 B10sth4zjuI 2dn13zneEjo (Mayo Clinic); HhHTnDOtxe8 (DOH Philippines).
Farming and DIY: zMH61Yabdj0 0uWIL21ViGU 5r0Z5gJnU0Y (This Old House); qdbieBBd-Ko (Agribusiness How It Works).
Listen: jLbDzs84BVo T4T8ACMXGGM (Jason Stephenson); wCy2ETwUn3o (Soothing Relaxation); tEmt1Znux58 (Sunnybrook Hospital, box breathing).
Recipe videos: pEMMBceYyMw OzfTQZVYKmY t_Hsq7JcGtQ fSx0azcVbbw 27baGt4-kzg (Panlasang Pinoy; card says "use less patis and salt").
Excluded on purpose: Survival Lilly (fear headlines), Doc Willie Ong glutathione and "cure without medicine" titles, any video oEmbed refuses.
