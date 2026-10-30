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
