# Session 10 build plan: wave 2 fix round, safety wave, Discover + fun logging

**Status:** rev 3, for Lloyd's approval (D-77: plan before code). Nothing in this file is built, applied, deployed or pushed.
**Written:** 2026-10-26 by the planner (Fable 5.1, writing-plans skill); rev 2 applied the Opus 5.5 review (`docs/session-10/PLAN-REVIEW.md`); rev 3 applies **D-78** (in-app alerts only; SOS through the phone's own call and SMS apps; no Firebase, no SMS gateway, no native SMS sender, Sentry dropped for now).
**UI contract:** mockup v6, `D:/ObsidianVault/20-projects/family-bantay/mockups/bantay-complete-mockup.html` (135 screens, `data-s` ids quoted per lane). Per D-78 the three lock-screen push screens (`lock-missed`, `lock-sos`, `lock-storm`) are built as in-app alert views; the orchestrator updates their mockup notes. Every lane ships 390x844 light + dark shots beside the matching screen before merge (D-66, D-67).

**Goal:** Ship wave 2 (fixed), then make the safety net honest and real within D-78 (alerts the family sees in the app, SOS that records the event and hands the elder to the phone's call and SMS apps, medicine alarms that repeat and survive Doze and force-stop, automatic hazard rows, a System health page, guided BP with one verdict table), then add Discover and the fun-logging mechanics.

**Architecture:** Same stack, no new push infrastructure. One new table `carer_alerts` is the family alert channel: triggers and the dose-watch cron write rows; the app shows them as the bell list, Today cards and Family cards, live through Supabase Realtime while the app is open and a 30 s poll on resume; the existing Web Push (VAPID) keeps carrying the same rows to browser/PWA users, nothing new for the APK. SOS is an outbox insert plus two intents (`tel:` and `sms:`). Everything else is client React + Dexie + the existing sync/outbox, Supabase migrations numbered from 0030, and edge functions. Native work in Phase 2 is small (auto-dial plugin, OEM settings intents) and feature-detected so old shells keep working on the new web bundle.

**Trade-off stated plainly (D-78):** a carer on the Android app sees a missed dose, an SOS or a storm alert only when they open Bantay; the elder's own phone alarms still ring on time. Browser/PWA users keep web push. D-35's FCM plan is parked, not cancelled; the `carer_alerts` rows are the exact input a later push sender would read.

**Tech stack:** React 19 + Vite 8 + Dexie (local-first), Capacitor 8.5.3 Android shell (`server.url`), Supabase (Postgres, RLS, Realtime, Edge Functions on Deno, pg_cron, pg_net), Web Push (VAPID, existing), OpenRouter (Jack, scans), Open-Meteo, RainViewer past-frame tiles on Leaflet, Playwright + Vitest, multi-lane-build workflow (Sonnet builds, Opus 5.5 audits).

---

## Changes after D-78 (rev 3)

| D-78 item | Applied where |
|---|---|
| (1) No Firebase/FCM, no SMS gateway, no native SEND_SMS; alerts in-app; web push only where it exists | Architecture + trade-off above; 3.1 contracts (`carer_alerts` kept, `push_tokens`/`push_deliveries`/`register_push_token`/FCM sender removed; Realtime publication added); S1a/S1b replaced by **S1 ALERTS-INAPP**; `sendToUsers` is now Web-Push-only `pushWeb` inside dose-watch; `templates.ts` stays client-side; S1a's native channels, `release-apk.yml` step, `google-services` and the FCM device tests removed |
| (2) SOS = record the event, dial the first family contact (or 911), open the SMS app pre-written; offline works | S2 rewritten: `sos_events` insert through the outbox + trigger that writes family `carer_alerts` rows; `tel:` via auto-dial plugin (ACTION_CALL, CALL_PHONE) by default with the dial screen as fallback, reasons in 3.1 "SOS"; `sms:` composer per contact with name, time, maps link; no `sos` edge function, no `sos_contacts` table, no Semaphore; Q32 (auto-dial vs dial screen) |
| (3) Local alarms stay; carers told after 3 tries = in-app row (elder-phone SMS to the carer default no) | S3 unchanged (+10/+20 repeats, self-heal, battery guide); the 30-min carer row comes from dose-watch (S4 logic) into `carer_alerts`; Q33 (window), Q35 (SMS to carer from the elder's phone, default no) |
| (4) No Firebase / Semaphore / `GOOGLE_SERVICES` setup; Sentry dropped for now | 3.4 Lloyd list reduced to apply, deploy, APK, device tests, reviews; S8 keeps `job_runs` + System health + weekly KPIs and adds a tiny client error counter (no third party); Q36 (Sentry later) |
| (5) Lanes, migrations, device tests, effort, risks, rollback, questions re-cut | 3.2a-3.6, section 6 (dropped: second-carer escalation, SMS provider, failed-job push, FCM banner wording; added Q32, Q35, Q36), section 7 (Phase 2 now 3-4 sessions + ~2 days of device tests) |
| Rev 2 items that stand | C1 preview test window (only when a native change ships), C2 feature detection, C5 PIN reset protocol (approval prompt is in-app + web push), C6 trigger rules, H1 ownership table + pre-commit, H2 repeats, H6/H7 BP table + crisis copy, H8 `ref` dedupe, H10 RLS, M1 RainViewer, M2 native TTS in Phase 3, M4 mark-taken rule, M5 Jack gate script, M6 family-names dual mode, M7 privacy items, M8 no PAGASA scraping, M9 rollbacks, M11 Phase 3 contracts, M12 hazards |

(The rev 2 table mapping every Opus finding is kept in `PLAN-REVIEW.md`'s history; items made moot by D-78 are C3, C4, H3, H4, M3 and the Semaphore/Sentry parts of H4/M7/M10.)

---

## 0. Principal-engineer pre-flight

**(1) Reframe and critique.** The deep review found the app's promises exceed what it does: carers on the APK get no push, SOS only opens an SMS composer, dose alarms die on force-stop and drift in Doze and never repeat, "Still taking it?" silently stops both safety layers, official storm bulletins are never pushed, nothing monitors errors, and real use is near zero. Rev 2 answered that with Firebase, an SMS gateway and native SMS; Lloyd simplified (D-78): alerts live in the app, SOS uses the phone's own apps. That is a smaller, cheaper, offline-friendly build with one honest limit: carers see alerts when they open Bantay. The plan therefore (a) makes the app say that everywhere a push was implied, (b) keeps the carer channel as data (`carer_alerts`) so a push sender can be added later without redesign, (c) keeps the elder-side safety that needs no server (local alarms with repeats, the dial and SMS intents, Medical ID on the lock screen), (d) puts the Family tab and the bell where carers will look, with a badge on the tab bar when unseen rows exist, and (e) still fixes the structural bugs (wrong worktree bases, unapplied migrations, verdict table, PIN-reset security).

**(2) Data and context read first (done, read-only).** D-34/35/36/41/42/43/45/51/62/64/65/66/67/68/73/76/77/**78**; 04-HANDOFF top entries and NEXT-CHAT-PROMPT-session-10; deep review V1, V2, C-hazards, A-features; mockup notes for all 135 screens, CANON, CONTRACT, R-discover, R-nudge, REVIEW2; session 9 PLAN.md and the 8 wave-2 review files; main a2f4e52 code; the 8 lane diffs; multi-lane PLAYBOOK + CHECKLIST; PLAN-REVIEW.md.

**(3) Tools and methods.** `multi-lane-build.js` workflow for every wave (Sonnet code lanes in worktrees from a named base sha, Opus 5.5 audit per lane, `args.contract` = `docs/session-10/contracts.md`, `args.base` = the integration tip after the orchestrator pre-commit). Fix rounds as new workflow runs with only the failing lanes. Merge queue one lane at a time with tier-0 smoke after each. WSL psql rehearsal for every migration. Playwright with the 600 s webServer timeout. `npx -y supabase@2.121.0` for apply and deploy (Lloyd). GitHub Actions `release-apk.yml` builds and signs the APK (`ANDROID_KEYSTORE_BASE64`); Lloyd triggers it. Haiku only for read-only research lanes (R1-R3) and grep gates.

**(4) Independent verification.** Opus 5.5 reviews every lane and the whole branch before each PR. Gates run bare with exit codes quoted: `npx tsc --noEmit`, `npx vitest run`, `npx playwright test`, screenshot compare per `data-s`, migration rehearsal ALL PASS, `scripts/check-manifest.mjs` after any Android change, `scripts/jack-gate-live.mjs` before the Jack flip. Live checks after Lloyd's apply: `select version from supabase_migrations.schema_migrations order by 1 desc limit 8`, `select kind, count(*) from carer_alerts group by 1`, `select job, ran_at, ok from job_runs order by ran_at desc limit 5`. Device tests (Lloyd, 3.4) are gates: force-stop re-arm, Doze day-2 and day-3 delivery, SOS with data off (call + SMS composer) and on (family sees it in the app), PIN reset by family approval, old shell on the new web. Retro after each release.

**(5) Revised numbered plan = task counter (Tasks 0/31).**
1. Lloyd approves this plan; answers to section 6 recorded as D-79+ for Phase 1 and 2 questions (defaults apply to the rest).
2. P1: commit the wave-2 review files + `docs/session-10/contracts.md` (Phase 1 part) to the integration branch; launch the 8 fix lanes.
3. P1: merge the 8 lanes onto `claude/cache-ttl-cost-39e7cd`; smoke + duplicate scan after each.
4. P1: gates (tsc, vitest, full e2e incl. the 8 wave-1 failures triaged).
5. P1: Opus release review of the whole diff; fix round if needed.
6. P1: tag `pre-s10-p1` on main; push; one PR to main.
7. P1 gate (Lloyd): `apply` 0025, 0026, 0027, 0029; deploy `records-extract`, `ask`; verify.
8. P1 gate (Lloyd): `merge`; confirm live bundle; `jack-gate-live.mjs` exit 0; flip `VITE_ASSISTANT_PROVIDER=edge`.
9. P1: retro.mjs; handoff.
10. P2: Haiku research R1 (PAGASA machine feeds + terms), R2 (OEM battery/autostart intents), R3 (RainViewer PH coverage); results into contracts.md.
11. P2: orchestrator pre-commit (3.2b) = Phase 2 base sha; contracts.md Phase 2 part; mockup notes for `lock-*` screens updated to "in-app alert"; launch 13 lanes in two batches.
12. P2: audits, fix round, merge queue with smoke after each.
13. P2: migrations 0030-0035 rehearsed in order on WSL.
14. P2: gates + screenshot compare for 52 screens; Opus release review; tag `pre-s10-p2`.
15. P2 test window (only because the auto-dial plugin and OEM intents are native): Pages branch preview origin added to `ALLOWED_ORIGIN` and Supabase redirect URLs; CI builds APK 2.3.0-rc against it (`CAP_SERVER_URL`); sideload to the test phone. Skipped if Q32 = dial screen and S3's OEM intents are deferred (then no new APK in Phase 2).
16. P2 gate (Lloyd): device tests (3.4) over about 2 calendar days pass.
17. P2 gate (Lloyd): clinician signs the S9 thresholds + crisis copy and the S4 review rule; Lloyd reviews `privacypolicy.html` + breach plan.
18. P2 gate (Lloyd): apply 0030-0035 + cron files; deploy functions; merge PR; CI builds APK 2.3.0 against production; family roll-out; remove the preview origin; raise the minimum versionCode after roll-out; retro.
19. P3 prep (Lloyd): YouTube playlist list, NASA API key, Red Cross / FNRI emails, answers to the Phase 3 questions recorded.
20. P3: content build (MedlinePlus XML -> topics.json, medicine cards, 20 recipes) and size budget check; Haiku licence-string sweep.
21. P3: pre-commit (TTS plugin dep); contracts.md Phase 3 part; launch 11 lanes.
22. P3: audits, fix round, merge queue.
23. P3: migrations 0036-0038 rehearsed; n8n news-feed ops file validated (never applied by a lane).
24. P3: gates + screenshot compare for 55 screens; Opus release review; tag `pre-s10-p3`.
25. P3 gates (Lloyd): clinician review of medicine/supplement cards and recipe tags; native Tagalog read; apply 0036-0038; n8n apply; deploy `discover-daily`; merge; APK 2.4.0.
26. P3: retro; handoff.
27. Family setup day + usability script (gap 5) after P2 ships: 3 elders, time-to-SOS, time-to-log-BP; results into 02-DECISIONS.
28. Deferred-hazard review at the Phase 3 release review: J3 explain_term-from-knowledge, red-team rerun.
29. Parked (D-78): FCM push sender reading `carer_alerts` (needs Firebase project; re-plan when Lloyd wants it).
30. Parked (D-78): SMS gateway for SOS/carer texts.
31. Parked: Sentry (Q36).

---

## 1. Conventions every lane follows

- **Base sha:** named in each brief. Phase 1 fix lanes: the lane's own last commit (after merging the integration branch in, lanes 1 and 4). Phase 2 and 3: the integration tip after the orchestrator pre-commit. Builder's first command: `git reset --hard <sha>` (ML-01).
- **One owner per file.** The ownership tables in 3.2a and 4.3 are the law. Shared files get one-line hooks only, added by the owner; the other lane ships a component in its own file and names it in `contracts.md`. Test files are named, never globbed.
- **Feature detection (C2).** Every native call is gated: `Capacitor.isPluginAvailable('Call' | 'SettingsOpener' | 'TextToSpeech')`, and shell-version checks read `App.getInfo().version` once at start (`src/native/shell.ts`, owned by S1: `shellAtLeast('2.3.0')`, `hasPlugin(name)`). An old shell on the new web degrades to the PWA behaviour with an honest line ("Update the app to use this", D-50), never a crash. `phone_health.alarms_ok` is `null` ("old app") on shells below 2.3.0.
- **Alert copy rule (D-78):** wherever the app tells someone another person "will be told", it says "will see it in Bantay" (and "and get a notification in the browser app" only for PWA users). Never promise a lock-screen alert on the Android app.
- **Model:** Sonnet 5.5 builds every lane; Opus 5.5 audits every lane; Opus builds only after two failed Sonnet reviews. Haiku: read-only research lanes and mechanical checks only.
- **Review:** `critical: true` marks the lane in briefs. Final whole-branch review on Opus before each PR.
- **Shots:** `docs/session-10/shots/<lane>/<data-s>-{light,dark}.png` at 390x844 (admin: 1440x900 + 390x844), compared by the auditor against the mockup section with the same `data-s`.
- **Tests:** vitest for logic (hand-computed expected values, ML-17), one Playwright spec per lane for the screens it changes, axe on each new screen, no `sleep` (ML-25).
- **Copy:** plain words; one BP table (In range / A little raised / Above target 130-134 or 80-84 / High 135/85+ / Low) owned by S9; no "I'm OK" anywhere; no admin gates; no brain-health or outcome claims; B-7 (no health values in notifications or alert rows: rows carry a template id and a first name only).
- **Migrations:** `NNNN_name.sql` + `.down.sql` + `supabase/tests/<name>_rehearsal.sql`; idempotent; full grants restated (ML-21); RLS policies per the contract. Written only; Lloyd applies in the order given.
- **Secrets:** named in `needs`, never printed. Deploys, pushes, applies, n8n activations, CI runs: orchestrator and Lloyd only.
- **Status reply format:** every status to Lloyd shows **Tasks n/31** and the list above.

---

## 2. Phase 1: wave 2 fix round (1 session)

### 2.1 Where things are
- Integration branch `claude/cache-ttl-cost-39e7cd` at **fc9450c** = main a2f4e52 + wave 1 (8 lanes merged); tsc 0, vitest 2021/2021; e2e 345 pass / 8 fail under load.
- Wave 2 lanes, worktrees `D:/Claude/Bantay/.claude/worktrees/wf_ac368f43-134-N`, branches `worktree-wf_ac368f43-134-N`:

| N | Lane | Commit | Base | Review file | Majors |
|---|---|---|---|---|---|
| 1 | W2-HEALTH | b4ca1cc | **a2f4e52 (old main)** | wave2/W2-HEALTH.md | 3 |
| 2 | W2-TODAY-SAFETY | f48045e | fc9450c | wave2/W2-TODAY-SAFETY.md | 2 |
| 3 | W2-FAMILY | e8c9601 | fc9450c | wave2/W2-FAMILY.md | 2 |
| 4 | W2-ASK | 9c07e92 | **a2f4e52 (old main)** | wave2/W2-ASK.md | 2 |
| 5 | W2-JACK | d9ad15c | fc9450c | wave2/W2-JACK.md | 1 |
| 6 | ADM-BE | 62020b6 | fc9450c | wave2/ADM-BE.md | 2 (3 modified shot PNGs uncommitted under docs/session-9/shots/adm-a/: commit them in the fix lane) |
| 7 | ADM-C | baaf403 | fc9450c | wave2/ADM-C.md | 1 (status partial) |
| 8 | ADM-D-VIEW | 0e53626 | fc9450c | wave2/ADM-D-VIEW.md | 0 |

Review files live in `D:/Claude/Bantay/.claude/worktrees/android-tv-debloat-launcher-ffa8d2/docs/session-9/wave2/` (uncommitted there; the orchestrator commits them to the integration branch first, Task 2). Verified by the review: the only files two lanes share are `Today.tsx` and `Today.simple.test.tsx` (lanes 2 and 3), merged by hand.

### 2.2 Fix lanes (8 Sonnet lanes, one workflow run, `base` = each lane's last commit)

Every fix lane: `git reset --hard <its commit>`; lanes 1 and 4 first run `git merge claude/cache-ttl-cost-39e7cd` (merge, not rebase, so the audited commit stays), resolve, commit "merge wave 1"; then fix the numbered items; rerun its specs bare; commit; report.

**F1 W2-HEALTH** (worktree -1, base b4ca1cc)
- Merge fc9450c in. Conflict `src/features/health/m7a.css`: keep wave 1's `.seg.hv-modes` hunk, drop the lane's duplicate.
- Issue 2: `e2e/w2-health-shots.spec.ts` gains a signed-in case (reuse `e2e/health-auth.spec.ts` helpers) so `canMarkFor` is true; assert `Add BP` opens `AddReadingSheet`; shots `health-home-nudge-buttons-{light,dark}.png` and the add sheet with the "Example: 120 on top, 80 on the bottom." hint.
- Issue 3: `MetricChart.tsx` whole-number BP ticks; `WaterPanel.tsx` label; `m7a.css:51` `.mc-t` 10px -> 13px; `.kp-sub`, `.kp-chip`, `.hv-nl/.hv-last/.hv-state/.lr-h` -> 14px (`.sub`); H5 page de-dup.
- Minors 4-7: `nudgeLogic.test.ts` allMet case; define `.kp-none` in `health.css`; `Health.tsx:118` copy "My numbers"; swap the meds goal to `doseCount.ts` (wave 1 helper, present after the merge).
- Acceptance: `npx tsc --noEmit` 0; `npx vitest run src/features/health` 0; `PW_PORT=5400 npx playwright test e2e/health-v6.spec.ts e2e/health-a11y.spec.ts e2e/health-overview.spec.ts e2e/w2-health-shots.spec.ts` 0. Mockup: `health-home` (nudge card block only). Review: Opus.

**F2 W2-TODAY-SAFETY** (worktree -2, base f48045e)
- Issue 1: no GreetingBand move (S7 deletes it in Phase 2); note the deviation in risks. Issue 2: `SimpleToday.tsx` layout so Hold for help and the dose card fit in 844 px (`.td-bigbtn` 72 px, weather strip 56 px); e2e assertion at 390x844 and 360x640 that the SOS button's bounding box is inside the viewport before scroll.
- Interim push notice (2 files): `src/features/update/PwaBanner.tsx` returns null until kv `alerts.inapp.ok` is true (S1 sets it in Phase 2); `src/features/notify/AlertsBanner.tsx` on native (`Capacitor.isNativePlatform()`) renders "Family alerts do not reach the Android app yet. Keep the browser app for missed-dose and storm alerts." instead of returning early. Unit tests for both.
- Minors 3-5: fake-timer test for the TabBar 8 s dismiss and `data-simple`; timer not started in Simple mode; a test asserting the five Safety group headings and tile placement; delete dead `.sf-act-sec`, `.bt .td-bigbtn.sos`; tokens `--late-bg`, `--late-ink` in `today.css`.
- Acceptance: `npx vitest run src/features/today src/features/safety src/features/update src/features/notify src/screens` 0; `npx playwright test e2e/today.spec.ts e2e/today-auth.spec.ts e2e/safety.spec.ts` 0. Mockup: `simple-today` (buttons above the fold), `safety-hub` (three tinted groups), `start-banner` (hidden state). Review: Opus.

**F3 W2-FAMILY** (worktree -3, base e8c9601, critical)
- Issue 1 (decision: build it, `family-msgs` promises "messages that cannot send yet wait on the phone"): text messages go through the existing outbox (`enqueue('family_messages', 'insert', row)` with a client UUID, `src/features/family/messagesApi.ts`), shown with a "Queued" tag until the poll returns them; voice notes and files stay online-only with "Needs signal". Add the table to the `src/features/sync/tables.ts` outbox allowlist only (no pull).
- Issue 2: `SLEEP_478_ENABLED = false` in `breathLogic.ts` (shortcut comment: clinician gate Task 17) so 4-7-8 is hidden; Relax and Calm stay.
- Minors: drop the duplicate `is_family_member()` body from 0027 and `\ir 0023` in the rehearsal; re-enable the axe rule in `family-messages.spec.ts` by adding the visible text to `aria-label`; delete `familyLineLogic.ts(+test)` and the `card_seen_family_line` event.
- Acceptance: `npx vitest run src/features/family src/features/today` 0; `npx playwright test e2e/family-messages.spec.ts e2e/family-plan.spec.ts e2e/family-report.spec.ts e2e/today-auth.spec.ts` 0; 0027 rehearsal ALL PASS on WSL. Mockup: `family-home` (bubbles), `family-msgs`, `family-thread`, `today-breathe`. Review: Opus (critical).

**F4 W2-ASK** (worktree -4, base 9c07e92, critical)
- Merge fc9450c in (take wave 1's `vitals.ts`). Blocker: `src/features/scan/reading.ts:74` `'body_temp'` -> `'temperature'` (+ test). Issue 2: run `npx playwright test e2e/scan.spec.ts e2e/ask-sheet.spec.ts` bare with the 600 s config and quote exit codes; run `src/features/family/family-ui.test.tsx` alone and quote.
- W2-ASK #7 per-user cap: reading mode takes a daily slot through the existing `assistant_take` RPC with its own key `'reading'` (cap 20/day) before calling the model; 429 -> "Try again tomorrow or type the numbers".
- Minors: log `{fn, mode, ok, in_tokens, out_tokens}` counts only; `normalizeReading`: confidence missing -> fields null; plausibility bounds reused from `readingPreview.ts` SPECS (temp 30-45, spo2 50-100 added with a "plausibility, not clinical" note in CLINICAL-REVIEW.md); remove the duplicate "For Me" line; delete `crop.png`, `form.png`. R2 hazard: `ReadingConfirm.tsx` shows the `previewReading` verdict colour under the numbers and requires a tap on each prefilled number when `confidence < 0.9 or null` before Save is enabled.
- Acceptance: tsc 0; `npx vitest run src/features/scan supabase/functions/records-extract` 0; scan + ask-sheet specs 0. Mockup: `ask-capture`, `ask-capture-result`. Review: Opus (critical).

**F5 W2-JACK** (worktree -5, base d9ad15c, critical). Files: `supabase/functions/ask/*`, `src/features/assistant/client.ts`, `README.md`, `scripts/jack-gate-live.mjs`, `docs/ASSISTANT.md` only (never `Assistant.tsx`; the client gate and 911 card are Phase 2 S10).
- Blocker: `supabase/functions/ask/index.ts:27` add `.is('deleted_at', null)`; Reader test with a tombstoned row in `ask.test.ts`. Minor 3: BP regex requires a symptom or `presyon|bp|blood pressure` within 20 chars. Minor 5: README env row `VITE_ASSISTANT_PROVIDER`.
- `scripts/jack-gate-live.mjs <ask-url> <jwt>` posts 30 emergency phrases (10 English, 10 Tagalog, 10 Taglish/Cebuano) and exits 1 unless every reply carries `emergency.call === '911'` and the `x-bantay-model-called: 0` header the function adds in this lane.
- Acceptance: `npx vitest run supabase/functions/ask src/features/assistant` 0; the script runs against `supabase functions serve` locally or is documented as Lloyd's live step. Review: Opus.

**F6 ADM-BE** (worktree -6, base 62020b6)
- Commit the 3 modified adm-a shots. Issue 2: vitest for the Calendar month "Meds N" collapse, `listExpiringIds` (sort, skip rejected, error on any failure), 12 px axis minimum. Minors: `Ids.tsx` empty state for zero people; one rule for the Home tile and the list (0-60 days ahead, skip rejected, expired flagged separately); Active delta reports unknown at the 20k cap; `isExpired` uses `todayManila()`. ADM-BE #7: `dk-cardtab` keeps `role="table" | "row" | "cell"` so semantics survive `display:block`; axe at 390 in the spec.
- Acceptance: `npx vitest run src/features/admin` 0; `npx playwright test e2e/admin-web-home.auth.spec.ts e2e/admin-web-calendar.auth.spec.ts e2e/admin-desk-files.auth.spec.ts` 0. Mockup: `admin-home`, `admin-calendar`, `admin-files`. Review: Opus.

**F7 ADM-C** (worktree -7, base baaf403)
- Issue 1: 390 px Queue uses the `dk-cardtab` card layout under 768 px so Fix is visible; spec asserts it at 390. `Queue.tsx` honours `id` (`#/queue/<personId>`) with a test. Minor 3: `labTag` tests for Low, unknown (null, never Normal), no range; e2e fixture flag matches value. Minor 4: refresh the 60 s signed link on image `onError` (one retry) and every 50 s while the aside is shown. Full `npx vitest run` bare, exit code quoted (status leaves partial).
- Acceptance: `npx vitest run` 0; `npx playwright test e2e/admin-desk-records.auth.spec.ts` 0. Mockup: `admin-queue`, `admin-queue-empty`, `admin-queue-err`, `admin-dups`. Review: Opus.

**F8 ADM-D-VIEW** (worktree -8, base 0e53626, critical)
- Blocker (0029 hard-coded action list): keep 0029 and its number (0028 stays unused, recorded in contracts.md and skipped by `migrations.json`). Add `'view'` to `ACTIONS` and `STATUS_LABEL` in `src/features/admin/desk/logsApi.ts` ("Viewed as member") (ML-28); orchestrator grep gate at merge: `grep -rln audit_log_action_check supabase/migrations` returns exactly 0021 and 0029. Minors 1-2: `viewAsData.ts` treats `role=admin` as all-visible; `.not.in('kind', ['id_card','insurance_card'])` when relation is `carer`. Minor 3: commit members list + member page shots (1440 + 390, light + dark). Minor 6: `<details>` menu closes on Escape and outside click.
- Acceptance: `npx vitest run src/features/admin/desk` 0; `npx playwright test e2e/admin-view-as.auth.spec.ts e2e/admin-desk-members.auth.spec.ts` 0; `supabase/tests/admin_view_as_rehearsal.sql` ALL PASS. Mockup: `admin-viewas`, `admin-member`, `admin-members` (the "Members reset their own PIN" bar is Phase 2 S6b). Review: Opus (critical).

### 2.3 Merge, gates, release (orchestrator, Tasks 3-6)
1. Merge order onto `claude/cache-ttl-cost-39e7cd`: F5, F8, F6, F7, F2, F3, F4, F1. After each: `npx tsc --noEmit`; tier-0 smoke `npx playwright test e2e/shell.spec.ts e2e/today.spec.ts`; duplicate scan `grep -rn "export function \(parseReply\|doseCount\|verdictFor\)" src | sort | uniq -d`.
2. Full gates: `npx vitest run` 0; `npx playwright test` with the 600 s webServer. The 8 wave-1 failures rerun alone with `--repeat-each 2`; a real failure goes back to the owning fix lane (today.spec -> F2, admin specs -> F6/F7/F8, nutrition axe timeout -> orchestrator raises the axe timeout).
3. Opus 5.5 whole-branch release review (`/code-review` on fc9450c..tip). Fix round as a new workflow run with only the lanes named.
4. `git tag pre-s10-p1 origin/main`; push the branch; one PR "Session 9 wave 2 + fix round"; PR body lists the apply order below and the rollback block 2.5.

### 2.4 Lloyd's gates (Tasks 7-8), one PowerShell 5.1 block each, stops at the first failure
**`apply`** (before merge; the W1 outbox sends 0026 columns): 0025_knowledge -> 0026_nutrition_v2 -> 0027_family_messages -> 0029_admin_view_as, each `npx -y supabase@2.121.0 db query --linked -f supabase\migrations\NNNN_x.sql` then the `schema_migrations` insert (pattern `scripts/golive-w1.ps1`). Then `functions deploy records-extract --no-verify-jwt`, `functions deploy ask --no-verify-jwt`; secrets `OPENROUTER_CHAT_KEY` (set 10-22), `ALLOWED_ORIGIN=https://bantay.pages.dev`. Verify: `select count(*) from supabase_migrations.schema_migrations where version in ('0025','0026','0027','0029')` = 4; a count of the 0026 `food_entries` columns (the lane lists the exact names) = all present; `select count(*) from storage.buckets where id='family-messages' and not public` = 1; `select count(*) from pg_constraint where conname='audit_log_action_check' and pg_get_constraintdef(oid) like '%view%'` = 1.
**`merge`**: merge the PR; confirm `bantay.pages.dev` serves the new bundle hash; open Health, Family > Messages, Scan & Capture on Lloyd's phone (browser). `node scripts/jack-gate-live.mjs <ask url> <Lloyd's jwt>` exit 0; only then set `VITE_ASSISTANT_PROVIDER=edge` in Cloudflare Pages env and redeploy. Until S10 ships, the client cap (`Assistant.tsx:267`) still runs before the server gate; acceptable because the limit reply itself says "call 911".
Rule that bit: apply a migration before merging app code that reads it.

### 2.5 Phase 1 rollback
- **Web:** Cloudflare Pages -> Deployments -> "Rollback to this deployment" on the previous production build (this also rolls back every APK through `server.url`).
- **Functions:** `git checkout pre-s10-p1 -- supabase/functions/records-extract supabase/functions/ask` then redeploy both; or flip `VITE_ASSISTANT_PROVIDER` back to `n8n` (the n8n webhook stays active for one release).
- **Database:** 0025-0029 are additive; leave them. 0027's bucket: `0027_family_messages.down.sql` if needed.
- **Signal:** Supabase function logs for `ask` 5xx > 5 in 10 min, or any family report of a blank screen.

---

## 3. Phase 2: safety wave within D-78 (3-4 sessions + about 2 days of device tests)

Covers deep-review gaps 1 (as in-app alerts), 2 (SOS through the phone's apps), 3, 4, 6 (automatic hazard rows + web push where it exists), 9 (System health, no third party), 10, plus D-76 onboarding/lock/consent/no-admin and Today weather-first + mood; gap 7 in S6b/S6c, gap 8 client side in S10, hazards M4 (`dose_due` web push for the iPhone PWA), K1 (S11), J3 (S10 script + dated deferral), gap 5 KPIs in S8.

### 3.1 Phase 2 contracts (copied into `docs/session-10/contracts.md` at launch)

**Templates (owner S1, `src/features/notify/templates.ts`, also imported by dose-watch through a copied `supabase/functions/_shared/templates.ts` kept identical by a test):** fixed strings, ids: `storm_warning`, `flood_watch`, `heat_alert`, `family_sos`, `sos_cancel`, `dose_due`, `dose_missed`, `review_open` ("A medicine needs an answer"), `phone_health` ("A phone may miss alarms"), `reading_high` ("Please check on <name>"), `mood_unwell` ("<name> is not feeling well"), `digest` ("Today's family summary is ready"), `pin_approve` ("Someone asks you to approve a PIN reset"), `pin_changed`, `system` ("Bantay needs your attention (admin)"), `bp_check`. Each has `tab` and `tone: 'urgent' | 'normal'`. Web push payload stays `{t, n?}`; in-app rows carry the same.

**Family alert channel (owner S1, `0030_carer_alerts.sql`):**
```sql
create table if not exists public.carer_alerts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  carer_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('dose_missed','review_open','phone_health','reading_high','mood_unwell','hazard','sos','sos_cancel','digest','system')),
  template text not null,                                  -- a templates.ts id (B-7: no values)
  ref text,                                                -- dedupe key: safety_alerts.id, sos_events.id, medication id + day, reading bucket
  created_at timestamptz not null default now(), pushed_at timestamptz, seen_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days');
create unique index if not exists carer_alerts_ref on public.carer_alerts (kind, ref, carer_user_id) where ref is not null;
alter table public.documents add column if not exists printed_name text;   -- S11 (hazard K1)
alter publication supabase_realtime add table public.carer_alerts;         -- live rows while the app is open (RLS applies to realtime)
create or replace function public.notify_family(p_person uuid, p_kind text, p_template text, p_ref text, p_scope text) returns int
  language plpgsql security definer set search_path = '' as $$ ... $$; -- p_scope 'carers' = writer carers of p_person; 'family' = every active member except the person; inserts rows, ignores duplicates, returns the count; execute granted to authenticated for kinds the app may raise (mood_unwell, sos, sos_cancel) and used by triggers for the rest
```
RLS (H10): `carer_alerts` select where `carer_user_id = auth.uid()`; `grant update (seen_at)` with the same policy; inserts only by `notify_family` (SECURITY DEFINER), triggers and the service role. Trim in `dose_watch_prune`: rows older than 30 days (ML-06). Realtime: the app subscribes to `carer_alerts` filtered by `carer_user_id=eq.<uid>` while open, polls once on resume and every 30 s as a fallback; the tab bar shows a badge on Family and the bell while unseen rows exist.
```ts
// supabase/functions/dose-watch (S1 owns index.ts; S4 owns logic.ts): port gains
//   carerRow(kind, personId, carerUserIds: string[], template, ref): Promise<void>   -> inserts carer_alerts (service role)
//   flushWebPush(now): Promise<{pushed:number}>  -> for rows with pushed_at null: Web Push {t, n?} to the carer's push_subscriptions if any (browser/PWA users only); sets pushed_at either way (pushed_at means "offered", the in-app row is the record)
//   dose_due (hazard M4): at each slot, Web Push {t:'dose_due'} to the person's own subscriptions when phone_health.platform is 'web' or missing
// DOSE_WATCH_AFTER_MIN env, default 30 (CANON 9:30); WATCH_MAX_LATE_MIN stays 360
// mode:'flush' body (cron secret) runs only flushWebPush; the 0031 and 0035 triggers call it through pg_net so PWA users get the push at once; APK users see the row when they open the app
```

**Phone health (owner S3, `0032_phone_health.sql`):** `public.phone_health(user_id uuid primary key, platform text check (platform in ('android','web')), app_version text, alarms_ok bool, notif_ok bool, exact_ok bool, battery_ok bool, oem text, last_open_at timestamptz, alarms_checked_at timestamptz, alarms_set int, alarms_rearmed int, updated_at timestamptz)`. `alarms_ok` null on shells below 2.3.0 and on web. RLS: own row insert/update/select; carers select through `people.auth_user_id = phone_health.user_id` joined to `carers.carer_id = auth.uid()`; `is_admin()` select all. Written through the outbox (row pre-committed in `sync/tables.ts`). The sweep (`alarms_ok = false`, or `last_open_at` older than 48 h -> `carer_alerts` kind `phone_health`, `ref = user_id || ':' || Manila day`) runs in dose-watch `index.ts` (S1).

**SOS (owner S2, `0031_sos.sql`):**
```sql
create table if not exists public.sos_events (id uuid primary key default gen_random_uuid(), person_id uuid not null references public.people(id), user_id uuid not null default auth.uid(), at timestamptz not null, lat double precision, lon double precision, gps bool, late bool not null default false, call_to text check (call_to in ('family','911','none')), sms_opened bool not null default false, cancelled_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.sos_acks (event_id uuid references public.sos_events(id) on delete cascade, user_id uuid not null default auth.uid(), seen_at timestamptz not null default now(), primary key (event_id, user_id));
-- trigger after insert on sos_events (security definer, search_path ''): late := (now() - new.at) > interval '30 minutes'; if not late then notify_family(person, 'sos', 'family_sos', id, 'family') and pg_net POST dose-watch {mode:'flush'} (web push for PWA members); late rows get no alert row (they still show in history as "earlier SOS at HH:MM")
-- trigger after update of cancelled_at: notify_family(..., 'sos_cancel', 'sos_cancel', id || ':cancel', 'family')
alter publication supabase_realtime add table public.sos_events, public.sos_acks;
```
RLS: `sos_events` insert for one's own person (self or writer carer), select for active family members (`is_family_member()` from 0023), update `cancelled_at` by the inserter; `sos_acks` insert/select own user, select all acks of events one can see. Rate: the insert policy also checks `(select count(*) from sos_events where user_id = auth.uid() and created_at > now() - interval '10 minutes') < 3`.
Client flow (`SosScreen`, S2), in this order, all of it working with no data because steps 2 and 3 only need the phone's own apps:
1. **Record:** `enqueue('sos_events','insert', {...})` with a client UUID; local history row; the status card says "Your family will see this in Bantay" ("and get a notification in the browser app" is never promised on Android).
2. **Call:** the first family contact from kv `sos.contacts` (the two numbers set at setup) is called. Default (Q32) = **auto-dial** with a tiny native `CallPlugin.java` (`Intent.ACTION_CALL`, `CALL_PHONE` permission asked at setup under "Hold for help can call Ate Joy for you"): the 3-second hold is already the deliberate act, and in a panic an elder may not find or press the green button on the dial screen, which is what `tel:` (ACTION_DIAL) leaves them with. Fallbacks: permission denied, PWA, no plugin or no contact -> `tel:` dial screen prefilled. **911 is never auto-dialled** (ACTION_DIAL prefilled with 911; the elder presses call) so a slip cannot place a false emergency call; "Call 911" stays a separate big red button on the SOS screen and in Simple mode (`Call911.tsx`).
3. **Text:** when the app comes back to the foreground after the call (or at once if no call was placed), open the SMS app with the pre-written message to the first contact: `"<Name> needs help. <time>. Location: <maps link> (<lat>, <lon>). Sent from Bantay."` (`sos/sms.ts`); the SOS screen shows "Text <second contact>" as the next big button (one composer per contact; a two-recipient `sms:` URI becomes a group MMS on many Android phones, hazard S5). The elder taps Send in the SMS app; `sms_opened` is set true when the composer was opened (all the app can know, as today).
4. **Status:** `safety-sos-sent` shows who has seen it (`sos_acks`, realtime), Call 911, "Call <contact> again", "Text again", and "Cancel, I don't need help" (`cancelled_at`).
Carer side (S4 `IncomingSos.tsx`): when an unseen `sos` row exists, a full-screen in-app view on open (Call, Open map, "On my way" message), and the row is acked.

**Dangerous reading (owner S9, `0035_reading_alerts.sql`, needs 0030):** trigger `after insert on public.readings`, `security definer set search_path = ''`, fires only when `new.source_file_id is null` (home or device rows) and `new.taken_at > now() - interval '2 hours'`; evaluates each row on its own: `bp_systolic >= 180`, `bp_diastolic >= 120`, `glucose`/`fasting_glucose` `< 70 or > 300` mg/dL (mmol/L x 18 first), `spo2 < 90`; calls `notify_family(person, 'reading_high', 'reading_high', person || ':' || bucket || ':' || floor(epoch/21600), 'carers')` so at most one alert per person per bucket per 6 h; then pg_net POST dose-watch `{mode:'flush'}` (web push for PWA carers at once). Thresholds and copy cite CLINICAL-REVIEW.md and need the Task 17 sign-off.

**PIN reset + consent + erasure (owner S6b, `0034_pin_reset_erasure.sql`):**
```sql
create table if not exists public.pin_reset_requests (id uuid primary key default gen_random_uuid(), user_id uuid not null, method text not null check (method in ('google','family')), code char(2) not null, secret_hash text not null, approved_by uuid, approved_at timestamptz, used_at timestamptz, created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '15 minutes');
create table if not exists public.erasure_requests (user_id uuid primary key, requested_at timestamptz not null default now(), cancel_until timestamptz not null default now() + interval '7 days', done_at timestamptz);
alter table public.people add column if not exists consent_at timestamptz, add column if not exists consent_version text, add column if not exists consent_by uuid;
-- retire the admin flow (D-76): revoke execute on public.request_pin_reset(text) from anon, authenticated; keep admin_requests for history.
```
Protocol (C5): `pin-login` action `reset_start {handle, method}`: anon, rate-limited 3 per hour per handle and 10 per hour per IP (0009 pattern, same reply for every case), creates the row, returns `{id, secret}` (128 random bits shown once, stored hashed); `code` (2 digits) is shown on the requester's screen. Method `family`: `notify_family(person, 'system'? no: kind 'pin_approve' is not a carer kind: the request inserts `carer_alerts` kind `system`? No.)` -> the function inserts a row per active member with kind `review_open`? **Contract:** add kind `pin_approve` to `carer_alerts.kind` in 0030 (S1 adds it; S6b uses it): every active member except the requester gets a `pin_approve` row (in-app sheet `start-approve-req` on open; web push for PWA users through the flush). The requester's screen says "Ask a family member to open Bantay and approve" with the code. `approve_pin_reset(id, code)` RPC (authenticated, not the requester, code must match, first approval wins). Method `google`: the OAuth identity must match the user, approval set server-side. `reset_complete {id, secret, new_pin}`: verifies the secret against `secret_hash`, `approved_at` set, not used, not expired; hashes the PIN server-side with `_shared/pin.ts`; marks `used_at`; `audit_log` action `pin_reset`; `pin_changed` row for the owner. The fingerprint route is not built (Q33 deferral; `BiometricPlugin.java` has no Keystore binding). `export_my_data()` and `request_erasure()` / `cancel_erasure()` are SECURITY DEFINER scoped to `auth.uid()`'s person. `family-names`: no-token mode unchanged (D-65) plus `?invite=<token>` mode for `start-who` (M6).

**Job heartbeat and client errors (owner S8, `0033_job_runs.sql`):** `public.job_runs(id bigint identity, job text, ran_at timestamptz, ok bool, summary jsonb)`; `is_admin()` select only; keep 30 days. `_shared/heartbeat.ts` `heartbeat(sb, job, ok, summary)`; `ok = false` -> `carer_alerts` kind `system` for every admin user (`ref = job || ':' || floor(epoch/21600)`). `public.client_errors(id bigint identity, user_id uuid, app_version text, where_ text, message_hash text, count int, day date, unique (user_id, where_, message_hash, day))`: the app's `window.onerror`/`unhandledrejection` handler upserts a hashed message (no stack, no URL, no values) once per error per day through a SECURITY DEFINER RPC `log_client_error(where_, message_hash, app_version)`; admin select; keep 30 days. No third-party SDK (Sentry parked, Q36). `admin_pending_migrations()` and `admin_weekly_kpis()` SECURITY DEFINER RPCs as in rev 2.

**Shell version + plugins (owner S1):** `src/native/shell.ts`: `shellVersion()`, `shellAtLeast(v)`, `hasPlugin(name)`. `capacitor.config.ts` reads `process.env.CAP_SERVER_URL ?? 'https://bantay.pages.dev'` (C1).

### 3.2a File ownership table (Phase 2)

| Owner | Files (exclusive) |
|---|---|
| Orchestrator pre-commit (3.2b) | `package.json`, `package-lock.json` (no new dependencies expected in Phase 2; the line exists so lanes never touch them), `src/features/sync/tables.ts` (outbox rows for `phone_health`, `sos_events`, `sos_acks`), `android/app/src/main/AndroidManifest.xml` (`CALL_PHONE`), `capacitor.config.ts` (`CAP_SERVER_URL`), `supabase/functions/_shared/heartbeat.ts` stub, `docs/session-10/contracts.md` |
| S1 ALERTS-INAPP | `supabase/migrations/0030_carer_alerts.sql` (+down, rehearsal), `src/native/shell.ts`, `src/features/notify/*` (`templates.ts` incl. new ids, `alertsLive.ts` realtime + poll, `AlertsBanner.tsx` APK copy "Family alerts show here when you open Bantay", `push.ts`, `alerts.ts`, `subscribe.ts`), `supabase/functions/_shared/templates.ts` (+ equality test against the client file), `src/features/inbox/*` (bell list = `carer_alerts` + existing inbox rows; `lock-missed` as an in-app sheet: Call, Mark taken for her (`can_write`, "Did you see her take it?", `marked_by`), Message the family), `src/features/shell/TabBar.tsx` (badge only), `supabase/functions/dose-watch/index.ts` (port `carerRow`, `flushWebPush`, phone-health sweep, `dose_due`, `mode:'flush'`, heartbeat line), `broadcast/index.ts` + `logic.ts` (also writes `carer_alerts` kind `hazard` rows so APK users see admin broadcasts in the app), `ops/sql/dose_watch_cron.sql`, `docs/ALERTS-INAPP.md` |
| S2 SOS | `supabase/migrations/0031_sos.sql`, `src/features/sos/*` (incl. `Call911.tsx`, `SosHold.tsx`, `call.ts`, `sms.ts`), `android/.../CallPlugin.java`, `android/.../MainActivity.java` (registration line) |
| S3 ALARMS | `src/features/health/reminders.ts` (+test), `health/reminderActions.ts` (+test), `src/features/phonecheck/*` (`probe.ts` exported for S6a, `PhoneCheckCard.tsx`, `AlarmHealthRow.tsx`, `AlarmFixedToast.tsx`), `supabase/migrations/0032_phone_health.sql`, `android/.../SettingsOpenerPlugin.java`, `src/features/safety/settingsOpener.ts`, `scripts/release-apk.ps1` (version bump), `docs/NATIVE.md` |
| S4 REVIEW + FAMILY-CARER | `src/features/health/meds.ts` (+test), `health/MedReview.tsx`, `health/Medicines.tsx` (marked-by line), `supabase/functions/dose-watch/logic.ts`, `dose-watch/dose-watch.test.ts`, `src/features/family/People.tsx`, `family/CarerCards.tsx`, `family/IncomingSos.tsx`, `family/FamilyPhones.tsx`, `family/FamilyAnswer.tsx`, `family/family.css` |
| S5 ALERTS-AUTO | `supabase/functions/alerts-ingest/*`, `ops/sql/alerts_cron.sql`, `src/features/safety/*` (all), `src/screens/Safety.tsx`, `docs/ALERTS.md` |
| S6a ONBOARD | `src/screens/Onboarding.tsx`, `src/features/setup/*` (incl. `steps.ts`; imports `probe` from S3; asks `CALL_PHONE` on the SOS-contacts card), `src/screens/SignIn.tsx`, `src/features/auth/pinLogin.ts`, `auth/pinReset.ts`, `auth/family.ts`, `auth/signin.css`, `src/features/shell/icons/*` |
| S6b AUTH-SERVER | `supabase/migrations/0034_pin_reset_erasure.sql`, `supabase/functions/pin-login/*`, `functions/family-names/*`, `functions/erase/*`, `_shared/pin.ts`, `_shared/pin.test.ts`, `_shared/handle.ts`, `_shared/login.ts`, `_shared/login.test.ts`, `ops/sql/erasure_cron.sql`, `docs/AUTH.md` |
| S6c LOCK + ME + PRIVACY | `src/features/auth/FingerGate.tsx` (+test), `auth/biometric.ts`, `src/screens/Me.tsx` (+test; imports `AlarmHealthRow`), `src/features/privacy/*`, `public/privacypolicy.html`, `public/breach-plan.html`, `src/features/medid/*`, `src/features/update/*` |
| S7 TODAY | `src/screens/Today.tsx`, `Today.simple.test.tsx`, `src/features/today/*` except `weather.ts`/`WeatherCard.tsx`, `today.css` |
| S7w WEATHER | `src/features/weather/*`, `src/features/today/WeatherCard.tsx`, `src/features/today/weather.ts`, `src/features/location/place.ts` (exports `WeatherStrip`, `RainMap`) |
| S8 MONITOR | `supabase/functions/_shared/heartbeat.ts` (+test; replaces the stub), `supabase/migrations/0033_job_runs.sql`, `src/features/monitor/errors.ts` (+test), `src/main.tsx`, `src/admin-main.tsx` (one hook line each), `src/features/admin/desk/System.tsx`, `desk/systemApi.ts`, `desk/types.ts`, `desk/WebShell.tsx`, `desk/Home.tsx`, `desk/homeApi.ts`, `src/data/migrations.json`, `supabase/functions/records-extract/index.ts` (heartbeat line only), `docs/MONITORING.md` |
| S9 BP-GUIDED + VERDICT | `src/features/health/bpcheck/*`, `health/verdict.ts` (+test), `health/readingPreview.ts` (+test), `health/vitals.ts` (copy), `health/ranges.ts`, `health/AddReadingSheet.tsx`, `health/MetricScreen.tsx`, `src/features/sensors/health.ts`, `supabase/migrations/0035_reading_alerts.sql`, `docs/session-8/CLINICAL-REVIEW.md` ("Session 10 safety"; S4 sends its review-rule paragraph through `needs`) |
| S10 JACK-CLIENT | `src/features/assistant/*` (incl. `gateClient.ts`), `scripts/jack-redteam.mjs`, `supabase/functions/ask/gate.ts` (JSON export of the phrase list) |
| S11 RECORDS-NAME | `supabase/functions/records-extract/logic.ts` (+test), `src/features/records/*`, `src/features/scan/ScanFlow.tsx` |

Hook lines (owner adds): `App.tsx` (S1: `alertsLive` start, Privacy route for S6c); `QuickLog.tsx` (S7) <- S9 `BpCheckButton`; `Me.tsx` (S6c) <- S3 `AlarmHealthRow`; `Today.tsx` (S7) <- S3 `AlarmFixedToast`, S5 `StormCard`, S1 `AlertCardToday` (newest unseen row as a Today card); `SimpleToday.tsx` (S7) <- S2 `SosHold`, `Call911`; `dose-watch/index.ts` (S1) <- S8 `heartbeat` (S8 merges first); `reminders.ts` (S3) <- none.

### 3.2b Orchestrator pre-commit (before the Phase 2 base sha is named)
1. `src/features/sync/tables.ts`: outbox rows for `phone_health` (upsert by `user_id`), `sos_events` (insert, client UUID), `sos_acks` (insert); pull for `sos_events` (family) is read live by S2 through Realtime, not sync.
2. `AndroidManifest.xml`: `<uses-permission android:name="android.permission.CALL_PHONE" />` (only if Q32 = auto-dial).
3. `capacitor.config.ts`: `server.url` from `CAP_SERVER_URL` with the production default.
4. `supabase/functions/_shared/heartbeat.ts` stub.
5. `docs/session-10/contracts.md` Phase 2 part; mockup notes for `lock-missed`, `lock-sos`, `lock-storm` rewritten to "in-app alert view (D-78)" in the vault copy; `npx tsc --noEmit` 0; commit "s10 p2 base".

### 3.2c Lane briefs (beyond the contract; Sonnet builds, Opus audits)

**R1 (Haiku, readonly):** PAGASA machine feeds (CAP/Atom/RSS/JSON) for TCWS, rainfall and thunderstorm advisories and their stated terms; "none found" is an acceptable answer; no scraping is planned without a published feed and terms.
**R2 (Haiku, readonly):** OEM battery-saver / autostart settings intents (Xiaomi MIUI/HyperOS, Oppo/Realme, Vivo, Samsung, Huawei) with package + activity names; cross-check `SettingsOpenerPlugin.java:61`.
**R3 (Haiku, readonly):** RainViewer free-tier coverage of Mindanao and Bohol, current limits (zoom 7, 100 req/IP/min, past frames only), attribution text.

**S1 ALERTS-INAPP (critical).** 0030 + `notify_family` + Realtime publication; `alertsLive.ts` (subscribe while open, filter by own uid, poll on resume and every 30 s, writes rows into Dexie `alerts` so the bell works offline with what was last seen); bell list (`start-inbox`: newest first, unread dots, top card "Family alerts show here when you open Bantay; the browser app also gets notifications"); `lock-missed` in-app sheet; `AlertCardToday` (one card for the newest unseen urgent row: SOS > reading > missed dose > hazard); tab-bar badge; `AlertsBanner` APK copy + sets kv `alerts.inapp.ok` (re-enables the switch-to-app banner, Q1); dose-watch `index.ts` port methods, flush, sweep, `dose_due`, `mode:'flush'`, heartbeat; broadcast writes `hazard` rows too. Acceptance: vitest (realtime row -> Dexie -> badge; seen_at update; old shell -> no native call), `npx vitest run supabase/functions` 0, 0030 rehearsal ALL PASS (duplicate `ref` ignored; RLS: a member cannot read another's rows), shots `start-inbox`, `lock-missed` (in-app sheet), `today-full` (alert card variant), `start-banner`.

**S2 SOS (critical).** The 3.1 flow. `CallPlugin.java` (ACTION_CALL with a runtime `CALL_PHONE` check; returns `{placed: boolean}`; never used for 911); `call.ts` (`callFirstContact()`: plugin -> `tel:` fallback), `sms.ts` (body with name, time, maps link + digits, no second recipient), `SosScreen` sequence with the foreground-return hook (`App.addListener('appStateChange')`), `safety-sos-sent` with acks and cancel, `SosHold`/`Call911` for Simple mode, one composer per contact. Offline: steps 1-3 work with no data (the insert waits in the outbox; the server marks it late if > 30 min and does not alert then). Acceptance: unit tests (no contact -> 911 dial screen and the contacts picker; permission denied -> `tel:`; offline -> row queued + composer opened; cancel -> `cancelled_at`), 0031 rehearsal (trigger writes one `sos` row per active member except the person; late insert writes none; 4th insert in 10 min refused), shots `safety-sos-hold`, `safety-sos-sent`, `simple-hold`.

**S3 ALARMS (critical).** `reminders.ts`: one-shot `at` alarms for the next 7 days per slot with `allowWhileIdle: true` (the first-schedule path is the good one; the `on:` re-arm path is the broken one); re-plan on every app open and on `appStateChange` active; compare `LocalNotifications.getPending()` ids with the plan and re-arm any difference; sig includes app version + Manila day; the 500-pending cap is checked (fall back to 3 days if a phone exceeds it). Repeats (`lock-alarm`): each dose slot schedules +0, +10, +20 min with actions "I took it", "In 10 min", "Skip today"; logging a dose cancels the remaining two; the +20 text says "Third reminder; your family will see this in Bantay at :30". Phone check (`phonecheck/probe.ts`): notifications, exact alarm, battery exemption, OEM autostart (R2 intents), test alarm; `PhoneCheckCard` = `start-done-fix`; `AlarmHealthRow`; `AlarmFixedToast`; writes `phone_health` through the outbox. Acceptance: unit tests (getPending mismatch -> schedule; dose logged -> cancel +10/+20; old shell -> null fields), `scripts/check-manifest.mjs` 0 after `cap sync`, shots `start-done-fix`, `today-alarmfix`, `lock-alarm` (notification content page), device tests 3.4.

**S4 REVIEW + FAMILY-CARER (critical).** `meds.ts`: a medicine in review keeps its reminders (`reviewOverdue` only flags); `MedReview.tsx` "I stopped it" confirm (`health-med-stop`); writer carers can answer (`FamilyAnswer.tsx`, "answered by <carer>"); dose-watch `logic.ts`: review medicines watched after day 1; `review_open` row once per medicine per day via `carerRow`; `digest` row at 20:00 Manila when compartments are open (Q18); `mood_unwell` row when an `unwell` mood arrives (the app calls `notify_family` directly on save; Q4). `CarerCards.tsx` (missed dose with Call / Mark taken for her under the M4 rule; unanswered review; phone health), `IncomingSos.tsx`, `FamilyPhones.tsx`. Acceptance: unit tests incl. the SQL proof in the rehearsal (`select count(*) from medications ... not exists (<planned reminder>)` = 0 for a fixture with a review medicine 4 days old); `runDoseWatch` fixture with `review:true` older than 1 day produces a `review_open` row at the 30-min window; shots `family-home`, `family-answer`, `family-phones`, `health-meds`, `health-med-stop`, `lock-sos` (in-app view).

**S5 ALERTS-AUTO (critical).** If R1 found a feed with terms: ingest it into `safety_alerts` (TCWS tier 1 with signal number + areas; rainfall advisories tier 2). Otherwise: GDACS TC + Open-Meteo severe weather produce the tier-1 rows and the copy says "From GDACS and Open-Meteo, checked every 10 minutes; PAGASA bulletin: open" (M8). After upsert: each new tier-1 row within a member's home zone -> `notify_family(member person, 'hazard', template, safety_alerts.id, 'self')` (scope `self` = that member only; S1 adds it to `notify_family`) and one `mode:'flush'` call so PWA users get the push now. Heartbeat line. `safety-storm` storm mode (How are you? faces = mood log, Do now list), `safety-warnings`, `safety-hub` (Phone alerts count from S3's probe result in kv), `safety-phonewarn`, `lock-storm` as the in-app alert row + Today storm card. Acceptance: ingest tests (new tier-1 row -> one row per member in zone; rerun -> none), shots `safety-storm`, `safety-warnings`, `safety-hub`, `safety-phonewarn`, `lock-storm` (in-app).

**S6a ONBOARD (critical).** Three screens: `start-who` (names from `family-names?invite=<token>`; invite link `https://bantay.pages.dev/#join/<token>`), `start-pin` (PIN + fingerprint switch default on), `start-done` (consent one-liner writes `people.consent_at`, `consent_version = '2026-10'`; two off switches; the S3 probe runs in the background; `start-done-fix` only on failure). `start-pinpad`, `start-wrong` (1-minute countdown, fingerprint stays available, no "Ask an admin"), `start-forgot` (Google + Family approval; fingerprint hidden until a Keystore-bound route exists), `start-approve-wait` ("Ask a family member to open Bantay"), `start-approve-req` (in-app sheet from the `pin_approve` row). Medicines, SOS contacts (with the `CALL_PHONE` ask), sharing become Today checklist cards. Acceptance: `onboarding.spec.ts` rewritten, unit tests for the reset client state machine, shots for its 11 `start-*` screens.

**S6b AUTH-SERVER (critical).** 0034 + the C5 protocol in `pin-login`, `family-names` dual mode (M6), `erase` function (after `cancel_until`: deletes readings, medications, meds_taken, activity, documents + storage objects, push rows, messages by that user, carer_alerts, sos rows; keeps `audit_log`; `people.erased_at`; Drive copies are the family folder owner's to remove, D-46), `ops/sql/erasure_cron.sql`, `export_my_data()`. Acceptance: function tests for every C5 rule, rehearsal ALL PASS incl. the revoke on `request_pin_reset`.

**S6c LOCK + ME + PRIVACY (critical for privacy copy).** `start-finger` (Jack, greeting, date, weather glance from the cached forecast, ridge mark with a slow scan line, Use PIN / Not you, Call 911 (dial screen), Medical ID without unlock showing allergies, conditions, who to call only), `start-me` (text size, Simple mode, "I also look after someone", Family admin tools, Privacy row, `AlarmHealthRow`, "Hold for help can call for you" permission row), `start-privacy` ("Agreed when you joined, <consent_at>", AI switch, Download my data, Delete my data with the 7-day undo, processors list: Supabase, Open-Meteo and RainViewer (coordinates rounded to 1 km), OpenRouter with zero-data-retention, Google Drive (family-owned folder), Cloudflare Pages (hosting); no Firebase, Sentry or SMS gateway in this build), `public/privacypolicy.html` rewritten (Lloyd reviews before "Draft" is dropped, Task 17), `public/breach-plan.html`, `start-update` checked against the live updater, consent backfill rule (Q34). Acceptance: shots `start-finger`, `start-me`, `start-privacy`, `start-update`, `safety-medid` (lock variant), vitest for the FingerGate states.

**S7 TODAY.** `today-full` (weather card first with greeting, bell + badge and M inside; advisory row; `AlertCardToday`; late dose; quick log; Plan today; `GreetingBand` deleted; `AlarmFixedToast`, `StormCard` hooks), `today-log` (six big tiles; How are you? row = `logMood` + `checkIn`; `unwell` calls `notify_family` (Q4); More row; `BpCheckButton` hook), `simple-today` (`WeatherStrip`, I took it, How are you? -> `simple-mood`, `SosHold`, `Call911`, Call Ate Joy), `simple-taken`, `today-storm`, `today-offline`. Acceptance: `today.spec.ts`, `today-auth.spec.ts`, `Today.simple.test.tsx` updated; shots for the 7 screens.

**S7w WEATHER.** `today-weather`: RainViewer past frames only (last 2 h, zoom <= 7, 100 req/IP/min, no tile caching beyond the session) on Leaflet; if R3 finds no Philippine coverage, Open-Meteo hourly rain bars + PAGASA radar link (M1); chips Rain / Wind / Storm track; warnings; 48 h hourly; 10-day; rain this month vs normal; PAGASA outlook + heat bands as link-out text; sunrise/sunset; kv cache with "Saved for offline, updated HH:MM"; attributions. `today-storm-track` from the GDACS/S5 rows, cached. Exports `WeatherStrip`, `RainMap`. Acceptance: `weather.spec.ts`, unit tests for cache freshness and the fallback branch, shots `today-weather`, `today-storm-track`.

**S8 MONITOR.** `heartbeat.ts`, 0033 (`job_runs`, `client_errors`, `log_client_error`, `admin_pending_migrations`, `admin_weekly_kpis`), `monitor/errors.ts` (hashed message, no PII, once per error per day), `System.tsx` (`admin-system`: alarm health per phone from `phone_health`, jobs + last run (red when older than 30 min), client errors last 7 days by app version, unseen `carer_alerts` by kind (how many alerts nobody has opened, which is the D-78 trade-off made visible), pending migrations vs `migrations.json` (skips 0028), weekly KPIs), Home "who has seen it" line from `carer_alerts.seen_at`. Acceptance: vitest for the red/amber rules, shots `admin-system`, `admin-home`, `admin-broadcast` ("In the app for everyone; browser users also get a notification").

**S9 BP-GUIDED + VERDICT (critical).** Owns the one BP table (`verdict.ts`, `readingPreview.ts`, `vitals.ts` copy; hand-computed tests 134/84 above, 133/83 above, 138/86 high, 129/79 raised, 119/79 in, 88/58 low). Crisis flow (H7): >= 180/120 asks about symptoms first -> Yes: Call 911 (dial screen); No: "Rest 5 minutes and check again; if still 180/120 or more, call Dr. Santos today"; glucose < 70: rule-of-15 card; SpO2 < 90: re-check, 911 if breathless. The carer row (0035) fires regardless; its copy to the elder: "Your family will see this in Bantay". `health-bp`, `health-bpresult`, `BpCheckButton`. Acceptance: tests above + 0035 rehearsal cases (lab import row -> none; 3 h old row -> none; two 185/90 rows in 6 h -> one; glucose 3.0 mmol/L -> one), shots `health-bp`, `health-bpresult`, `health-vitals`.

**S10 JACK-CLIENT.** Local keyword gate before `takeMessage`; 911 card from `reply.emergency` (dial screen); source chips; `ask-offline`; `tools.ts` draft validation reuses `readingPreview` SPECS; `scripts/jack-redteam.mjs` (100 prompts). Deferral (J3): `explain_term` from the knowledge table at the Phase 3 release review. Acceptance: vitest 0; shots `ask-emergency`, `ask-offline`.

**S11 RECORDS-NAME (critical, hazard K1).** `records-extract/logic.ts` stores `patient_name_as_printed` into `documents.printed_name` (column from 0030); confirm sheet shows "Name on paper: X" and a red mismatch warning when `nameKey` differs from the person and their aliases; Confirm needs the acknowledgement; `ScanFlow` requires an explicit person pick when more than one person exists. Acceptance: e2e fixture "Rosa Dela Cruz" for "Me (Jun)" shows the warning and blocks Confirm; shots `health-papers`, `health-record`.

### 3.3 Mockup screens each lane must match (`data-s`, 52 unique)
S1: `start-inbox`, `lock-missed` (in-app sheet), `start-banner`, `today-full` (alert card variant, shared with S7). S2: `safety-sos-hold`, `safety-sos-sent`, `simple-hold`. S3: `start-done-fix`, `today-alarmfix`, `lock-alarm`. S4: `family-home`, `family-answer`, `family-phones`, `health-meds`, `health-med-stop`, `lock-sos` (in-app view). S5: `safety-storm`, `safety-warnings`, `safety-hub`, `safety-phonewarn`, `lock-storm` (in-app). S6a: `start-get`, `start-iphone`, `start-invite`, `start-who`, `start-pin`, `start-done`, `start-pinpad`, `start-wrong`, `start-forgot`, `start-approve-wait`, `start-approve-req`, `start-dependent`. S6c: `start-finger`, `start-me`, `start-privacy`, `start-update`, `safety-medid`. S7: `today-full`, `today-storm`, `today-offline`, `today-log`, `simple-today`, `simple-mood`, `simple-taken`. S7w: `today-weather`, `today-storm-track`. S8: `admin-system`, `admin-home`, `admin-broadcast`. S9: `health-bp`, `health-bpresult`, `health-vitals`. S10: `ask-emergency`, `ask-offline`. S11: `health-papers`, `health-record`.

### 3.3a Screens this plan does NOT change (D-67 disclosure)
`today-week`, `health-labs`, `health-labs-empty`, `health-labdetail`, `health-meddetail`, `health-medsheet`, `health-refill`, `health-visits`, `health-move`, `health-movedetail`, `health-food`, `health-plate`, `health-med-pause`, `health-body`, `ask-answer`, `ask-scan-paper`, `safety-hotlines`, `safety-gobag`, `safety-ids`, `family-plan`, `family-add`, `family-member`, `family-report`, `family-memories`, `admin-calendar` (F6 only), `admin-members` (F8 only), `admin-dups` (F7 only), `admin-files` (F6 only). Phase 3 changes `health-library`, `health-home` (nudge entry), `ask-home`, `safety-firstaid*`, `learn-*`, `fun-*`, `nudge-*`.

### 3.4 What needs what
- **Native Android work (APK 2.3.0):** S2 `CallPlugin` + `CALL_PHONE` (only if Q32 = auto-dial); S3 OEM intents in `SettingsOpenerPlugin`. Nothing else. If Lloyd picks the dial screen (Q32) and accepts deferring the OEM intents to 2.4.0, Phase 2 ships with **no new APK** and Task 15 is skipped. `scripts/check-manifest.mjs` must still pass after `cap sync`.
- **APK test window (C1, Task 15, only when a native change ships):** Pages branch preview URL added by Lloyd to `ALLOWED_ORIGIN` (comma list; S1 makes `_shared/http.ts` accept it) and Supabase Auth > Redirect URLs; CI builds `2.3.0-rc` with `CAP_SERVER_URL=<preview>`; sideload; preview origin removed after roll-out.
- **Migrations:** 0030 (S1) -> 0031 (S2) -> 0032 (S3) -> 0033 (S8) -> 0034 (S6b) -> 0035 (S9). Rehearsed on WSL in that order.
- **Edge functions to deploy:** dose-watch, broadcast, alerts-ingest, records-extract, pin-login, family-names, erase (new), ask (only if S10 changed `gate.ts` export). No `sos`, no `system-status`.
- **Cron files (Lloyd applies):** `ops/sql/alerts_cron.sql`, `ops/sql/erasure_cron.sql`, `ops/sql/dose_watch_cron.sql` only if its body changed.
- **Secrets (Lloyd):** `ERASE_CRON_SECRET`; `ALLOWED_ORIGIN` list during the test window. Nothing else new. (Removed: Firebase, Semaphore, `GOOGLE_SERVICES_JSON_BASE64`, Sentry DSN.)
- **Device tests (Lloyd; test phone = Papa's Xiaomi if possible; about 2 calendar days because of the Doze tests, 3 h hands-on):**
  1. Carer phone (APK, app closed): open Bantay 35 min after a missed slot on the elder's phone; the Family tab shows the missed-dose card and the bell has the row; Mark taken for her asks "Did you see her take it?".
  2. `adb shell am force-stop ph.bantay.family`; open the app; a reminder set for +3 min still fires; Me shows "1 set again".
  3. Day 2 and day 3: the 08:00 reminder arrives within 60 s with the phone idle overnight; +10 and +20 repeats fire when not logged; a dose logged at +5 cancels them; the carer row appears at :30.
  4. SOS, data off: hold 3 s; the phone dials the first contact (auto-dial or dial screen per Q32); after the call the SMS app opens pre-written to that contact; "Text <second>" opens the second; both texts arrive after the elder taps Send. Data back on: the `sos_events` row appears, a family phone that opens Bantay shows the full-screen incoming-SOS view and the ack shows on the elder's status screen. Data on from the start: the family phone already open shows it within 5 s (realtime); a PWA member gets the web push.
  5. Fingerprint lock screen: Medical ID opens without unlock showing no medicine names; Call 911 opens the dialer prefilled.
  6. PIN reset by family approval on two phones (approver opens Bantay and sees the sheet); a reused secret is refused.
  7. Hazard row: insert a fixture tier-1 row through `alerts-ingest` with the cron secret; every member in zone sees the storm card on Today and the bell row on open; a PWA member gets the push.
  8. Old shell check: the 2.2 APK on the new web shows the "Update the app" lines where a native feature is missing and no crash on Today, Me, Safety.
  9. Dangerous reading: type 185/95; the symptoms sheet appears; the carer phone shows the `reading_high` row on open.
- **Lloyd-only gates:** apply 0030-0035 + cron files; deploy functions; test window (15, if native); device tests (16); clinician + privacy review (17); merge; APK 2.3.0 (if native) + roll-out; versionCode floor after roll-out.

### 3.5 Phase 2 merge order and release
Merge queue: S8, S1, S3, S2, S4, S5, S9, S11, S6b, S6a, S6c, S7w, S7, S10. After each: tsc, tier-0 smoke, duplicate scan, `npx vitest run src/features/notify supabase/functions` when a server lane lands, rehearsal when SQL changed. Then full gates, 52-screen shot compare, Opus release review, `git tag pre-s10-p2 origin/main`, PR "Session 10 safety wave (D-78)". Deploy order: database (0030-0035 + cron) -> functions -> web (merge) -> APK 2.3.0 if native -> roll-out -> versionCode floor. Old shells keep working on the new web through feature detection.

### 3.6 Phase 2 rollback
- **Web:** Pages rollback to the previous deployment (rolls back every APK too).
- **Functions:** redeploy from tag `pre-s10-p2`; `erase` can stay deployed unused.
- **Database:** additive; leave tables. Stop effects: `drop trigger if exists readings_alert on public.readings` (0035), `drop trigger if exists sos_events_alert on public.sos_events` (0031), `select cron.unschedule('erasure')`, set `DOSE_WATCH_AFTER_MIN=120` to restore the old window.
- **APK:** cannot downgrade; the new plugins are dormant when the web rolls back; a `2.3.1` revert build only if a plugin crashes at start. The versionCode floor rises only after roll-out.
- **Jack:** env back to `n8n`.
- **Signal:** `job_runs.ok = false` for dose-watch, `client_errors` spike by app version on System health, or any family report.

### 3.7 Hazards deferred from Phase 2 (dated)
- **M3 / gap 1 (push to the APK):** parked by D-78; `carer_alerts` is the input for a later sender (Task 29). Mitigation now: tab badge, Today alert card, Family cards, System health "unseen alerts" count, honest copy.
- **S1 server-sent SOS SMS:** parked (Task 30); the elder's phone sends the text after one tap.
- **J3 (Jack hallucination):** `scripts/jack-redteam.mjs` at every release review; `explain_term` from the knowledge table at the Phase 3 release (Task 28).
- **A6 (bad deploy hits every APK at once):** tags + Pages rollback; no staged channel.

---

## 4. Phase 3: Discover + fun logging (about 3-4 sessions; APK 2.4.0 for the TTS plugin and, if deferred from Phase 2, the OEM intents)

### 4.1 Content and licence tasks (from R-discover.md / R-nudge.md)
| Content | Source and licence | Who | Where it lands |
|---|---|---|---|
| Health library topics (offline) | MedlinePlus health-topics XML, US-government public domain; credit "Source: MedlinePlus, National Library of Medicine"; EXCLUDE ASHP drug monographs and A.D.A.M. | D2 build script; Haiku checks count + licence strings | `src/data/learn/topics.json` (about 250 topics; gzip < 1.5 MB) |
| Encyclopedia | WikiMed mini ZIM 166 MB via the Kiwix app: link-out only | D2 | one card under Learn > More |
| Medicine + supplement cards | Bantay-written from DailyMed/openFDA labels and NIH ODS fact sheets (public domain); RxNorm names; one MedlinePlus drug link per medicine; never ASHP text; every card ends "Talk to your doctor first"; angioedema line is red "call 911"; do-not-mix is a curated clinician-signed list per card, never "no interactions found" | D3 writes; **Lloyd gate: clinician review** | `src/data/learn/meds/*.json` (about 15 cards) |
| Recipes | 20 original low-sodium Filipino recipes; salt per serving vs the person's limit; Pinggang Pinoy plate redrawn with FNRI credit | D4; Lloyd emails FNRI (optional) | `src/data/learn/recipes.json` |
| Studies | NIH News in Health RSS full text cached with credit; Cochrane and PH health news headline + link only | D5 via n8n news-feed (N1) | `news_items.source_kind = 'study'` |
| Audio | Native TTS plugin `@capacitor-community/text-to-speech` (pinned) on the APK, Web Speech on the PWA; Tagalog voice tested on Mama's phone first; podcasts link-out | D2; Lloyd tests the voice | `src/features/discover/listen/tts.ts` |
| Mindfulness | Self-built breathing circle (reuse `breathLogic.ts`), waves, candle; UCLA Mindful link-out | D5 | `src/features/discover/mind/*` |
| Brain games | Written from scratch; our word lists; "fun mental exercise", never a dementia/memory claim | D6 | `src/features/discover/play/*`, `src/data/play/*.json` |
| News | RSS headline + link + source (PNA, GMA, Inquirer, Rappler) | D7 + N1 | `news_items` (`zone`, `source_kind`) |
| Fun facts | Wikipedia On This Day (CC BY-SA credit + link), NASA APOD (Lloyd's key; `copyright` field honoured), one PH fact from our list | D6 `discover-daily` | `daily_cards` (0036) |
| Watch | Curated YouTube playlists from official channels only, deep links, never embed; official apps row; pirate aggregators never | D7; **Lloyd curates** 12 playlists | `watch_playlists` (0037) |
| First-aid videos | Philippine Red Cross first, DOH second; link-out until written permission; offline copies only from files the Red Cross provides, never YouTube downloads | D9; **Lloyd emails PRC** | `src/data/safety/firstaid-videos.json` |

**Offline storage budget (a vitest fails when exceeded):** bundle growth <= 8 MB; opt-in downloads in Me > Storage: first-aid videos <= 60 MB, Tagalog audio clips <= 20 MB; WikiMed lives in Kiwix. Cached feeds capped at 2 MB with a 7-day trim.

### 4.2 Phase 3 contracts
```sql
-- 0036_discover.sql (D5)
alter table public.news_items add column if not exists source_kind text not null default 'news' check (source_kind in ('news','advisory','study','video'));
create table if not exists public.daily_cards (day date primary key, cards jsonb not null, fetched_at timestamptz not null default now()); -- members select; service role writes; keep 14 days
-- 0037_watch.sql (D7)
create table if not exists public.watch_playlists (id uuid primary key default gen_random_uuid(), title text not null, channel text not null, youtube_id text not null unique, kind text check (kind in ('drama','sports','movies','live','music','faith','other')), videos int, added_by uuid, added_at timestamptz default now(), active bool default true); -- is_admin() insert/update; members select where active
-- 0038_nudge.sql (D8a)
alter table public.family_messages drop constraint if exists family_messages_kind_check; alter table public.family_messages add constraint family_messages_kind_check check (kind in ('text','voice','photo','file','kudos','fact'));
create table if not exists public.streak_freezes (day date primary key, used_by uuid not null, kind text check (kind in ('freeze','sick'))); -- RPC use_freeze(day, kind): 2 'freeze' per month, 'sick' unlimited
create table if not exists public.badges (user_id uuid, badge text, earned_at timestamptz default now(), primary key (user_id, badge)); -- own insert/select; view badges_public for family names only
create table if not exists public.nudge_settings (user_id uuid primary key, times text[] default '{08:00,20:00}', quiet jsonb, fewer bool default false, kudos_from uuid[], sound bool default false, lang text default 'en');
```
```ts
// src/features/discover/index.ts (D1): export type DiscoverSub = 'learn' | 'listen' | 'play' | 'watch' | 'news'; each content lane exports default <Screen sub="..."/> from src/features/discover/<sub>/Screen.tsx and `routes: string[]`
// src/features/discover/listen/tts.ts (D2): speak(text, lang), stop(), available(lang)
// src/features/nudge/api.ts (D8a): familyStreak(now), recordLog(kind:'bp'|'dose'|'scan'|'meal'|'mood')
```

### 4.3 Phase 3 lanes and file ownership (11 lanes: 10 code + 1 config)

| Lane | Owns | Mockup `data-s` |
|---|---|---|
| Pre-commit (orchestrator) | `package.json` + lockfile (`@capacitor-community/text-to-speech` pinned), `contracts.md` Phase 3 part |
| D1 SHELL-DISCOVER | `src/features/shell/*` (5 tabs, floating 56 px Ask Jack, hidden in Simple mode and on `bare` screens; keeps S1's badge), `src/App.tsx`, `src/screens/Discover.tsx`, `src/screens/Safety.tsx` (News tile -> `#discover/news?zone=gensan`, drop `NewsTop5`), `src/screens/Health.tsx` (Library row -> Discover links), `src/features/family/People.tsx` (LearningHub row), `src/features/assistant/Assistant.tsx` (back arrow, one-time bubble) | `learn-home` (shell), `ask-home`, `health-library`, `safety-hub` (News tile) |
| D2 LEARN-LIBRARY + TTS | `scripts/knowledge/medline-topics.mjs`, `src/data/learn/topics.json`, `src/features/discover/learn/{Screen,Library,Article,Together}.tsx`, `discover/listen/tts.ts`, credits entry | `learn-library`, `learn-article`, `learn-together` |
| D3 LEARN-MEDS (critical) | `src/data/learn/meds/*.json`, `discover/learn/{Meds,MedCard,SuppCard}.tsx`, mechanism SVGs | `learn-meds`, `learn-medcard`, `learn-suppcard` |
| D4 LEARN-RECIPES | `src/data/learn/recipes.json`, `discover/learn/{Recipes,Recipe,Cook}.tsx` | `learn-recipes`, `learn-recipe`, `learn-cook` |
| D5 STUDIES + LISTEN + MIND | `supabase/migrations/0036_discover.sql`, `discover/learn/Studies.tsx`, `discover/listen/*` (except `tts.ts`), `discover/mind/*` | `learn-studies`, `learn-listen`, `learn-mind` |
| D6 PLAY | `discover/play/*`, `src/data/play/*.json`, `supabase/functions/discover-daily/*` (`NASA_API_KEY`), share a fact to the family chat (`messagesApi` kind `fact`) | `fun-play`, `fun-memory`, `fun-wordsearch`, `fun-trivia`, `fun-facts`, `fun-settings` |
| D7 WATCH + NEWS | `supabase/migrations/0037_watch.sql`, `discover/watch/*`, `src/data/watch/livetv.json`, `discover/news/Screen.tsx`, `src/features/admin/desk/Watch.tsx` + `types.ts` `'watch'` + `WebShell.tsx` nav line | `fun-watch`, `fun-watchlist`, `fun-livetv`, `fun-news` |
| N1 NEWS-FEED (config, validate-only) | `ops/n8n/news-feed.json` patch, `ops/n8n/news-feed.validate.json` | feeds `fun-news`, `learn-studies` |
| D8a NUDGE-CORE (critical) | `supabase/migrations/0038_nudge.sql`, `src/features/nudge/{api,Home,JackState,SavedSheet,Streak,Recap,Settings}.tsx`, `nudge/reminderCopy.ts`, `src/features/health/NudgeCard.tsx`, hook lines in `today/actions.ts`, `health/AddReadingSheet.tsx`, `scan/pipeline.ts`, `health/reminderActions.ts` | `nudge-home`, `nudge-saved-ok`, `nudge-saved-high`, `nudge-streak`, `nudge-recap`, `nudge-settings`, `health-home` (entry) |
| D8b NUDGE-VIEWS | `src/features/nudge/{Pixels,Badges,ScanShelf,Pillbox,Reminder}.tsx`, `nudge/replyParse.ts` (+test; local-notification input action "Reply with your reading" -> `logReading`) | `nudge-pixels`, `nudge-badges`, `nudge-scan`, `nudge-pillbox`, `nudge-reminder` |
| D9 FIRSTAID-VIDEO | `src/data/safety/firstaid-videos.json`, `src/features/safety/FirstAid.tsx`, `safety/FirstAidDetail.tsx`, `safety/Cpr.tsx`, `safety/offlineVideos.ts`, `discover/learn/FirstAidCard.tsx` | `safety-firstaid`, `safety-firstaid-detail`, `safety-firstaid-cpr`, `learn-firstaid` |

### 4.4 Phase 3 needs
- **Lloyd before launch:** answers to the Phase 3 questions recorded as D-8x; 12 YouTube playlists; NASA API key; Red Cross and FNRI emails (templates `docs/session-10/emails.md`); Tagalog voice check on Mama's phone.
- **Lloyd before merge:** clinician review of medicine cards and recipe tags; native Tagalog read; apply 0036-0038; `n8n apply` of the validated news-feed patch; deploy `discover-daily`; set `NASA_API_KEY`; CI builds APK 2.4.0 and rolls it out.
- **Migrations:** 0036 (D5) -> 0037 (D7) -> 0038 (D8a). **Merge order:** D1, D2, D3, D4, D5, D6, D7, D9, D8b, D8a. **Shot compare:** 55 screens plus `today-full` with the Jack bubble.

### 4.5 Phase 3 rollback
- **Web:** Pages rollback. **Functions:** `discover-daily` can stay; n8n: re-activate the previous news-feed version. **Database:** additive. **APK 2.4.0:** the TTS plugin is dormant when the web rolls back; `2.4.1` only if it crashes at start.

---

## 5. Gates summary (every phase)
1. Per lane: tsc 0, lane vitest 0, lane Playwright 0 (bare, exit codes quoted), shots at 390x844 light + dark, checklist returned, Opus audit pass or pass_with_issues with a fix round.
2. Merge queue: one lane at a time, smoke + duplicate scan after each, rehearsal when SQL changed.
3. Release: full vitest, full e2e (600 s webServer), shot compare vs mockup, Opus whole-branch review, tag, PR.
4. Lloyd: `apply` (database + cron) -> deploy functions -> test window + device tests (when native changed) -> clinician/privacy reviews -> `merge` (web) -> APK -> roll-out -> rollback block known.
5. Retro: `retro.mjs` with each run's journal; promote checklist items (orchestrator only).

---

## 6. Open questions for Lloyd (32; defaults apply if unanswered; answers recorded as D-79+ before the phase launches)

Blocking Phase 1 / interim:
1. **Switch-to-app banner (`start-banner`):** hide now (F2), re-enable in Phase 2 with the honest line "Family alerts show when you open the app; the browser app also gets notifications"? Default: yes.

Blocking Phase 2:
2. **Phone check fail (`start-done-fix`):** reach Today with the fix pending? Default: yes, with a Today card until fixed.
3. **PIN reset by family (`start-forgot`):** one approver or two? Default: one active adult member (not the requester), code read aloud; the approver must open Bantay (no push on the Android app).
4. **Unwell in Simple mode (`simple-mood`):** Default: `mood_unwell` alert row for carers + a big "Call Ate Joy" button (dial screen); no auto-dial for a mood.
5. **Carer sees "Still taking it?" (`health-meds`):** Default: yes, and can answer it.
6. **Rain map (`today-weather`):** Default: RainViewer past frames at zoom <= 7 if R3 confirms PH coverage, else Open-Meteo hourly rain + PAGASA radar link.
7. **Quick log tiles (`today-log`):** BP, sugar, weight, water, food, dose taken? Default: yes.
8. **Lock-screen Medical ID (`safety-medid`, `start-finger`):** Default: allergies, conditions, who to call; no medicine names before unlock.
9. **Dangerous-reading flow (S9):** Default: symptoms first (911 dial screen with symptoms, else rest and re-check, then call the doctor); rule of 15; SpO2 re-check; carer row in every case; clinician signs.
10. **Message retention (`family-thread`):** Default: voice notes and photos 30 days, text kept.
11. **Confirm box before a broadcast to everyone (`admin-broadcast`):** Default: yes.
32. **SOS call: auto-dial or dial screen (D-78 item 2)?** Auto-dial = `ACTION_CALL` with `CALL_PHONE` (needs APK 2.3.0 and a permission prompt at setup; the phone starts calling Ate Joy the moment the 3-second hold ends; a slip past the hold calls family, never 911). Dial screen = `tel:` prefilled (no APK change; the elder must press the green button; works on the PWA too). Default: **auto-dial** for the family contact, dial screen for 911, dial screen as the fallback everywhere.
33. **Fingerprint PIN-reset route:** ship Google + family approval now, Keystore-bound fingerprint later (APK 2.4+)? Default: yes.
34. **Carer alert window after a missed dose:** 30 minutes (CANON) vs 2 hours. Default: 30 minutes, with the 20:00 digest as the calm view.
35. **After 3 unanswered alarms, should the elder's phone also open the SMS app pre-written to the carer ("Mama has not taken her 9 AM medicine")?** Default: **no** (an in-app row only; the elder would have to tap Send, and an elder who ignored three alarms will not).
36. **Sentry:** add later when there is a reason, or never? Default: not now; `client_errors` + System health cover it.
37. **Consent backfill:** existing members get `consent_at` on first open with a one-line notice; dependents' consent recorded by their writer carer. Default: yes.

Blocking Phase 3:
12. **Family streak scope (`nudge-home`):** Default: any family log.
13. **Year in pixels visibility (`nudge-pixels`):** Default: the person only, with a "Share with Ate Joy" switch.
14. **Streak freezes per month (`nudge-streak`):** Default: 2; illness days unlimited.
15. **Carer digest at 8 PM (`nudge-pillbox`):** Default: yes, as an in-app row (and web push for browser users), opt-out per carer.
16. **Sunday recap audience (`nudge-recap`):** Default: only people the person picks.
17. **Two-way reply channel (`nudge-reminder`):** Default: phone notification reply only.
18. **"Fewer check reminders" default in Simple mode:** Default: on.
19. **Medicine cards to start (`learn-meds`):** Default: the family's medicines + 5 supplements (about 15).
20. **Recipes at launch:** Default: 20.
21. **WikiMed 166 MB:** Default: Kiwix link under "More".
22. **Studies sources:** Default: NIH News in Health full text + PH health headlines (links).
23. **Tagalog narration:** Default: phone voice (native TTS plugin); record 20 clips only if Mama's phone has no Filipino voice.
24. **First-aid video storage and sources:** Default: link-out until the Red Cross answers; then their files offline on carers' phones by default, elders opt-in.
25. **Who adds playlists:** Default: Lloyd via the admin web page.
26. **News sources:** Default: PNA, GMA, Inquirer, Rappler.
27. **Fun-fact sharing:** Default: straight to the one family chat.
28. **Scoreboard:** Default: games played, not scores.

(Numbers 29-31 retired in rev 3: second-carer escalation timer, SMS provider, failed-job push. Failed jobs now show on System health and as an in-app `system` row for admins.)

Skipped as cosmetic (the plan picks): hint count in Memory (unlimited), Tagalog-first word list, CPR beat fixed at 110, break reminder on at 45 min, bubble resets at midnight, 30-day family report (yes, small), album kept off by default, Fix does not post in chat, archive keeps the typed name, Recent keeps 10 questions, capture photo not kept, admin files stay three pages, sharing switches stay on Me.

---

## 7. Effort and risks

| Phase | Agent sessions | Wall clock | Lloyd time |
|---|---|---|---|
| 1 Wave 2 fix round + release | 1 | 8-10 h | 45 min (apply, merge, gate script, env flip) |
| 2 Safety wave (D-78) | 3-4 | 28-34 h (research 1 h, pre-commit 1 h, build 10-12 h in two batches, audits + fix round 7-8 h, merge + gates 7 h, release 2 h) | about 2 calendar days of device tests (3 h hands-on) + 1 h apply/deploy/APK + clinician + privacy review + 1 h roll-out; no Firebase, Semaphore or Sentry setup |
| 3 Discover + fun logging | 3-4 | 32-38 h (content 6 h, build 12 h, audits + fix 8 h, merge + gates 6 h) | 3 h (playlists, emails, voice test, answers) + clinician review + APK 2.4.0 roll-out |

Risks and what we do about them:
- **Carers do not open the app, so alerts go unseen (the D-78 trade-off).** Tab badge, Today alert card, Family cards, honest copy; System health shows unseen alerts by kind so Lloyd can see whether the family actually opens Bantay; FCM parked (Task 29) with `carer_alerts` as its ready input.
- **Auto-dial on a sideloaded APK:** `CALL_PHONE` is a runtime permission the family grants once; OEMs may block background calls, so the call is placed from the foreground SOS screen only; fallback is the dial screen. False calls to family are possible after an accidental 3-second hold; 911 is never auto-dialled.
- **Group MMS and SMS composer differences per OEM:** one composer per contact; device test 4 on the test phone; the composer-opened flag is all the app can know.
- **Doze/force-stop behaviour differs per OEM:** one-shot 7-day alarms tested on one phone over 2-3 days; `phone_health.alarms_rearmed` on System health; the plugin patch stays in reserve.
- **Realtime on RLS tables:** Supabase Realtime respects RLS for `postgres_changes`, but the publication and policies must line up; the 0030 rehearsal cannot test Realtime, so device test 4 and a Playwright test against a local Supabase (if available) cover it; the 30 s poll is the safety net.
- **PAGASA has no machine feed (likely):** GDACS + Open-Meteo rows and copy that says so; no scraping.
- **RainViewer** may not cover the Philippines at zoom 7; R3 decides; fallback built in.
- **Old shells on the new web:** feature detection everywhere; device test 8; versionCode floor only after roll-out.
- **Account takeover via PIN reset:** the C5 protocol; fingerprint route waits for Keystore binding; family approval needs the approver to open the app (slower, so the Google route is offered first when linked).
- **False carer alarms from the readings trigger:** home rows only, 2 h freshness, per component, unit conversion, 6 h bucket; rehearsal cases in S9.
- **Unapplied migrations drift:** Phase 1 applies 0025-0029 first; every later phase applies before merging.
- **e2e flakes under load:** rerun alone with `--repeat-each 2`; 600 s webServer.
- **Worktree bases and file collisions:** ownership tables + pre-commit; `git reset --hard <sha>` first.
- **WSL Postgres crash-loops:** keep one `wsl` process alive; never restart it from a lane (ML-14).
- **No third-party error monitoring:** `client_errors` catches hashed messages only; a silent white screen on an elder's phone still depends on the family telling Lloyd; Sentry can be added later (Q36).
- **Content licences (Phase 3):** only public-domain or Bantay-written text bundled; a vitest greps for forbidden markers; offline videos only from Red Cross files.
- **Clinician and Tagalog reviews are external:** medicine cards, 4-7-8 breathing and the S9 copy sit behind flags/gates so merges do not wait, releases do.
- **Jack live flip** only after `jack-gate-live.mjs` passes; n8n stays as rollback for one release.

---

## 8. Self-review (writing-plans skill, rev 3)
- **Spec coverage:** D-78 items 1-5 applied (table at the top). Brief items 1-7 remain covered: pre-flight (0), Phase 1 unchanged, Phase 2 re-cut to in-app alerts + phone-app SOS, Phase 3 unchanged except the APK 2.4.0 note, lanes with files/model/acceptance/`data-s`/review, migrations 0030-0038 sequenced, deploy order, Lloyd gates, 32 questions with defaults, effort + risks, rollback per phase. The trade-off is stated at the top, in 3.7 and in the risks.
- **Placeholders:** none. Research-dependent items (R1-R3) have named fallbacks. The `notify_family` scope list is `carers | family | self`; the kinds list includes `pin_approve` (added in 0030 for S6b).
- **Type consistency:** `carer_alerts.kind` values match the templates and their writers (S1 `dose_missed`/`phone_health`, S4 `review_open`/`digest`, S7 `mood_unwell`, S9 `reading_high`, S2 `sos`/`sos_cancel`, S5 `hazard`, S8 `system`, S6b `pin_approve`); `carerRow`, `flushWebPush`, `notify_family` signatures used consistently; no reference to `push_tokens`, `sendToUsers`, FCM, Semaphore or Sentry remains in any lane brief.
- **One owner per file:** 3.2a and 4.3 assign every file named in any brief; shared dependencies are pre-committed; hook lines listed with their owner.

Skipped / not checked: nothing was run (no tsc, no SQL, no device, no network); Realtime-with-RLS behaviour, OEM handling of `ACTION_CALL` from a WebView-hosted app, and RainViewer/PAGASA availability are settled by the research lanes and device tests.
