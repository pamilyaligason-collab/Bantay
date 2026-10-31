# Session 16 plan review (read-only, Opus, 2026-10-30)

Reviewed: `docs/session-16/PLAN.md` against `src/` and `supabase/` on commit 0cadb58 (+ uncommitted D-95 work), LLOYD-NOTES N-5..N-23, D-66/82/84/91/92/94-97, ANDROID-RULES, IA-INVENTORY, multi-lane CHECKLIST (ML-01..ML-41).

## Verdict: NO_GO as written

The screens, tokens and IA parts are sound and need only the changes below. Section 1.6 (View as) is unsafe as designed: overriding `selfIdOrCached` turns every **write** path into a write as the viewed member, including SOS, Health Connect sync, consent and the own-profile sync. B-1..B-3 must change in the plan. After that the plan is GO_WITH_CHANGES. Only a re-review of the revised 1.6 / L6 brief is needed; the majors can go straight into the briefs.

---

## Blockers

### B-1 View as through `selfIdOrCached` writes as the viewed member (privacy, SOS, consent)
Evidence: `selfIdOrCached` (`src/features/sync/profile.ts:227`) is the person id used by **writers**, not only readers:
- SOS: `sos/SosScreen.tsx:112` (`pidP = selfIdOrCached()`) and `sos/useSelf.ts:7` → `enqueue('sos_events', … personId: pid)` (:121). An admin who holds SOS while viewing as Mama raises Mama's SOS. RLS `sos_events_insert` (`0031_sos.sql:49`) needs `is_self or is_writer_of`. If Lloyd is her writer, it is silently accepted. If he is not, the row dead-letters and **his own SOS is lost**.
- Own-profile sync: `syncOwnProfile` (`profile.ts:216-223`) runs on every pull, does `adoptPerson(viewedId)` and so wipes the admin's `PHONE_KEYS` (`profile.ts:26,30`): his pending photo upload and wizard answers. It also sets `SELF_ID` = the viewed id, then runs `migrateKv` / `flushPhoto` with the viewed id (`profile.ts:156-166` uploads `profile.photo` as `<viewedId>.jpg`).
- Consent: `ConsentNotice` (`Me.tsx:117`) and `PrivacyScreen.tsx:25,36` call `ensureConsent(personId)`. That **writes `people.consent_at` for the viewed member** with `consent_by = admin` (`privacy/consent.ts:26-27`) just by opening Settings.
- Logging: `today/actions.ts:17` (checkIn, mood, doses, readings), `exercise/actions.ts:11`, `nutrition/actions.ts:21`, `PlateSheet/WaterSheet/SaltSummary`, `nudge/bpReminder.ts:111` (a notification reply), `MedicineEditor.tsx:20`, `Wizard.tsx:42,78` (profile save), `StormCard.tsx:24,39` (roll-call "I'm safe" for the member), `SharingScreen.tsx:17,29` (removes **the member's** shares).
- Reminders: `health/reminders.ts:185` re-arms the phone's alarms for the viewed member's medicines and drops the admin's own.
- RLS does not stop any of the health writes: `records_editor` = `is_self or is_writer_of or is_admin()` (`0008_records.sql:16-17`) and the record policies OR in `is_admin()` (`0008_records.sql:517-521`). They are silently allowed and audited as the admin's own actions.
- The plan's guard does not work. "allowed only where `canMarkFor(viewed, ownId, writable)`" is meaningless once `ownId` *is* the viewed id: `canMarkFor` returns true when `personId === ownId` (`health/useCanMark.ts:6-7`), so every write passes.
- The plan's instruction "L6 greps every `personId` read of `getMember()` … and routes it through `selfIdOrCached`" (PLAN:194) would make it worse. It would pull in `sensors/health.ts:125` (Health Connect steps and sleep from the admin's phone written to the member, D-21), `auth/AuthGate.tsx:49` and `setup/JoinFlow.tsx:36`.
- Both 0029 (`0029_admin_view_as.sql:2`, "The preview itself is client-side and read-only") and the existing desk tool (`admin/desk/viewAsData.ts:3-5`, "never writes health data") define View as as **read-only**.

**Change to the plan (1.6, C-5, L6):**
1. Leave `selfIdOrCached`, `selfIdNow`, `currentPersonId` and every write path untouched. Add one read-only lens instead: `viewas/viewAs.ts` exports `useViewedPersonId(): string | null` (the override when admin and set, else `useSelfPersonId()`). Only these **display** readers switch to it: `useDueMeds` targets, `useMyTakes`/`MyWeek` display, Health default person, Family ProfileCard, Labs. Each one is named in the L6 brief, and no other file changes.
2. While viewing, writes are off, which 0029 already states. QuickLog, NextUp Take/Snooze, I'm OK, roll call, breathe-log, Add reading, scan, ProfileCard Edit and Settings > Privacy / Sharing / Sign-in / SOS contacts / ConsentNotice render disabled with "Viewing only. Exit to act as yourself." Writes for a dependant stay on the paths that already take an explicit person (MemberPage, MedDetail, Family plan), unchanged.
3. SOS hold, IncomingSos, the SOS screen and the Simple mode SOS always act as the signed-in person. The banner stays visible on the SOS screen.
4. Reframe Q1 as "View as is read-only (0029, desk ViewAs). Say 'writes on' only if you want a separate, explicit act-as design later."
5. The C-6 invariant gains: "no write path reads the View as id". L6 test: grep-based vitest that `viewas` is imported by no module under `log/`, `sos/`, `sync/`, `sensors/`, `privacy/`, `sharing/`, `setup/Wizard`, `health/reminders*`, `nudge/`.

### B-2 View as persists across restarts and leaks offline
Evidence: the kv key `viewas.person` (PLAN:185) lives in Dexie and is cleared only on Exit and sign-out (PLAN:194). Offline, `getMember()` loses the role: the `app_roles` and `people` queries fail, so `role` falls to `'member'` and `personId` to null (`auth/session.ts:19-27`). The VA block (PLAN:189-192) is then skipped and `selfIdOrCached` returns the cached `SELF_ID` (`profile.ts:231-233`), which B-1's `adoptPerson(viewedId)` had already set to the **member**. So offline, and even after Exit, the app keeps treating the member as self, without the role check and possibly without the banner. The plan's "offline = works from the phone's copy" (PLAN:196) does not hold.
**Change:**
1. Keep the View as id in memory only (a module variable plus a small subscribe for React), never in Dexie. A cold start always opens as yourself.
2. Allow a switch only when `admin_log_view_as` succeeds (online). Offline, the row says "Needs internet to switch". This also keeps the D-82 audit row true for every view.
3. With B-1 applied, `SELF_ID` is never touched.
4. L6 tests: restart (reload) lands as self; airplane mode after Exit shows the admin's own Next up; a non-admin with a forged value sees self.

### B-3 Switching does not re-render identity, so writes after Exit can still go to the member
Evidence: `useSelfPersonId` reads once on mount (`setup/useProfile.ts:28-35`). `useHealthData` reads `getMember().personId` first and only falls back to `selfIdOrCached` when it is null (`records/useHealthData.ts:36`), so the plan's "ownId via selfIdOrCached, already" (PLAN:194, 307) is false for an admin with a person row. It also keeps a module-level `picked` person. Under the plan, Exit from the banner leaves mounted screens (Today QuickLog, open sheets, the Assistant) holding the member's id.
**Change:** `useViewedPersonId` (B-1) subscribes to the in-memory value. L6 resets the Health picker (`setPersonId`) on switch and exit. Test: switch, then exit on the same mounted Today, and the next render shows self (vitest with the store toggled).

---

## Majors

### M-1 View as ignores what the member may see (D-82/D-84, N-7 "exactly that member's … content")
Evidence: under the plan, the Family faces row, NeedYouNow, the calendar, PersonChips (hidden) and roster use the **admin's** RLS view (all people), so "Viewing as Mama" shows people and records Mama cannot see. The repo already models the member's visibility in `visibleTo(userId, people, carers)` (`admin/desk/viewAsData.ts:17-34`).
**Change:** L6 exposes `useViewedVisibleIds()` built from `visibleTo(viewedUserId, …)` via `loadRoster()`, reused, not rewritten (ML-10). The Family (L4) and Health (L2) person lists filter by it while viewing. For a no-login member (no `auth_user_id`), the visible set is only that person. Reuse `logViewAs` from `viewAsData.ts:57` instead of a new RPC wrapper.

### M-2 Deleting StormCard and AlertBand breaks unowned screens; the storm roll call disappears on acknowledge
Evidence: `StormCard` is mounted on Safety (`screens/Safety.tsx:14,56`) and tested in `family/stormrollcall.test.tsx:34`. `AlertBand` is used by Simple mode (`today/SimpleToday.tsx:2,103`), and the plan says Simple mode is unchanged. StormCard also carries "How are you?", "I'm safe / I need help" and "Do now" (`StormCard.tsx:59-80`). The plan folds only "roll-call faces" into WarningCard, so after a close the push `rollcall_ask` (tab `today`, `notify/templates.ts:35`, mirrored in `supabase/functions/_shared/templates.ts`) lands on a Today with no way to answer.
**Change:**
1. Do not delete `StormCard.tsx` or `AlertBand.tsx`. WarningCard composes StormCard's storm block for the storm variant.
2. Acknowledge hides the hazard text only. The roll-call answer row stays on Today while a signal is live and the user has not answered for this `stormRef`.
3. Simple mode: apply N-8 there too (SimpleToday passes `warning: null` to WeatherCard or drops AlertBand). Name SimpleToday in L1's file list.

### M-3 Acknowledge key misses escalations that keep the same `issuedAt`
Evidence: USGS quakes use `issued_at = origin time` (`supabase/functions/alerts-ingest/parse.ts:97`) with a stable `id: usgs-<id>` (:87). A magnitude revision (M5.4 → M6.2) keeps the same id and issuedAt, so `isAcked` (PLAN:75) keeps it hidden. TCWS (`pagasa.ts:120,130`) re-shows on a new CAP, which is fine.
**Change:** acknowledge by `id` plus `${issuedAt}|${level ?? ''}|${kind}` (store that string). Test: a quake fixture with the same id and issuedAt and a higher `level` re-shows; signal 2 → 3 re-shows; a new quake id shows. IncomingSos and the SOS screen get no close button (C-6 invariant line).

### M-4 File ownership is not exclusive or complete (lane tsc will fail)
Evidence (grep on 0cadb58):
- L3 moves `health/library/*`, but `videosLogic` / `medline` are imported by `anatomy/ExploreScreen.tsx:7`, `today/VideoCard.tsx:2`, `media/LiteVideo.tsx:3`, `discover/today/pick.ts:4`, `discover/watch/Screen.tsx:3` and `safety/firstaid.test.ts:2`. Several of these are owned by no lane, and L2's new VideoHero imports the old path from its base.
- L3 moves `family/LearningHub.tsx`, but `family/People.tsx:13,138` (L4) imports it, so L3's worktree breaks until L4 lands.
- L1 deletes StormCard and AlertBand (M-2) imported by Safety.tsx and SimpleToday.tsx (unowned).
- `App.tsx:86` `useTrackScreen(… hash === '#health/papers' ? 'records' …)` is unassigned.
- `shell/routes.test.ts:6-8` asserts the old `#health/papers` target and is unowned.

**Change (ponytail):** do **not** `git mv` the library, videos or LearningHub files. Only the routes and the screens that mount them change. L3 mounts `health/library/Library` and `family/LearningHub` from Discover; L4 stops importing LearningHub. That removes all the cross-lane imports. Add `routes.test.ts` and the `App.tsx:86` track line to L0.

### M-5 e2e specs that break are unowned
Evidence: these touch moved routes or removed cards and are in no lane: `s13-f-shots.auth` (#family/people/records), `today-auth`, `s14-t2-today.auth`, `s7-today-shots.auth`, `s12-storm-shots.auth`, `s5-alerts`, `s1-alerts-shots` (StormCard / AlertBand / "Family alert" region).
**Change:** add the six Today and alert specs to L1 and `s13-f-shots.auth` to L4 (or L7).

### M-6 N-23 "ingest" and parts of People.tsx are not placed
Evidence: LLOYD-NOTES N-23 asks for "One full 'ingest and review' tab". The Family root (PLAN:147-153) has no scan or add-paper action; Papers sits only in a sub-screen. People.tsx is deleted (PLAN:155), but it also mounts `CarerCards` (review asks, missed doses: `People.tsx:16`) and `Memories` (:14), and neither is placed.
**Change:** ProfileCard (or a row under it) gets "Scan a paper" (`#scan`) plus a "Papers · N to check" link to `#family/papers`. Put CarerCards inside NeedYouNow, and Memories under the calendar or in a named sub-screen (or drop it with Lloyd's yes). "See their stats" in the faces sheet only appears when the user can read that member's records (D-82: `visibleTo(...).records`).

### M-7 Contract C-5 lists hooks that are not needed or do not exist, and misses one needed stub
Evidence: there is no `records` template (`notify/templates.ts:11-36`; tab values are only today/health/family/safety), and templates are mirrored server-side in `supabase/functions/_shared/templates.ts`. `Assistant.tsx:259` sets `location.hash = tab`, so `records` already lands on the `#records` redirect: no Assistant change is needed. L2 (PersonChips hidden) and L4 (ProfileCard "View as = that member") need `useViewAs`, but L0 stubs only `ViewAsRow` and `ViewAsBanner`.
**Change:** drop the Assistant and templates rows from C-5 and L7. L0 stubs `viewas/viewAs.ts` with the final signatures (`useViewedPersonId`, `useViewAs`, `useViewedVisibleIds`) returning self/null.

---

## Minors

- m-1 IncomingSos and AlarmFixedToast sit above weather (PLAN:53), a deviation from N-9 "always the top-most card". Put it to Lloyd as a stated deviation (ML-04).
- m-2 `#today/breathe` makes `hasOwnHeader` true (any `/`, `routes.ts:28`) and hides the TopBar under the sheet. Use the existing history-state pattern (`history.state.bantayAssistant`, `Assistant.tsx:257`) for back-closes instead of a new route, which removes the parseHash change too.
- m-3 ConsentNotice (`Me.tsx:117`) is not in any Settings group. Place it in Privacy, and keep it off while viewing (B-1).
- m-4 ML-38 fixed clocks (23:30 / 00:30) are also needed for the L2 ProgressHero "this week", the L6 `useDueMeds.test`, and the L1 NoticeStack/WarningCard "checked N min ago".
- m-5 ML-41 is absent. List the screens where ViewAsBanner + OfflineBar + TopBar + NoticeStack stack, and check one Jack per screen: no Jack on WarningCard or the storm variant (D-91: none on emergency results). Test at 195 px.
- m-6 Tokens must go into all three theme blocks (`tokens.css:4`, `:22` `[data-theme=dark]`, `:39-42` media query), and `contrast.test.ts` must cover both themes (ML-39).
- m-7 Swipe-to-dismiss on WarningCard (PLAN:78) was not asked for. The close button meets N-10, so skip the swipe.
- m-8 The plan leans on `alerts.ts` `Alert.issuedAt` for acknowledge, but `air-<zone>` rows change issuedAt hourly (`parse.ts:191,201`) and would re-show every hour. Either keep `air` off WarningCard (it is a model estimate) or ack it by `id|level` only.

## Accent contrast recomputed (WCAG 2.x relative luminance, sRGB)
Ink `#1D1F1C` / muted `#5E625B` light, `#EEF0EA` / `#A7B0A6` dark:
- Labs light `#E6E0F0`: ink 12.87, icon `#4F3F80` 6.91, muted 4.83. Plan says 12.9 / 6.9 / 4.8. Holds.
- Watch light `#F6DFD6`: ink 13.00, icon `#9A3B22` 5.44, muted 4.87. Plan 13.0 / 5.4 / 4.9. Holds.
- Family dark `#3A3016`: ink 11.33, icon `#F0B54C` 7.07, muted 5.83. Plan 11.3 / 7.1 / 5.8. Holds.
- Every other row also recomputes within ±0.05 of the table. The tightest is muted on Meds light (4.81) and Labs light (4.83), above 4.5 with little margin. The table test (PLAN:252) must assert ≥ 4.5 exactly, never round up.

## Coverage (N-5..N-23)
All notes are placed and match Lloyd's wording except:
- N-7: write leak (B-1..B-3) and member visibility (M-1).
- N-8: Simple mode still doubled (M-2).
- N-9: SOS above weather (m-1).
- N-23: "ingest" missing; CarerCards and Memories dropped (M-6).

N-19 cites mockup v9. D-91 (v8 contract) is consistent.

## Ponytail
- Over-built: the library, videos and LearningHub file moves (M-4), the Assistant and templates hooks (M-7), the swipe dismiss (m-7), the `#today/breathe` route (m-2), and a new View as module where `viewAsData.ts` already has `logViewAs` and `visibleTo` (M-1).
- Missing: the read-only rule for View as (B-1), memory-only state (B-2), and SimpleToday, Safety StormCard, routes.test and the App.tsx track line in the lanes (M-2, M-4).

Not checked: mockup v9/v10 frames visually, the Me.tsx "22 rows" count, Discover sub-screen internals, MemberPage write paths.

---

# Re-review 1 (Opus, 2026-10-30, PLAN.md Revision 1)

## Verdict: GO_WITH_CHANGES

B-1, B-2 and B-3 are fixed in design. View as is now a read-only display lens. It is memory-only (`PLAN:215-236`), audited before the switch (`:226`), and `sync/profile.ts`, SOS, consent and sensors are untouched (`:211`). I checked `useHealthData.ts:55`: `resetPersonChoice` exists, so L6 needs no edit there.

No blockers remain. Three majors remain. All are about *completeness* of read-only, not identity: every write still goes out under the admin's own id and is allowed by existing RLS. Apply R-1..R-3 to the briefs; no further plan review is needed.

M-2..M-7 are fixed:
- M-2: StormCard and AlertBand kept; SimpleToday is in L1 (`:78,105,361`).
- M-3: the ack stamp includes `level` and `kind` (`:95`).
- M-4: no file moves (`:160-162,369`); `routes.test` and the `App.tsx:86` track line are in L0 (`:326`).
- M-5: every spec named exists in `e2e/` and has an owner (`:288`).
- M-6: the ingest row, CarerCards and Memories are placed (`:174-181`).
- M-7: C-5 is trimmed and the stubs are in L0 (`:326,345-352`).

M-1 is fixed, apart from R-3.

## Remaining findings

### R-1 (major) The read-only list misses live write controls, and two of them have no owner
The plan relies on each lane disabling its own write controls (`PLAN:251`, risk R6 `:397`). Grepping the code turns up writes that are not on the list:
- **Simple mode "Took it":** `today/SimpleToday.tsx:41,63` calls `markDue` on `useDueMeds()` rows. Those become the viewed member's doses (`PLAN:245`), so Simple mode marks Mama's dose. L1 owns the file, but neither 1.1 (f) (`:113`) nor `:251` names it.
- **QuickLog and NextUp:** `today/QuickLog.tsx:63-64` (now shows the viewed member's meds via `useMyTakes`, `PLAN:246`) and `today/NextUp.tsx:7` (`markTaken`/`markDue`). These two files are in **no lane** (L1's list at `:361` has neither, nor `quickLog.test.tsx`).
- **Bell inbox:** `inbox/useInbox.ts:29` uses `useMyTakes`, so the bell lists the viewed member's doses. `inbox/MissedDoseActions.tsx:6` (`logDose`) is reachable from there, and L7 owns it for hrefs only.
- **Health sub-screens:** `health/useHealthPerson.ts:8-9` computes `canMark`/`canEdit` from `ownId`. If L2 makes the "viewed id" the owner (`PLAN:247,362`), `canMarkFor(viewed, viewed)` is true. That enables every write in Refill, Visits, VisitSummary, MetricScreen, Nutrition and Labs, which all use `useHealthPerson`.

**Change:**
1. Add `today/QuickLog.tsx`, `today/NextUp.tsx` and `quickLog.test.tsx` to L1, and add SimpleToday's dose and face buttons to 1.1 (f). Add the MissedDoseActions disable to L7.
2. In `useHealthPerson` (L2), set `canMark = !viewing && canMarkFor(...)` and `canEdit = !viewing && (…)`. Get the viewed default person through `resetPersonChoice()` + `setPersonId(viewed)`, never by changing `ownId`.
3. Add one fail-closed backstop owned by L6 in `src/db.ts:48` `enqueue`: throw `'viewing'` when `getViewedPersonId() !== null`, unless `table === 'sos_events'` (and the telemetry table `admin/events.ts` uses). Callers already map a throw to `'failed'` (e.g. `today/actions.ts:20`). Add a vitest for it.

With the backstop, R6 stops depending on every lane remembering. Only the direct-RPC writes still rely on per-lane disabling: `raise_mood_alert`, roll call, consent and share.

### R-2 (major) The C-6 grep guard is a denylist with holes, and C-5 contradicts it
The guard (`PLAN:255,354`) lists directories. It does not cover:
- `today/actions.ts` (all the quick-log writes)
- `safety/StormCard.tsx:24,39` (roll call, now composed by WarningCard)
- `health/reminderActions.ts:41` and `health/medActions.ts`
- `setup/MedicineEditor.tsx:20`
- `family/store.ts` and `family/messagesApi.ts`

Separately, C-5 offers `exitViewAs()` inside `auth/session.ts` (`:350`). That breaks the guard's own `auth/` rule, and `viewAs.ts` imports `getMember` from `auth/session`, which would make a circular import.

**Change:**
- Turn the guard into an allowlist: `useViewedPersonId` / `getViewedPersonId` may be imported only by the files in the 1.6 reader table (`:242-249`) plus `viewas/**` and `db.ts` (R-1). `useViewAs` (the boolean) is allowed anywhere.
- Fix C-5 to the banner option: `onAuthChange(exitViewAs)` in `ViewAsBanner`'s mount effect. Drop the `auth/session.ts` row.

### R-3 (major) `useViewedVisibleIds` fails open
`PLAN:237-238` returns null, meaning no filter, "when not viewing". It does not say what happens while viewing when `loadRoster()` fails. `loadRoster` returns null on any failed read (`viewAsData.ts:65-72`). Read literally, a failed roster load while viewing shows the admin's whole family under "Viewing as Mama", which defeats M-1.
**Change:** while viewing, a null or failed roster gives `new Set([viewedId])` (only that person) plus a line "Family list could not be loaded". Return null only when not viewing. Test the failed-load case.

### Minors
- r-1 Stale text that contradicts rev 1. Fix these in place:
  - `PLAN:28` Architecture still says "one local override of … `selfIdOrCached`".
  - `PLAN:43` still says "close button + swipe".
  - `PLAN:315-316` still says "local kv" and "a non-admin with the kv key set".
  - `PLAN:378` still says "`learn/library/*.test` moved".
  - `PLAN:380` still says "22 labels" (`:207` says to count instead).
  - `PLAN:407` "roll-call faces inside" should be "StormBlock: faces, I'm safe / I need help, Do now".
- r-2 "Member archived = exit automatically" (`:253`) has no mechanism or owner. L6: `useViewAs` calls `exitViewAs()` when the viewed id leaves `hdb.people`.
- r-3 Fidelity: some screens still show the admin's own data under "Viewing as Mama":
  - Move: `exercise/data.ts:45`
  - Food: `nutrition/SaltSummary.tsx:72`
  - Water: `nutrition/WaterSheet.tsx:9`
  - Plate: `nutrition/PlateSheet.tsx:25`
  - Privacy: `privacy/PrivacyScreen.tsx:25`

  Either add the Move and Food display reads to the reader table, or say in 1.6 that those sub-screens show "yourself". With R-1 their writes are blocked either way.
- r-4 `viewas` importing `admin/desk/viewAsData.ts` also pulls `admin/api` (`viewAsData.ts:2`) into the main bundle. Lazy-import it inside `enterViewAs` / `useViewedVisibleIds`.

Not checked: the mockup frames, and the full direct-RPC write inventory beyond the files named in R-1 and R-2.

---

# Re-review 2 (Opus, 2026-10-30, PLAN.md Revision 3: D-98, D-99 look and act, D-100, L8, L9)

## Verdict: NO_GO for section 1.6 as written; everything else is GO_WITH_CHANGES

Two blockers remain, and both are in the act-as plumbing, not in the D-99 rules. The rules themselves are right and checked against the migrations:
- `meds_taken`, `readings`, `activity`: self-or-writer only (`0003:88-98`, `0001:115`).
- `raise_mood_alert`: person or can_write carer, once per person per day (`0030:75-82`).
- `rollcall_set`: self-or-writer; `user_id = auth.uid()` (`0041:67-73`).
- Nutrition allows admins (`0024:77`).
- `marked_by` is set by trigger (`0039:21`), and the plan correctly says `saveProfile` adopts (`profile.ts:85`).

Fix B2-1 and B2-2 in 1.6/C-5, then Opus re-reviews only 1.6 and the L6 brief. The majors can go straight into the briefs.

## Blockers

### B2-1 The `db.ts enqueue` backstop breaks SOS and silently loses the admin's own writes
Design at `PLAN:245-264`. Checked against the code:
- **SOS refused offline.** The SOS rule compares against `selfIdNow()`. Offline that returns null: `getMember()`'s `people` query fails, so `personId` is null (`auth/session.ts:19-27`, `profile.ts:236-238`). SosScreen takes its id from `selfIdOrCached()` (cached, `SosScreen.tsx:112`), so `pid !== null` throws `acting:sos-not-self`. `ok` becomes false and the SOS is not recorded (`SosScreen.tsx:119-125`). SOS must never be refused (`0031_sos.sql:50`). `selfIdNow()` also costs two network round-trips on every acting write, inside the 3 s SOS budget.
- **SOS follow-ups and acks refused.** `sos_events_update` (SMS opened, cancel) and `sos_acks` (`family/IncomingSos.tsx`) are in neither set, so `acting:unknown-table` fires. While acting, the admin cannot cancel his own SOS or acknowledge a family member's real SOS. `phone_health` (`phonecheck/report.ts`), `push_subscriptions` (`notify/subscribe.ts`), `nutrition_goals` and `safety_overrides` fail the same way.
- **Silent data loss.** "Refuse the admin's own self rows" plus local-first writes loses data. `log/store.ts:73,79,92` writes the local Dexie row first and then calls `enqueue`. A throw leaves a local row that never syncs. Several legitimate background writes for the admin's own person run while he is acting:
  - Health Connect sync (`sensors/health.ts:236-237`): dedupe then skips the steps forever.
  - Dose reminder "Taken" from the admin's own notification (`health/reminderActions.ts:41-60`): his dose looks taken on the phone and missed on the server, so carers get `dose_missed`.
  - Move log (`exercise/actions.ts:11-14`).
  - The pulse from a BP reply (`nudge/bpReminder.ts:111-114`).
  - A dependant's reminder "Taken" for someone other than the acting member is refused as `acting:mismatch`.

  The "every queued row is for the member" invariant (C-6, `PLAN:379`) is wrong. While acting, the admin is still a person whose phone keeps working.

**Change:** drop the person check from the backstop entirely. Correctness comes from explicit ids at the named UI entry points plus the import allowlist (already in 1.6). Keep one narrow guard: refuse `people_profile` where `payload.id === acting` (the member's profile must never be adopted). Put it in `saveProfile` before its local write, or in a guard registered with `db.ts`. Do not import `viewas` or `sync/profile` into `db.ts`: `db.ts` ← `sync/profile.ts:1` and `setup/useProfile.ts:3` would form an import cycle at app start. Add tests:
- SOS enqueues while acting, online and offline;
- `sos_acks` and `sos_events_update` pass;
- a sensors sync and a reminder Taken for the admin while acting both reach the outbox.

### B2-2 A global acting id inside `asPerson` logs the admin's own notification replies into the member's record
C-5 (`PLAN:375`) makes `today/actions.ts asPerson` return `getActingPersonId() ?? selfIdOrCached()`. `asPerson` is shared by non-UI paths. `nudge/bpReminder.ts:7` imports `logBp` from it. When the admin replies "130/85" to **his own** BP reminder notification while acting, the BP goes into **Mama's** readings, while the pulse goes to him (`bpReminder.ts:111-114`, explicit `selfIdOrCached`). That is wrong-person health data.

This also contradicts 1.6's own rule: "writes pass the viewed person id explicitly" (D-99).

**Change:** `asPerson` stays `selfIdOrCached()`. Each exported logger (`checkIn`, `logFeeling`, `takeDose`, `takeMedication`, `logBp`, `logSugar`, `logWeight`) gets an optional `personId` parameter. Only the UI entry points pass `useActingPersonId()`: QuickLog, NextUp, SimpleToday, the Today I'm OK, the FacesRow I'm OK, StormCard. Drop the `asPerson` row from C-5. Extend the allowlist test so `getActingPersonId` is not imported by `today/actions.ts`.

## Majors

### M2-1 The queued "Unwell" is one slot for the whole phone, so one person's later mood drops another's alert
`today/actions.ts:49` deletes `mood.unsent` on any non-Unwell mood, and `queueUnsent` (`:58-60`) keeps a single `{ personId }`. Offline:
1. The admin logs Unwell for Mama; it is queued.
2. The admin logs his own "Great"; Mama's queued alert is deleted.
3. Mama's carers are never told.

**Change (L6, `actions.ts`):** key it `mood.unsent.<personId>`. Only the same person's later mood supersedes it. `retryOnce` sends every key. Add a test.

### M2-2 Write paths in the plan's own table have no owner, and one is missing
- The nutrition row (`PLAN:236`) changes `nutrition/actions.ts:21` (`selfIdOrCached`), `PlateSheet.tsx:25`, `WaterSheet.tsx:9` and `SaltSummary.tsx:72`. None of these is in L2's file list (`PLAN:386`), nor in any other lane.
- `exercise/actions.ts:11` (Move) and `exercise/data.ts:45` are not in the write table at all. Rev 2 said Move "shows yourself", and rev 3 is silent.

**Change:** add `nutrition/{actions.ts,PlateSheet,WaterSheet,SaltSummary,NutritionScreen}.tsx` to L2 with explicit `personId`. For exercise, either add it to L2 the same way, or state that Move is "yourself only" and disable its log button while acting with a reason.

### M2-3 The animated sky and Aurora sit behind the SOS screen
`Sky` is mounted once at the App root (`App.tsx` `<Sky state="clear" />`), behind every screen. SosScreen replaces only Today's content (`Today.tsx:66`). Section 8 puts the WebGL2 Aurora in `look/Sky.tsx` (`PLAN:453-454`) with no SOS rule. A WebGL context loss or a jank spike while GPS, the call and SMS are starting is a risk on the one path that must not fail.

**Change (L9, C-6):** `Sky` renders static, with no WebGL canvas, whenever the SOS screen, Simple mode SOS or a live `IncomingSos` is up, and on `#safety*`. Add an `s16-motion` case: hold SOS with Aurora enabled → no `<canvas>` in the DOM.

### M2-4 The consent and sharing copy overclaims privacy (ML-12) and points to the wrong screen
The onboarding screen 5, Wizard and StartDone copy (`PLAN:280,282`) says "Your records stay private until you share them and the person accepts … Change this in Settings > Privacy." Two problems:
- Admins can also offer a viewer for any member. The member is told only at offer time (`0037_sharing.sql:12-13,113-115`; D-80, D-82).
- "Who can see my records" lives in Settings > **Family and sharing** (`PLAN:199`), not Privacy.

**Change:** "Your records stay private until you or a family admin share them and the person accepts. Family admins can see them. Change this in Settings > Family and sharing."

### M2-5 Lanes built in parallel need L9 components that do not exist in their base
- L1 renders `<BreathOrb>` (C-5 `PLAN:378`).
- L8's First success uses `CheckDraw` (`PLAN:280`).
- Both are L9 files (`PLAN:393`), and the L1 and L8 worktrees start from L0, where neither exists. `tsc` fails in those lanes, the same class as M-4 in the first review.
- `look/index.ts` is L0's, so L9 cannot export from it.

**Change:** L0 stubs `look/BreathOrb.tsx` (static disc + label) and `look/CheckDraw.tsx` (static tick) with their final props. L9 replaces them. Other lanes import by file path, not via `index.ts`.

## Minors
- m2-1 `useActingCan` (`PLAN:226`) reads `listCarers()` live. It does not say what happens offline or on a failed read. Cache the result at `enterActing` time, which is online anyway, and fail closed to "View only" only when there is no cache.
- m2-2 The test reminder (`PLAN:280`): `setup/steps.ts:121 scheduleTest` uses the default channel, so it may not "ring". Reuse `phonecheck/probe.ts:55 scheduleTestAlarm(5)` (alarm channel, permission check, `'no-permission'` result) (ML-10). If step 3 was skipped, step 5 shows "Turn on reminders first" instead of a test.
- m2-3 POST_NOTIFICATIONS on Android 13+ works: manifest `:66`, targetSdk 36, `steps.turnOnReminders:66-72`. After two denials Android stops prompting, so step 3 and the Today alerts-off card need an "Open app settings" fallback. USE_EXACT_ALARM is auto-granted on 33+ (`:68`). Location `resolveLocation(true)` with the Geolocation plugin is fine (`useLocation.ts:36-56`).
- m2-4 Dark contrast recomputed on `--card #18231C`:
  - ink 14.11 and muted 7.26: these hold.
  - Icons on card: 8.14-9.13. On the actual 18% chip they are 5.67 (terra) to 6.10 (green), which still holds.
  - `contrast.test.ts` must test the icon against the chip colour, its real background (ML-39), not against `--card`.
- m2-5 Ponytail: `look/motionBudget.ts` overlaps `look/useReducedMotion.ts` and `look/motion.ts`, which already exist, so extend those. `scripts/size-budget.mjs` does not exist and has no owner; give it to L9 or drop it for a `vite build` chunk-size check in the L9 test.
- m2-6 A mood alert raised by the acting admin also reaches the admin himself, since `notify_family` excludes only the owner (`0030:60`). Messages sent while acting go out as Lloyd. Say both in the bar or the toast copy ("Sent as Lloyd").
- m2-7 Section 4 (`PLAN:339`) says RLS refuses an admin without a link "for … roll call". True, but `rollcall_set` also needs `is_family_member()` (`0041:71`), so state both conditions in `useActingCan.rollcall`.

## Ownership spot-check
L8 and L9 do not collide with L1-L7. `setup/steps.ts` is L8's, and L0 adds the `useSetupLeft` stub before branching, which is fine. ML-38 fixed clocks are kept per lane, and ML-41 is covered by C-7.

Not checked: the DESIGN-AUDIT wording items W-1..W-52 one by one, the mockup v11 frames, and the visits/appointments write path (no outbox table found for it).

---

# Re-review 3 (Opus, 2026-10-30, PLAN.md Revision 4: section 1.6, L6, B2-1, B2-2, M2-1..M2-5)

## Verdict: GO

No blockers or majors remain. The four minors below go into the L6 and L9 briefs as written; they do not need another review.

## Checked against the code
- **B2-1 fixed.** `db.ts enqueue` is unchanged (`PLAN:266`, C-6 `:388`), and L6 "does not touch `db.ts`" (`:399`).
  - SOS, `sos_events_update`, `sos_acks`, `phone_health`, `push_subscriptions`, Health Connect (`sensors/health.ts:236`), the admin's own reminder Taken (`reminderActions.ts:41-60`), Move and the BP pulse all queue as before.
  - `actingWrites.test.ts` pins this, including offline SOS with `getMember` rejecting.
  - The profile guard runs before `adoptPerson` and before the local write (`:269`).
- **B2-2 fixed.** `asPerson` stays `selfIdOrCached()` (`:250`, C-5 `:382`).
  - The loggers get an optional trailing `personId`; `nudge/bpReminder.ts:7` passes none, so its BP and its pulse both go to the admin.
  - The allowlist names `today/actions.ts`, `nudge/**` and `health/reminder*` as forbidden importers (`:275`).
  - `markDue`/`markTaken` already take explicit people (`reminderActions.ts:50-53`), so NextUp and SimpleToday need no global.
- **M2-1 fixed.** `mood.unsent.<personId>`, `retryUnsentMood` sends every key, and the test covers "Mama queued, own Great, Mama's still sent" (`:253,275`).
- **M2-2 fixed.** The nutrition files are in L2 with an explicit `personId`. Exercise is "yourself only", with the Move log button off while acting (`:255-256,395`).
- **M2-3 fixed in design.** Sky goes static with no canvas during SOS, a live IncomingSos and `#safety*` (`:387,458`), with an `s16-motion` canvas check. See r3-2 for the owner gap.
- **M2-4 fixed.** The copy names the admin path and "Settings > Family and sharing" (`:287`), consistent with `0037_sharing.sql:12-13`.
- **M2-5 fixed.** L0 stubs `BreathOrb` and `CheckDraw` with their final props, and L1/L8 import them by path (`:356,385-386`).
- **Also verified:** m2-1 (carers cached at enter, fail closed offline), m2-7 (`rollcall = family member && log`) and m2-2 (`scheduleTestAlarm(5)`) are applied.

## Minors (fold into briefs)
- **r3-1 Guard placement.** `savePhoto` (`profile.ts:146`) also calls `adoptPerson` directly, and so does `applyPulledProfiles` (`:106`, self only). Put the one guard line in **`adoptPerson`** (`profile.ts:27`) instead of `saveProfile`. That is the single choke point for `saveProfile` (`:85`), `savePhoto` and pulls, and it is still before any local write. It is not reachable today, because `DetailsSheet` is mounted only from `Me.tsx:234` with the admin's own id and ✎ is off while acting. It costs the same one line.
- **r3-2 SOS flag owner.** The "module flag the SOS screens set" (`PLAN:458`) has no owner. `SosScreen` is mounted in four places: `Today.tsx:66`, `SimpleToday.tsx:76`, `Safety.tsx:49` and `assistant/Assistant.tsx:372`. `useSosActive` (`family/sosActive.ts:11`) covers only an *incoming* family SOS. Give L9 one hook line in `sos/SosScreen.tsx`: a mount/unmount effect that sets the Sky flag (an import from `look/`, not `viewas`, so C-6 is not affected). This covers all four, including Jack's SOS, which no lane owns.
- **r3-3 Import cycle.** The plan's "no cycle" claim (`:271`) is not quite true. `sync/profile.ts` would import `viewas/viewAs.ts`, which imports `setup/useProfile.ts`, which imports `sync/profile.ts` (`useProfile.ts:4`). It is harmless today, because all three modules only define functions at top level, but it is fragile. Put `getActingPersonId` and the subscribe set in a dependency-free `viewas/store.ts`, imported by `profile.ts`, and keep the hooks in `viewAs.ts`.
- **r3-4 Acting as yourself.** The picker lists people "sorted self-first" (`:230`), but `getActingPersonId` is "never the admin's own id" (`:236`). `enterActing(ownPersonId)` must return false and the picker must leave out self. Otherwise the guard would block the admin's own profile edits.

Not re-checked: sections outside 1.6 and the L6 brief, and the items of earlier rounds beyond those listed above.
