# Session 10 plan review (adversarial, Opus 5.5)

**Verdict: GO_WITH_CHANGES.** Phase 1 can start after the small changes below (H5, M5, M9). Phase 2 must not launch until findings C1-C6 and H1-H10 are written into the plan and `contracts.md`. Phase 3 needs M2 and M11 before launch.

**Reviewed:** `docs/session-10/PLAN.md` (Fable, 2026-10-26).
**Checked against:** D-34/35/36/65/66/73/76/77; the deep review (HTML top 10, V1, C-hazards top 15); CANON, R-discover and R-nudge; the 8 wave-2 review files; the mockup (135 `data-s` ids, grepped against the plan); live code on fc9450c, main and the 8 wave-2 worktrees; PLAYBOOK.
**Nothing was run** against Supabase, a device or the network.

---

## Coverage

### Top-10 gaps (deep review)
| # | Gap | Plan | Verdict |
|---|---|---|---|
| 1 | No push on the APK | S1a + S1b (Phase 2) | Covered. The interim notice is missing (H5). The FCM payload design is broken (C3). The CI build drops FCM (C4). |
| 2 | SOS alerts nobody | S2 | Covered while online. The offline path and device test 4 are wrong (H3). Abuse and cost controls are missing (H4). |
| 3 | Alarms go quiet | S3 | Covered. Repeat and escalation are missing (H2). A simpler option exists (L3). |
| 4 | Review silences a medicine | S4 | Covered. The deep review's SQL proof ("no scheduled med with zero pending reminders") is not in the acceptance criteria. Add it to S4. |
| 5 | Usage near zero | Task 26 | Covered. S8 System should also show the weekly KPIs the deep review names: active members, home readings per week, on-time doses. |
| 6 | Storm push | S5 | Covered. Dedupe is impossible in the current schema (H8). PAGASA scraping is a licence risk (M8). |
| 7 | Consent / privacy | S6a / S6b | Partly covered. There is no stored consent, no breach plan, the processor list is incomplete, there is no Lloyd review of the notice, and Drive copies are ignored on erase (M7). |
| 8 | Jack gate | F5 (server) + S10 (client) | Covered. The live flip test is too thin (M5). |
| 9 | Monitoring | S8 | Covered. S8 should add a Semaphore balance check (H4). |
| 10 | Guided BP | S9 | Partly covered. The "Above target" copy has no owner (H6). Clinical copy and clinician sign-off are missing in Phase 2 (H6, H7). |

### Merge blockers (deep review, 5)
All 5 are covered: body_temp (F4), deleted_at (F5), wave-1 merge for lanes 1 and 4 (F1 and F4), 0029 action list (F8), and 0026 applied before the app ships (section 2.4).

### Wave-2 review items not carried into a fix lane
- W2-ASK #7: reading mode has no per-user cap, so every call costs a vision request.
- W2-TODAY-SAFETY #3: no test for the Safety group headings.
- ADM-BE #7: `dk-cardtab` drops table semantics.

Add each to F4, F2 or F6, or list it as deferred (L5).

### Top-15 hazards neither covered nor deferred
- **M4:** the iPhone PWA gets zero dose reminders. `dose_due` is never sent.
- **J3:** Jack hallucination. The post-check has gaps and there is no red-team set.
- **K1:** a scan can be filed under the wrong person. There is no check of the printed name.

Add explicit deferral lines, or a small K1 task (a name-mismatch warning is cheap).

### Mockup screens with no task
Grepping all 135 `data-s` ids against the plan finds 31 that are never named. Most are live screens that do not change. D-67 requires a plan to say which screens it does NOT cover, so list them.

Three of them do need work:
- **`lock-alarm`** has no owner. It is a full-screen alarm, repeating every 10 minutes, with carers told after 3 tries (H2).
- **`safety-phonewarn`** (the phone's emergency-alert settings guide) has no owner.
- **`start-update`**: confirm it matches the live updater.

---

## CRITICAL (fix in the plan before Phase 2 launches)

**C1. Section 3.4 device tests and Tasks 15-16 cannot test the new code.**
`capacitor.config.ts` sets `server.url: 'https://bantay.pages.dev'`. The test APK 2.3.0, sideloaded before merge, therefore loads the old production web bundle. None of the S1a, S2, S3 or S6a web code runs on it.
- **Change:** add a step before Task 15.
  - `capacitor.config.ts` reads `CAP_SERVER_URL`, defaulting to production.
  - Build the test APK against the Cloudflare Pages branch preview URL.
  - Make `_shared/http.ts` accept a comma list in `ALLOWED_ORIGIN`. Today it allows a single origin (`origin === allowed`). Owner: S1b.
  - Lloyd adds the preview origin to `ALLOWED_ORIGIN` and to the Supabase Auth redirect URLs for the test window, then removes it.

**C2. Section 3.5 deploy order ignores old shells loading the new web.**
"Database, functions, web, then APK" means every 2.2 APK runs the new bundle before it has the push plugin or the patched alarms.
- **Change: feature detection.** S1a, S3 and S6a gate each native call on `Capacitor.isPluginAvailable(...)` and the shell build from `App.getInfo()`. `phone_health` reports `alarms_ok = null` ("old app") rather than true on shells below 2.3.0.
- **Change: release policy.** In section 3.5, raise `release-apk.yml`'s minimum versionCode to 2003000 only after the family roll-out.

**C3. Section 3.1 `sendToUsers` "no body text beyond {t, n?}" does not work for FCM.**
Web push sends `{t}` and the service worker renders it. Android only shows a background or killed-app push when it is an FCM *notification* message with a title and body. A data-only message shows nothing.
- **Change:** move `TEMPLATES` into one module the edge functions can import. Make `supabase/functions/_shared/templates.ts` the source, owned by S1b, and have `src/features/notify/templates.ts` re-export it (S1a). The server renders the fixed strings, which keeps B-7. Set `android.notification.channel_id` per kind and `priority: 'high'`.
- **Also:** the template list is missing `system` (S8) and an id for the Q4 "Unwell" carer alert.

**C4. The APK built in CI would silently lack FCM.**
The plan says Lloyd builds with the offline keystore. In fact `.github/workflows/release-apk.yml` builds and signs the APK (`ANDROID_KEYSTORE_BASE64`). Meanwhile `android/app/build.gradle:67-72` only logs at info level when `google-services.json` is missing ("Push Notifications won't work").
- **Change:** S1a owns `release-apk.yml` for this phase.
  - Add a step that writes the secret `GOOGLE_SERVICES_JSON_BASE64` to `android/app/google-services.json`.
  - Make release builds fail when the file is missing.
  - Lloyd adds the GitHub secret. List it under section 3.4 Secrets.
  - Fix the "offline keystore" wording in Task 15 and section 3.4.

**C5. Section 3.1 PIN reset and section 3.2 S6b open an account-takeover path.**
1. **The requester is not signed in.** `request_pin_reset` is anon today (0009). `complete_pin_reset(id, new_pin_hash)` keyed only by the request id lets anyone who learns an approved id set the PIN.
   - **Change:** the request returns a random 128-bit secret, stored hashed. Completion requires it, is single-use and expires in 15 minutes. The new PIN goes to `pin-login` and is hashed server-side with the existing `pin.ts`, never as a client-side hash.
   - Rate-limit per handle and per IP using the 0009 anti-enumeration pattern.
   - Write to `audit_log` and push the account owner after any reset.
2. **The "fingerprint" route is not hardware-bound.** `BiometricPlugin.java` has no CryptoObject or Keystore use (grep finds none). A "device secret" would just sit in WebView storage, and any enrolled finger (family members often enrol theirs) would unlock it.
   - **Change:** add a Keystore key with `setUserAuthenticationRequired(true)`. This is native, part of APK 2.3.0, owned by S6b. Otherwise ship Google + family approval first and record that as a D-78 entry.
3. **The old admin flow has no fate in the plan.** 0009's `admin_requests` and `request_pin_reset` are the old admin-approval flow. D-76 says no admin gates. 0034 should revoke and retire them, and S6a should remove "Ask an admin".
4. **Remove the unresolved text.** "people.profile2? no:" in the S6b brief must go before launch.

**C6. The section 3.1 0035 dangerous-reading trigger will fire false and stale alarms.**
`readings` holds laptop-loader lab imports (auto-confirmed per D-68; all 75 live readings are lab imports) and outbox syncs that can arrive hours late. Units are mixed, and BP is two rows (`bp_systolic`, `bp_diastolic`).
- **Change: what fires.**
  - Only home or device rows (`source_file_id is null`) with `taken_at > now() - interval '2 hours'`.
  - Each BP test row is evaluated on its own.
  - Glucose in mmol/L is converted (x18).
  - At most one alert per person per kind per 6 h.
- **Change: how it runs.** The trigger is `SECURITY DEFINER` with `set search_path = ''`, because inserts into `carer_alerts` are service-only.
- **Change: latency.** `flushCarerAlerts` runs on dose-watch's `*/15` cron, so a dangerous reading can wait up to 15 minutes. Either call the sender at once (pg_net from the trigger, or the app calling a small notify function after save), or state the 15-minute latency in the copy.

---

## HIGH

**H1. Phase 2 lanes collide on files (section 3.2).**
The "one owner per file" claim in section 8 is false.

| File | Lanes |
|---|---|
| `package.json` + `package-lock.json` | S1a (push), S3 (patch-package, pin), S8 (Sentry) |
| `src/features/sync/tables.ts` | S1a (push_tokens row), S3 (phone_health row) |
| `src/features/setup/steps.ts` | S3 ("probe reused"), S6a ("ORDER") |
| `supabase/functions/_shared/*.test.ts` | S6b (glob) vs S1b `push.test.ts` / S8 `heartbeat.test.ts` |
| `notify/templates.ts` | S1a, but the server needs it (C3) |
| dose-watch | S4 owns `logic.ts` and emits `review_open`/`digest`, but persisting rows lives in S1b's `index.ts` |
| `_shared/heartbeat.ts` (S8) | S1b and S5 import it, and merge order is S1b before S8 |

Files nobody owns:
- `AndroidManifest.xml`, `res/raw/` alarm sound, `release-apk.yml`
- Native DND and full-screen code
- `screens/Safety.tsx` (S5 needs the safety-hub count)
- `verdict.ts` / `readingPreview.ts` / `vitals.ts` (H6)

**Change:**
- The orchestrator commits all Phase 2 dependencies (package.json, lock and the postinstall line) and both `sync/tables.ts` rows into the base sha before launch.
- S6a owns `steps.ts`; S3 exports the probe from `phonecheck/`.
- S6b test files are named, not globbed.
- `contracts.md` names the dose-watch port method that S4's logic calls, for example `carerRow(kind, personId, template)`.
- Merge S8 before S1b, or S1b ships a stub `heartbeat.ts` that S8 replaces.
- Assign every unowned file above.

**H2. The repeat alarm and 3-try escalation have no lane.**
This is `lock-alarm` and `lock-missed` in the mockup. CANON says the alarm fires at 9:00, 9:10 and 9:20, and carers are told at 9:30. The plan keeps dose-watch at 2 h (the template literally says "(2 h)") on a 15-minute cron.
- **Change:**
  - S3 schedules the +10 and +20 repeats with "I took it", "In 10 min" and "Skip today" actions, and cancels them when the dose is logged.
  - S1b makes the dose-watch window configurable (default 30 minutes to match CANON).
  - Add an open question for Lloyd (30-minute window vs alert fatigue), or change the mockup copy.

**H3. The SOS offline path and device test 4 are wrong.**
Device test 4 expects that with mobile data off, both contacts get the SMS through Semaphore. That cannot happen, because Semaphore needs the server call. The deep review's fix is native `SEND_SMS`, which a sideloaded APK may hold.
- **Change: offline SOS.**
  - S2 adds a small native SMS sender: `SmsManager.sendTextMessage` once per contact, plus the `SEND_SMS` permission (APK 2.3.0, manifest owned by S2).
  - The app uses it when offline or when the server call has not answered in 5 s.
  - The composer stays only on the PWA.
- **Change: device test 4.** Data off: native SMS reaches both contacts. Data on: push plus Semaphore.
- **Change: late replays.** An SOS insert replayed by the outbox more than 30 minutes late is marked late ("earlier SOS at HH:MM"), not pushed as live.

**H4. The SOS function has no abuse or cost controls (S2).**
- Recipients must come from the person's saved SOS contacts on the server, never from the request body. Otherwise the function is an open SMS relay.
- Limit it to 3 calls per 10 minutes per user.
- Use Semaphore's priority endpoint for SOS.
- Put no URL in the body. PH telcos filter links in SMS; verify this.
- S8 adds a Semaphore credit-balance check to System and the heartbeat. An empty balance means SOS SMS fails silently.

**H5. Phase 1 has no interim fix for the push gap (sections 2.2 and 6, Q1).**
V1's "NEW critical" ranks two cheap steps first: (1) an in-app notice now, (2) a Family-tab row. The plan defers both to S1a, which is three sessions and a device-test round away, while the "switch to the app" banner keeps moving carers onto the APK.
- **Change:** add to F2, or as an orchestrator commit in Phase 1: hide the switch-to-app banner and show "Family alerts do not reach the Android app yet. Keep the browser app for alerts." on the APK. It is about 2 files.

**H6. The single BP table has no owner.**
"Above target" appears nowhere in `src` (grep: 0 hits). `vitals.ts:77` still says "130/80 or more is high".
- **Change:** S9 owns `verdict.ts`, `readingPreview.ts` and the vitals copy for the CANON table, with hand-computed tests.
- **Change:** add "clinician signs the S9 thresholds and copy" as a Phase 2 Lloyd gate at Tasks 16-17. Section 4.4 currently has clinician review only in Phase 3.

**H7. The section 3.1 and S9 clinical copy for dangerous readings is too blunt.**
The plan shows a red "get help now" sheet with Call 911 for every reading of 180/120 or more.
- **BP:** the AHA home guidance is to rest 5 minutes and re-check. Call 911 only with symptoms (chest or back pain, breathlessness, numbness or weakness, vision change, trouble speaking); otherwise call the doctor. `ask/gate.ts` already requires a symptom for BP, so S9 should ask about symptoms first to keep the two consistent.
- **Glucose:** under 70 gets a rule-of-15 card (15 g fast sugar, re-check in 15 minutes). 911 only if the person is confused or unable to swallow, or if sugar is under 54 and not rising.
- **SpO2:** under 90 means re-check with warm hands. 911 when breathless.
- The carer alert can still fire in every case. A clinician signs it all off (H6).

**H8. Section 3.1 contract inconsistencies.**
- `push_deliveries.alert_id` references `carer_alerts`. S5, however, dedupes by `(safety alert id, user_id)`, and there is no column for that.
- `carer_alerts.kind` has no `hazard` or `mood_unwell`, although Q4's default writes an Unwell carer alert.
- Section 8 says `phone_health` alerts come "via S1b sweep", but no lane brief owns that sweep.
- **Change for 0030:**
  - Add `ref text` with unique `(kind, ref, carer_user_id) where ref is not null`.
  - Add the kinds `hazard` and `mood_unwell`.
  - S5 writes `carer_alerts` rows and lets the flush push them, instead of calling `sendToUsers` itself.
  - S1b owns the phone_health sweep (`alarms_ok = false`, or no open in 48 h).

**H9. Section 3.1 `push_tokens` through the outbox gets stuck and leaks.**
`token` is unique. When a second family member signs in on the same phone, or the app is reinstalled, the upsert hits another user's row. RLS refuses it, so the outbox row retries forever. Meanwhile the previous user's alerts keep arriving on that phone.
- **Change:** S1b adds a `SECURITY DEFINER` RPC `register_push_token(token, app_version)` that removes any row with that token and then inserts one for `auth.uid()`. The app calls it directly, not through the outbox, and deletes its token on sign-out.

**H10. RLS rules are missing from the contracts (section 3.1).**
Write these into `contracts.md` before launch:
- `carer_alerts`: column-level update only (`grant update (seen_at)`).
- `sos_events` and `sos_acks`: insert for one's own person, select for family members, acks only for one's own user.
- `job_runs`: admin select only.
- `phone_health`: carer read through `people.auth_user_id = phone_health.user_id` joined to `carers.carer_id = auth.uid()`.
- `export_my_data`: `SECURITY DEFINER`, scoped to `auth.uid()`'s person.
- S8's "pending migrations": PostgREST cannot see `supabase_migrations`, so this needs an admin-only RPC.

**H11. Effort is under-estimated (section 7).**
- **S6a** is 15 screens plus the fingerprint screen, Medical ID, Privacy and the policy. Split it: S6a (start-* onboarding and PIN) and S6c (start-finger, Medical ID, Me, Privacy, the policy).
- **S7** is 9 screens including the radar and the storm track. Split it: S7 Today and S7w weather.
- **D8** is 12 screens. Split it: D8a (home, sheets, streak, recap) and D8b (pixels, badges, scan shelf, pillbox, two-way reply).
- **Screen count:** section 3.3 lists about 52 unique Phase 2 `data-s` ids, not 31.
- **Device tests:** the Doze day-2 test, and the deep review's 3-day proof, need 2-3 calendar days, not "~2 h".
- **Realistic Phase 2:** 4-5 sessions, plus about 3 days for the device tests, plus Semaphore's sender approval.

---

## MEDIUM

**M1. The S7 rain map cannot do what the plan describes.**
R-discover verified that the free RainViewer API, from 2026-01-01, has a maximum zoom of 7 and no nowcast. The "past-2h/next-2h scrubber" is therefore impossible, zoom 7 cannot show General Santos at street level, and RainViewer's radar coverage of the Philippines is unverified.
- **Change:**
  - Use past frames only, with the zoom capped at 7.
  - Add a Haiku check (R3) of RainViewer's PH coverage.
  - If there is no coverage, show Open-Meteo hourly rain with a PAGASA radar link-out.
  - Add the attribution lines "Weather data by Open-Meteo.com" and RainViewer's.

**M2. Phase 3 assumes Web Speech, which the APK's WebView probably lacks.**
Listen, read-aloud, Cook mode and the voice guidance all use it. Android System WebView does not implement `speechSynthesis` (verify on one phone first).
- **Change:** D2 owns a native TTS plugin (`@capacitor-community/text-to-speech`, pinned exact). Phase 3 therefore needs an APK 2.4, which section 4.4 should list.

**M3. The notification channels need native work.**
- Capacitor's `createChannel` cannot set bypass-DND.
- The `alarm` sound needs a file in `res/raw`.
- A channel cannot change after it is created, so version the id (`sos_v1`).
- Full-screen `lock-sos` and `lock-alarm` need `USE_FULL_SCREEN_INTENT` plus native code, and Android 14 restricts that permission (verify for sideloaded apps).
- **Change:** assign this to S1a and list it under section 3.4 native work, or soften the copy from "rings even on silent" to "rings loudly; allow Do Not Disturb override in settings".

**M4. "Mark taken for her" (S1a `lock-missed`, S4 carer cards) is a clinical risk.**
D-73 kept carer marking on Health only. The mockup overrides that, but a remote mark can cause a double dose.
- **Change:**
  - Only carers with `can_write` get the button.
  - It asks "Did you see her take it?" first.
  - The mark records `marked_by`, and the elder's dose card shows "marked by Ate Joy".

**M5. Section 2.4: the Jack flip test is too thin.**
The live test is 5 questions. The deep review's proof is 30 emergency phrases in English, Tagalog and Taglish, all getting the 911 card, with 0 reaching the model.
- **Change:** F5 adds `scripts/jack-gate-live.mjs` (30 phrases, posted to the deployed `ask`). Its exit code gates the `VITE_ASSISTANT_PROVIDER=edge` flip.
- Note that until S10 ships, the client cap (`Assistant.tsx:267`) still runs before the server gate. This is acceptable because the limit reply also shows 911, but the plan should say so.

**M6. The S6b `family-names` change breaks fresh-install sign-in.**
D-65 returns active members' names with no token. That is how existing members sign in on a new phone (`start-pinpad`).
- **Change:** keep the no-token mode for sign-in, and add a token mode for `start-who`.

**M7. RA 10173 items are missing (S6a, S6b, S8).**
- **Processors:** the notice must list Google FCM, Sentry (US), Semaphore (SOS text with location), Open-Meteo and RainViewer (coordinates), and OpenRouter.
- **Stored consent:** "Agreed when you joined, <date>" needs a stored `people.consent_at` and `consent_version`, with a backfill rule for existing members. A dependent's consent is given by the carer.
- **Breach plan:** a one-page breach plan (NPC Circular 16-03, 72 hours) has no task.
- **Erase:** it must state what happens to Drive copies (D-46 puts files in the family Drive) and why `audit_log` is kept.
- **Lloyd gate:** Lloyd reviews `privacypolicy.html` before it drops "Draft".
- **Sentry:** also drop console and XHR breadcrumbs, scrub `event.request.data`, and never enable Replay.

**M8. S5 risks scraping PAGASA.**
R-discover says "No API or licence found; do not scrape". D-36's "CAP feed, CC BY 4.0" claim is unverified.
- **Change:** S5 ingests PAGASA only if R1 finds a published machine feed with terms. Otherwise it uses GDACS TC and Open-Meteo, with PAGASA as a link-out. In that case the `lock-storm` copy "Sent by itself from PAGASA" must change.

**M9. No phase has a rollback (sections 2.4, 3.5, 4.4).**
Add a rollback block to each Lloyd gate:
- **Web:** Cloudflare Pages "rollback to previous deployment". This also rolls back every APK, through `server.url`.
- **Functions:** redeploy from the previous tag (tag main before each merge).
- **Database:** the changes are additive, so leave the tables. Use `drop trigger` (0035) and `cron.unschedule` for jobs.
- **Jack:** flip the env back to n8n.
- **APK:** it cannot downgrade (versionCode), so plan a 2.3.1 revert build.

**M10. Section 3.5's Lloyd apply list is incomplete.**
Add:
- the cron files (`ops/sql/alerts_cron.sql`, `erasure_cron.sql`, any `dose_watch_cron.sql` change);
- the GitHub secret (C4);
- the preview origin add and remove (C1);
- a check that the "Firebase Cloud Messaging API (V1)" is enabled in the Google Cloud console.

**M11. Phase 3 contract gaps (section 4.2).**
- 0027 limits `family_messages.kind` to text, voice, photo and file. That blocks D8's `kudos` and D6's shared facts. 0038 must alter the check.
- D5 says "news_items kind study", but 0036 adds a column named `source_kind`. Pick one name.
- D3's interaction check must never say "no interactions found", which gives false reassurance. Use a curated, clinician-signed do-not-mix list on each card instead.
- Q16's default makes Year in pixels visible to writer carers. That conflicts with R-nudge: "do not display one person's missed days to others by default". Default it to the person only.
- Offline first-aid videos must come from Red Cross files, not YouTube downloads (YouTube's terms forbid downloading).

**M12. Three top-15 hazards are not covered (M4, J3, K1).**
Add explicit deferral lines to section 3 or 4, with a date or phase.

---

## LOW
- **L1. Unresolved brief text.** Remove "people.profile2? no:", "discover-daily? no:" and F5's "is not in lane 4's diff? It is". Wave-2 diffs confirm F5 never needs `Assistant.tsx`. PLAYBOOK 0.1 also requires the section 6 answers recorded as D-78+ *before* launch, not "as answered" (Task 27).
- **L2. F2's interim `GreetingBand` move is throwaway work.** S7 deletes it. Skip it.
- **L3. A simpler alarm fix exists (S3).** The plugin's `setExactIfPossible` already uses `setExactAndAllowWhileIdle(RTC_WAKEUP)` for `allowWhileIdle` (`LocalNotificationManager.kt:363`). Only the `on:` re-arm in `TimedNotificationPublisher.kt:67` uses `setExact(RTC)`. Scheduling one-shot `at` alarms 7 days ahead and re-arming on open avoids a patch to maintain. Keep the patch only if the 500-alarm cap bites. The patch target itself is verified real in 8.3.1 (Kotlin path correct).
- **L4. `FCM_PROJECT_ID` is redundant.** The `project_id` is inside the service-account JSON.
- **L5. Carry the three wave-2 minors** under Coverage into fix lanes, or list them as deferred.
- **L6. S8 `migrations.json` must skip 0028**, or System will always show a pending migration.
- **L7. Section 2.4's verify step needs a 0026 column check.** Add a query on the `food_entries` columns, because the outbox depends on them.

---

## Verified as correct (no change needed)
- **Wave-2 migrations.** 0025 and 0026 are on fc9450c, 0027 is only in lane -3 and 0029 only in lane -8. 0026 is additive, so it is safe to apply before merge with the old app live. The apply order and the "apply before merge" rule in section 2.4 are right.
- **Wave-2 file overlap.** The only shared files are `Today.tsx` and `Today.simple.test.tsx`, between lanes 2 and 3. Section 2.3 merges them by hand.
- **`ask` emergency handling.** The server gate runs before the cap, and the reply text itself carries the 911 card text (`ask/logic.ts:73-83`). The flip is a net safety gain.
- **Apply pattern.** `db query --linked -f` plus the `schema_migrations` insert matches `scripts/golive-w1.ps1`.
- **Versions and native pieces.** Capacitor 8.5.3 core is pinned, and local-notifications is 8.3.1 (currently `^`, so the pin is right). The google-services Gradle wiring exists. `BiometricPlugin` exists.
- **FCM HTTP v1 from Deno.** RS256 with WebCrypto and a service-account JSON is feasible.
- **Licences.** Kiwix, ASHP, A.D.A.M., Cochrane, NASA APOD and Lumosity handling all match R-discover.

## Not checked
- Live Supabase state. The deep review says 0024 is the last migration applied.
- Behaviour on a real device: Web Speech in the WebView, full-screen intent, RainViewer coverage of the Philippines.
- Semaphore's current sender-name rules.
- The Inquirer and Rappler feed terms.
