# Session 10 build plan: wave 2 fix round, safety wave, Discover + fun logging

**Status:** rev 2, for Lloyd's approval (D-77: plan before code). Nothing in this file is built, applied, deployed or pushed.
**Written:** 2026-10-26 by the planner (Fable 5.1, writing-plans skill); rev 2 applies the Opus 5.5 review (`docs/session-10/PLAN-REVIEW.md`, GO_WITH_CHANGES).
**UI contract:** mockup v6, `D:/ObsidianVault/20-projects/family-bantay/mockups/bantay-complete-mockup.html` (135 screens, `data-s` ids quoted per lane). Every lane ships 390x844 light + dark shots beside the matching screen before merge (D-66, D-67).

**Goal:** Ship wave 2 (fixed), then make the safety net real (push to the APK, server SOS with an offline SMS path, alarms that repeat and survive Doze and force-stop, automatic hazard pushes, monitoring, guided BP with one verdict table), then add Discover and the fun-logging mechanics, in that order.

**Architecture:** Same stack, no new layers. One new server channel (`carer_alerts` rows + one sender `_shared/push.ts` that renders fixed template strings and fans out to Web Push and FCM notification messages) carries every carer-facing event. Everything else is client React + Dexie + the existing sync/outbox, Supabase migrations numbered from 0030, and edge functions. Native work ships as APK 2.3.0 (Phase 2) and 2.4.0 (Phase 3), and every native call is feature-detected so old shells keep working on the new web bundle. Discover content is bundled public-domain or Bantay-written JSON; anything with a restrictive licence is link-out.

**Tech stack:** React 19 + Vite 8 + Dexie (local-first), Capacitor 8.5.3 Android shell (`server.url`), Supabase (Postgres, RLS, Edge Functions on Deno, pg_cron, pg_net), Web Push (VAPID) + Firebase Cloud Messaging HTTP v1 (new), Semaphore SMS (new) + native `SmsManager` (new), OpenRouter (Jack, scans), Open-Meteo, RainViewer past-frame tiles on Leaflet, Sentry, Playwright + Vitest, multi-lane-build workflow (Sonnet builds, Opus 5.5 audits).

---

## Changes after Opus review (rev 2)

| Finding | Applied where |
|---|---|
| C1 test APK loads production web | 3.4 "APK test window": `CAP_SERVER_URL`, Pages branch preview, `ALLOWED_ORIGIN` comma list (S1b `_shared/http.ts`), Lloyd adds/removes the preview origin; Task 15a |
| C2 old shells on the new web | 1 Conventions "feature detection"; S1a/S3/S6a briefs; `phone_health.alarms_ok = null` on shells < 2.3.0; 3.5 release policy (min versionCode after roll-out) |
| C3 FCM needs title+body | 3.1 templates contract: `_shared/templates.ts` owned by S1b, client re-exports; notification messages with `channel_id`, `priority high`; kinds `system`, `mood_unwell`, `hazard` added |
| C4 CI APK without FCM | S1a owns `.github/workflows/release-apk.yml`; secret `GOOGLE_SERVICES_JSON_BASE64`; build fails when the file is missing; "offline keystore" wording fixed (CI signs with `ANDROID_KEYSTORE_BASE64`) |
| C5 PIN reset takeover | 3.1 "PIN reset" contract (hashed 128-bit secret, single use, 15 min, server-side PIN hash via `pin.ts`, rate limits, audit + owner push); fingerprint route deferred (Q32, D-78); 0034 retires `admin_requests` + `request_pin_reset`; S6a removes "Ask an admin"; unresolved text removed |
| C6 false/stale reading alarms | 3.1 "Dangerous reading" contract: home/device rows only, 2 h freshness, per BP component, mmol/L x18, 1 per person per kind per 6 h, SECURITY DEFINER + `search_path ''`, pg_net flush at once |
| H1 file collisions | 3.2a "File ownership table" + 3.2b "Orchestrator pre-commit" (package.json, lockfile, postinstall, sync rows, manifest permission lines); S6a owns `steps.ts`; named test files; `carerRow` port method; S8 merged before S1b; every unowned file assigned |
| H2 repeat alarm + 3 tries | S3 (+10/+20 repeats with actions, `lock-alarm`), S1b dose-watch window configurable, default 30 min; Q33 |
| H3 SOS offline | S2 native `SmsPlugin.java` (`SEND_SMS`), used offline or after 5 s without a server answer; composer PWA only; late replays > 30 min marked late; device test 4 rewritten |
| H4 SOS abuse/cost | 0031 `sos_contacts` table (server-side recipients), 3 calls / 10 min, Semaphore priority endpoint, no URL in the SMS body, S8 Semaphore balance check |
| H5 interim push notice | Phase 1 F2: hide the switch-to-app banner, show the APK notice; Q1 updated |
| H6 BP table owner | S9 owns `verdict.ts`, `readingPreview.ts`, `vitals.ts` copy; clinician gate in Phase 2 (Task 16b) |
| H7 blunt crisis copy | S9: symptoms-first re-check flow (AHA), rule of 15, SpO2 re-check; carer alert still fires |
| H8 contract inconsistencies | 0030 `ref` column + unique index, kinds `hazard`/`mood_unwell`; S5 writes rows, flush pushes; S1b owns the phone_health sweep |
| H9 push_tokens via outbox | 0030 `register_push_token` RPC (SECURITY DEFINER), called directly; token deleted on sign-out |
| H10 RLS missing | 3.1 "RLS rules" block; `admin_pending_migrations()` RPC |
| H11 effort | S6a/S6c, S7/S7w, D8a/D8b split; 52 Phase 2 screens; Phase 2 = 4-5 sessions + ~3 days device tests + Semaphore approval |
| M1 RainViewer limits | S7w: past frames only, zoom <= 7, R3 coverage check, Open-Meteo hourly + PAGASA link fallback, attributions |
| M2 Web Speech in WebView | D2 owns `@capacitor-community/text-to-speech`; APK 2.4.0 in 4.4 |
| M3 channels need native | S1a native channel code, `res/raw/bantay_alarm`, versioned ids `sos_v1`, full-screen intent verified; copy softened |
| M4 Mark taken for her | S1a/S4: `can_write` only, "Did you see her take it?" confirm, `marked_by` shown |
| M5 thin Jack flip test | F5 `scripts/jack-gate-live.mjs` (30 phrases) gates the env flip; client-cap note in 2.4 |
| M6 family-names breaks sign-in | S6b keeps the no-token mode, adds the token mode |
| M7 RA 10173 | S6c: processors list, `people.consent_at/consent_version` (0034), breach plan page, erase explains Drive + audit_log, Lloyd reviews the notice; S8 Sentry scrubbing, no Replay; Q34 |
| M8 PAGASA scraping | S5 ingests PAGASA only if R1 finds a published feed with terms; else GDACS + Open-Meteo and `lock-storm` copy changes |
| M9 rollback | 2.5, 3.6, 4.5 rollback blocks |
| M10 apply list | 3.5 Lloyd list completed (cron files, GitHub secret, preview origin, FCM API enabled) |
| M11 Phase 3 contracts | 0038 alters `family_messages.kind`; `news_items.source_kind` everywhere; D3 curated do-not-mix only; Q16 default = person only; offline first-aid videos from Red Cross files only |
| M12 hazards M4/J3/K1 | M4 iPhone `dose_due` in S1b; J3 red-team script in S10 + dated deferral; K1 name-mismatch warning as lane S11 |
| L1-L7 | Unresolved text removed; F2 GreetingBand move dropped; S3 uses 7-day one-shot alarms (patch only if the cap bites); `FCM_PROJECT_ID` dropped; wave-2 minors carried into F2/F4/F6; `migrations.json` skips 0028; 0026 column check in 2.4 |
| Coverage | S4 acceptance SQL proof; S8 weekly KPIs; 3.3a list of screens the plan does NOT change; `lock-alarm` -> S3, `safety-phonewarn` -> S5, `start-update` -> S6c |

---

## 0. Principal-engineer pre-flight

**(1) Reframe and critique.** The deep review found the app's promises exceed what it does: carers on the APK get no push at all (no FCM; D-35 said there would be), SOS only opens an SMS composer, dose alarms die on force-stop and drift in Doze from day 2 and never repeat, "Still taking it?" silently stops both safety layers, official storm bulletins are never pushed, nothing monitors errors, and real use is near zero (1 writer, 0 home readings). Lloyd's mockup notes (D-76) add a frictionless family-only onboarding, weather-first Today, a Discover tab and fun logging. The risk is building the fun before the floor: the order Lloyd fixed (fix round -> safety -> Discover) is right. Critique of the inputs: (a) wave 2 lanes 1 and 4 sit on old main and will look like W1 reverts if merged raw; (b) three migrations (0025, 0026, 0027) have waited since 10-22 while app code that needs them sits unmerged, and the W1 outbox will 400 on `food_entries` until 0026 is applied; (c) the mockup promises things no lane owned (offline message queue, a repeating lock-screen alarm, "rings even on silent"), so this plan builds them or changes the copy; (d) the APK loads the live web bundle (`server.url`), so a new APK cannot be tested against unmerged code without a preview origin, and old APKs will run the new web before they have the plugins: feature detection is mandatory; (e) self-service PIN reset is an account-takeover surface and gets a real protocol; (f) several "Decide" questions change data design, so they are collected in section 6 with defaults and recorded as D-78+ before each phase launches (PLAYBOOK 0.1).

**(2) Data and context read first (done, read-only).** D-34/35/36/41/42/43/45/51/62/64/65/66/67/68/73/76/77; 04-HANDOFF top entries and NEXT-CHAT-PROMPT-session-10; deep review V1 (13 code verdicts), V2 (8 evidence verdicts), C-hazards (51 modes, top 15), A-features; mockup notes for all 135 screens, CANON.md, CONTRACT.md, R-discover.md, R-nudge.md, REVIEW2.md; session 9 PLAN.md and the 8 wave-2 review files; main a2f4e52 code (routes, TabBar, Today, Me, Onboarding/Wizard, reminders.ts, SosScreen, notify/*, dose-watch, broadcast, alerts-ingest, templates, vitals, 0003/0009/0029 SQL, AndroidManifest, capacitor.config, release-apk.yml); the 8 lane diffs; multi-lane PLAYBOOK + CHECKLIST; PLAN-REVIEW.md.

**(3) Tools and methods.** `multi-lane-build.js` workflow for every wave (Sonnet code lanes in worktrees from a named base sha, Opus 5.5 audit per lane, `args.contract` = `docs/session-10/contracts.md` generated from this plan's contract blocks at launch, `args.base` = the integration tip after the orchestrator pre-commit). Fix rounds as new workflow runs with only the failing lanes (PLAYBOOK 2). Merge queue one lane at a time with tier-0 smoke after each (PLAYBOOK 3b). WSL psql rehearsal for every migration. Playwright with the 600 s webServer timeout. `npx -y supabase@2.121.0` for apply and deploy (Lloyd). GitHub Actions `release-apk.yml` builds and signs the APK (secret `ANDROID_KEYSTORE_BASE64`); Lloyd triggers it. Haiku only for read-only research lanes (R1-R3) and grep gates.

**(4) Independent verification.** Opus 5.5 reviews every lane and the whole branch before each PR. Gates run bare with exit codes quoted: `npx tsc --noEmit`, `npx vitest run`, `npx playwright test`, screenshot compare vs mockup per `data-s`, migration rehearsal ALL PASS, `scripts/check-manifest.mjs` after any Android change, `scripts/jack-gate-live.mjs` before the Jack flip. Live checks after Lloyd's apply: `select version from supabase_migrations.schema_migrations order by 1 desc limit 8`, `select count(*) from push_tokens`, `select job, ran_at, ok from job_runs order by ran_at desc limit 5`. Device tests (Lloyd, section 3.4) are gates: force-stop re-arm, Doze day-2 and day-3 delivery, FCM on a locked Xiaomi, SOS with two contacts and data off (native SMS) and on (push + Semaphore), PIN reset by family approval. Retro after each release (`retro.mjs`).

**(5) Revised numbered plan = task counter (Tasks 0/32).**
1. Lloyd approves this plan; answers to section 6 recorded as D-78+ for Phase 1 and 2 questions (defaults apply to the rest).
2. P1: commit the wave-2 review files + `docs/session-10/contracts.md` (Phase 1 part) to the integration branch; launch the 8 fix lanes.
3. P1: merge the 8 lanes onto `claude/cache-ttl-cost-39e7cd`; smoke + duplicate scan after each.
4. P1: gates (tsc, vitest, full e2e incl. the 8 wave-1 failures triaged).
5. P1: Opus release review of the whole diff; fix round if needed.
6. P1: tag `pre-s10-p1` on main; push; one PR to main.
7. P1 gate (Lloyd): `apply` 0025, 0026, 0027, 0029; deploy `records-extract`, `ask`; verify.
8. P1 gate (Lloyd): `merge`; confirm live bundle; `jack-gate-live.mjs` exit 0 against the deployed `ask`; flip `VITE_ASSISTANT_PROVIDER=edge`.
9. P1: retro.mjs; handoff.
10. P2 prep (Lloyd, parallel with 2-9): Firebase project + `google-services.json` + service-account JSON + FCM v1 API enabled + GitHub secret; Semaphore account + key + sender-name request; Sentry DSN.
11. P2: Haiku research R1 (PAGASA machine feeds + terms), R2 (OEM battery/autostart intents), R3 (RainViewer PH coverage); record their results in contracts.md.
12. P2: orchestrator pre-commit (3.2b) on the integration tip = Phase 2 base sha; contracts.md Phase 2 part; launch 14 lanes in two batches of 7.
13. P2: audits, fix round, merge queue with smoke after each.
14. P2: migrations 0030-0035 rehearsed in order on WSL.
15. P2: gates + screenshot compare for 52 screens; Opus release review; tag `pre-s10-p2`.
15a. P2 test window (Lloyd + orchestrator): Pages branch preview URL added to `ALLOWED_ORIGIN` and Supabase Auth redirect URLs; CI builds test APK 2.3.0-rc against it (`CAP_SERVER_URL`); sideload to the test phone.
16. P2 gate (Lloyd): device tests (section 3.4) over 3 calendar days pass.
16b. P2 gate (Lloyd): clinician signs the S9 thresholds + crisis copy and the S4 review rule (CLINICAL-REVIEW.md "Session 10 safety"); Lloyd reviews `privacypolicy.html` + breach plan.
17. P2 gate (Lloyd): apply 0030-0035 + cron files; deploy functions; set secrets; merge PR; CI builds APK 2.3.0 against production; family roll-out; remove the preview origin; raise the minimum versionCode after roll-out; retro.
18. P3 prep (Lloyd): YouTube playlist list, NASA API key, Red Cross / FNRI emails sent, answers to the Phase 3 questions recorded as D-8x.
19. P3: content build (MedlinePlus XML -> topics.json, Bantay-written medicine cards, 20 recipes) and size budget check; Haiku licence-string sweep.
20. P3: pre-commit (TTS plugin dep); contracts.md Phase 3 part; launch 11 lanes.
21. P3: audits, fix round, merge queue.
22. P3: migrations 0036-0038 rehearsed; n8n news-feed ops file validated (never applied by a lane).
23. P3: gates + screenshot compare for 55 screens; Opus release review; tag `pre-s10-p3`.
24. P3 gates (Lloyd): clinician review of medicine/supplement cards and recipe tags; native Tagalog read; apply 0036-0038; n8n apply; deploy `discover-daily`; merge; APK 2.4.0.
25. P3: retro; handoff.
26. Family setup day + usability script (deep review gap 5) after P2 ships: 3 elders, time-to-SOS, time-to-log-BP; results into 02-DECISIONS.
27. Deferred-hazard review date: J3 explain_term-from-knowledge and the 100-prompt red team rerun (section 3.7) at the Phase 3 release review.

---

## 1. Conventions every lane follows

- **Base sha:** named in each brief. Phase 1 fix lanes: the lane's own last commit (after merging the integration branch in, lanes 1 and 4). Phase 2 and 3: the integration tip after the orchestrator pre-commit (3.2b / 4.4). Builder's first command: `git reset --hard <sha>` (ML-01).
- **One owner per file.** The ownership tables in 3.2a and 4.3 are the law. Shared files get one-line hooks only, added by the owner; the other lane ships a component in its own file and names it in `contracts.md`. Test files are named, never globbed.
- **Feature detection (C2).** Every native call is gated: `Capacitor.isPluginAvailable('PushNotifications' | 'Sms' | 'TextToSpeech')`, and shell-version checks read `App.getInfo().version` once at start (`src/native/shell.ts`, owned by S1a: `shellAtLeast('2.3.0')`). An old shell on the new web bundle degrades to the PWA behaviour with an honest line ("Update the app to use this", D-50), never a crash. `phone_health.alarms_ok` is `null` ("old app") on shells below 2.3.0.
- **Model:** Sonnet 5.5 builds every lane; Opus 5.5 audits every lane; Opus builds only after two failed Sonnet reviews. Haiku: read-only research lanes and mechanical checks only.
- **Review:** `critical: true` marks the lane in briefs. Final whole-branch review on Opus before each PR.
- **Shots:** `docs/session-10/shots/<lane>/<data-s>-{light,dark}.png` at 390x844 (admin: 1440x900 + 390x844), compared by the auditor against the mockup section with the same `data-s`.
- **Tests:** vitest for logic (hand-computed expected values, ML-17), one Playwright spec per lane for the screens it changes, axe on each new screen, no `sleep` (ML-25).
- **Copy:** plain words; one BP table (In range / A little raised / Above target 130-134 or 80-84 / High 135/85+ / Low) owned by S9; no "I'm OK" anywhere (CANON round 2); no admin gates; no brain-health or outcome claims; B-7 (no health values in notifications: the server renders fixed template strings only).
- **Migrations:** `NNNN_name.sql` + `.down.sql` + `supabase/tests/<name>_rehearsal.sql`; idempotent; full grants restated (ML-21); RLS policies written per the contract. Written only; Lloyd applies in the order given.
- **Secrets:** named in `needs`, never printed. Deploys, pushes, applies, n8n activations, CI runs: orchestrator and Lloyd only.
- **Status reply format:** every status to Lloyd shows **Tasks n/32** and the list above.

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
- Issue 1: no GreetingBand move (L2: S7 deletes it in Phase 2); note the deviation in risks. Issue 2: `SimpleToday.tsx` layout so Hold for help and the dose card fit in 844 px (`.td-bigbtn` 72 px, weather strip 56 px); e2e assertion at 390x844 and 360x640 that the SOS button's bounding box is inside the viewport before scroll.
- H5 interim push notice (2 files): `src/features/update/PwaBanner.tsx` returns null until a kv flag `push.native.ok` is true (S1a sets it in Phase 2); `src/features/notify/AlertsBanner.tsx` on native (`Capacitor.isNativePlatform()`) renders "Family alerts do not reach the Android app yet. Keep the browser app for missed-dose and storm alerts." instead of returning early. Unit tests for both.
- Minors 3-5 + L5: fake-timer test for the TabBar 8 s dismiss and `data-simple`; timer not started in Simple mode; a test asserting the five Safety group headings and tile placement; delete dead `.sf-act-sec`, `.bt .td-bigbtn.sos`; tokens `--late-bg`, `--late-ink` in `today.css`.
- Acceptance: `npx vitest run src/features/today src/features/safety src/features/update src/features/notify src/screens` 0; `npx playwright test e2e/today.spec.ts e2e/today-auth.spec.ts e2e/safety.spec.ts` 0. Mockup: `simple-today` (buttons above the fold), `safety-hub` (three tinted groups), `start-banner` (hidden state). Review: Opus.

**F3 W2-FAMILY** (worktree -3, base e8c9601, critical)
- Issue 1 (decision: build it, `family-msgs` promises "messages that cannot send yet wait on the phone"): text messages go through the existing outbox (`enqueue('family_messages', 'insert', row)` with a client UUID, `src/features/family/messagesApi.ts`), shown with a "Queued" tag until the poll returns them; voice notes and files stay online-only with "Needs signal". Add the table to the `src/features/sync/tables.ts` outbox allowlist only (no pull).
- Issue 2: `SLEEP_478_ENABLED = false` in `breathLogic.ts` (shortcut comment: clinician gate Task 16b) so 4-7-8 is hidden; Relax and Calm stay.
- Minors: drop the duplicate `is_family_member()` body from 0027 and `\ir 0023` in the rehearsal; re-enable the axe rule in `family-messages.spec.ts` by adding the visible text to `aria-label`; delete `familyLineLogic.ts(+test)` and the `card_seen_family_line` event.
- Acceptance: `npx vitest run src/features/family src/features/today` 0; `npx playwright test e2e/family-messages.spec.ts e2e/family-plan.spec.ts e2e/family-report.spec.ts e2e/today-auth.spec.ts` 0; 0027 rehearsal ALL PASS on WSL. Mockup: `family-home` (bubbles), `family-msgs`, `family-thread`, `today-breathe`. Review: Opus (critical).

**F4 W2-ASK** (worktree -4, base 9c07e92, critical)
- Merge fc9450c in (take wave 1's `vitals.ts`). Blocker: `src/features/scan/reading.ts:74` `'body_temp'` -> `'temperature'` (+ test). Issue 2: run `npx playwright test e2e/scan.spec.ts e2e/ask-sheet.spec.ts` bare with the 600 s config and quote exit codes; run `src/features/family/family-ui.test.tsx` alone and quote.
- L5 (W2-ASK #7 per-user cap): reading mode takes a daily slot through the existing `assistant_take` RPC with its own key `'reading'` (cap 20/day) before calling the model; 429 -> "Try again tomorrow or type the numbers".
- Minors: log `{fn, mode, ok, in_tokens, out_tokens}` counts only; `normalizeReading`: confidence missing -> fields null; plausibility bounds reused from `readingPreview.ts` SPECS (temp 30-45, spo2 50-100 added with a "plausibility, not clinical" note in CLINICAL-REVIEW.md); remove the duplicate "For Me" line; delete `crop.png`, `form.png`. R2 hazard: `ReadingConfirm.tsx` shows the `previewReading` verdict colour under the numbers and requires a tap on each prefilled number when `confidence < 0.9 or null` before Save is enabled.
- Acceptance: tsc 0; `npx vitest run src/features/scan supabase/functions/records-extract` 0; scan + ask-sheet specs 0. Mockup: `ask-capture`, `ask-capture-result`. Review: Opus (critical).

**F5 W2-JACK** (worktree -5, base d9ad15c, critical). Files: `supabase/functions/ask/*`, `src/features/assistant/client.ts`, `README.md`, `scripts/jack-gate-live.mjs`, `docs/ASSISTANT.md` only (never `Assistant.tsx`; the client gate and 911 card are Phase 2 S10).
- Blocker: `supabase/functions/ask/index.ts:27` add `.is('deleted_at', null)`; Reader test with a tombstoned row in `ask.test.ts`. Minor 3: BP regex requires a symptom or `presyon|bp|blood pressure` within 20 chars. Minor 5: README env row `VITE_ASSISTANT_PROVIDER`.
- M5: `scripts/jack-gate-live.mjs <ask-url> <jwt>` posts 30 emergency phrases (10 English, 10 Tagalog, 10 Taglish/Cebuano, listed in the script from `gate.ts` test fixtures plus 15 new ones) and exits 1 unless every reply carries `emergency.call === '911'` and the function's usage log shows 0 model calls for them (the script reads the `x-bantay-model-called: 0` header the function adds in this lane).
- Acceptance: `npx vitest run supabase/functions/ask src/features/assistant` 0; `node scripts/jack-gate-live.mjs` runs against a local `supabase functions serve` or is documented as Lloyd's live step. Review: Opus.

**F6 ADM-BE** (worktree -6, base 62020b6)
- Commit the 3 modified adm-a shots. Issue 1: `Queue.tsx` person filter belongs to F7. Issue 2: vitest for the Calendar month "Meds N" collapse, `listExpiringIds` (sort, skip rejected, error on any failure), 12 px axis minimum. Minors: `Ids.tsx` empty state for zero people; one rule for the Home tile and the list (0-60 days ahead, skip rejected, expired flagged separately); Active delta reports unknown at the 20k cap; `isExpired` uses `todayManila()`. L5 (ADM-BE #7): `dk-cardtab` keeps `role="table" | "row" | "cell"` attributes so semantics survive `display:block`; an axe check in the spec at 390.
- Acceptance: `npx vitest run src/features/admin` 0; `npx playwright test e2e/admin-web-home.auth.spec.ts e2e/admin-web-calendar.auth.spec.ts e2e/admin-desk-files.auth.spec.ts` 0. Mockup: `admin-home`, `admin-calendar`, `admin-files`. Review: Opus.

**F7 ADM-C** (worktree -7, base baaf403)
- Issue 1: 390 px Queue uses the `dk-cardtab` card layout under 768 px so Fix is visible; spec asserts it at 390. `Queue.tsx` honours `id` (`#/queue/<personId>`) with a test. Minor 3: `labTag` tests for Low, unknown (null, never Normal), no range; e2e fixture flag matches value. Minor 4: refresh the 60 s signed link on image `onError` (one retry) and every 50 s while the aside is shown. Full `npx vitest run` bare, exit code quoted (status leaves partial).
- Acceptance: `npx vitest run` 0; `npx playwright test e2e/admin-desk-records.auth.spec.ts` 0. Mockup: `admin-queue`, `admin-queue-empty`, `admin-queue-err`, `admin-dups`. Review: Opus.

**F8 ADM-D-VIEW** (worktree -8, base 0e53626, critical)
- Blocker (0029 hard-coded action list): keep 0029 and its number (0028 stays unused, recorded in contracts.md and skipped by `migrations.json`). Add `'view'` to `ACTIONS` and `STATUS_LABEL` in `src/features/admin/desk/logsApi.ts` ("Viewed as member") (ML-28); orchestrator grep gate at merge: `grep -rln audit_log_action_check supabase/migrations` returns exactly 0021 and 0029. Minors 1-2: `viewAsData.ts` treats `role=admin` as all-visible; `.not.in('kind', ['id_card','insurance_card'])` when relation is `carer`. Minor 3: commit members list + member page shots (1440 + 390, light + dark). Minor 6: `<details>` menu closes on Escape and outside click.
- Acceptance: `npx vitest run src/features/admin/desk` 0; `npx playwright test e2e/admin-view-as.auth.spec.ts e2e/admin-desk-members.auth.spec.ts` 0; `supabase/tests/admin_view_as_rehearsal.sql` ALL PASS. Mockup: `admin-viewas`, `admin-member`, `admin-members` (the "Members reset their own PIN" bar is Phase 2 S6b). Review: Opus (critical).

### 2.3 Merge, gates, release (orchestrator, Tasks 3-6)
1. Merge order onto `claude/cache-ttl-cost-39e7cd`: F5, F8, F6, F7, F2, F3, F4, F1 (server and admin first; Today.tsx editors F2 then F3 by hand; F1 last for m7a.css). After each: `npx tsc --noEmit`; tier-0 smoke `npx playwright test e2e/shell.spec.ts e2e/today.spec.ts`; duplicate scan `grep -rn "export function \(parseReply\|doseCount\|verdictFor\)" src | sort | uniq -d`.
2. Full gates: `npx vitest run` 0; `npx playwright test` with the 600 s webServer. The 8 wave-1 failures (today.spec:33, admin-desk-members 390, admin-desk-records x3, admin-web-calendar 1280, nutrition-auth Quick log light+dark axe timeout) rerun alone with `--repeat-each 2`; a real failure goes back to the owning fix lane (today.spec -> F2, admin specs -> F6/F7/F8, nutrition axe timeout -> orchestrator raises the axe timeout).
3. Opus 5.5 whole-branch release review (`/code-review` on fc9450c..tip). Fix round as a new workflow run with only the lanes named.
4. `git tag pre-s10-p1 origin/main`; push the branch; one PR "Session 9 wave 2 + fix round"; PR body lists the apply order below and the rollback block 2.5.

### 2.4 Lloyd's gates (Tasks 7-8), one PowerShell 5.1 block each, stops at the first failure
**`apply`** (before merge; the W1 outbox sends 0026 columns): 0025_knowledge -> 0026_nutrition_v2 -> 0027_family_messages -> 0029_admin_view_as, each `npx -y supabase@2.121.0 db query --linked -f supabase\migrations\NNNN_x.sql` then the `schema_migrations` insert (pattern `scripts/golive-w1.ps1`). Then `functions deploy records-extract --no-verify-jwt`, `functions deploy ask --no-verify-jwt`; secrets `OPENROUTER_CHAT_KEY` (set 10-22), `ALLOWED_ORIGIN=https://bantay.pages.dev`. Verify: `select count(*) from supabase_migrations.schema_migrations where version in ('0025','0026','0027','0029')` = 4; `select count(*) from information_schema.columns where table_name='food_entries' and column_name in ('carbs_g','fat_g','fibre_g','sugars_g','calcium_mg','iron_mg','magnesium_mg','vitamin_d_ug','b12_ug')` = 9 (L7; the lane confirms the exact names from 0026); `select count(*) from storage.buckets where id='family-messages' and not public` = 1; `select count(*) from pg_constraint where conname='audit_log_action_check' and pg_get_constraintdef(oid) like '%view%'` = 1.
**`merge`**: merge the PR; confirm `bantay.pages.dev` serves the new bundle hash; open Health, Family > Messages, Scan & Capture on Lloyd's phone (browser). `node scripts/jack-gate-live.mjs <ask url> <Lloyd's jwt>` exit 0 (30 phrases, 0 model calls); only then set `VITE_ASSISTANT_PROVIDER=edge` in Cloudflare Pages env and redeploy. Note: until S10 ships, the client cap (`Assistant.tsx:267`) still runs before the server gate; acceptable because the limit reply itself says "call 911".
Rule that bit: apply a migration before merging app code that reads it.

### 2.5 Phase 1 rollback
- **Web:** Cloudflare Pages -> Deployments -> "Rollback to this deployment" on the previous production build (this also rolls back every APK through `server.url`).
- **Functions:** `git checkout pre-s10-p1 -- supabase/functions/records-extract supabase/functions/ask` then redeploy both; or leave `ask` deployed and flip `VITE_ASSISTANT_PROVIDER` back to `n8n` (the n8n webhook stays active for one release).
- **Database:** 0025-0029 are additive; leave them. If 0027's bucket must go: `0027_family_messages.down.sql`.
- **Signal to roll back:** Sentry is not live yet; watch Supabase function logs for `ask` 5xx > 5 in 10 min, or any family report of a blank screen.

---

## 3. Phase 2: safety wave (4-5 sessions + about 3 days of device tests + Semaphore sender approval)

Covers deep-review gaps 1, 2, 3, 4, 6, 9, 10 plus D-76 onboarding/lock/consent/no-admin and Today weather-first + mood; gap 7 rides in S6b/S6c, gap 8 client side in S10, hazards M4 (S1b), K1 (S11), J3 (S10 script + deferral), gap 5 KPIs in S8.

### 3.1 Phase 2 contracts (copied into `docs/session-10/contracts.md` at launch)

**Templates (owner S1b, `supabase/functions/_shared/templates.ts`; `src/features/notify/templates.ts` re-exports it):** fixed strings, ids: `storm_warning`, `flood_watch`, `heat_alert`, `family_sos`, `sos_cancel` ("False alarm, all good"), `dose_due`, `dose_missed` (body "<name> has not marked a medicine."), `review_open` ("A medicine needs an answer"), `phone_health` ("A phone may miss alarms"), `reading_high` ("Please check on <name>" / "A reading needs a look. Open Bantay."), `mood_unwell` ("<name> is not feeling well" / "Open Bantay to call."), `digest` ("Today's family summary is ready"), `pin_approve` ("Someone asks you to approve a PIN reset"), `system` ("Bantay needs your attention (admin)"), `bp_check`. Each template carries `channel: 'sos_v1' | 'carer_v1' | 'default_v1'` and `tab`. Payload stays `{t, n?}`; the server renders title/body for FCM; the service worker renders them for Web Push.

**Carer-alert channel (owner S1b):**
```sql
-- 0030_push_channel.sql
create table if not exists public.push_tokens (
  client_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique, platform text not null check (platform in ('android')),
  app_version text, updated_at timestamptz not null default now());
create or replace function public.register_push_token(p_token text, p_app_version text) returns void
  language plpgsql security definer set search_path = '' as $$ begin
    if auth.uid() is null then raise exception 'not_signed_in'; end if;
    delete from public.push_tokens where token = p_token;                     -- a phone belongs to the latest signer-in (H9)
    insert into public.push_tokens (user_id, token, platform, app_version) values (auth.uid(), p_token, 'android', p_app_version);
  end $$;
create or replace function public.unregister_push_token(p_token text) returns void ... -- deletes where token = p_token and user_id = auth.uid()
create table if not exists public.carer_alerts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  carer_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('dose_missed','review_open','phone_health','reading_high','mood_unwell','hazard','sos','sos_cancel','digest','system')),
  template text not null,                                  -- a templates.ts id (B-7)
  ref text,                                                -- dedupe key: safety_alerts.id, sos_events.id, medication id + day, reading id
  created_at timestamptz not null default now(), pushed_at timestamptz, seen_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days');
create unique index if not exists carer_alerts_ref on public.carer_alerts (kind, ref, carer_user_id) where ref is not null;
create table if not exists public.push_deliveries (
  id bigint generated always as identity primary key,
  alert_id uuid references public.carer_alerts(id) on delete set null,
  user_id uuid not null, channel text not null check (channel in ('webpush','fcm')),
  status int, error text, sent_at timestamptz not null default now());
```
RLS rules (H10): `push_tokens` no direct access (RPC only; service role reads). `carer_alerts`: select where `carer_user_id = auth.uid()`; `grant update (seen_at)` with a policy `carer_user_id = auth.uid()`; inserts only by service role, the 0035 trigger (SECURITY DEFINER) and SECURITY DEFINER RPCs. `push_deliveries`: select only `is_admin()`. Trim in `dose_watch_prune`: `carer_alerts` older than 30 days, `push_deliveries` older than 60 days (ML-06).
```ts
// supabase/functions/_shared/push.ts (S1b)
export async function sendToUsers(sb, userIds: string[], payload: { t: TemplateId; n?: string }, opts?: { alertId?: string; urgency?: 'high' | 'normal' }): Promise<{ sent: number; failed: number }>
// Web Push: {t, n?} as today. FCM HTTP v1: a *notification* message {title, body} rendered from templates.ts + data {t, tab} + android {priority:'high', notification:{channel_id: template.channel}}. 404/410/UNREGISTERED delete the token or subscription; 429/5xx return failed and never consume a claim (hazard M5). OAuth2 bearer from secret FCM_SERVICE_ACCOUNT_JSON (project_id read from it; RS256 via WebCrypto, cached per isolate).
export async function flushCarerAlerts(sb, now: number): Promise<{ pushed: number }>  // rows with pushed_at null and not expired; one push per row; writes push_deliveries
export async function phoneHealthSweep(sb, now: number): Promise<{ rows: number }>     // phone_health.alarms_ok = false, or last_open_at older than 48 h -> carer_alerts kind phone_health, ref = user_id + Manila day
// supabase/functions/_shared/http.ts (S1b): ALLOWED_ORIGIN accepts a comma-separated list; CORS echoes the matching origin (C1)
// dose-watch port (S1b implements in index.ts; S4 calls from logic.ts): carerRow(kind, personId, carerUserIds: string[], template, ref): Promise<void>
// dose-watch window: DOSE_WATCH_AFTER_MIN env, default 30 (H2, CANON 9:30); WATCH_MAX_LATE_MIN stays 360
// dose_due for phones without native reminders (hazard M4): dose-watch pushes {t:'dose_due'} to the person's own push_subscriptions at each slot when push_tokens has no row for that user and phone_health.platform is 'web' or missing
```

**Phone health (owner S3, `0032_phone_health.sql`):** `public.phone_health(user_id uuid primary key, platform text check (platform in ('android','web')), app_version text, alarms_ok bool, notif_ok bool, exact_ok bool, battery_ok bool, oem text, last_open_at timestamptz, alarms_checked_at timestamptz, alarms_set int, alarms_rearmed int, updated_at timestamptz)`. `alarms_ok` is null on shells below 2.3.0 and on web. RLS: own row insert/update; select own; carers select through `people.auth_user_id = phone_health.user_id` joined to `carers.carer_id = auth.uid()`; `is_admin()` select all. Written through the outbox (row pre-committed in `sync/tables.ts`, 3.2b).

**SOS (owner S2, `0031_sos.sql`):**
```sql
create table if not exists public.sos_contacts (person_id uuid, slot int check (slot in (1,2)), name text, phone text, updated_at timestamptz, primary key (person_id, slot)); -- synced copy of kv sos.contacts; recipients come from here, never from the request body (H4)
create table if not exists public.sos_events (id uuid primary key default gen_random_uuid(), person_id uuid not null, user_id uuid not null default auth.uid(), at timestamptz not null, lat double precision, lon double precision, gps bool, late bool not null default false, sms_status text check (sms_status in ('native','server','composer','failed','none')), cancelled_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.sos_acks (event_id uuid references public.sos_events(id) on delete cascade, user_id uuid not null default auth.uid(), seen_at timestamptz not null default now(), primary key (event_id, user_id));
```
RLS: `sos_contacts` own person (self or writer carer) insert/update/select; `sos_events` insert for one's own person, select for active family members (`is_family_member()` from 0023); `sos_acks` insert/select own user, select all acks of events one can see. Edge function `sos` (verify_jwt, S2): rate limit 3 calls / 10 min per user (table-backed, 429); loads recipients from `sos_contacts`; inserts the event (or marks an outbox replay older than 30 min `late = true` and does not push); calls `sendToUsers` to every active member with `t:'family_sos'` (not for late rows); sends SMS through Semaphore's **priority** endpoint (`SEMAPHORE_API_KEY`), body = `sosBody` with plain "lat, lon" digits and no URL (PH telcos filter links; R-verify in lane); writes `carer_alerts` kind `sos` with `ref = event id`. Client: native `Sms` plugin (`SmsManager.sendTextMessage`, one message per contact, `SEND_SMS` permission; S2 owns `android/.../SmsPlugin.java`) is used when offline or when the server call has not answered in 5 s; the `sms:` composer stays only on the PWA. Cancel: `cancelled_at` set + `sos_cancel` push + carer row.

**Dangerous reading (owner S9, `0035_reading_alerts.sql`, needs 0030):** trigger `after insert on public.readings`, function `security definer set search_path = ''`, fires only when `new.source_file_id is null` (home or device rows, never lab imports) and `new.taken_at > now() - interval '2 hours'` (never stale outbox replays); evaluates each row on its own: `bp_systolic >= 180`, `bp_diastolic >= 120`, `glucose`/`fasting_glucose` `< 70 or > 300` in mg/dL (a value with unit `mmol/L` is multiplied by 18 first), `spo2 < 90`; inserts `carer_alerts` kind `reading_high` for each writer carer with `ref = person_id || ':' || kind-bucket || ':' || floor(epoch/21600)` so at most one alert per person per bucket per 6 h (the unique index absorbs duplicates); then `pg_net` POSTs to the dose-watch function with `{mode:'flush'}` and the cron secret so the push goes out at once (no 15-minute wait). Thresholds and copy cite CLINICAL-REVIEW.md and need the Task 16b sign-off.

**PIN reset + consent + erasure (owner S6b, `0034_pin_reset_erasure.sql`):**
```sql
create table if not exists public.pin_reset_requests (id uuid primary key default gen_random_uuid(), user_id uuid not null, method text not null check (method in ('google','family')), code char(2) not null, secret_hash text not null, approved_by uuid, approved_at timestamptz, used_at timestamptz, created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '15 minutes');
create table if not exists public.erasure_requests (user_id uuid primary key, requested_at timestamptz not null default now(), cancel_until timestamptz not null default now() + interval '7 days', done_at timestamptz);
alter table public.people add column if not exists consent_at timestamptz, add column if not exists consent_version text, add column if not exists consent_by uuid; -- consent_by = the carer for a dependent
-- retire the admin flow (D-76): revoke execute on public.request_pin_reset(text) from anon, authenticated; drop policy ... on admin_requests for pin resets; keep the table for history.
```
Protocol (C5): `pin-login` action `reset_start {handle, method}`: anon, rate-limited 3 per hour per handle and 10 per hour per IP (0009 pattern, same reply for every case, no enumeration), creates the row, returns `{id, secret}` where `secret` is 128 random bits shown once and stored as `secret_hash`; `code` (2 digits) is shown on the requester's screen. Method `family`: `pin-login` pushes `pin_approve` to every active member except the requester; `approve_pin_reset(id, code)` RPC (authenticated, not the requester, code must match, one approval wins) sets `approved_by/at`. Method `google`: the OAuth identity must match the user (existing `nativeOAuth`), approval set server-side. `reset_complete {id, secret, new_pin}`: verifies `secret` against `secret_hash`, `approved_at` set, not used, not expired; hashes the PIN server-side with `_shared/pin.ts`; marks `used_at`; writes `audit_log` action `pin_reset`; pushes the owner "Your PIN was changed" (template `system` is admin-only, so add `pin_changed` to templates). The fingerprint route is not built in Phase 2 (`BiometricPlugin.java` has no Keystore/CryptoObject binding; a WebView-held secret would be unlocked by any enrolled finger): recorded as D-78 (Q32), with a Keystore-backed version listed under Phase 3 native work if Lloyd wants it. `export_my_data()` and `request_erasure()` / `cancel_erasure()` are SECURITY DEFINER scoped to `auth.uid()`'s person. `family-names`: no-token mode unchanged (D-65, sign-in on a new phone), plus `?invite=<token>` mode that returns the same list for `start-who` (M6).

**Job heartbeat (owner S8, `0033_job_runs.sql`):** `public.job_runs(id bigint identity, job text, ran_at timestamptz, ok bool, summary jsonb)`; `is_admin()` select only; keep 30 days. `_shared/heartbeat.ts` `heartbeat(sb, job, ok, summary)`; when `ok = false` it inserts `carer_alerts` kind `system` for every admin user with `ref = job || ':' || floor(epoch/21600)` (one per 6 h). `admin_pending_migrations()` SECURITY DEFINER RPC returns applied versions from `supabase_migrations.schema_migrations` (PostgREST cannot read that schema; H10). `admin_weekly_kpis()` returns active members, home readings per week, on-time dose share (aggregates only).

**Shell version + plugins (owner S1a):** `src/native/shell.ts`: `shellVersion(): Promise<string | null>` (`App.getInfo()` on native, null on web), `shellAtLeast(v)`, `hasPlugin(name)`. `capacitor.config.ts` reads `process.env.CAP_SERVER_URL ?? 'https://bantay.pages.dev'` (C1).

### 3.2a File ownership table (Phase 2; every file touched by more than a hook line)

| Owner | Files (exclusive) |
|---|---|
| Orchestrator pre-commit (3.2b) | `package.json`, `package-lock.json` (+`@capacitor/push-notifications` pinned exact, `@sentry/react` pinned, `patch-package` only if S3 needs it later), `src/features/sync/tables.ts` (rows for `push_tokens`? no: RPC only; rows for `phone_health`, `sos_contacts`), `android/app/src/main/AndroidManifest.xml` (adds `SEND_SMS`, `USE_FULL_SCREEN_INTENT`, `VIBRATE`), `android/app/.gitignore` (`google-services.json`), `docs/session-10/contracts.md` |
| S1a PUSH-CLIENT | `src/native/shell.ts`, `src/features/notify/native.ts`, `notify/templates.ts` (re-export), `notify/AlertsBanner.tsx`, `notify/push.ts`, `notify/alerts.ts`, `notify/subscribe.ts`, `src/features/inbox/*`, `src/App.tsx` (hook lines for push init), `android/.../PushChannelsPlugin.java` (channels `sos_v1` alarm sound + vibration + DND-bypass request via `NotificationManager.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS`, `carer_v1`, `default_v1`; full-screen intent for `family_sos` when the OS allows it), `android/app/src/main/res/raw/bantay_alarm.ogg` (own recording, CC0), `.github/workflows/release-apk.yml`, `docs/PUSH.md` |
| S1b PUSH-SERVER | `supabase/migrations/0030_push_channel.sql` (+down, rehearsal), `supabase/functions/_shared/templates.ts`, `_shared/push.ts`, `_shared/push.test.ts`, `_shared/http.ts`, `dose-watch/index.ts`, `broadcast/index.ts`, `broadcast/logic.ts`, `ops/sql/dose_watch_cron.sql` |
| S2 SOS | `supabase/migrations/0031_sos.sql`, `supabase/functions/sos/*`, `src/features/sos/*` (incl. new `Call911.tsx`, `SosHold.tsx`, `nativeSms.ts`), `android/.../SmsPlugin.java`, `android/.../MainActivity.java` (plugin registration lines for Sms and PushChannels: S2 owns the file, S1a passes its one line through `needs`) |
| S3 ALARMS | `src/features/health/reminders.ts`, `reminders.test.ts`, `health/reminderActions.ts` (+test), `src/features/phonecheck/*` (`probe.ts` exported for S6a, `PhoneCheckCard.tsx`, `AlarmHealthRow.tsx`, `AlarmFixedToast.tsx`), `supabase/migrations/0032_phone_health.sql`, `android/.../SettingsOpenerPlugin.java`, `src/features/safety/settingsOpener.ts`, `scripts/release-apk.ps1` (version bump only), `docs/NATIVE.md` |
| S4 REVIEW + FAMILY-CARER | `src/features/health/meds.ts` (+test), `health/MedReview.tsx`, `health/Medicines.tsx` (marked-by line), `supabase/functions/dose-watch/logic.ts`, `dose-watch/dose-watch.test.ts`, `src/features/family/People.tsx`, `family/CarerCards.tsx`, `family/IncomingSos.tsx`, `family/FamilyPhones.tsx`, `family/FamilyAnswer.tsx`, `family/family.css` |
| S5 ALERTS-AUTO | `supabase/functions/alerts-ingest/*`, `ops/sql/alerts_cron.sql`, `src/features/safety/*` (all, incl. `alerts.ts`, `SafetyHub.tsx`, `SafetyBrief.tsx`, `stormView.ts`, `PhoneWarnings.tsx`), `src/screens/Safety.tsx`, `docs/ALERTS.md` |
| S6a ONBOARD | `src/screens/Onboarding.tsx`, `src/features/setup/*` (incl. `steps.ts`; imports `probe` from S3), `src/screens/SignIn.tsx`, `src/features/auth/pinLogin.ts`, `auth/pinReset.ts` (new), `auth/family.ts`, `auth/signin.css`, `src/features/shell/icons/*` |
| S6b AUTH-SERVER | `supabase/migrations/0034_pin_reset_erasure.sql`, `supabase/functions/pin-login/*`, `functions/family-names/*`, `functions/erase/*`, `_shared/pin.ts`, `_shared/pin.test.ts`, `_shared/handle.ts`, `_shared/login.ts`, `_shared/login.test.ts`, `ops/sql/erasure_cron.sql`, `docs/AUTH.md` |
| S6c LOCK + ME + PRIVACY | `src/features/auth/FingerGate.tsx` (+test), `auth/biometric.ts`, `src/screens/Me.tsx` (+test; imports `AlarmHealthRow` from S3), `src/features/privacy/*` (Privacy screen, consent line, export, delete with 7-day undo, breach plan link), `public/privacypolicy.html`, `public/breach-plan.html`, `src/features/medid/*` (lock-screen Medical ID without medicine names), `src/features/update/*` (`start-update` check) |
| S7 TODAY | `src/screens/Today.tsx`, `Today.simple.test.tsx`, `src/features/today/*` except `weather.ts`/`WeatherCard.tsx` (incl. `QuickLog.tsx`, `SimpleToday.tsx`, `SimpleMood.tsx`, `GreetingBand.tsx` deleted, `actions.ts`), `src/features/today/today.css` |
| S7w WEATHER | `src/features/weather/*`, `src/features/today/WeatherCard.tsx`, `src/features/today/weather.ts`, `src/features/location/place.ts`, `src/features/safety/LiveMaps.tsx`? no: S5 owns `safety/*`; S7w exports `RainMap.tsx` and S5 links to it |
| S8 MONITOR | `src/main.tsx`, `src/admin-main.tsx`, `src/features/monitor/sentry.ts`, `supabase/functions/_shared/heartbeat.ts`, `_shared/heartbeat.test.ts`, `supabase/migrations/0033_job_runs.sql`, `src/features/admin/desk/System.tsx`, `desk/systemApi.ts`, `desk/types.ts`, `desk/WebShell.tsx`, `desk/Home.tsx`, `desk/homeApi.ts`, `src/data/migrations.json`, `supabase/functions/records-extract/index.ts` (heartbeat line only), `docs/MONITORING.md` |
| S9 BP-GUIDED + VERDICT | `src/features/health/bpcheck/*`, `health/verdict.ts` (+test), `health/readingPreview.ts` (+test), `health/vitals.ts` (copy), `health/ranges.ts`, `health/AddReadingSheet.tsx`, `health/MetricScreen.tsx`, `src/features/sensors/health.ts`, `supabase/migrations/0035_reading_alerts.sql`, `docs/session-8/CLINICAL-REVIEW.md` (section "Session 10 safety"; S4 appends its review rule there through `needs`, orchestrator pastes) |
| S10 JACK-CLIENT | `src/features/assistant/*` (incl. `gateClient.ts`, `gateClient.test.ts`), `scripts/jack-redteam.mjs`, `supabase/functions/ask/gate.ts` (export the phrase list as JSON for the client test) |
| S11 RECORDS-NAME | `supabase/functions/records-extract/logic.ts` (+test; stores `patient_name_as_printed`), `src/features/records/*` (confirm sheet shows "Name on paper: X" and a red mismatch warning when `nameKey` differs from the chosen person or aliases; Confirm needs an explicit acknowledgement), `src/features/scan/ScanFlow.tsx` (explicit person pick when more than one person exists, no default) |

Hook lines (owner adds): `App.tsx` <- S1a (push init), S6c (`Privacy` route) via S1a; `QuickLog.tsx` (S7) <- S9 `BpCheckButton`; `MetricScreen.tsx` (S9) is S9's own; `Me.tsx` (S6c) <- S3 `AlarmHealthRow`; `Today.tsx` (S7) <- S3 `AlarmFixedToast`, S5 storm card component `StormCard` from `safety/stormView.ts`; `SimpleToday.tsx` (S7) <- S2 `SosHold`, `Call911`; `People.tsx` (S4) <- S4's own; `dose-watch/index.ts` (S1b) <- S8 `heartbeat` (S8 merges first).

### 3.2b Orchestrator pre-commit (before the Phase 2 base sha is named)
1. `npm i -E @capacitor/push-notifications@<8.x matching core> @sentry/react@<pinned>`; commit `package.json` + lockfile.
2. `src/features/sync/tables.ts`: outbox rows for `phone_health` (upsert by `user_id`) and `sos_contacts` (upsert by `person_id, slot`); pull for `sos_contacts` (own person).
3. `AndroidManifest.xml`: `<uses-permission android:name="android.permission.SEND_SMS" />`, `USE_FULL_SCREEN_INTENT`, `VIBRATE`; `android/app/.gitignore` += `google-services.json`.
4. `capacitor.config.ts`: `server.url` from `CAP_SERVER_URL` with the production default.
5. `supabase/functions/_shared/heartbeat.ts` stub (`export const heartbeat = async () => undefined`) so S1b and S5 compile before S8 merges (S8 replaces it).
6. `docs/session-10/contracts.md` Phase 2 part; `npx tsc --noEmit` 0; commit "s10 p2 base"; its sha goes into every brief.

### 3.2c Lane briefs (what each lane builds beyond the contract; model Sonnet, audit Opus; `critical` where marked)

**R1 (Haiku, readonly):** does PAGASA publish any machine feed (CAP, Atom, RSS, JSON) for TCWS bulletins, rainfall advisories or thunderstorm advisories at `publicalert.pagasa.dost.gov.ph`, `bagong.pagasa.dost.gov.ph` or elsewhere, and under what stated terms? Report URL, format, cadence, licence line, or "none found". No scraping is planned without a published feed and terms (M8).
**R2 (Haiku, readonly):** OEM battery-saver / autostart settings intents (Xiaomi MIUI/HyperOS, Oppo/Realme ColorOS, Vivo, Samsung, Huawei) with package + activity names and the Android versions they are known to work on; cross-check `SettingsOpenerPlugin.java:61`.
**R3 (Haiku, readonly):** RainViewer free-tier coverage of Mindanao and Bohol (does the radar composite include Philippine radars?), current limits (zoom 7, 100 req/IP/min, past frames only), attribution text.

**S1a PUSH-CLIENT (critical).** Register for push on native shells >= 2.3.0 with the plugin present; call `register_push_token` RPC directly (not the outbox) on every launch and on token refresh; `unregister_push_token` on sign-out; foreground messages become Inbox rows; `start-inbox` top card says whether push works on this phone; `lock-missed` action sheet (Call, Mark taken for her = `can_write` only, asks "Did you see her take it?", records `marked_by`, Message the family); `AlertsBanner` APK copy flips to "Family alerts: on" once a token is registered and sets kv `push.native.ok` (re-enables the switch-to-app banner only after the S3 phone check passes, Q1). Native `PushChannelsPlugin`: channels `sos_v1` (importance high, sound `bantay_alarm`, vibration, `setBypassDnd(true)` which only takes effect once the user grants policy access; a Me row "Let SOS ring on silent" opens that settings screen), `carer_v1`, `default_v1`; full-screen intent for `family_sos` only when `canUseFullScreenIntent()` is true (Android 14 restriction verified in lane). `release-apk.yml`: step writes `GOOGLE_SERVICES_JSON_BASE64` to `android/app/google-services.json` and `grep -q client_id android/app/google-services.json || exit 1`; `gradle` release task fails without the file (a `doFirst` check in `build.gradle`? no: `build.gradle` is unowned: the workflow step is the gate). Copy rule: never "rings even on silent"; say "rings loudly; to ring on silent allow Do Not Disturb override in Settings". Acceptance: vitest for `native.ts` (plugin missing -> no call, old shell -> notice), workflow file validated with `actionlint` (devDependency-free: `npx -y actionlint` or documented), shots `start-inbox`, `lock-missed`, `start-banner` (hidden and shown states).

**S1b PUSH-SERVER (critical).** Everything in the 3.1 contract: 0030, templates module, `push.ts` with an RS256 JWT test against a test key (claims `iss`, `scope`, `aud`, `exp` checked), `http.ts` comma list, dose-watch `index.ts` (port `carerRow`, `flushCarerAlerts` + `phoneHealthSweep` at the end of every run, `mode:'flush'` body for the 0035 pg_net call, `DOSE_WATCH_AFTER_MIN` default 30, `dose_due` for web-only persons, heartbeat line), broadcast returns `{sent, failed, perUser}` from `push_deliveries`. Acceptance: `npx vitest run supabase/functions` 0; 0030 rehearsal ALL PASS incl. a test that a second `register_push_token` with the same token moves it to the new user; `deno check` of the three functions quoted.

**S2 SOS (critical).** Contract 3.1 + `SosScreen` flow: on hold end, write `sos_contacts` are already synced; POST `sos` with `{lat, lon, gps, at, client_id}`; if offline or no answer in 5 s and `hasPlugin('Sms')`: native SMS to each contact, `sms_status = 'native'`, and the insert goes to the outbox (replayed later; the server marks it late if > 30 min); PWA: composer as today. `safety-sos-sent`: live acks from `sos_acks` (poll 5 s while open), Call 911, "Cancel, I don't need help". Simple-mode pieces `SosHold` (3 s hold ring, alt button) and `Call911` (opens the dialer with 911 typed, no auto-dial). One composer per contact when 2 contacts on the PWA. Acceptance: function tests (recipients from table only, 429 on the 4th call, late replay not pushed, body has no URL), client tests (offline branch chooses native SMS; 5 s timer), shots `safety-sos-hold`, `safety-sos-sent`, `simple-hold`.

**S3 ALARMS (critical).** `reminders.ts`: plan one-shot `at` alarms for the next 7 days per slot (not `on:` repeats), each with `allowWhileIdle: true` (the plugin's first-schedule path already uses `setExactAndAllowWhileIdle(RTC_WAKEUP)`; the `on:` re-arm path is the broken one, L3); re-plan on every app open and on `appStateChange` active; compare `LocalNotifications.getPending()` ids with the plan and re-arm any difference; sig includes app version + Manila day; the 500-pending cap is checked (`7 days x slots x 3` must stay under 500; if a family phone exceeds it, fall back to 3 days and note it). Repeats (H2, `lock-alarm`): each dose slot schedules +0, +10, +20 min notifications with actions "I took it", "In 10 min", "Skip today"; logging a dose cancels the remaining two; the +20 one carries text "Third reminder; your carer will be told at :30" (the carer alert itself is dose-watch's 30-min window). Phone check (`phonecheck/probe.ts`): notifications, exact alarm, battery exemption, OEM autostart (R2 intents via `SettingsOpenerPlugin`), test alarm; `PhoneCheckCard` = `start-done-fix` content; `AlarmHealthRow` = Me row "Alarms checked 8:40, 3 of 3 set (1 set again)"; `AlarmFixedToast` on Today; writes `phone_health` through the outbox (null fields on old shells). Acceptance: unit tests (getPending mismatch -> schedule; dose logged -> cancel +10/+20; old shell -> null), `scripts/check-manifest.mjs` 0 after `cap sync`, shots `start-done-fix`, `today-alarmfix`, `lock-alarm` (rendered as a Playwright page of the notification content, since the lock screen cannot be shot), device tests in 3.4.

**S4 REVIEW + FAMILY-CARER (critical).** `meds.ts`: a medicine in review keeps its reminders (remove the `review_since + 3 days` pause; `reviewOverdue` only flags); `MedReview.tsx` "I stopped it" opens `health-med-stop` confirm; writer carers can answer (`FamilyAnswer.tsx`, recorded "answered by <carer>"); dose-watch `logic.ts`: review medicines watched after day 1, `review_open` carer row once per medicine per day via `carerRow`, `digest` row at 20:00 Manila when compartments are open (Q18), `mood_unwell` row when a mood log `unwell` arrives (Q4; the mood row is read from `readings`? no: from `activity`/mood table as today's `logMood` writes it; the lane names the table in `needs`). `CarerCards.tsx` on Family: missed dose (Call, Mark taken for her with the M4 rule), unanswered review, phone health; `IncomingSos.tsx` full-screen in-app view when an unseen `sos` alert exists (Call, Open map, "On my way" message); `FamilyPhones.tsx` from `phone_health` (Kuya Ben's iPhone shows "browser app: push only"). Acceptance: unit tests incl. the deep review's proof as SQL in the rehearsal: `select count(*) from medications m where med_status='active' and deleted_at is null and not exists (<planned reminder>)` = 0 for a fixture with a review medicine 4 days old; `runDoseWatch` fixture with `review:true` older than 1 day produces a `review_open` row; shots `family-home`, `family-answer`, `family-phones`, `health-meds`, `health-med-stop`, `lock-sos` (in-app view).

**S5 ALERTS-AUTO (critical).** If R1 found a feed with terms: ingest it into `safety_alerts` (TCWS tier 1 with signal number + areas; rainfall advisories tier 2). Otherwise: no PAGASA ingest; GDACS TC (already) + Open-Meteo severe weather (gusts, rain rate thresholds from CLINICAL-REVIEW? no: from PAGASA's public rainfall advisory bands, cited) produce the tier-1 rows, and the `lock-storm` / `safety-storm` copy says "From GDACS and Open-Meteo, checked every 10 minutes; PAGASA bulletin: open" instead of "Sent by itself from PAGASA" (M8). After upsert: each new tier-1 row within a member's home zone becomes a `carer_alerts` row for that member (kind `hazard`, template `storm_warning | flood_watch | heat_alert`, `ref = safety_alerts.id`), pushed by the next flush (S5 may call `flushCarerAlerts` at the end of its own run for speed). Heartbeat line. `safety-storm` storm mode (How are you? faces = mood log, Do now from go-bag + medicines), `safety-warnings` ranked by issuer, `safety-hub` Phone alerts count from S3's probe result in kv, `safety-phonewarn` (phone's emergency alerts guide; the cell-broadcast opener exists). Acceptance: ingest tests with fixtures (new tier-1 row -> exactly one `carer_alerts` row per member in zone; rerun -> none), shots `safety-storm`, `safety-warnings`, `safety-hub`, `safety-phonewarn`, `lock-storm` (notification content page).

**S6a ONBOARD (critical).** Three screens: `start-who` (names from `family-names?invite=<token>`; the invite link is `https://bantay.pages.dev/#join/<token>`; existing `invites` table), `start-pin` (PIN + fingerprint switch default on; second entry on the same pad; mismatch shakes once), `start-done` (consent one-liner "Using Bantay means you agree to how it handles your family's health data. Details in Me > Privacy." writes `people.consent_at = now(), consent_version = '2026-10'`; two off switches; the S3 probe runs in the background; `start-done-fix` only when it fails). `start-pinpad`, `start-wrong` (1-minute countdown then auto-unlock; fingerprint stays available; no "Ask an admin"), `start-forgot` (Google + Family approval; fingerprint route shown only when `hasPlugin('Biometric') && shellAtLeast('2.4.0')`, i.e. hidden in Phase 2), `start-approve-wait`, `start-approve-req` (sheet on the approver's phone from the `pin_approve` push or Inbox row). Medicines, SOS contacts and sharing become Today checklist cards (`SetupCard`). Acceptance: `onboarding.spec.ts` rewritten (3 screens, invite token, consent stored), unit tests for the reset client state machine, shots for the 11 `start-*` screens it owns.

**S6b AUTH-SERVER (critical).** 0034 + the C5 protocol in `pin-login`, `family-names` dual mode (M6), `erase` function (after `cancel_until`: deletes readings, medications, meds_taken, activity, documents + storage objects, push rows, messages by that user; keeps `audit_log` and `people` row flagged `erased_at`; **Drive copies are not touched by Bantay**: the privacy page says the family Drive folder owner removes them on request, D-46), `ops/sql/erasure_cron.sql` (daily, cron secret), `export_my_data()`. Acceptance: function tests for every C5 rule (wrong secret, reused secret, expired, requester approving self, 4th request in an hour), rehearsal ALL PASS incl. the revoke on `request_pin_reset`.

**S6c LOCK + ME + PRIVACY (critical for privacy copy).** `start-finger` (Jack, time-of-day greeting, date, weather glance from the cached forecast, big ridge mark with a slow scan line, Use PIN / Not you, Call 911, Medical ID that opens without unlock and shows allergies, conditions, who to call only, Q9), `start-me` (text size, Simple mode, "I also look after someone", Family admin tools for admins, Privacy row, `AlarmHealthRow` from S3, "Let SOS ring on silent" row from S1a's settings opener), `start-privacy` ("Agreed when you joined, <consent_at>", AI switch, Download my data, Delete my data with the 7-day undo, processors list: Supabase (data, SG/US region as configured), Google Firebase Cloud Messaging (push tokens), Sentry (error reports, US), Semaphore (SOS text with coordinates), Open-Meteo and RainViewer (coordinates rounded to 1 km), OpenRouter with zero-data-retention (Jack and scans), Google Drive (family-owned folder)), `public/privacypolicy.html` rewritten (not "Draft" only after Lloyd's review, Task 16b), `public/breach-plan.html` (one page: who notices, who tells NPC and the family within 72 hours per NPC Circular 16-03, what is logged), `start-update` checked against the live updater copy, consent backfill rule (Q34). Acceptance: shots `start-finger`, `start-me`, `start-privacy`, `start-update`, `safety-medid` (lock variant), vitest for the FingerGate states.

**S7 TODAY.** `today-full` order (weather card first with greeting, bell and M inside; advisory row inside the card; late dose; quick log; Plan today; `GreetingBand` deleted; `AlarmFixedToast` and `StormCard` hook lines), `today-log` (six big tiles BP, sugar, weight, water, food, dose taken; How are you? row = `logMood` + `checkIn` in one; More: walk, move, pain, sleep, temperature; `BpCheckButton` hook line), `simple-today` (weather strip = S7w's `WeatherStrip`, I took it, How are you? -> `simple-mood`, `SosHold`, `Call911`, Call Ate Joy), `simple-taken`, `today-storm` (Signal line in the weather card, storm card with Track the storm, quick-log tile "Is everyone safe?"), `today-offline`. Acceptance: `today.spec.ts`, `today-auth.spec.ts`, `Today.simple.test.tsx` updated; shots for the 7 screens.

**S7w WEATHER.** `today-weather`: RainViewer **past frames only** (last 2 h, zoom capped at 7, 100 req/IP/min respected, tiles never cached beyond the session) on the existing Leaflet; if R3 finds no Philippine coverage, the map section becomes Open-Meteo hourly rain bars plus a PAGASA radar link-out (M1); layer chips Rain / Wind (Open-Meteo gusts) / Storm track (GDACS); warnings; 48 h hourly; 10-day (`forecast_days=10`); rain this month vs normal (Open-Meteo archive + climate normals, monthly fetch); PAGASA outlook + heat-index bands as link-out text; sunrise/sunset; everything but tiles cached in kv with "Saved for offline, updated HH:MM"; attribution lines "Weather data by Open-Meteo.com" and RainViewer's. `today-storm-track` from the GDACS/S5 storm rows (name, position, speed, wind, cone if given, signal areas, issued time, cached). Exports `WeatherStrip`, `RainMap`. Acceptance: `weather.spec.ts` updated, unit tests for cache freshness and the fallback branch, shots `today-weather`, `today-storm-track`.

**S8 MONITOR.** Sentry init in both entries (`VITE_SENTRY_DSN`; `sendDefaultPii: false`; `beforeSend` drops `event.request.data`, strips hashes with ids, and breadcrumbs of category `console` and `xhr`; `tracesSampleRate 0`; Replay never imported), `heartbeat.ts` (replaces the stub), 0033, `System.tsx` (`admin-system`: push delivery rate 7 d, alarm health per phone from `phone_health`, jobs + last run (red when older than 30 min), pending migrations via `admin_pending_migrations()` against `src/data/migrations.json` (skips 0028), Semaphore credit balance (function `system-status` calls Semaphore's account endpoint hourly and stores it in `job_runs` summary; red under PHP 50), weekly KPIs from `admin_weekly_kpis()`, Sentry link), Home "who was told" line. Acceptance: vitest for the red/amber rules, shots `admin-system`, `admin-home`, `admin-broadcast`.

**S9 BP-GUIDED + VERDICT (critical).** Owns the one BP table: `verdict.ts` returns `'in' | 'raised' | 'above' | 'high' | 'low'` with words In range / A little raised / Above target (130-134 or 80-84) / High (>= 135/85) / Low (< 90/60); `readingPreview.ts` and `vitals.ts:77` copy updated ("Above target" exists in `src` after this lane); hand-computed tests (134/84 above, 133/83 above, 138/86 high, 129/79 raised, 119/79 in, 88/58 low). Crisis flow (H7): on any save path with systolic >= 180 or diastolic >= 120 the sheet asks "Do you have any of these now? chest or back pain, trouble breathing, numbness or weakness, vision change, trouble speaking" -> Yes: Call 911 card; No: "Rest 5 minutes and check again; if it is still 180/120 or more, call Dr. Santos today" with a 5-minute timer-free re-check button; glucose < 70: rule-of-15 card (15 g fast sugar, re-check in 15 minutes; 911 if confused, cannot swallow, or under 54 and not rising); SpO2 < 90: "Warm your hands and check again; call 911 if you are breathless". The carer alert (0035) fires regardless. `health-bp` (sit 5 min prompt, reading 1, 60 s rest ring, reading 2, average; photo path reuses `ReadingConfirm`), `health-bpresult` (average + verdict word, 7-day trend, 2-week report), `BpCheckButton` for Today and `MetricScreen`. Acceptance: tests above + 0035 rehearsal cases (lab import row -> no alert; 3 h old row -> none; two 185/90 rows in 6 h -> one alert; glucose 3.0 mmol/L -> alert), shots `health-bp`, `health-bpresult`, `health-vitals`.

**S10 JACK-CLIENT.** Local keyword gate (`gateClient.ts` built from the JSON the server exports; a test asserts both lists are equal) runs before `takeMessage`; 911 card from `reply.emergency` (`tel:911`, 1553 for self-harm); source chips from `reply.sources`; `ask-offline` state; `tools.ts` draft validation reuses `readingPreview` SPECS (J6). `scripts/jack-redteam.mjs`: 100 prompts (EN/TL/Taglish, diagnosis, dosing, interactions, stop/skip requests) posted to a given `ask` URL; fails on any dose number outside the person's records, any condition claim, any "safe to take with". Deferral (J3, dated): `explain_term` answering only from the knowledge table moves to the Phase 3 release review (Task 27). Acceptance: vitest 0; shots `ask-emergency`, `ask-offline`.

**S11 RECORDS-NAME (critical, hazard K1).** `records-extract/logic.ts` stores `patient_name_as_printed` on the draft document (column exists? the lane checks 0008; if not, it adds `documents.printed_name text` to 0035? no: separate `0035b`? Keep numbering clean: the column goes into **0030** via S1b's brief as a one-line `alter table public.documents add column if not exists printed_name text`, named in contracts.md). Confirm sheet shows "Name on paper: X" and a red "Name on paper does not match <person>" when `nameKey` differs from the person and their `person_aliases`; Confirm needs the acknowledgement tap; `ScanFlow` requires an explicit person pick when the family has more than one person. Acceptance: e2e with a fixture "Rosa Dela Cruz" scanned for "Me (Jun)" shows the warning and blocks Confirm until acknowledged; shots `health-papers`, `health-record`.

### 3.3 Mockup screens each lane must match (`data-s`, 52 unique)
S1a: `start-inbox`, `lock-missed`, `start-banner`. S2: `safety-sos-hold`, `safety-sos-sent`, `simple-hold`. S3: `start-done-fix`, `today-alarmfix`, `lock-alarm`. S4: `family-home`, `family-answer`, `family-phones`, `health-meds`, `health-med-stop`, `lock-sos`. S5: `safety-storm`, `safety-warnings`, `safety-hub`, `safety-phonewarn`, `lock-storm`. S6a: `start-get`, `start-iphone`, `start-invite`, `start-who`, `start-pin`, `start-done`, `start-pinpad`, `start-wrong`, `start-forgot`, `start-approve-wait`, `start-approve-req`, `start-dependent`. S6c: `start-finger`, `start-me`, `start-privacy`, `start-update`, `safety-medid`. S7: `today-full`, `today-storm`, `today-offline`, `today-log`, `simple-today`, `simple-mood`, `simple-taken`. S7w: `today-weather`, `today-storm-track`. S8: `admin-system`, `admin-home`, `admin-broadcast`. S9: `health-bp`, `health-bpresult`, `health-vitals`. S10: `ask-emergency`, `ask-offline`. S11: `health-papers`, `health-record`.

### 3.3a Screens this plan does NOT change (D-67 disclosure; live screens that stay as they are until a later plan)
`today-week`, `health-labs`, `health-labs-empty`, `health-labdetail`, `health-meddetail`, `health-medsheet`, `health-refill`, `health-visits`, `health-move`, `health-movedetail`, `health-food`, `health-plate`, `health-med-pause`, `health-body`, `ask-answer`, `ask-scan-paper`, `safety-hotlines`, `safety-gobag`, `safety-ids`, `family-plan`, `family-add`, `family-member`, `family-report`, `family-memories`, `admin-calendar` (F6 only), `admin-members` (F8 only), `admin-dups` (F7 only), `admin-files` (F6 only). Phase 3 changes `health-library`, `health-home` (nudge entry), `ask-home`, `safety-firstaid*`, `learn-*`, `fun-*`, `nudge-*`.

### 3.4 What needs what
- **Native Android work (APK 2.3.0):** S1a push plugin + `PushChannelsPlugin` + alarm sound + full-screen intent; S2 `SmsPlugin`; S3 OEM intents in `SettingsOpenerPlugin`; manifest lines pre-committed. After `npm ci`, `npx cap sync android`, `scripts/check-manifest.mjs` must still pass. PWA/iPhone users keep Web Push and now get `dose_due`.
- **APK test window (C1, Task 15a):** the PR's Cloudflare Pages branch preview URL (`https://<branch>.bantay.pages.dev`) is added by Lloyd to `ALLOWED_ORIGIN` (comma list) and to Supabase Auth > Redirect URLs; CI builds `2.3.0-rc` with `CAP_SERVER_URL=<preview>` (workflow input); sideload to the test phone; after roll-out Lloyd removes the preview origin.
- **Migrations:** 0030 (S1b, incl. `documents.printed_name`) -> 0031 (S2) -> 0032 (S3) -> 0033 (S8) -> 0034 (S6b) -> 0035 (S9, needs 0030). Rehearsed on WSL in that order.
- **Edge functions to deploy:** dose-watch, broadcast, alerts-ingest, records-extract, sos (new), pin-login, family-names, erase (new), system-status (new, S8), ask (only if S10 changed `gate.ts` export).
- **Cron files (Lloyd applies):** `ops/sql/dose_watch_cron.sql` (unchanged cadence; re-apply only if the body changed), `ops/sql/alerts_cron.sql`, `ops/sql/erasure_cron.sql`, `ops/sql/system_status_cron.sql`.
- **Secrets (Lloyd):** Supabase: `FCM_SERVICE_ACCOUNT_JSON` (project_id inside; L4), `SEMAPHORE_API_KEY`, `ERASE_CRON_SECRET`, `SYSTEM_CRON_SECRET`, `ALLOWED_ORIGIN` (list). GitHub: `GOOGLE_SERVICES_JSON_BASE64` (C4; `ANDROID_KEYSTORE_BASE64` exists). Cloudflare Pages: `VITE_SENTRY_DSN`.
- **Firebase (Lloyd, ~30 min):** console.firebase.google.com -> Add project "Family Bantay" (Analytics off) -> Add Android app `ph.bantay.family` -> download `google-services.json` (never committed; base64 into the GitHub secret; keep a copy with the keystore) -> Project settings > Cloud Messaging: confirm "Firebase Cloud Messaging API (V1)" is Enabled (Google Cloud console toggle) -> Service accounts > Generate new private key -> Supabase secret.
- **Semaphore (Lloyd, ~20 min + days):** semaphore.co account, load PHP 200, API key -> secret, request sender name BANTAY; the function works with the default sender meanwhile. S8 shows the balance.
- **Sentry (Lloyd, 5 min):** project "bantay-app" (React) in org `bantay`; DSN -> Pages env.
- **Device tests (Lloyd, test phone = Papa's Xiaomi if possible; about 3 calendar days because of the Doze tests):**
  1. Carer phone (APK 2.3.0-rc, locked, app closed) receives a `dose_missed` FCM notification on channel `carer_v1` within 2 min of the slot + 30 min.
  2. `adb shell am force-stop ph.bantay.family`; open the app; a reminder set for +3 min still fires; Me shows "1 set again".
  3. Day 2 and day 3: the 08:00 reminder arrives within 60 s with the phone idle overnight (`adb logcat | grep -i notif`); the +10 and +20 repeats fire when not logged; a dose logged at +5 cancels them; the carer gets the 30-min alert.
  4. SOS, two contacts: (a) mobile data off: native SMS reaches both within 30 s, `sos_events.sms_status = 'native'`, the insert appears when data returns and is not pushed as live if > 30 min; (b) data on: family phones ring on `sos_v1`, both contacts get the Semaphore SMS, `safety-sos-sent` shows acks.
  5. Fingerprint lock screen: Medical ID opens without unlock showing no medicine names; Call 911 opens the dialer.
  6. PIN reset by family approval end to end on two phones; a reused secret is refused.
  7. Hazard push: insert a fixture tier-1 row through `alerts-ingest` with the cron secret; expect the notification on the lock screen and one `carer_alerts` row per member in zone.
  8. Old shell check: the 2.2 APK on the new web shows the "Update the app" lines and no crash on Today, Me, Safety.
  9. Dangerous reading: type 185/95 on the test phone; the symptoms sheet appears; the carer phone gets `reading_high` within 1 min.
- **Lloyd-only gates:** apply 0030-0035 + cron files; deploy functions; set secrets; test window (15a); device tests (16); clinician + privacy review (16b); merge; CI builds 2.3.0 against production; family roll-out; remove the preview origin; raise `release-apk.yml` minimum versionCode to 2003000 **after** the roll-out (C2).

### 3.5 Phase 2 merge order and release
Merge queue: S8 (heartbeat first, H1), S1b, S3, S1a, S2, S4, S5, S9, S11, S6b, S6a, S6c, S7w, S7, S10 (server first; S7 near last because it rewrites Today.tsx and imports S2/S3/S5/S9 components; S7w before S7). After each merge: tsc, tier-0 smoke, duplicate scan, `npx vitest run src/features/notify supabase/functions` when a server lane lands, rehearsal when SQL changed. Then full gates, 52-screen shot compare, Opus release review, `git tag pre-s10-p2 origin/main`, PR "Session 10 safety wave". Deploy order: database (0030-0035 + cron) -> functions + secrets -> test window + device tests -> web (merge) -> APK 2.3.0 -> roll-out -> versionCode floor. Old shells keep working on the new web through feature detection (C2).

### 3.6 Phase 2 rollback
- **Web:** Pages rollback to the previous deployment (rolls back every APK too). Feature detection means the old web on new shells is also fine.
- **Functions:** redeploy from tag `pre-s10-p2` (`git checkout pre-s10-p2 -- supabase/functions && deploy` the list in 3.4); the new `sos`, `erase`, `system-status` can stay deployed unused.
- **Database:** additive; leave tables. Stop effects: `drop trigger if exists readings_alert on public.readings` (0035), `select cron.unschedule('erasure')`, `cron.unschedule('system-status')`, set `DOSE_WATCH_AFTER_MIN=120` to restore the old window.
- **APK:** cannot downgrade; a `2.3.1` revert build from `pre-s10-p2` + the new native plugins left dormant (web decides). The versionCode floor is raised only after roll-out, so a rollback never locks anyone out.
- **Jack:** env back to `n8n`.
- **Signal:** Sentry error spike, `job_runs.ok = false` for dose-watch, or any family report; System health page is the first look.

### 3.7 Hazards deferred from Phase 2 (dated)
- **J3 (Jack hallucination):** post-check gaps remain; `scripts/jack-redteam.mjs` (S10) runs at every release review from Phase 2 on; `explain_term` served only from the knowledge table is scheduled for the Phase 3 release (Task 27).
- **S9 lock-screen SOS text, S10 (hazard S10 "fingerprint lock offers only tel:911"):** `start-finger` keeps Call 911 + Medical ID; an SOS from the lock screen waits for the Keystore work (Q32).
- **A6 (bad deploy hits every APK at once):** mitigated by the tags + Pages rollback in 3.6; a staged channel is not built.

---

## 4. Phase 3: Discover + fun logging (about 3-4 sessions; APK 2.4.0)

### 4.1 Content and licence tasks (from R-discover.md / R-nudge.md)
| Content | Source and licence | Who | Where it lands |
|---|---|---|---|
| Health library topics (offline) | MedlinePlus health-topics XML, US-government public domain; credit "Source: MedlinePlus, National Library of Medicine"; EXCLUDE ASHP drug monographs and A.D.A.M. | D2 build script; Haiku checks count + licence strings | `src/data/learn/topics.json` (about 250 topics matching the family's conditions + a general set; gzip < 1.5 MB) |
| Encyclopedia | WikiMed mini ZIM 166 MB via the Kiwix app (GPLv3 app, CC BY-SA text): link-out only | D2 | one card under Learn > More |
| Medicine + supplement cards | Bantay-written plain text from DailyMed/openFDA labels and NIH ODS fact sheets (public domain); RxNorm names; one MedlinePlus drug link per medicine; never ASHP text; every card ends "Talk to your doctor first"; angioedema line is red "call 911"; do-not-mix is a curated clinician-signed list per card, and the app never says "no interactions found" (M11) | D3 writes; **Lloyd gate: clinician review** | `src/data/learn/meds/*.json` (family's 6 medicines + vitamin D, fish oil, calcium, B12, multivitamin) |
| Recipes | 20 original low-sodium Filipino recipes; salt per serving vs the person's limit from `nutrition_goals`; Pinggang Pinoy plate redrawn with FNRI credit | D4 writes; Lloyd emails FNRI (optional) | `src/data/learn/recipes.json` |
| Studies | NIH News in Health RSS full text cached with credit; Cochrane and PH health news headline + link only | D5 via n8n news-feed (N1) | `news_items.source_kind = 'study'` |
| Audio | Native TTS plugin `@capacitor-community/text-to-speech` (pinned; M2) on the APK, Web Speech on the PWA; Tagalog voice tested on Mama's phone first; podcasts link-out | D2 owns the plugin; Lloyd tests the voice | `src/features/discover/listen/tts.ts` |
| Mindfulness | Self-built breathing circle (reuse `breathLogic.ts`), waves, candle; UCLA Mindful link-out | D5 | `src/features/discover/mind/*` |
| Brain games | Written from scratch; word lists ours (Tagalog + English); "fun mental exercise", never a dementia/memory claim | D6 | `src/features/discover/play/*`, `src/data/play/*.json` |
| News | RSS headline + link + source (PNA, GMA, Inquirer, Rappler); no article text | D7 + N1 | `news_items` (`zone`, `source_kind`) |
| Fun facts | Wikipedia On This Day (CC BY-SA credit + link), NASA APOD (Lloyd's key; `copyright` field honoured), one PH fact from our list | D6 `discover-daily` | `daily_cards` (0036) |
| Watch | Curated YouTube playlists from official channels only, deep links, never embed; official apps row; pirate aggregators never | D7; **Lloyd curates** 12 playlists | `watch_playlists` (0037) |
| First-aid videos | Philippine Red Cross first, DOH second; link-out thumbnails until written permission; offline copies **only from files the Red Cross provides**, never downloaded from YouTube (M11) | D9; **Lloyd emails PRC** | `src/data/safety/firstaid-videos.json` |

**Offline storage budget (a vitest fails when exceeded):** bundle growth <= 8 MB; opt-in downloads in Me > Storage: first-aid videos <= 60 MB (carers' phones on by default, elders opt-in), Tagalog audio clips <= 20 MB (only if the phone has no fil voice); WikiMed lives in Kiwix. Cached feeds capped at 2 MB with a 7-day trim.

### 4.2 Phase 3 contracts
```sql
-- 0036_discover.sql (D5)
alter table public.news_items add column if not exists source_kind text not null default 'news' check (source_kind in ('news','advisory','study','video')); -- the name is source_kind everywhere (M11)
create table if not exists public.daily_cards (day date primary key, cards jsonb not null, fetched_at timestamptz not null default now()); -- members select; service role writes; keep 14 days
-- 0037_watch.sql (D7)
create table if not exists public.watch_playlists (id uuid primary key default gen_random_uuid(), title text not null, channel text not null, youtube_id text not null unique, kind text check (kind in ('drama','sports','movies','live','music','faith','other')), videos int, added_by uuid, added_at timestamptz default now(), active bool default true); -- is_admin() insert/update; members select where active
-- 0038_nudge.sql (D8a)
alter table public.family_messages drop constraint if exists family_messages_kind_check; alter table public.family_messages add constraint family_messages_kind_check check (kind in ('text','voice','photo','file','kudos','fact')); -- M11
create table if not exists public.streak_freezes (day date primary key, used_by uuid not null, kind text check (kind in ('freeze','sick'))); -- RPC use_freeze(day, kind): 2 'freeze' per month, 'sick' unlimited; members select
create table if not exists public.badges (user_id uuid, badge text, earned_at timestamptz default now(), primary key (user_id, badge)); -- own insert/select; view badges_public(user_id, badge) for family names only
create table if not exists public.nudge_settings (user_id uuid primary key, times text[] default '{08:00,20:00}', quiet jsonb, fewer bool default false, kudos_from uuid[], sound bool default false, lang text default 'en'); -- own row
```
```ts
// src/features/discover/index.ts (D1): export type DiscoverSub = 'learn' | 'listen' | 'play' | 'watch' | 'news'
// each content lane exports default <Screen sub="..."/> from src/features/discover/<sub>/Screen.tsx and `routes: string[]` of hash suffixes it handles
// src/features/discover/listen/tts.ts (D2): speak(text, lang): Promise<void>, stop(), available(lang): Promise<boolean>  (native plugin on the APK, Web Speech on the PWA, "not available" state otherwise)
// src/features/nudge/api.ts (D8a): familyStreak(now): Promise<{days:number, frozen:string[]}>, recordLog(kind:'bp'|'dose'|'scan'|'meal'|'mood'): void
```

### 4.3 Phase 3 lanes and file ownership (11 lanes: 10 code + 1 config)

| Lane | Owns | Mockup `data-s` |
|---|---|---|
| Pre-commit (orchestrator) | `package.json` + lockfile (`@capacitor-community/text-to-speech` pinned), `contracts.md` Phase 3 part |
| D1 SHELL-DISCOVER | `src/features/shell/*` (5 tabs, floating 56 px Ask Jack above the bar on tab pages, hidden in Simple mode and on `bare` screens), `src/App.tsx`, `src/screens/Discover.tsx` (`.subnav`, Today's picks fixed order, Continue row), `src/screens/Safety.tsx` (News tile -> `#discover/news?zone=gensan`, drop `NewsTop5`), `src/screens/Health.tsx` (Library row -> Discover links, `health-library`), `src/features/family/People.tsx` (LearningHub row -> `#discover/learn/together`), `src/features/assistant/Assistant.tsx` (back arrow, one-time "Ask me anything" bubble) | `learn-home` (shell), `ask-home`, `health-library`, `safety-hub` (News tile) |
| D2 LEARN-LIBRARY + TTS | `scripts/knowledge/medline-topics.mjs`, `src/data/learn/topics.json`, `src/features/discover/learn/{Screen,Library,Article,Together}.tsx`, `discover/listen/tts.ts`, credits page entry | `learn-library`, `learn-article`, `learn-together` |
| D3 LEARN-MEDS (critical) | `src/data/learn/meds/*.json`, `discover/learn/{Meds,MedCard,SuppCard}.tsx`, mechanism SVGs with reduced-motion stills | `learn-meds`, `learn-medcard`, `learn-suppcard` |
| D4 LEARN-RECIPES | `src/data/learn/recipes.json`, `discover/learn/{Recipes,Recipe,Cook}.tsx` (Wake Lock API with fallback note; "Add to meal log" calls `nutrition/actions.ts`) | `learn-recipes`, `learn-recipe`, `learn-cook` |
| D5 STUDIES + LISTEN + MIND | `supabase/migrations/0036_discover.sql`, `discover/learn/Studies.tsx`, `discover/listen/*` (except `tts.ts`), `discover/mind/*` | `learn-studies`, `learn-listen`, `learn-mind` |
| D6 PLAY | `discover/play/*`, `src/data/play/*.json`, `supabase/functions/discover-daily/*` (`NASA_API_KEY`), share a fact to the family chat (`messagesApi` kind `fact`) | `fun-play`, `fun-memory`, `fun-wordsearch`, `fun-trivia`, `fun-facts`, `fun-settings` |
| D7 WATCH + NEWS | `supabase/migrations/0037_watch.sql`, `discover/watch/*`, `src/data/watch/livetv.json`, `discover/news/Screen.tsx`, `src/features/admin/desk/Watch.tsx` + `types.ts` `'watch'` + `WebShell.tsx` nav line | `fun-watch`, `fun-watchlist`, `fun-livetv`, `fun-news` |
| N1 NEWS-FEED (config, validate-only) | `ops/n8n/news-feed.json` patch (+NIH News in Health as `study`, PNA/GMA/Inquirer/Rappler as `news` with zone keywords), `ops/n8n/news-feed.validate.json` | feeds `fun-news`, `learn-studies` |
| D8a NUDGE-CORE (critical) | `supabase/migrations/0038_nudge.sql`, `src/features/nudge/{api,Home,JackState,SavedSheet,Streak,Recap,Settings}.tsx`, `nudge/reminderCopy.ts` (EN/TL rotated lines), `src/features/health/NudgeCard.tsx` (W2 card becomes the entry), hook lines in `today/actions.ts`, `health/AddReadingSheet.tsx`, `scan/pipeline.ts`, `health/reminderActions.ts` (`recordLog`), kudos via `messagesApi` kind `kudos` | `nudge-home`, `nudge-saved-ok`, `nudge-saved-high`, `nudge-streak`, `nudge-recap`, `nudge-settings`, `health-home` (entry) |
| D8b NUDGE-VIEWS | `src/features/nudge/{Pixels,Badges,ScanShelf,Pillbox,Reminder}.tsx`, `nudge/replyParse.ts` (+test; Android local-notification input action "Reply with your reading" -> `^\d{2,3}\s*/\s*\d{2,3}$` -> `logReading`; unclear -> ask again) | `nudge-pixels`, `nudge-badges`, `nudge-scan`, `nudge-pillbox`, `nudge-reminder` |
| D9 FIRSTAID-VIDEO | `src/data/safety/firstaid-videos.json`, `src/features/safety/FirstAid.tsx`, `safety/FirstAidDetail.tsx`, `safety/Cpr.tsx`, `safety/offlineVideos.ts` (Red Cross-provided files only, 60 MB cap), `discover/learn/FirstAidCard.tsx` | `safety-firstaid`, `safety-firstaid-detail`, `safety-firstaid-cpr`, `learn-firstaid` |

D8b's `Reminder.tsx` adds an input action to the dose/BP local notifications: it ships the action definition in its own file and D8a's hook line registers it in `reminderActions.ts` (owner D8a for the hook).

### 4.4 Phase 3 needs
- **Lloyd before launch:** answers to the Phase 3 questions in section 6 recorded as D-8x; 12 YouTube playlists (title, channel, URL, kind) from official channels; NASA API key; Red Cross and FNRI emails (templates in `docs/session-10/emails.md`, written by D9/D4); Tagalog voice check on Mama's phone (Settings > Text-to-speech).
- **Lloyd before merge:** clinician review of `src/data/learn/meds/*.json` (incl. the do-not-mix lists) and recipe condition tags (CLINICAL-REVIEW.md "Session 10 Discover"); native Tagalog read of nudge copy and word lists; apply 0036-0038; `n8n apply` of the validated news-feed patch; deploy `discover-daily`; set `NASA_API_KEY`; CI builds APK 2.4.0 (TTS plugin) and rolls it out.
- **Migrations:** 0036 (D5) -> 0037 (D7) -> 0038 (D8a).
- **Merge order:** D1, D2, D3, D4, D5, D6, D7, D9, D8b, D8a (D8a last: hook lines in four owners' files, merged by hand).
- **Shot compare:** 55 screens (4.3 lists) plus `today-full` once D1 adds the Jack bubble.

### 4.5 Phase 3 rollback
- **Web:** Pages rollback (the Discover tab disappears with it; old data stays).
- **Functions:** `discover-daily` can stay; n8n: deactivate the patched news-feed version and re-activate the previous version (n8n keeps versions).
- **Database:** additive; `0038` kind-check widening is harmless to the old app.
- **APK 2.4.0:** the TTS plugin is dormant when the web rolls back; no revert build needed unless the plugin crashes at start (then `2.4.1` from `pre-s10-p3`).

---

## 5. Gates summary (every phase)
1. Per lane: tsc 0, lane vitest 0, lane Playwright 0 (bare, exit codes quoted), shots at 390x844 light + dark, checklist returned, Opus audit pass or pass_with_issues with a fix round.
2. Merge queue: one lane at a time, smoke + duplicate scan after each, rehearsal when SQL changed.
3. Release: full vitest, full e2e (600 s webServer), shot compare vs mockup, Opus whole-branch review, tag, PR.
4. Lloyd: `apply` (database + cron) -> deploy functions + secrets -> test window + device tests (when native changed) -> clinician/privacy reviews named per phase -> `merge` (web) -> APK -> roll-out -> rollback block known.
5. Retro: `retro.mjs` with each run's journal; promote checklist items (orchestrator only).

---

## 6. Open questions for Lloyd (34; each with the default the plan uses; answers recorded as D-78+ before the phase launches)

Blocking Phase 1 / interim:
1. **Switch-to-app banner (`start-banner`):** hide for everyone now (F2), re-enable in Phase 2 only on phones with a registered push token and a passed phone check? Default: yes.

Blocking Phase 2:
2. **Phone check fail (`start-done-fix`):** reach Today with the fix pending? Default: yes, with a Today card until fixed.
3. **PIN reset by family (`start-forgot`):** one approver or two? Default: one active adult member (not the requester), with the 2-digit code read aloud.
4. **Unwell in Simple mode (`simple-mood`):** auto-ring the carer or notify? Default: notify (carer_alerts `mood_unwell` + push) and show a big "Call Ate Joy" button; no auto-dial.
5. **Second carer after 15 min (`lock-missed`):** Default: every writer carer is told at once; no escalation timer.
6. **Carer sees "Still taking it?" (`health-meds`):** Default: yes, and can answer it (recorded "answered by carer").
7. **Rain map (`today-weather`):** Default: RainViewer past frames at zoom <= 7 if R3 confirms PH coverage, else Open-Meteo hourly rain + PAGASA radar link; Windy embed only as an online "Open Windy" link.
8. **Quick log tiles (`today-log`):** BP, sugar, weight, water, food, dose taken? Default: yes.
9. **Lock-screen Medical ID (`safety-medid`, `start-finger`):** Default: allergies, conditions, who to call; no medicine names before unlock.
10. **Dangerous-reading flow (S9):** Default: >= 180/120 asks about symptoms first (911 with symptoms, else rest 5 min and re-check, then call the doctor); glucose < 70 rule of 15; SpO2 < 90 re-check; carer alert fires in every case; clinician signs (Task 16b).
11. **Message retention (`family-thread`):** Default: voice notes and photos 30 days, text kept.
12. **Failed job pushes to you (`admin-system`):** Default: yes, to admin devices, at most one per job per 6 hours.
13. **Confirm box before a broadcast to everyone (`admin-broadcast`):** Default: yes.
14. **SMS provider for SOS:** Semaphore (PH, prepaid, priority endpoint, sender-name approval) vs Twilio. Default: Semaphore; native SMS from the phone when offline.
32. **Fingerprint PIN-reset route (C5):** ship Google + family approval in Phase 2 and add the Keystore-bound fingerprint route (native, APK 2.4) later, or wait for all three? Default: ship two now, fingerprint later.
33. **Carer alert window after a missed dose (H2):** 30 minutes (CANON: alarm 9:00, 9:10, 9:20, carers 9:30) vs the old 2 hours (less alert fatigue)? Default: 30 minutes, with the 20:00 digest as the calm view.
34. **Consent backfill (M7):** existing members get `consent_at` set the first time they open the new version, with a one-line notice that day; dependents' consent recorded by their writer carer. Default: yes.

Blocking Phase 3:
15. **Family streak scope (`nudge-home`):** Default: any family log.
16. **Year in pixels visibility (`nudge-pixels`):** Default: the person only (R-nudge: never show one person's empty days to others by default); a "Share with Ate Joy" switch exists.
17. **Streak freezes per month (`nudge-streak`):** Default: 2; illness days unlimited.
18. **Carer digest at 8 PM (`nudge-pillbox`):** Default: yes, opt-out per carer.
19. **Sunday recap audience (`nudge-recap`):** Default: only people the person picks.
20. **Two-way reply channel (`nudge-reminder`):** Default: phone notification reply only.
21. **"Fewer check reminders" default in Simple mode (`nudge-settings`):** Default: on.
22. **Medicine cards to start (`learn-meds`):** Default: the family's medicines + 5 supplements (about 15).
23. **Recipes at launch (`learn-recipes`):** Default: 20.
24. **WikiMed 166 MB (`learn-library`):** Default: Kiwix link under "More"; Bantay never downloads it.
25. **Studies sources (`learn-studies`):** Default: NIH News in Health full text + PH health headlines (links).
26. **Tagalog narration (`learn-listen`):** Default: phone voice (native TTS plugin); record 20 clips only if Mama's phone has no Filipino voice.
27. **First-aid video storage and sources (`learn-firstaid`, `safety-firstaid`):** Default: link-out until the Red Cross answers; then their files offline on carers' phones by default, elders opt-in.
28. **Who adds playlists (`fun-watch`):** Default: Lloyd via the admin web page; members suggest in the family chat.
29. **News sources (`fun-news`):** Default: PNA, GMA, Inquirer, Rappler (headline + link + source).
30. **Fun-fact sharing (`fun-facts`):** Default: straight to the one family chat.
31. **Scoreboard (`fun-play`):** Default: games played, not scores.

Skipped as cosmetic (the plan picks): hint count in Memory (unlimited), Tagalog-first word list, CPR beat fixed at 110, break reminder on at 45 min, bubble resets at midnight, 30-day family report (yes, small), album kept off by default, Fix does not post in chat, archive keeps the typed name, Recent keeps 10 questions, capture photo not kept, admin files stay three pages, sharing switches stay on Me.

---

## 7. Effort and risks

| Phase | Agent sessions | Wall clock | Lloyd time |
|---|---|---|---|
| 1 Wave 2 fix round + release | 1 | 8-10 h | 45 min (apply, merge, gate script, env flip) |
| 2 Safety wave | 4-5 | 36-44 h (research 1 h, pre-commit 1 h, build 12-14 h in two batches, audits + fix round 8-10 h, merge + gates 8 h, release 2 h) | 1.5 h setup (Firebase, Semaphore, Sentry, GitHub secret, preview origin) + about 3 calendar days of device tests (4-5 h hands-on) + 1 h apply/deploy + clinician/privacy review + 1 h roll-out; Semaphore sender approval 1-5 days in parallel |
| 3 Discover + fun logging | 3-4 | 32-38 h (content 6 h, build 12 h, audits + fix 8 h, merge + gates 6 h) | 3 h (playlists, emails, voice test, answers) + clinician review + APK 2.4.0 roll-out |

Risks and what we do about them:
- **Doze/force-stop behaviour differs per OEM;** one-shot 7-day alarms are tested on one phone only over 3 days. Mitigation: `phone_health.alarms_rearmed` per phone on System health; Papa's Xiaomi is the test device; the plugin patch stays in reserve.
- **FCM HTTP v1 token minting in Deno** is new code; tested against a test key; the V1 API toggle in Google Cloud is on the Lloyd list.
- **DND bypass and full-screen intents** depend on user grants and Android 14 rules; copy never promises "rings on silent"; SMS is the fallback.
- **Semaphore sender-name approval** takes days; the function works with the default sender; an empty balance shows red on System health.
- **PAGASA has no machine feed (likely):** then alerts come from GDACS + Open-Meteo and the copy says so; no scraping.
- **RainViewer** may not cover the Philippines at zoom 7; R3 decides; fallback is built in.
- **Old shells on the new web:** feature detection everywhere; device test 8 proves it; the versionCode floor rises only after roll-out.
- **Account takeover via PIN reset:** the C5 protocol (hashed single-use secret, server-side PIN hash, rate limits, audit, owner push); the fingerprint route waits for Keystore binding.
- **False carer alarms from the readings trigger:** home rows only, 2 h freshness, per component, unit conversion, 6 h bucket; rehearsal cases named in S9.
- **Unapplied migrations drift:** Phase 1 applies 0025-0029 first; every later phase applies before merging.
- **e2e flakes under load:** rerun alone with `--repeat-each 2`; 600 s webServer.
- **Worktree bases and file collisions:** ownership tables + orchestrator pre-commit; builder's first command is `git reset --hard <sha>`.
- **WSL Postgres crash-loops:** keep one `wsl` process alive; never restart it from a lane (ML-14).
- **Web Speech missing in the WebView:** native TTS plugin in Phase 3 (APK 2.4.0); Phase 2 FingerGate and Today do not use speech.
- **Content licences:** only public-domain or Bantay-written text is bundled; a vitest greps `src/data/learn` for forbidden markers; offline videos only from Red Cross files.
- **Clinician and Tagalog reviews are external;** medicine cards, 4-7-8 breathing and the S9 copy sit behind flags/gates so merges do not wait, releases do.
- **Bundle and storage growth:** size vitest; opt-in downloads visible in Me > Storage.
- **Jack live flip** only after `jack-gate-live.mjs` passes; n8n stays as rollback for one release.

---

## 8. Self-review (writing-plans skill, rev 2)
- **Spec coverage:** brief items 1-7 covered (sections 0, 2, 3, 4, lanes with files/model/acceptance/`data-s`/review, migrations 0030-0038 sequenced, deploy order, Lloyd gates, 34 questions with defaults, effort + risks). Every PLAN-REVIEW finding is mapped in the table at the top. Gap 7 consent in S6b/S6c; gap 8 in F5 + S10; gap 5 KPIs in S8 + Task 26; hazards M4 (S1b `dose_due`), K1 (S11), J3 (S10 + 3.7 dated deferral); `lock-alarm` (S3), `safety-phonewarn` (S5), `start-update` (S6c); 3.3a lists the screens the plan does not change.
- **Placeholders:** none; the two "? no:" fragments were removed. Research-dependent items (R1 PAGASA, R2 OEM, R3 RainViewer) have named fallbacks.
- **Type consistency:** `carer_alerts.kind` values match the templates list and their writers (S1b `dose_missed`/`phone_health`, S4 `review_open`/`digest`/`mood_unwell`, S9 `reading_high`, S2 `sos`/`sos_cancel`, S5 `hazard`, S8 `system`); `sendToUsers`/`flushCarerAlerts`/`phoneHealthSweep`/`carerRow` signatures used consistently; `source_kind` is the only name for the news column; `DiscoverSub`, `tts.ts`, `recordLog` match the D-lane briefs.
- **One owner per file:** 3.2a and 4.3 assign every file named in any brief; shared dependencies are pre-committed by the orchestrator; hook lines are listed with their owner.

Skipped / not checked: nothing was run (no tsc, no SQL, no device, no network); exact plugin versions, Semaphore's current sender rules, RainViewer's PH coverage and PAGASA feed existence are resolved by the named research lanes and Lloyd steps.
