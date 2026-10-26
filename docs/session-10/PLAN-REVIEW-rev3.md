# Session 10 plan rev 3 re-check (adversarial, Opus 5.5)

**Verdict: GO_WITH_CHANGES.** Phase 1 is unchanged by rev 3 and can start now. Phase 2 must not launch until the changes in A (critical) and B (high) are written into PLAN.md section 3 and `contracts.md`. The D-78 direction itself is sound and smaller than rev 2.

**Scope:** only what rev 3 changed (D-78), plus anything it broke. Read: PLAN.md rev 3 (all), PLAN-REVIEW.md (rev 2 findings), D-78, the mockup's D-78 notes, live code on this worktree (`src/features/sync/sync.ts` + `tables.ts`, `src/features/sos/*`, `src/db.ts`, `_shared/http.ts`, `0023`, `ops/sql/dose_watch_cron.sql`, `MainActivity.java`, `AndroidManifest.xml`).
**Nothing was run:** no SQL, no Realtime, no device.

---

## A. CRITICAL (fix before Phase 2 launch)

**A1. The SOS row does not fit the outbox, and the rate limit loses SOS records.** (3.1 SOS, 3.2b item 1, S2)
Facts in code:
- The outbox POSTs `?on_conflict=client_id` unless the spec says `noClientId` (`sync.ts:104`, `tables.ts`). `sos_events` has no `client_id` column. The first SOS would get a 400, and 400 is in `DETERMINISTIC` (`sync.ts:22`), so it is dead-lettered at once.
- A 403 is dead-lettered too (`sync.ts:137`). The planned rate limit is an RLS `with check`, so the 4th SOS in 10 minutes is silently lost. The screen has already told the elder "Your family will see this in Bantay".
- Updates (`sms_opened`, `call_to`, `cancelled_at`) would be full-row upserts. Postgres checks the INSERT policy on `INSERT ... ON CONFLICT DO UPDATE` as well. After 3 SOS events, even "Cancel, I don't need help" would be refused. A column grant on `cancelled_at` alone would also refuse an upsert that sets other columns.

**Change:**
1. The client supplies `id` (a UUID). Spec: `sos_events: { noClientId: true, onConflict: 'id', resolution: 'ignore-duplicates' }`.
2. Add a separate PATCH spec (`sos_events_update`, `patch: { table: 'sos_events', idField: 'id' }`, the `people_profile` pattern) for `sms_opened`, `call_to` and `cancelled_at`. Use `grant update (sms_opened, call_to, cancelled_at)` with an update policy `user_id = auth.uid()`.
3. `sos_acks`: `noClientId: true, onConflict: 'event_id,user_id', resolution: 'ignore-duplicates'`.
4. **Never refuse an SOS insert.** Drop the count from the insert policy. Throttle the fan-out instead: the trigger skips `notify_family` when this user already raised 3 or more events in 10 minutes. The insert policy is `with check (user_id = auth.uid() and <own person or writer carer>)`. Without `user_id = auth.uid()` a caller can spoof `user_id` and dodge any per-user throttle.
5. S2 acceptance: change "4th insert in 10 min refused" to "4th insert stored, no new `carer_alerts` rows". Add "cancel after 3 events succeeds".

**A2. Alert triggers must never block the write they hang on.** (0031, 0035)
The 0035 trigger runs on every `readings` insert from the outbox. If `notify_family` or `net.http_post` raises (pg_net missing, vault secret missing, a bad check value), the reading insert fails. The client gets a 4xx or 5xx, the row is dead-lettered or retried, and the health data never reaches the server. The same applies to `sos_events`.

**Change:**
- Wrap the body of each alert trigger in `begin ... exception when others then raise warning '...'; end;` and return `new`.
- Call pg_net only when `to_regproc('net.http_post') is not null`. The WSL rehearsal has no pg_net and no vault, so this guard is also what lets the rehearsal pass.
- The rehearsal gets one case per trigger: "notify fails, the insert still commits".

**A3. `notify_family` is too open.** (3.1, 0030)
- Postgres grants EXECUTE to PUBLIC by default. Write `revoke execute on function public.notify_family(...) from public, anon` (as 0023 does), otherwise anon can call it through PostgREST.
- Granting `sos` and `sos_cancel` to authenticated lets any active member fake an SOS alert for any person, with a caller-chosen `ref`. This skips `sos_events`, its history and the throttle. Those kinds come only from the 0031 triggers.
- **Change:** app callers may raise only `mood_unwell`. Do it through a thin wrapper, `raise_mood_alert(p_person)`, granted to authenticated. It checks that the caller is the person (`people.auth_user_id = auth.uid()`) or a writer carer, forces scope `carers`, and derives `ref = p_person || ':' || Manila day` on the server. `notify_family` itself is not granted to authenticated at all.

---

## B. HIGH

**B1. The 0030 contract is internally inconsistent.**
- `kind` check: the SQL list lacks `pin_approve`. Section 8 says it is there; 3.1 says "S1 adds it". It also lacks the owner's `pin_changed` row. Add both.
- `person_id not null`: S8's `system` rows for admins have no person. Either make `person_id` nullable (with `check (person_id is not null or kind = 'system')`) or set it to the admin's own person. Pick one in the contract.
- The `notify_family` comment lists scopes `carers | family`, but S5 uses `self` ("S1 adds it"). Write all three in the contract.
- `expires_at` is 7 days but the prune is 30 days. State which one the bell honours.
- `on conflict` must repeat the partial-index predicate: `on conflict (kind, ref, carer_user_id) where ref is not null do nothing`.
- **Line 240 still has unresolved text:** `notify_family(person, 'system'? no: ... kind 'system'? No.)`. Rev 2 C5.4 and L1 asked for this to be removed, and section 8 says "Placeholders: none". Replace it with one sentence: "pin-login (service role) inserts one `pin_approve` row per active member except the requester."

**B2. Realtime: the claim is right, but the details are missing.**
Supabase Realtime `postgres_changes` does apply the table's SELECT RLS per subscriber when the client holds a user JWT. The app uses `supabase.auth` sessions (`auth/client.ts`, `pinLogin.ts` `setSession`), so supabase-js 2.118 refreshes the socket token by itself. Still to write:
- `alter publication supabase_realtime add table ...` is not idempotent, and WSL Postgres has no `supabase_realtime` publication. Wrap each statement in a `do $$` block that checks `pg_publication` and `pg_publication_tables`. The down migration drops the table from the publication.
- Grant `select` on `carer_alerts`, `sos_events` and `sos_acks` to authenticated. Realtime evaluates the same policy.
- In a Capacitor WebView the socket dies in the background. `alertsLive.ts` unsubscribes on `appStateChange` inactive, then resubscribes **and** polls on active. The 30 s poll stays the safety net.
- DELETE events (the prune) are not RLS-filtered and carry the primary key only. The client must ignore them.
- S1 acceptance gains a vitest with a mocked channel: subscribe, then an INSERT payload, then a Dexie row and the badge; resume, then resubscribe and one poll.

**B3. The late-SOS rule depends on the elder's phone clock, and late rows vanish.**
- `late := now() - new.at > 30 min` uses the server clock against the client's `at`. A phone clock that is 30 or more minutes slow turns a live SOS into "late", and no alert is sent. Use the client's own clock on both ends instead. The outbox stamps `sent_at` when it sends an `sos_events` row (one line in `sendRow`, beside the existing `client_id` stamp). Then `late = sent_at - at > 30 min`. Fail open: a missing `sent_at`, or an `at` in the future, counts as live.
- `late` must be set in a **BEFORE INSERT** trigger. An AFTER trigger cannot change `new`. The BEFORE trigger also overrides any `late` the client sent. The alert stays in the AFTER trigger.
- Late rows get no alert row today, so a member who was neither called nor texted never learns about the SOS. Give late rows a non-urgent `sos` row with a new template, `sos_late` ("<name> used SOS at HH:MM; it reached Bantay later"). This is what rev 2 H3 asked for ("marked late, not pushed as live").
- The cancel trigger fires on any update that names `cancelled_at`. Guard it with `old.cancelled_at is null and new.cancelled_at is not null`.

**B4. SOS call and SMS on the device.** (S2, 3.1 steps 2-3)
- **Auto-dial from the WebView is fine while in the foreground.** ACTION_CALL from a plugin on the visible activity is not blocked by the Android 10+ background-activity-start rules or by anything in Android 14. Add to `CallPlugin`:
  - check `ContextCompat.checkSelfPermission` first;
  - catch `SecurityException` and `ActivityNotFoundException` and return `{placed:false}`, which falls back to `tel:`;
  - refuse emergency numbers in native code (`PhoneNumberUtils.isEmergencyNumber` plus 911, 112, 117), not only by convention in the caller.
- **Never ask for `CALL_PHONE` inside the SOS flow.** If the permission is missing, use the `tel:` fallback. The prompt belongs only to setup (S6a) and the Me row (S6c).
- **Android 11+ resets the permissions of apps unused for months.** S3's probe and `phone_health` gain `call_ok`. The Me row shows "Hold for help can no longer call for you, tap to allow".
- **Dual-SIM phones** (common in PH) may show a SIM chooser on ACTION_CALL, unless a default SIM is set. MIUI may show its own "allow this app to make calls" confirm. Device test 4 must record both on the Xiaomi. If either appears, set "always use SIM 1" during the family setup day (Task 27).
- **Auto-opening the SMS composer on return.** Do it only while the SOS is under 10 minutes old and not cancelled. Otherwise show the "Text <contact>" button. Keep the SOS-in-progress state (`id`, step, `at`) in kv, so a WebView killed during a long call resumes on the status screen. Without this, a phone reopened the next morning pops an SOS text.
- **Message content.** The plan's template drops the existing honest no-GPS wording (`sos/sms.ts` `sosBody`: "My phone could not find my location. My home area"). Keep that branch. Name, time, link and digits are the minimum needed; no health data appears, which is correct. The existing `smsUri` comma-joins numbers (the group-MMS hazard), so S2 replaces it.
- **One composer per contact deviates from D-78 and the mockup.** D-78 says "addressed to the family" and the mockup sequence says "Text to family ready". The reason is good (group MMS), but it is a decision, not a silent change. Record it as D-79, or add it as a question with this default.
- 911 is never auto-dialled, and ACTION_DIAL is prefilled. This is correct. Android also turns ACTION_CALL to an emergency number into the dialer.

**B5. The plan contradicts the updated mockup on the three alert screens.** The vault mockup already carries 8 D-78 notes.
- `lock-storm` is now "Phone's own emergency alert (NDRRMC) ... Bantay does not send it." S5's "`lock-storm` as the in-app alert row" and its `lock-storm (in-app)` shot cannot match it. **Change:** S5 drops the `lock-storm` shot. The storm in-app state is `today-storm` (S7) plus the bell row (S1).
- `lock-sos` is "a red SOS banner at the top of Today and Family", not a full-screen view. **Change:** S4 `IncomingSos` becomes the banner. Device test 4 says "banner" instead of "full-screen incoming-SOS view".
- `lock-missed` is the alert list ("bell with count"). S1 builds that as the list, with the missed-dose row's actions; it is not a separate sheet.
- **3.2b step 5 ("rewrite mockup notes for lock-*") must be dropped.** The notes are already rewritten, and rewriting them again would overwrite approved D-77/D-78 text.

**B6. File ownership after S1a/S1b were merged into S1 still has holes or collisions.**

| File | Problem | Change |
|---|---|---|
| `src/features/safety/settingsOpener.ts` (+test) | S3 owns it, and S5 owns `src/features/safety/*` (all) | S5 = `safety/*` except `settingsOpener.ts*` |
| `supabase/functions/_shared/http.ts` | 3.4 says "S1 makes it accept a comma list" (C1); not in the table | add to S1 |
| `src/App.tsx` | hook lines given to S1 (`alertsLive`, Privacy route), not in the table | add to S1 (hook lines only) |
| `src/db.ts` | S1 writes "Dexie `alerts`"; no such store exists (version 2 has `outbox`, `kv`, `profiles`); unowned schema bump | S1 uses a feature-local Dexie DB `src/features/notify/store.ts` (the `family/store.ts` pattern) or kv; nobody edits `src/db.ts` |
| `src/features/admin/broadcast.ts`, `AdminScreen.tsx` | S8 ships the `admin-broadcast` copy; the files are unowned | add to S8 |
| `mood_unwell` raise | S4 ("the app calls notify_family on save") and S7 (`today-log` unwell) both claim it | S7 calls `raise_mood_alert` (A3); S4 only renders the card |
| CALL_PHONE request | S6a (setup card) and S6c (Me row) need S2's code; there is no export in the contract | contract: `src/features/sos/call.ts` exports `callPermission(): Promise<'granted'|'denied'|'unavailable'>` and `requestCallPermission()`; S6a and S6c import them |
| kv `sos.contacts` | read by S2, written by S6a; shape not in the contract | contract: the existing `SosContact[]` (`sos/contacts.ts`, max 2) |
| dose-watch `index.ts` tests | S1 owns `index.ts`; the only test file `dose-watch.test.ts` is S4's | S1 adds a named `dose-watch/index.test.ts` |

No collision was found among the remaining rows (S2 `sos/*` vs S7 `today/*` hooks, S4 `family/*`, S9 health files, S6a/b/c).

**B7. Rev 2 M3 is only partly moot.** The FCM channels are gone, but `lock-alarm` is still a local alarm. No channel is created today (no `createChannel` in `src`, no `res/raw`).
**Change:** S3 creates a versioned `alarms_v1` channel (importance 5, vibration) through `LocalNotifications.createChannel`. This is JS only, no native code. All reminders use it. The copy says "rings loudly", never "even on silent". The mockup's "sounds even on silent" sits only on the NDRRMC screen, which is true there.

---

## C. MEDIUM / LOW

- **C-1 Migrations order** (0030 S1 -> 0031 S2 -> 0032 S3 -> 0033 S8 -> 0034 S6b -> 0035 S9). The order is correct: 0031, 0034 and 0035 depend only on 0030, and the functions deploy after all six.
  - **Rollback:** downs run strictly in reverse (0035 -> 0030). A 0030 down with the 0031 or 0035 triggers still present breaks every SOS and reading insert (late-bound `notify_family`); A2 softens this but does not remove the rule.
  - Name the triggers in the contract (`sos_events_late` BEFORE, `sos_events_alert`, `sos_events_cancel`, `readings_alert`) so 3.6's `drop trigger` lines match. 3.6 currently omits the cancel trigger.
  - The 0030 down keeps `documents.printed_name`, because S11 data lives there; say so.
  - 0033 `admin_pending_migrations` reads `supabase_migrations`, which WSL lacks. Guard it with `to_regclass`.
  - The 0031 and 0035 pg_net calls reuse the vault secret `dose_watch_cron_secret`, which `ops/sql/dose_watch_cron.sql` requires. List it as a prerequisite in 3.4.
- **C-2 `log_client_error`** (new in rev 3): take `user_id` from `auth.uid()`, never a parameter. Add length checks (`where_` 64 chars, `message_hash` 64 chars), revoke from public and anon, and cap the rows at 50 per user per day. Otherwise random hashes grow the table without bound.
- **C-3 Copy rule (no push promised on the Android app).** The rule and the lane copy hold: "will see it in Bantay", "+20 ... see this in Bantay at :30", banners, `admin-broadcast`, `start-approve-wait`. No rev 3 string promises a lock-screen alert on the APK.
  - Live code: `SosButton.tsx:14` aria-label "to alert your family" is acceptable (the family is called and texted), but S2 should align it with "call and text your family".
  - Add a grep gate at merge: `grep -rniE "will be (told|notified)|lock screen|notification" src/features/{notify,sos,family,today,health/bpcheck}` reviewed by the auditor.
- **C-4 Open questions are miscounted and mis-referenced.**
  - The header says **32**, and so does section 8. The list has **34**: 1-11, 32-37 and 12-28, with 29-31 retired.
  - Wrong references:
    - line 23 "Q33 (window)" should be **Q34**;
    - S4 "digest ... (Q18)" should be **Q15**;
    - S6c "consent backfill rule (Q34)" should be **Q37**;
    - line 25 "added Q32, Q35, Q36" leaves out 33, 34 and 37.
  - **Change:** renumber the Phase 2 block 12-17 and the Phase 3 block 18-34 (or keep the numbers and fix the header to 34), then fix every reference. Add B4's composer decision as a new question if it is not recorded as D-79.
- **C-5 Device test 1 timing.** "Open Bantay 35 min after a missed slot" depends on the dose-watch `*/15` cron, so the row can appear at :30 to :45. State that, or open at :50.

---

## D. Rev 2 findings: does each still apply, and is each marked correctly?

| Finding | Rev 3 status | Check |
|---|---|---|
| C1 preview test window | kept, only when native ships | Correct. The `http.ts` owner is missing (B6). |
| C2 feature detection | kept | Correct. `hasPlugin('Call')` gives the `tel:` fallback on 2.2 shells. |
| C3 FCM payload | moot | Correct. Its sub-point (`system` and Unwell template ids) is carried. |
| C4 CI google-services | moot | Correct. |
| C5 PIN reset | kept | Mostly. **C5.4 regressed**: the unresolved text is back on line 240 (B1). |
| C6 reading trigger | kept | Rules carried. Fail-safety is new (A2). |
| H1 ownership | kept | Gaps listed in B6. |
| H2 repeats | kept | Correct. |
| H3 SOS offline | marked moot | The native-SMS part is moot (D-78). The late-replay part is kept, but its clock and its no-row behaviour need B3. |
| H4 SOS abuse | marked moot | The server-SMS parts are moot. The rate limit was carried, but in a form that loses SOS records (A1). Recipients now come from on-device kv, which is correct with no server SMS. The link-plus-digits body satisfies the link-filter point. |
| H5 interim notice | kept (F2) | Correct. |
| H6/H7 BP table, crisis copy | kept | Correct. |
| H8 `ref` dedupe, kinds | kept | Kinds incomplete (B1). |
| H9 push_tokens | moot | Correct. Its lesson (an RLS refusal in the outbox = stuck or lost) recurs in A1. |
| H10 RLS | kept | Needs `user_id = auth.uid()`, the column grants (A1) and the `revoke from public` lines (A3). |
| H11 effort | re-cut, 3-4 sessions | Plausible for the smaller scope. A1-B7 add about half a session. |
| M1, M2, M4-M9, M11, M12 | kept | Correct. |
| M3 channels | marked moot | **Partly wrong**: the alarm channel still applies (B7). |
| M7 privacy | kept, processors updated | Correct (no Firebase, Sentry or Semaphore listed). |
| M10 apply list | reduced | Add the vault secret prerequisite (C-1). |
| L1-L7 | kept | L1 regressed (line 240). |

---

## Exact edit list for rev 4 (orchestrator, before the Phase 2 launch)

1. **3.1 SOS:**
   - client `id` and the outbox specs (A1.1-3);
   - an insert policy with `user_id = auth.uid()` and no count;
   - throttle inside the trigger;
   - BEFORE trigger for `late` using the client `sent_at`, failing open;
   - a `sos_late` non-urgent row;
   - the cancel guard;
   - column grants;
   - exception-safe trigger bodies.
2. **3.1 alert channel and S1:** add `pin_approve` and `pin_changed` to `kind`, decide nullability of `person_id` for `system` rows, list all three scopes, repeat the `on conflict` predicate, revoke `notify_family` from public, anon and authenticated, add the `raise_mood_alert` wrapper, add the guarded publication blocks, grant select, add resubscribe-on-resume, ignore DELETE events, add the mocked-channel vitest.
3. **3.1 dangerous reading:** an exception-safe trigger, a pg_net guard, and a rehearsal case for "notify fails, the insert commits".
4. **Line 240:** replace the unresolved PIN text with one contract sentence.
5. **S2:** add the native emergency-number refusal and exception handling, no permission prompt inside the SOS, the 10-minute window for auto-opening the composer, kv-persisted SOS state, and the no-GPS wording. Change the rate-limit acceptance. Record the one-composer-per-contact decision (D-79 or a new question).
6. **S3:** add `call_ok` to the probe and to `phone_health`, and the `alarms_v1` channel.
7. **S4, S5, 3.2b, device test 4:** follow the current mockup. `lock-sos` is a banner and `lock-missed` is the alert list. Drop the `lock-storm` shot. Delete 3.2b step 5.
8. **3.2a:** apply the B6 table.
9. **3.4 and 3.6:** add the vault secret prerequisite, the named triggers, the reverse-order downs, the WSL guards and the device-test 4 dual-SIM/MIUI notes.
10. **Section 6 and section 8:** set the question count to 34 (or renumber), fix the four wrong Q references, and correct the "Placeholders: none" claim.

Not checked: live Supabase Realtime behaviour, real OEM ACTION_CALL behaviour (dual-SIM, MIUI), and whether `dose_watch_cron.sql` (and so the vault secret) is applied live.
