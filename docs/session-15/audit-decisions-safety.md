# Family Bantay: decisions and safety-path audit (Opus, read-only)

Repo: worktree `family-bantay-review-check-ac44fa` at main `6f32f97`. Live DB `wuakimpssycbtnmoexuc`, read-only SELECTs, run 2026-10-29 19:2x UTC.
Nothing in the repo or the database was changed.

## Findings

### DS-1 (blocker) "Your family will see it" is promised for alerts that reach nobody
- **Evidence (code):** the copy promises it: `src/features/today/actions.ts:90`, `:114` ("Your family has been told you are unwell." / "Saved. Your family will see it in Bantay."), `src/features/today/QuickLog.tsx:180`, `src/features/today/SimpleToday.tsx:81`, `src/features/health/bpcheck/CrisisCard.tsx:8,20`, and the third dose alarm `src/features/health/reminders.ts:132` ("your family will see this in Bantay at {late}").
- **Evidence (server):** `raise_mood_alert` and `readings_alert` both call `notify_family(..., 'carers')`. That scope means **writer carers only** (live `notify_family` body: `c.can_write and c.carer_id is distinct from owner`). dose-watch is also writer carers only (`supabase/functions/dose-watch/logic.ts:135-137`, `index.ts:116`). By design a person with a login can never have a writer carer: `supabase/migrations/0037_sharing.sql:11` says only an admin can grant edit, and only for a person with no login (D-22).
- **Evidence (live data):** of the 4 members with a login, 3 have active timed medicines (8, 4 and 2 medicines) and **0 writer carers** each. Only the two no-login dependents have a writer carer. The RPC still returns no error (it returns 0 rows inserted), so the client takes that as `'sent'` and says the family was told.
- **User impact:** an elder who taps Unwell, logs a crisis-level reading, or ignores the third alarm is told the family knows, but no alert row is created for anyone.
- **Fix (smallest):** client side, read the count the RPC already returns (`const { data, error } = await supabase.rpc('raise_mood_alert', …)`) and treat `data === 0` as `'refused'`, which already shows "Your family was not told. Call them." For CrisisCard and the alarm body, show the family line only when a writer carer exists (MedDetail's `useHasWriterCarer` pattern). Alternative for Lloyd to decide: widen those alerts to `'family'` scope for members who have a login (this is a privacy decision; it touches D-82).
- **Files:** `src/features/today/actions.ts`, `src/features/health/bpcheck/CrisisCard.tsx` (plus its caller, to pass in a has-writer flag), `src/features/health/reminders.ts` (text b2), tests `src/features/today/*.test.ts*`, `src/features/health/reminders*.test.ts`.

### DS-2 (major) A queued SOS can wait up to 30 minutes in sync backoff
- **Evidence:** `src/features/sos/SosScreen.tsx:121` only calls `enqueue('sos_events', …)`. The outbox hook then calls a non-forced `syncNow()` (`src/features/sync/sync.ts:398-399`). `run()` returns early while a backoff is active (`sync.ts:356`: `if (!force && bo && Date.now() < bo.nextAt) return`), and that backoff grows to 30 minutes (`sync.ts:28`). Only the browser `online` event forces a run, and a weak signal during a storm usually does not fire it. The drain is also strictly in order (`src/db.ts:57-66`), so a transient 5xx on an older row blocks the SOS row behind it.
- **User impact:** after a few failed syncs, "Your family will see this in Bantay" can be false for up to 30 minutes, even once the signal comes back. (The phone call and SMS still go out, because they do not use the data network.)
- **Fix:** after the enqueue, call `void import('../sync/sync').then((m) => m.syncNow(true))`, the same pattern as `messagesApi.ts:38`. Optional follow-up: send `sos_events` rows first in `push()`.
- **Files:** `src/features/sos/SosScreen.tsx` (+ `sosFlow.test.tsx`).

### DS-3 (major) Simple mode never shows the family SOS banner
- **Evidence:** `src/screens/Today.tsx:65` returns `<SimpleToday>` for simple-mode members. `SimpleToday.tsx` imports `useSosActive` (to hide Jack) but never renders `IncomingSos` (imports at lines 1-24, body at lines 97-120). Full Today mounts the banner at `Today.tsx:70`.
- **User impact:** a family member in Simple mode opens Today and sees nothing about another member's SOS. The row still exists, but only on Family or in the bell.
- **Fix:** render `<IncomingSos placement="today" />` at the top of SimpleToday's home view.
- **Files:** `src/features/today/SimpleToday.tsx` (+ `src/screens/Today.simple.test.tsx`).

### DS-4 (major) MedDetail offline: "No alarm on this phone for <your own name>"
- **Verified.** `src/features/health/MedDetail.tsx:91` takes `ownId` from `useHealthData()`. That is `member?.personId ?? ''` (`src/features/records/useHealthData.ts:40`). `getMember()` reads `people` over the network (`src/features/auth/session.ts:21`), and supabase-js returns `data: null` offline instead of throwing, so `ownId` is `''`. `useRingsHere` then calls `remindPeople(null)` (`MedDetail.tsx:59`), which leaves out self (`reminders.ts:46-50`), so `med-no-ring` renders "No alarm on this phone for Lloyd" (`MedDetail.tsx:170`). The alarm planner meanwhile uses `selfIdOrCached()` (`reminders.ts:186`), so the alarm does ring. The same empty id also hides Edit and Pause (`canMark` at `:128`) and labels the page "Lloyd's medicine" (`:131`).
- **User impact:** when offline, the screen says your own medicine has no alarm when it does. You may set up a duplicate or stop trusting the alarm.
- **Fix (shared root cause, fixes Health, Records, MedDetail, ExploreScreen and NudgeHub at once):** in `useHealthData`, `getMember().then(async (m) => setMember(m && !m.personId ? { ...m, personId: await selfIdOrCached() } : m))`.
- **Files:** `src/features/records/useHealthData.ts` (+ a test in `src/features/health/MedDetail.test.tsx` that mocks an offline `getMember`).

### DS-5 (major) Jack Jack shows beside a live family SOS banner on Today, and can be the second Jack on the screen (D-91)
- **Evidence:** `src/screens/Today.tsx:70` renders `IncomingSos` and `:73` renders `<WeatherCard … />` with no `noJack`. WeatherCard draws `ready-for-rain` / `drink-water` whenever the tip is rain or heat (`src/features/today/WeatherCard.tsx:67,74`). NextUp hides its Jack while an SOS is live (`NextUp.tsx:23,93`), but WeatherCard does not. When there is no SOS, NextUp's `well-done` (`NextUp.tsx:93`) and the weather Jack can be on screen together after Taken. People, Assistant (emergency) and SimpleToday's sleepy Jack are guarded correctly.
- **User impact:** a cartoon dog next to "Name needs help" breaks the D-91 rule.
- **Fix:** in Today, `const sosLive = useSosActive()` and pass `noJack={sosLive || !calm}` to WeatherCard (NextUp is only mounted when `!calm`).
- **Files:** `src/screens/Today.tsx` (+ `src/screens/Today.hold.test.tsx` or a new case).

### DS-6 (minor; latent, no live slots near midnight) Dose counter: a dose taken across midnight is counted as missed
- **Evidence:** `src/features/health/doseCount.ts:31-32` matches a take only if `dayOf(t.takenAt) === d`, and measures the gap as minutes from midnight on that same day. A 23:00 dose taken at 00:30 lands on the next day and never matches, so its own day counts it missed. The other direction (00:30 slot taken at 23:45) is also missed. Line 34 checks the 2-hour grace only for `d === today`, so just after midnight yesterday's 23:00 slot is already counted missed while still inside its 2 hours. `used` is per day (line 26), so after a fix one take could match two days' slots.
- **Live:** `meds_taken` has 3 rows in total and no active slot from 21:30 to 02:00, so the bug is latent today.
- **User impact:** a late-night medicine taken a little after midnight shows as missed in the week strip, the report, the visit summary and the recap. All of them share this counter.
- **Smallest correct fix (one file):** hoist `const used = new Set<MedTaken>()` above `i.days.map`. Per slot, compute `const slotMs = new Date(`${d}T00:00:00`).getTime() + sl.at * 60_000`. Match on medicine/slot/name without the `dayOf(...) === d` test, with `gap = Math.abs(Date.parse(t.takenAt) - slotMs) / 60_000`. Replace line 34 with `else if (slotMs + ON_TIME_MIN * 60_000 > i.now.getTime()) continue`. PH has no DST, so local-midnight arithmetic is exact. Add two tests: 23:00 slot taken 00:30 the next day counts as done; 00:30 slot taken 23:45 the night before counts as done.
- **Files:** `src/features/health/doseCount.ts`, `src/features/health/doseCount.test.ts`. (The Today card's `doseStates` in `src/features/health/meds.ts:108` has the same day-bucketing for display. Leave it unless Lloyd wants that changed too.)

### DS-7 (minor; latent) dose-watch: a slotted dose taken after midnight hides the next night's missed-dose alert
- **Evidence:** `supabase/functions/dose-watch/logic.ts:87,94-95` buckets each take by `manilaDay(taken_at)`, then closes the slot by slot name for that day. A 23:50 dose taken at 00:05 puts `'23:50'` into the **next** day's `bySlot`, so that night's 23:50 slot counts as taken: a false negative, and no carer alert. The 23:50 slot of the original day also stays open, so a false "missed" can fire at 00:20. `meds_taken` has no dose-day column (live column list).
- **User impact:** carers can miss a real missed dose for a late-night medicine. No live slots are affected now.
- **Fix:** in `openSlots`, match a slotted row by time instead of by day: `t.slot ? Math.abs(Date.parse(t.taken_at) - slotInstant(day, t.slot)) < 12 * 3600_000 : t.day === day`.
- **Files:** `supabase/functions/dose-watch/logic.ts`, `supabase/functions/dose-watch/dose-watch.test.ts` (redeploy dose-watch).

### DS-8 (minor) The snooze toast promises a ring even when alarms cannot ring
- **Evidence:** `src/features/today/NextUp.tsx:57` says "Okay. I will remind you in 10 minutes" on any native phone before it schedules anything. The schedule error is swallowed (`reminderActions.ts:99-106`, `NextUp.tsx:62`). `KEY_ALARM_HEALTH.ok === false` (notifications denied) is not checked.
- **Impact:** a phone with notifications off is told it will ring.
- **Fix:** read `KEY_ALARM_HEALTH` and use the web wording ("This card comes back in 10 minutes") when `ok !== true`.
- **Files:** `src/features/today/NextUp.tsx`.

### DS-9 (minor) The "alerts still ring" line in quiet hours is too broad
- **Evidence:** `src/screens/Me.tsx:175` says "10 PM to 6 AM, alerts still ring". `src/features/notify/push.ts:55-58` silences every `carer`-class push in quiet hours, and `reading_high` and `mood_unwell` are carer class (`src/features/notify/templates.ts:22-23`). Only safety class (SOS, roll call, storm) still rings.
- **Fix:** change the line to "SOS and storm alerts still ring; other family updates are silent".
- **Files:** `src/screens/Me.tsx` (+ `Me.test.tsx` if it snapshots the line).

### DS-10 (major, ops) Native push (D-85) reaches no phone today
- **Evidence (live):** `push_tokens` has 0 rows, `push_subscriptions` has 4 (web). The code is honest about it: `PushPermissionRow.tsx:23,34` only says "can reach you when Bantay is closed" once a token is saved.
- **User impact:** carers on the APK see a family SOS, roll-call help or missed dose only when they open Bantay.
- **Fix:** Lloyd's Firebase steps (D-86 "Lloyd owes"): set `FIREBASE_SERVICE_ACCOUNT_B64` and ship `google-services.json`. No code change.

### DS-11 (minor) Up to about 7 s can pass before the SOS call
- **Evidence:** `src/features/sos/SosScreen.tsx:112` waits for GPS (`FIX_MS` 4 s), then `:117` waits for the person id (up to 3 s) before the call at `:136`. The comment at `:21` says "the call must not wait long".
- **Fix:** start both waits together with `Promise.all`.
- **Files:** `src/features/sos/SosScreen.tsx`.

### DS-12 (minor) Video of the day (D-64) is built but never shown
- **Evidence:** `src/features/today/VideoCard.tsx` exists, but no `<VideoCard` appears anywhere in `src` (grep).
- **Fix:** mount it on Today, or record that D-64 is dropped.
- **Files:** `src/screens/Today.tsx`.

### Checked and fine (no finding)
- **SOS hold:** 3 s unbroken press, pointer capture, cancel on release (`hold.ts`, `SosButton.tsx:25-31`). There is a keyboard/"use a button" confirm. 911 is never auto-dialled (`call.ts:30-32`). A resumable `sos.active` survives a WebView kill. The fan-out trigger `sos_events_alert` uses `'family'` scope (all active members), is throttled after 3 per 10 min, and flushes push at once.
- **IncomingSos:** driven by unexpired `family_sos` rows. It hides once cancelled (row or `cancelled_at`), acks through the outbox, and offers Call/Map/911.
- **Dose alarms:** native only (`reminders.ts:182`, web returns `'web'`). One-shot alarms at +0/+10/+20 for 7 days, re-armed on every open. `alarms.health` is written on every plan (ok false when permission is denied). MedDetail shows "This phone rings" only when `ringsHere && alarmsOk === true` (`MedDetail.tsx:168`), and the web says "Dose alarms ring only in the phone app" (`:173`). Snooze uses a separate id range, and answered slots cancel the snoozes.
- **dose-watch:** 30 min (`WATCH_AFTER_MIN`, cron `*/15`), writer carers only, never the person themselves. Claim before write, release on failure. The digest opt-out applies to the digest only. Live `job_runs`: 96 runs in 24 h, 0 failures, last at 19:15 UTC.
- **Unwell -> carer_alerts:** server-side, once a day per person. Offline it queues in `mood.unsent` with a 24 h retry. Recipients: see DS-1.
- **Storm roll call (0041):** RPC is the only writer; requires an active member who is self or a writer carer; live PAGASA signal (`tcws/rainfall/thunderstorm/tsunami`, unexpired); rate limit 30/h; `need_help` alerts the whole family with a 30-min cooldown; RLS read for family members; 30-day retention. The app's `liveSignals` also uses only `tcws`, so the two agree. Live: 0 rows and no PAGASA rows yet, so this has never run end to end.
- **alerts-ingest freshness:** cron `*/10`, 144 runs in 24 h with 1 failure, last OK at 19:20 UTC with 4/4 sources. USGS rows fetched at 19:20. Air rows with no warning expire as soon as they are fetched, which is intended (`parse.ts:207`), and the app pull drops expired rows (`sync.ts:313`).
- **Offline outbox:** the oldest row goes first; 400/403/404/409/422 are dead-lettered with the payload kept; 401 pauses; 5xx/408/429 retry and give the try back; tables from unapplied migrations wait. Gaps: see DS-2.
- **RLS:** every one of the 61 public tables has RLS on. Tables with 0 policies are service-role only (`assistant_usage`, `dose_watch_sent`, `erasure_requests`, `invite_tokens`, `pin_attempts`, `pin_reset_requests`).

## Decisions table (Accepted D-9..D-92; D-41..D-51 count as accepted through D-60. D-25, D-30..D-37 and D-53 are still Proposed and are not graded)

| D | Status | Evidence |
|---|---|---|
| 9 Lab range then guide | honoured | `src/features/health/labsLogic.ts:133`, `LabsList.tsx:92`, `model.ts:23` |
| 10 GPL | honoured | `LICENSE` is GPL-3.0 |
| 11 Dampas home | honoured (amended by D-27) | `alerts-ingest/parse.ts` zones |
| 12 iOS build | not checkable in code (gated on an Apple account) | - |
| 13 Partial B-list | not checkable in code | - |
| 14 Dependents, writer carers | honoured | `people_link_creator` trigger (live); `is_writer_of` |
| 15 Prompt out of git | honoured | `git log --all -- BANTAY_CLAUDE_CODE_PROMPT_v001.md` is empty |
| 16 Sign-in + outbox | honoured | `src/features/sync/sync.ts`, `src/db.ts` |
| 17 Admin registers, PIN | honoured (not deep-checked) | `supabase/functions/admin-members`, `_shared/pin.ts` |
| 18 Biometrics later | not checkable in code | - |
| 19 Usage, no health values | partly checked | `usage_events` RLS: 3 policies; allowlist not re-read |
| 20 Broadcast in an Edge Function | honoured | `supabase/functions/broadcast` |
| 21 Local ids = people.id | honoured (not deep-checked) | `sync.ts` people pull |
| 22 Admin links view-only | honoured | `0037_sharing.sql:11` (see DS-1 for the side effect) |
| 23 Cloudflare Pages | not checkable in code | - |
| 24 Profile picker | superseded by D-41/D-76 | - |
| 26 alerts-ingest on pg_cron | honoured | live `cron.job` alerts-ingest `*/10` |
| 27 Two home zones | honoured | `parse.ts` QUAKE_RULES apply to the nearest zone |
| 28 Plan first | not checkable in code | - |
| 29 Look + features | honoured (visual not compared) | `src/styles/tokens.css` |
| 38 Body map + Previous switch | honoured | `src/features/health/BodyMap.tsx`; `LabsList.tsx:10-27`; `labsLogic.ts:158` |
| 39 Glass anatomy v1 | not checked | - |
| 40 Mockup v5 notes | superseded by D-77/D-90 | - |
| 41 Pick name from the list | honoured (D-65) | `supabase/functions/family-names` |
| 42 Writer carers for dependents | honoured (server) | 2 dependents each have 1 writer carer (live) |
| 43 I'm OK / hero first | not checked | - |
| 44 Family opens on People | superseded (D-90: Home/Messages/Plan) | `src/screens/Family.tsx:31-37` |
| 45 One home for medicines | honoured | `src/features/health/Medicines.tsx`, `MedDetail.tsx` |
| 46 Drive via drive.file | not checked | - |
| 47 Rx import is a draft | not checked | - |
| 48 Doctor summary | partly checked | `visitSummaryLogic.ts` exists; PDF not checked |
| 49 Posters link-out | not checked | - |
| 50 Update card never above an alert | honoured | `src/screens/Today.tsx:84` (in More, below everything) |
| 51 Degraded-comms banner | partly | `SyncStatus` "N waiting to send"; per-card "as of" not checked |
| 52 Anatomy licence | not checkable in code | - |
| 54 / 55 Records copy and import | not checkable in code | - |
| 60 v6 + session-4 decisions | see D-41..D-51 | - |
| 61 Phone warnings only when broken | honoured | `SafetyHub.tsx:104` drops the tile at 0 |
| 62 Safety order | **partly** | `src/screens/Safety.tsx:56-68`: SOS -> 911/Medical ID -> IDs -> alerts hub -> hotlines is right, but `StormCard` (an advisory) sits above SOS at `:56` during a storm |
| 63 IDs and insurance | honoured (RLS) | live `documents_read`: id/insurance cards need `records_editor` |
| 64 Video of the day | **not honoured** | DS-12 |
| 65 Name list has handles | honoured | `supabase/functions/family-names` |
| 66 v6 cream/green everywhere | partly checkable | `tokens.css` holds the v6 palette; no screenshot compare done |
| 67 Build order | not checkable in code | - |
| 68 Redesign wave | partly | Safety card hub honoured (`SafetyHub.tsx`); other items not checked |
| 69 GSAP, no Lenis | honoured | `package.json:29` gsap 3.15.0, no lenis |
| 70 ID numbers editors-only | honoured (RLS) | `person_identifiers`: 4 policies (bodies not read) |
| 71 Glass on the frame only | honoured (tokens) | `src/styles/tokens.css:16`, `glass.css:52` |
| 72 ZDR models | honoured | `supabase/functions/ask/logic.ts:135`, `records-extract/logic.ts:51` |
| 73 Other member's dose is a link | honoured per the decision (shipped 87348cc); not re-tested | - |
| 74 Admin desk, names-only audit | partly | `audit_log` + triggers `audit_people`/`audit_carers` live; masking not checked |
| 75 Archive people | honoured | live `people_read` filters `archived_at`; dose-watch skips archived (`logic.ts:89`); `remindPeople` drops unknown people |
| 76 Mockup notes round 1 | partly | Discover tab exists (`TabBar.tsx:12`); the rest not checked |
| 77 Mockup v6 is the contract | not checkable in code (screenshot compare is a process step) | - |
| 78 In-app alerts; SOS uses phone call/SMS | honoured | `SosScreen.tsx:43-47`, `call.ts:30-32`; in-app carer_alerts |
| 79 Plan rev 4 defaults | partly | Q32 honoured (`call.ts:32`), Q34 30 min honoured (`dose-watch/logic.ts:3`); the rest not checked |
| 80 Member and admin set carers | honoured | `share_set` RPC with audit_log (`0037_sharing.sql:62-128`); `src/features/sharing/api.ts:29` |
| 81 join_claim server RPC | partly checked | `supabase/functions/pin-login/join.ts:41` per-IP rate limit; single-use not re-read |
| 82 Records private by default | honoured | live: `readings_read`/`meds_taken_read`/`activity_read` = self OR `is_carer_of`; records tables use `records_reader` (editor, or confirmed + carer); carers rows only through `share_set` -> accept |
| 83 Digest opt-out, server marked_by | honoured | live trigger `meds_taken_marked_by`; `dose-watch/logic.ts:201` |
| 84 Private until shared; one share list | honoured | no `share.*` kv switches left (grep); `my_viewers` (`sharing/api.ts:53`); RLS on every one of the 61 public tables (live) |
| 85 FCM, Discover, motivation, PIN approve, roll call | **partly** | code present (`_shared/fcm.ts`, Discover, 0041/0042); live `push_tokens` = 0 (DS-10) |
| 86 Plan rev 2 bold defaults | partly | accept-first `share_offers` honoured; roll call visible to family honoured; push text has no names (`templates.ts`, `fcm.ts:4`) honoured; vaccines excluded (`dose-watch/logic.ts:56-57`) honoured; quiet-hours channel honoured (`fcm.ts:12`) but its copy is too broad (DS-9) |
| 87 Never "no action needed"; fail-open reads | honoured | `src/features/safety/alerts.ts:139,157` |
| 88 Wider alert radius | honoured | `parse.ts:35-39` (150/500/1500/3000 km, GDACS 1000); `alerts.ts:127,157` copy |
| 89 Batches 1+2 together | not checkable in code (release process) | - |
| 90 Round B screens | partly checked | MedDetail, LabsList with Previous, Family Home/Messages/Plan, NextUp "In 10 min" all present |
| 91 Jack Jack rules | **partly** | 19 poses x sizes in `src/assets/jack` (39 files); guarded in NextUp, People, Assistant emergency, SimpleToday sleepy; none on SOS screens, labs, report or diagnosis. **Violation:** the Today weather Jack shows next to a live SOS banner and can be a second Jack (DS-5) |
| 92 Ship as APK 2.5.0 | honoured (superseded by 2.5.1) | commit `6f32f97 release: latest.json 2.5.1` |

## Not done
- No screenshots and no running app, so D-66/D-77 visual parity was not checked.
- Rows marked "not checked" above were not read, for lack of time. They are not claimed either way.
