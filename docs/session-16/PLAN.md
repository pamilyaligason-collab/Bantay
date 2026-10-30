# Session 16 redesign plan (N-5..N-23, D-94, D-96, D-97)

## Revision 2 (2026-10-30, after Re-review 1, Opus GO_WITH_CHANGES)

| Finding | What changed |
|---|---|
| R-1 | `today/QuickLog.tsx`, `today/NextUp.tsx`, `quickLog.test.tsx` → L1; SimpleToday "Took it" and faces on the disable list (1.1 f); `inbox/MissedDoseActions` disable → L7; `useHealthPerson` returns `canMark`/`canEdit` false while viewing and sets the viewed default via `resetPersonChoice()` + `setPersonId(viewed)`, never by changing `ownId`; one fail-closed backstop in `db.ts enqueue` (throw `'viewing'` unless `sos_events` or `usage_events`), owned by L6, with a vitest. |
| R-2 | C-6 guard is an **allowlist**: `useViewedPersonId`/`getViewedPersonId` importable only by the 1.6 reader files, `viewas/**` and `db.ts`; `useViewAs` (boolean) anywhere. `exitViewAs` runs from `onAuthChange(exitViewAs)` in `ViewAsBanner`'s mount effect; the `auth/session.ts` row is gone (no circular import). |
| R-3 | `useViewedVisibleIds` fails closed: while viewing, a null/failed roster gives `new Set([viewedId])` plus the line "Family list could not be loaded"; null only when not viewing; failed-load test. |
| r-1 | Stale rev-0 text fixed: Architecture line, N-6 "swipe", section 4 "local kv"/"kv key", L3 "moved" tests, L5 "22 labels", mockup frame 3 "StormBlock". |
| r-2 | Archived member auto-exit has a mechanism and owner: `useViewAs` (L6) calls `exitViewAs()` when the viewed id leaves `hdb.people` (liveQuery). |
| r-3 | Move, Food, Water, Plate and Privacy sub-screens show **yourself** while viewing (stated in 1.6 with the bar's line "This page shows your own"); their writes are blocked by the R-1 backstop. |
| r-4 | `admin/desk/viewAsData.ts` is dynamically imported inside `enterViewAs` and `useViewedVisibleIds` so `admin/api` stays out of the main bundle. |

## Revision 1 (2026-10-30, after PLAN-REVIEW.md, Opus NO_GO)

| Finding | What changed |
|---|---|
| B-1 | View as is **read-only** (0029, desk ViewAs). `selfIdOrCached`, `selfIdNow`, `getMember().personId`, `SELF_ID`, `adoptPerson`, sync, consent, sensors, SOS and every write path are untouched. New display-only lens `useViewedPersonId()` feeds only the named readers (1.6). Every write control is disabled/hidden under a "Viewing as X, read only · Exit" bar; SOS always acts as the signed-in admin. C-6 gains "no write path reads the View as id" + a grep vitest. Q1 is no longer a question. |
| B-2 | View as id lives in memory only (module variable + subscribe), never Dexie/localStorage; cleared on restart, sign-out, Exit; a switch happens only after `admin_log_view_as` succeeds (online). Offline row says "Needs internet to switch". Tests: reload lands as self; airplane mode after Exit shows own Next up; forged value on a member = self. |
| B-3 | Readers subscribe to the in-memory store, so switch/exit re-renders mounted screens; Health picker `setPersonId('')` reset on switch and exit; vitest toggles the store on a mounted Today. |
| M-1 | `useViewedVisibleIds()` built from existing `visibleTo`/`loadRoster` (viewAsData.ts) filters Family and Health person lists while viewing; no-login member = only that person; `logViewAs` reused, no new RPC wrapper. |
| M-2 | `StormCard.tsx` and `AlertBand.tsx` are kept (Safety, Simple mode use them). WarningCard composes StormCard's storm block; acknowledge hides hazard text only, the roll-call answer row stays while a signal is live and unanswered. SimpleToday gets N-8 (warning: null) and is in L1's files. |
| M-3 | Ack value = `${issuedAt}\|${level ?? ''}\|${kind}`; tests for level escalation with same id/issuedAt, signal 2→3, new quake id. IncomingSos / SOS screen never get a close button (C-6). |
| M-4 | No `git mv`. Library, Videos, LearningHub stay where they are; Discover mounts them under new routes; L4 stops importing LearningHub. `routes.test.ts` and the `App.tsx:86` track line are L0. Every touched test file now has an owner. |
| M-5 | `today-auth`, `s14-t2-today.auth`, `s7-today-shots.auth`, `s12-storm-shots.auth`, `s5-alerts`, `s1-alerts-shots` → L1; `s13-f-shots.auth` → L4. |
| M-6 | ProfileCard gets a "Scan a paper" (`#scan`) action row and "Papers · N to check" link; CarerCards inside NeedYouNow; Memories under the calendar; "See their stats" only when `visibleTo(...).records` for that member. |
| M-7 | Assistant and templates rows removed from C-5 and L7 (`records` already lands on the `#records` redirect). L0 stubs `viewas/viewAs.ts` with the final signatures. |
| m-1 | IncomingSos/AlarmFixedToast above weather listed as a stated deviation from N-9 for Lloyd (Q1 now). |
| m-2 | Breathe sheet closes on back via the `history.state` pattern (as Assistant), no `#today/breathe` route, no parseHash change. |
| m-3 | ConsentNotice placed in Settings > Privacy; off while viewing. |
| m-4 | Fixed clocks 23:30 / 00:30 also for ProgressHero "this week", `useDueMeds.test`, NoticeStack/WarningCard "checked N min ago". |
| m-5 | ML-41 composition list added (section 5): screens where ViewAsBanner + OfflineBar + TopBar + NoticeStack stack; one Jack per screen; none on WarningCard/storm variant. |
| m-6 | Tokens go into all three theme blocks of `tokens.css`; `contrast.test.ts` covers light and dark and asserts ≥ 4.5 exactly. |
| m-7 | Swipe-to-dismiss dropped; the close button meets N-10. |
| m-8 | `air` rows stay off WarningCard (model estimate; hourly issuedAt). |

**Goal:** Rebuild Today, Health, Discover, Family and Settings as cream hero-card screens with one accent per section, move wiki/videos/Learn together into Discover and records into Family, group Settings the Android way, and give admins a whole-app "View as" switch, without a new migration.

**Architecture:** One shared `HeroCard` / `FeatureCard` pair and eleven accent tint tokens (D-96) carry the look; each tab screen is rebuilt in render order from existing hooks and tables. The router gains redirects so every old hash still lands. "View as" is a read-only, memory-only display lens (`useViewedPersonId`) over rows the admin can already read, fed to a named list of readers only, audited by the existing `admin_log_view_as` RPC (0029); identity (`selfIdOrCached`) and every write path stay the signed-in admin's. Warning acknowledge state is local (Dexie kv), so no migration.

**Tech stack:** React 18 + Vite + Capacitor Android, Dexie, Supabase (RLS, RPC), vitest + Playwright (195 px light+dark, fixed clocks ML-38), GSAP only where motion already exists (`features/look/gsap.ts`).

**Base:** branch `claude/family-bantay-session-16-6fa7b5`, commit after the N-1..N-4 bug PR (D-95) merges; the orchestrator names the sha in every brief (ML-01).

**Plan before code (D-77):** mockup v10 frames (section 7) go to Lloyd first; lanes start after his "A".

---

## 0. Scope map: where every note lands

| Note | Lands in | Lane |
|---|---|---|
| N-5 grouped Settings | section 1.5 | L5 |
| N-6 Android rules | ANDROID-RULES.md applied in 1.5, 1.1 (visible close button), contract C-4 (48 px, 4.5:1) | all |
| N-7 View as | section 1.6 | L6 (critical) |
| N-8 one place per warning | 1.1 WarningCard; WeatherCard loses its warning line | L1 |
| N-9 weather first | 1.1 render order | L1 |
| N-10 close = acknowledge | 1.1 `warnAck.ts` (local kv) + `markSeen` (server) | L1 |
| N-11 merge notices | 1.1 WarningCard (AlertBand+StormCard+weather warning line), NoticeStack (AlertsBanner+UpdateCard+PwaBanner) | L1 |
| N-12 breathing overhaul | 1.1 BreathSheet (orb, Hold 3, pattern grid) | L1 |
| N-13 body hero | 1.2 BodyHero | L2 |
| N-14 hero order | 1.2 render order | L2 |
| N-15 sub-tabs | 1.2 feature cards open full sub-screens (existing routes) | L2 |
| N-16 feature-card Browse | 1.2 HealthBrowse | L2 |
| N-17 colour per section | section 3 tokens | L0 + all |
| N-18 video hero | 1.2 VideoHero (one video + preview; library in Discover) | L2 |
| N-19 labs to mockup v9 | 1.2.7 concrete differences | L2 |
| N-20 Discover redesign | 1.3 | L3 |
| N-21 wiki, videos, Learn together move | 1.3 + section 2 redirects | L3 + L7 |
| N-22 feature sections open full tabs | 1.3 | L3 |
| N-23 Family ingest-and-review tab | 1.4 | L4 |
| G-4 UI-6 Today order, DS-12 video | 1.1, 1.2 | L1, L2 |
| G-5 IA change | section 2 + L7 | L7 |

---

## 1. Screens

Shared rules (contract C-1..C-6 in section 5): every card is a `HeroCard` or `FeatureCard`; one primary action per card; icon + label on every accent; 8 px grid (`--s1: 8px` multiples); serif display only on `h1`/hero titles (`--font-display`, already in tokens for the Today greeting); body text never below 14 px; every tap target 48 px; at 195 px every card stacks to one column and no word breaks mid-word (D-95 spec extended).

### 1.1 Today (`src/screens/Today.tsx`, lane L1)

Render order (Simple mode and SOS screens unchanged):

| # | Section | One action | Reads | States |
|---|---|---|---|---|
| 0 | `AlarmFixedToast`, `IncomingSos` | (as now) | as now | as now. **Stated deviation from N-9 (ML-04):** a live incoming SOS and the alarm-fixed toast sit above the weather card; they are not cards and never get a close button. Lloyd confirms in Q1. |
| 1 | `WeatherCard` (always first, N-9) | Open Weather (`#weather`) | `today/useWeather` via `WeatherCard.tsx`, `weather/actionLine.ts` **without** `warning` (N-8) | loading skeleton; offline = cached forecast + "last good" line (exists); no location permission = "Dampas" fallback label from N-2 fix; 195 px: pill text wraps by words (D-95) |
| 2 | `WarningCard` (new; N-8, N-11). Replaces AlertBand and StormCard **on Today only**: it draws the hazard text (AlertBand's content) and, for a live wind signal, composes StormCard's storm block (How are you? faces, I'm safe / I need help, Do now). `AlertBand.tsx` and `StormCard.tsx` are kept: Safety (`screens/Safety.tsx:56`) and Simple mode (`SimpleToday.tsx:103`) still mount them. `air` alerts never show here (model estimate, hourly issuedAt; they stay on Safety and in the weather action line) | "What to do" (`#safety/warnings`); close (48 px, `aria-label="Hide this warning on Today"`) | `safety/store.useKv(ALERTS_KEY)`, `today/heroCards.zoneAlert`, `safety/stormMode.liveSignals`, `safety/rollcall`, `StormCard` export `StormBlock` | none active = not drawn; acknowledged = hazard text hidden, **the roll-call answer row stays** while a signal is live and this person has not answered for this `stormRef` (push `rollcall_ask` lands on a Today that can still answer); stale feed = amber line (`freshness`); offline = last known + "checked N min ago" (fixed clock in tests, m-4); View as = no faces / no answer row (write) |
| 3 | `FamilyNotice` (renamed `AlertCardToday`) | Open (`#<template.tab>`) | `notify/useAlerts.useAlertRows`, `pickAlert` | none = not drawn; close = `markSeen(row.id)` (server `seen_at`, exists); View as = Open only |
| 4 | `NextUp` (self only, D-94) | Take / Snooze | `today/useNext`, `useDueMeds` (targets = self) | calm = not drawn (weather card expands) |
| 5 | `QuickLog` | How are you? | as now | as now |
| 6 | SOS hold | Hold for help | as now | as now |
| 7 | `SelfCare` hero (N-12) | Start (opens `BreathSheet`) | kv `selfcare.log`, `selfcare.buzz` | last session line; reduced motion = text count only |
| 8 | `PlanToday`, `SeeWeek` | as now | as now | as now |
| 9 | More: `NoticeStack` (merges AlertsBanner, UpdateCard, PwaBanner: one card, highest-priority row expanded, the rest one line each), `NearbyList`, `WeekLine` | one per row | as now | nothing to say = More heading hidden |

**Close = acknowledge (N-10).** Official hazards (`safety.alerts` kv rows, replaced by sync) have no server per-user state and B-7/D-78 keep alerts in-app, so the acknowledgement is local:

```ts
// src/features/today/warnAck.ts  (lane L1)
import { db } from '../../db'
import type { Alert } from '../safety/alerts'
export const ACK_KEY = 'warn.ack' // { [alertId]: stamp } on this phone only
/** A revision that matters re-shows the card: a new bulletin (issuedAt), a changed level (M5.4 -> M6.2 keeps the USGS id and origin time; Signal 2 -> 3) or kind. */
export const ackStamp = (a: Pick<Alert, 'issuedAt' | 'level' | 'kind'>) => `${a.issuedAt}|${a.level ?? ''}|${a.kind}`
export async function ackWarning(a: Pick<Alert, 'id' | 'issuedAt' | 'level' | 'kind'>): Promise<void> {
  const cur = ((await db.kv.get(ACK_KEY).catch(() => undefined))?.value ?? {}) as Record<string, string>
  await db.kv.put({ key: ACK_KEY, value: { ...cur, [a.id]: ackStamp(a) } })
}
export const isAcked = (ack: Record<string, string> | undefined, a: Pick<Alert, 'id' | 'issuedAt' | 'level' | 'kind'>) => !!ack && ack[a.id] === ackStamp(a)
export const trimAck = (ack: Record<string, string>, live: Set<string>) => Object.fromEntries(Object.entries(ack).filter(([id]) => live.has(id))) // ML-06: drop ids no longer in the feed
```
No migration. The warning stays listed on Safety > Warnings (acknowledge hides its text on Today only; copy on the card: "Hide on Today. Still listed under Safety."). Family alerts use the existing `markSeen` (carer_alerts.seen_at). No swipe-to-dismiss (m-7): the close button meets N-10. Tests (`warnAck.test.ts`): same id + issuedAt + higher `level` re-shows; TCWS signal 2 → 3 re-shows; a new quake id shows; same stamp stays hidden; trim drops dead ids.

**WeatherCard change (N-8):** `actionLines({ ...i, warning: null })` from Today **and from `SimpleToday`** (Simple mode mounts AlertBand, so the weather line would double there too); the `warning` input stays in `actionLine.ts` for the Weather screen (`#weather`) which keeps its own line. Test: `weatherCard.test.tsx` asserts no warning text on Today or Simple Today while `WarningCard` / `AlertBand` show it once.

**Breathing overhaul (N-12), refs 7 and 13:** `SelfCare.tsx` becomes a hero card: title "Take a breath", `pat.why`, last-time line, one Start. Start opens `BreathSheet.tsx` (full sheet via the existing `Sheet` pattern in `family/Sheet.tsx` is lane L4's file; use `createPortal` into `.bt` like `Me.SosSheet`):
1. Pick: pattern cards in a 2-column grid (`FeatureCard` with the `calm` tint: name, tag "In 4, out 6", why); minutes chips; buzz checkbox; `SAFETY` line.
2. Run: layered orb (4 rings, outer rings scale by `circleScale`, inner disc holds the phase word and the count: "HOLD" / "3"), elapsed `mm:ss` under it, "End early". Reduced motion: rings static, count text only.
3. Mood faces, thanks. Logic stays in `breathLogic.ts` (unchanged; `SLEEP_478_ENABLED` stays false). While View as is on, the log write is skipped and the mood step is replaced by "Done" (read-only).
States: 195 px = orb 140 px max, grid one column. Acceptance: orb scale follows `momentAt` at 250 ms ticks (existing timer), count never shows 0, phase word matches `PHASE_WORD`, buzz only when on, sheet closes on system back using the existing history-state pattern (`history.pushState({ bantayBreathe: true }, '')` on open, `popstate` closes; the same as `history.state.bantayAssistant` in `Assistant.tsx:257`). No new route, no `parseHash` change (m-2).

Acceptance checks (reviewer): (a) the earthquake/storm text appears exactly once on Today and once on Simple Today (grep rendered DOM for the alert title: 1 hit); (b) weather card is the first `section` after the h1 when no SOS or alarm toast; (c) close on WarningCard writes `warn.ack` and hides the hazard text; a fixture with a newer `issuedAt` or a higher `level` shows it again; the roll-call answer row is still there while a signal is live; (d) `NoticeStack` renders at most one expanded row; (e) 195 px light + dark shots of Today with a storm fixture, a quake fixture and calm; (f) with View as on, no enabled write control on Today or Simple Today (QuickLog faces and meds, NextUp Take/Snooze, SimpleToday "Took it" and "How are you?" faces, WarningCard roll-call answers, breathe log) and SOS hold / Call 911 still present and enabled (R-1).

### 1.2 Health (`src/screens/Health.tsx`, lane L2)

Render order of Overview:

| # | Section | One action | Reads | States |
|---|---|---|---|---|
| 1 | `PersonChips` (while View as is on: default person = `useViewedPersonId()`, list filtered to `useViewedVisibleIds()` so the admin sees exactly the people the member can see, D-82/D-84; `setPersonId('')` on switch/exit, B-3) | pick | `records/useHealthData`, `viewas/viewAs.useViewedPersonId`, `useViewedVisibleIds` | as now |
| 2 | `BodyHero` (N-13): BodyMap with the 7-day averages when any node has data; else the body wiki picture (anatomy `ExploreScreen` thumbnail) with a nudge "Record your latest vitals or scan a lab paper" | Add a reading (`AddReadingSheet`) / Scan a paper (`#scan`) | `health/vitals.averageNodes`, `useActivity`, readings | loading skeleton; no data = wiki nudge; no permission to log (`canMarkFor` false) or View as = action disabled, "Viewing only" |
| 3 | `ProgressHero` (N-14 "My progress") | See numbers (`#health/metric/<top code>`) | `Kpis` + one `MetricChart` sparkline of the most-logged vital this week (`kpisLogic`; "this week" from the shared local-day helper, tests at 23:30 and 00:30 local, ML-38) | no vitals = card not drawn (the nudge above covers it) |
| 4 | `MedicinesHero` | Medicines (`#health/meds`) | `MedicinesSummary` (`useMedications`, `doseCount`) | none = "No medicines listed" + Add |
| 5 | `LabsHero` (from `LabsRow`) | Lab results (`#health/labs`) | readings non-vital, `labsLogic.labDate` | none = "No lab papers yet" + Scan |
| 6 | Nudges: `NudgeCard`, `NudgeEntry` (N-14 "then nudges") | log | as now | as now |
| 7 | `VideoHero` (N-18): one video, poster preview, title, minutes; plays inline on tap | Play; footer link "More videos" (`#discover/watch`) | `today/videos.videoOfTheDay`, `library/videosLogic.playable`, `media/LiteVideo` | no playable video = not drawn; offline = poster + "Needs internet" |
| 8 | `HealthBrowse` (N-15, N-16): four `FeatureCard`s, each with the section tint, icon, label, status line and one action; a second row of two small links inside the card | Track: Readings (scroll `#lvn-vitals`), Labs, Papers (`#family/papers`), Visits. Medicines: Medicines, Refills. Move & eat: Move, Food. Body: Body wiki | `HealthLinks` data (`usePapers`, `stockRows`, `nextVisitLine`) | loading = skeleton per card |

Sub-screens keep their routes and own headers (N-15): `#health/meds`, `labs`, `body`, `refill`, `visits`, `summary`, `move`, `nutrition`, `metric/<code>`, `med/<id>`, `nudge`. Removed from Health: `papers` (→ Family), `library`, `library/<key>`, `videos` (→ Discover); `Health.tsx` drops those four branches and its imports of `Library`, `Article`, `Videos`, `Records`. **The files stay where they are** (`health/library/*`, `screens/Records.tsx`; M-4): Discover and Family mount them from their current paths. `VideoHero` imports `health/library/videosLogic` at its current path.

**Accent per section (N-17):** Track = `vitals`, Medicines = `meds`, Labs = `labs`, Body = `body`, Move & eat = `live`, Video = `watch`. Hero cards carry the tint on the card and the boxed icon; the body hero stays cream (it is the page's one big neutral).

**1.2.7 Labs restored to mockup v9 (N-19).** Compared `src/features/health/LabsScreen.tsx`, `LabsList.tsx`, `LabDetail.tsx` with mockup screens `health-labs`, `health-labs-empty`, `health-labdetail`. Differences to fix (all in lane L2):
1. Header: mockup = Back + eyebrow "Mama · from the lab's own paper" + title. Current = `SubHeader` + `PersonChips` + eyebrow "Mama · from lab papers". Fix: eyebrow copy to "from the lab's own paper"; keep PersonChips only when not in View as.
2. Empty state: mockup = drop icon, "No lab papers yet", body "Take a photo of a lab paper. A person checks every number before it is saved to Mama's record.", button "Scan a paper" opening the camera flow. Current = flask icon, "Snap a lab paper. A person checks it first.", button goes to `#health/papers`. Fix: copy, and action = `#scan` (ScanFlow).
3. Source card: mockup has a chevron and opens the paper. Current shows `OriginalLink` text. Fix: whole card is the link; chevron icon.
4. "Show previous result" switch: mockup always shown, on. Current only when `anyPrev`. Fix: always shown; disabled with sub "No earlier result yet" when none (dependent setting pattern, ANDROID-RULES).
5. Footer copy: mockup "A result outside the range is a question for your doctor, not a diagnosis. Tap a test to see what it means and the last 3 results." Current "Outside the range? Ask your doctor. Not a diagnosis or medical advice. Tap a test for more." Fix: mockup copy (ML-12 copy stays within what the code does).
6. Lab card: mockup `Lab range 4.0 to 5.6` + `Ask about it`, then `Before: 7.1 % on 3 Jul · down 0.3 · closer to the range`. Current matches except the Before line sits outside the `.lr-foot` row and uses `hv-before`; fix: `lb-before` under the foot, muted, one line.
7. Lab detail header: mockup eyebrow "Lab results · Mama", title, sub = `labInfo(code).short` ("Average sugar over about 3 months"). Current `MetricScreen` draws the generic metric header. Fix: when `lab`, `MetricScreen` passes `labInfo` sub to the header (one prop).
8. Last 3 results: mockup shows the trend word in the section header ("going down"). Current: same (`trendOfLastThree`). OK.
9. Questions header: mockup "Questions to ask Dr. Santos · Thu 29 Oct" (doctor + next visit). Current shows the visit date; doctor name only if `visit.doctor`. OK when data has it; no change.
10. Chips: mockup "All 6 · To ask about 4 · In range 2" as a subnav. Current chips identical in words. OK.
Unit tests: `LabsList.test.tsx` (empty-state action = `#scan`, switch disabled when no previous, footer copy), `LabDetail.test.tsx` (sub line from `labInfo`).

Acceptance checks: hero order 2-3-4-5-6-7-8 by `data-testid` order; body hero shows the wiki nudge for a blank person; tints only on hero cards + icons, never as the sole meaning (every tinted card has an icon and a label: axe + a vitest that walks `FeatureCard` props); labs screen matches v9 items 1-7 on 390 px light + dark shots; 195 px sweep of `#health`, `#health/labs`, `#health/meds`, `#health/body`.

### 1.3 Discover (`src/screens/Discover.tsx`, lane L3)

`#discover` (root, new overview):

| # | Section | One action | Reads | States |
|---|---|---|---|---|
| 1 | Header: eyebrow "Something good for today", h1 Discover | | | |
| 2 | `PickCard` as a hero (today's pick, `learn` tint) | Open the pick | `discover/today/pick.ts` | nothing picked = SeasonCard takes the slot |
| 3 | `SeasonCard` | Open | `data/discover/seasons.json` | as now |
| 4 | Feature sections (N-22), one `FeatureCard` each, full width: **Learn** (medicine wiki, recipes, plain health summaries = the Library, Learn together), **Watch** (checked videos, playlists, live TV), **Listen**, **Play**, **News** | Open `#discover/<sub>` | `DISCOVER_SUBS`, counts from each sub's data (`learn/data.ts`, `videosLogic.VIDEOS`, play registry) | a sub not registered = card says "Coming in this update" (existing `soon` text) |

`#discover/<sub>` = that sub's full screen with the existing sub-nav pill row kept for sideways moves (N-15 pattern shared with Health). Moves (N-21) are **route moves only, no file moves** (M-4; `videosLogic`/`medline` are imported by anatomy, today, media, pick, watch and firstaid tests):
- `Discover.tsx` mounts `health/library/Library` at `#discover/learn/library`, `health/library/Article` at `#discover/learn/library/<key>`, and the Watch screen (`discover/watch/Screen.tsx`) lists the checked videos (`health/library/Videos` content via `videosLogic.VIDEOS`) first, then playlists/live TV. `Library.tsx`/`Article.tsx` back links change from `#health` to `#discover/learn` (L3 owns these two files for that one-line change; L2 does not touch them).
- `Discover.tsx` mounts `family/LearningHub` at `#discover/learn/together`; the Learn screen gets a "Learn together" feature card. L4 removes the `LearningHub` import from the Family screen; the file stays in `family/`.
- `health/HealthLinks` tiles Library and Videos are gone (Health keeps the one VideoHero, 1.2).
Accents: Learn = `learn`, Watch = `watch`, Listen = `calm`, Play = `play`, News = `weather` (blue, information).

Acceptance: `#discover` draws 5 feature cards + hero; each card opens its sub; `#health/library`, `#health/library/<key>`, `#health/videos` redirect (section 2); `s13-d-discover.spec.ts`, `s12-learn.spec.ts`, `media.spec.ts` updated to the new hashes; 195 px sweep of `#discover`, `#discover/learn`, `#discover/watch`.

### 1.4 Family (`src/screens/Family.tsx`, lane L4; D-97)

`#family` root:

| # | Section | One action | Reads | States |
|---|---|---|---|---|
| 1 | `ProfileCard` (ID-style, N-23.1): big photo, name, age, blood type, allergies, medicines count, "carers: names", last check-in. Under it one **ingest row** (N-23 "ingest and review"): "Scan a paper" + "Papers · N to check" | "Show to a doctor" (`#medid`, the existing Medical ID full screen); ingest row: Scan (`#scan`), Papers (`#family/papers`) | `viewas/viewAs.useViewedPersonId` (self, or the viewed member), `setup/useProfile`, `useOwnAvatar`, `medid` card data (`medid/MedicalId` reads), `useMedications`, `family/roster.useFamilyPeople`, `useCheckIns`, `records/api.listDrafts` for N | no photo = initial; fields "Not added" link to `DetailsSheet`; View as = that member's card, Edit and Scan disabled ("Viewing only") |
| 2 | `FacesRow` (N-23.2): horizontal swipe row of member faces with today's status word under each; tap opens a small action sheet: "See their stats" (`#family/people/<id>`, **only when this user can read that member's records**: `visibleTo(...).records`, D-82) / "Send a message" (`#family/messages?to=<id>`) | "I'm OK" chip in the card header (D-43: I'm OK stays everywhere; `checkIn()` from `today/actions`; disabled while viewing) | `useFamilyPeople` filtered by `useViewedVisibleIds()` while viewing (M-1), `useCheckInsLoaded`, `rollCall`, `useFlagLines`, `admin/desk/viewAsData.visibleTo` + `loadRoster` for the records flag | one member = row still drawn; offline = status from cache; roll-call during a storm = `StormRollCall` replaces the status words |
| 3 | `Calendar` (N-23.3): month grid (dots per day, tag colours + icon) over a week strip (the existing `dayStrip`); the selected day lists rows, each tagged Dose / Visit / Event / Task / Note with icon + label | "Add" (opens `PlanSheets.ItemSheet`; disabled while viewing) ; "Full plan" link (`#family/plan`) | `usePlan` (tasks, events, notes), `events.weekOf`, `eventsOn`, `planList.dayRows`; dose rows from the existing `medSlots`/`pickSlot` (`health/meds`), never re-implemented (ML-10), for self + members whose records this user can read (D-82) | empty day = `emptyHint`; 195 px = week strip only, month grid behind a "Month" toggle |
| 4 | `Memories` (kept from People.tsx, M-6) | as now | as now | as now |
| 5 | `NeedYouNow` (N-23.4): latest notices for or from members: family alerts newest 5, newest message, **and `CarerCards`** (review asks, missed doses; from People.tsx, M-6) | Open (`#notif` or `#family/messages`); CarerCards keep their own actions | `notify/useAlerts.useAlertRows`, `family/messagesApi` newest, `family/CarerCards` | none = "Nothing needs you right now" |
| 6 | `AcceptCard`, `IncomingSos` (placement family) stay above the profile card when active | | | |

Sub-screens: `#family/people/<id>` (`MemberPage`, unchanged), `#family/people/<id>/report`, `#family/messages` (+ `?to=<id>` preselects the thread), `#family/plan` (full Plan editor), **`#family/papers`** (`screens/Records.tsx`, unchanged file, mounted by `Family.tsx` under a `SubHeader` "Papers" with back to `#family`). `#family/people` (the old roll-call list) redirects to `#family`; `People.tsx` is deleted after its pieces move: check-in + roll call + flags → `FacesRow`, `CarerCards` → `NeedYouNow`, `Memories` → row 4, `FamilyPhones` → Settings > Phone (1.5), `LearningHub` → mounted by Discover (file stays in `family/`).

Accent: `family` (amber-sand) on the profile card and the faces row; the calendar is cream with per-tag icon colours (`--c-medicine`, `--c-vitals`, `--c-family`, existing tokens).

Acceptance: profile card shows the same fields as Medical ID (vitest compares the two renders); faces row scrolls sideways only inside itself (`no-sideways-scroll` on `#family` passes); "See their stats" absent for a member whose records this user cannot read; calendar day rows equal `dayRows` for a fixed clock at 23:30 and 00:30 local (ML-38); `#family/papers` renders the Records screen; `#records`, `#family/records`, `#health/papers` land on it; while viewing, the faces row lists only `useViewedVisibleIds()` and every write control is disabled; 195 px sweep.

### 1.5 Settings (`src/screens/Me.tsx` → overview + groups, lane L5; N-5, N-6)

Title becomes "Settings" (TopBar aria stays "Me and settings" → "Settings"). `#me` = grouped overview list; each group row opens `#me/<group>` (own header, Back to Settings; one history entry so system back returns). Row label = subscreen title; supporting text shows the current value.

| Group (route) | Rows from `Me.tsx` today | Control |
|---|---|---|
| Account card (top of overview, not a group) | identity row (photo, name, Edit → `DetailsSheet`), "Simple mode" switch | switch |
| **View as** (admin only; L6 component `ViewAsRow`) | new | child screen |
| **Alerts and reminders** (`#me/alerts`) | Alerts list (`#notif`), `DigestToggle`, `PushPermissionRow`, Quiet hours switch, `AlarmHealthRow`, `CallRow` | switches + rows |
| **Display** (`#me/display`) | Text size, Theme, Language (segmented → choice dialogs per ANDROID-RULES: a `ChoiceSheet` with radio rows) | choice sheet |
| **Family and sharing** (`#me/family`) | Who can see my records (`#sharing`), Who gets your SOS text (`SosSheet`), Medical ID (`#medid`), carer-of rows (`#family/people/<id>`) | rows |
| **Phone** (`#me/phone`) | `SensorSettings` (phone health, Health Connect), `SetupCard` (setup checklist), Family phones (`FamilyPhones`) | rows |
| **Privacy** (`#privacy`, existing screen) | Agreement, AI, my data, **`ConsentNotice`** (moved here from the top of Me, m-3; not rendered while View as is on, since `ensureConsent` writes `people.consent_at`) | rows |
| **Sign-in** (`#me/signin`) | fingerprint/face on/off, Not you? Switch person, Forget this phone | rows |
| **About** (`#me/about`) | version (`VersionRow`), update (`UpdateRow`, admin), Family admin tools (`#admin`, admin), "Signed in as" | rows |

Overview rows: icon (boxed, neutral), label, supporting text = value summary ("Text size Large · Theme System · English"), chevron. Fewer than 15 settings would not need subscreens; Me has well over 15 rows (the lane counts the exact number on the base sha), so groups it is.

While View as is on, Settings shows the admin's own settings (identity, phone, sign-in are the signed-in person's; nothing here reads the viewed id) with the read-only bar on top; rows that write for a person (Sharing, SOS contacts, Privacy consent, Edit) are disabled with "Viewing only. Exit to act as yourself."

Acceptance: every row of the current `Me.tsx` is reachable (vitest renders each group and asserts the labels list = the current labels, counted from `Me.tsx` on the base sha by the lane, not assumed to be 22); switch rows are `role="switch"`; choice rows open a sheet with `role="radiogroup"`; system back from `#me/display` lands on `#me`; `s12-shell`, `profile-auth`, `sensors`, `s6c-lock.auth` specs updated; 195 px sweep of `#me` and each `#me/<group>`.

### 1.6 Admin "View as" (lane L6, critical, D-94, D-82/D-84)

**Decision (rev 1, B-1):** View as is **read-only**, as 0029 ("the preview itself is client-side and read-only") and the desk tool (`admin/desk/viewAsData.ts`) already define it. It is a display lens over rows the admin can already read (`is_admin()` policies 0021/0022, ML-07). It never changes who the app *is*: `selfIdOrCached`, `selfIdNow`, `getMember().personId`, `SELF_ID`/`SELF_USER`, `adoptPerson`, `syncOwnProfile`, `migrateKv`, `flushPhoto`, `ensureConsent`, Health Connect (`sensors/health.ts`), reminders (`health/reminders.ts`), SOS (`sos/*`), `today/actions.ts`, `exercise/actions.ts`, `nutrition/actions.ts`, `nudge/bpReminder.ts`, `MedicineEditor`, `Wizard`, `SharingScreen`, `AuthGate`, `JoinFlow` are **not edited and never import `viewas`**.

Behaviour: an admin opens Settings > View as, picks a member from the roster (`useFamilyPeople`). The switch happens only after `logViewAs(personId)` (`viewAsData.ts:57`, RPC `admin_log_view_as`, 0029) returns true, so every view has its D-82 audit row and a switch needs internet ("Needs internet to switch" otherwise, B-2). While viewing: a bar under the top bar on every screen (the SOS screen included) reads "Viewing as Mama, read only · Exit"; the named display readers show Mama's data; every write control is disabled or hidden with "Viewing only. Exit to act as yourself."; SOS hold, IncomingSos, the SOS screen and Simple mode SOS act as the signed-in admin, unchanged. Exit, sign-out (`onAuthChange`) and a cold start clear it.

State (B-2): memory only. `src/features/viewas/viewAs.ts`:
```ts
// Read-only lens (D-94, 0029). Memory only: never Dexie, never localStorage; a cold start is always yourself.
let viewed: string | null = null
const subs = new Set<() => void>()
const subscribe = (cb: () => void) => (subs.add(cb), () => void subs.delete(cb))
export const getViewedPersonId = () => viewed
/** Admin only, and only once the audit row is written (online). Returns false when not admin, offline or refused. */
export async function enterViewAs(personId: string): Promise<boolean> {
  const m = await getMember().catch(() => null)
  if (!m || m.role !== 'admin') return false
  if (!(await logViewAs(personId))) return false // viewAsData.ts: one audit row, person id only
  viewed = personId; subs.forEach((s) => s()); return true
}
export function exitViewAs(): void { viewed = null; subs.forEach((s) => s()) }
/** The person the DISPLAY readers show: the viewed member while an admin is viewing, else the signed-in person. Subscribes, so switch/exit re-render mounted screens (B-3). */
export function useViewedPersonId(): string | null {
  const v = useSyncExternalStore(subscribe, () => viewed)
  const self = useSelfPersonId()
  return v ?? self
}
/** The boolean any file may read to disable a write control. Also auto-exits when the viewed person leaves hdb.people (archived or erased; liveQuery), r-2. */
export const useViewAs = (): { viewing: boolean; personId: string | null } => { const v = useSyncExternalStore(subscribe, () => viewed); return { viewing: v !== null, personId: v } }
/** People the viewed member can see (D-82/D-84): visibleTo(viewedUserId, roster) from viewAsData.ts, reused not rewritten (ML-10), loaded with a dynamic import so admin/api stays out of the main bundle (r-4).
 *  Null only when NOT viewing (no filter). While viewing, a null or failed roster FAILS CLOSED to new Set([viewedId]) and the banner adds "Family list could not be loaded" (R-3). A no-login member sees only themself. */
export function useViewedVisibleIds(): Set<string> | null
```
`enterViewAs` also loads `logViewAs` by `await import('../admin/desk/viewAsData')` (r-4). `exitViewAs` on sign-out: `ViewAsBanner`'s mount effect registers `onAuthChange(exitViewAs)` (C-5); `auth/session.ts` is not edited (`viewAs.ts` imports `getMember` from it, so the other way round would be circular, R-2). On enter and exit, L6 calls `resetPersonChoice()` (exists, `useHealthData.ts:55`) and, on enter, `setPersonId(viewed)` so the Health picker follows (B-3).

**Backstop (R-1, L6 owns, one block in `src/db.ts` at `enqueue`):**
```ts
import { getViewedPersonId } from './features/viewas/viewAs'
const VIEWING_OK = new Set(['sos_events', 'usage_events']) // SOS always acts as the signed-in admin; telemetry has no person
/** Fail closed while an admin is viewing as a member: no queued write leaves the phone except SOS and telemetry. Callers already map a throw to 'failed' (today/actions.ts:20). */
export const enqueue = (table: string, op: string, payload: unknown) => {
  if (getViewedPersonId() !== null && !VIEWING_OK.has(table)) return Promise.reject(new Error('viewing'))
  return db.outbox.add({ table, op, payload, createdAt: Date.now(), tries: 0 })
}
```
vitest `db.enqueue.test.ts`: while viewing, `enqueue('medication_takes', …)` rejects with `'viewing'` and the outbox stays empty; `sos_events` and `usage_events` still queue; not viewing = unchanged. Direct-RPC writes that bypass the outbox (`raise_mood_alert`, roll call `sendRollcall`, `ensureConsent`, share RPCs) still rely on the per-lane disables below; the L6 Playwright spec covers each.

Display readers that switch to `useViewedPersonId()` (the complete list; nothing else changes):
| Reader | File | Lane |
|---|---|---|
| Next up targets | `today/useDueMeds.ts` (targets param) | L6 |
| My takes / My week display | `today/useMyTakes.ts`, `today/MyWeek.tsx` (display id only; the take write stays on `today/actions.ts`, which is disabled while viewing) | L6 |
| Health default person + chips filter | `screens/Health.tsx` (chips filter via `useViewedVisibleIds`) | L2 (reads the L0 stub signature) |
| Health sub-screens default person (Overview, Labs, Refill, Visits, Summary, Metric, Nutrition) | `health/useHealthPerson.ts`: on viewing, `resetPersonChoice()` + `setPersonId(viewed)`; **`ownId` stays the admin**; `canMark = !viewing && canMarkFor(...)`, `canEdit = !viewing && (...)` (R-1) | L2 |
| Family profile card, faces row filter, calendar members | `family/ProfileCard.tsx`, `FacesRow.tsx`, `Calendar.tsx` | L4 |
| Fail-closed backstop | `src/db.ts` `enqueue` (reads `getViewedPersonId`) | L6 |

Not readers (r-3): Move (`exercise/data.ts`), Food/Salt (`nutrition/SaltSummary.tsx`), Water, Plate and Privacy show **yourself** while viewing; the bar on those screens adds "This page shows your own." Their writes are blocked by the backstop. Lloyd can promote Move/Food to readers in a later release if he wants them in the lens.

Write controls disabled while `useViewAs().viewing` (each owning lane does its own, reading the L0 stub): QuickLog (faces + meds, L1), NextUp Take/Snooze (L1), SimpleToday "Took it" and faces (L1), WarningCard roll-call answers (L1), breathe log (L1), I'm OK (L4), Add reading / Scan / ProfileCard Edit / Calendar Add (L2, L4), bell inbox `MissedDoseActions` (L7), Settings > Sharing / SOS contacts / Privacy consent / Sign-in rows (L5). Writes for a dependant keep the paths that already take an explicit person (MemberPage, MedDetail, Family plan): their controls read `useViewAs().viewing` too and disable, since the backstop would refuse the queue anyway.

States: non-admin = row hidden, `enterViewAs` returns false, a forged in-memory value is impossible from the UI and the store is not exported mutable; viewed member archived or erased = `useViewAs` sees the id leave `hdb.people` and calls `exitViewAs()` (r-2, L6, test with a liveQuery fixture); roster load fails while viewing = only the viewed person is listed + "Family list could not be loaded" (R-3); offline = cannot switch, an active view keeps working from the phone's copy; reload = yourself.

Tests (L6): vitest `viewAs.test.ts` (non-admin cannot enter; enter waits for `logViewAs` true; exit clears; `useViewedPersonId` re-renders a mounted Today on switch and exit, B-3); `viewAs.imports.test.ts` **allowlist** guard (R-2): `useViewedPersonId`/`getViewedPersonId`/`useViewedVisibleIds` are imported only by the reader-table files, `viewas/**` and `src/db.ts`; any other importer fails the test (`useViewAs` is allowed anywhere); `db.enqueue.test.ts` (backstop); `useViewAs` auto-exit when the person row disappears (r-2); `useViewedVisibleIds` failed-roster case = only the viewed id (R-3); `useDueMeds.test.tsx` (targets = viewed id; fixed clocks 23:30/00:30, m-4); Playwright `admin-view-as.auth.spec.ts`: switch (network log shows one `admin_log_view_as` call), Mama's Next up, bar on all 5 tabs and on the SOS screen, no enabled write control on Today/Health/Family, SOS hold enabled, exit → own Next up, reload → yourself; `s16-viewas-privacy.auth.spec.ts`: a member account sees only self and no View as row; airplane mode after Exit shows the admin's own Next up. Opus reviews this lane first and re-audits after any fix.

---

## 2. IA map and redirects

Router (`src/features/shell/routes.ts`, lane L0 in the base commit):

```ts
/** Old hashes keep landing (G-5). */
const REDIRECT: [RegExp, string][] = [
  [/^#(records|family\/records|health\/papers)$/, '#family/papers'],
  [/^#health\/library$/, '#discover/learn/library'],
  [/^#health\/library\/(.+)$/, '#discover/learn/library/$1'],
  [/^#health\/videos$/, '#discover/watch'],
  [/^#family\/people$/, '#family'],
  [/^#people$/, '#family']
]
export const canonicalHash = (h: string) => { for (const [re, to] of REDIRECT) if (re.test(h)) return h.replace(re, to); return h }
```
`parseHash`: `me/<group>` → `{ tab: null, view: 'me' }` (Me reads the group from the hash); `family/papers` → `{ tab: 'family', view: 'papers' }`. `hasOwnHeader`: add `me/`, `family/papers`, `discover/learn/library`, `discover/learn/together` (all already true via the `/` rule; listed so the test names them). No breathe route (m-2). L0 also owns `shell/routes.test.ts` (its `#health/papers` assertion changes to `#family/papers`) and the one `App.tsx:86` track line (`hash === '#family/papers' ? 'records'`).

| Old | New | Who links there today (fix in L7 unless the owning lane is named) |
|---|---|---|
| `#records`, `#family/records`, `#health/papers` | `#family/papers` | `inbox/build.ts:111`, `HealthLinks` (L2), `Health.tsx:99` (L2), `LabDetail.tsx:57` + `LabsList.tsx:77,93` (L2), `shell/AskSheet.tsx:50`, `scan/ScanFlow.tsx:218`, `scan/open.ts:12`. Jack `open_screen 'records'` needs **no change**: `Assistant.tsx:259` sets `location.hash = 'records'`, which the redirect already lands (M-7). Notification templates have no `records` tab (M-7): no change |
| `#health/library`, `/<key>` | `#discover/learn/library[/<key>]` | `discover/learn/Screen.tsx:56` (L3), `health/library/Article.tsx:33` + `Library.tsx` back link (L3, file not moved) |
| `#health/videos` | `#discover/watch` | `HealthLinks.tsx:64` (L2) |
| `#family/people` | `#family` | `Me.tsx:136` (L5), `CarerCards.tsx:133`, `People.tsx` (deleted, L4) |
| `#me` | `#me` (overview) + `#me/<group>` | `TopBar.tsx:64` label only; `MedDetail.tsx:147` → `#me/alerts`; `MedicalId.tsx:8,45` → `#me/family`; `PrivacyScreen.tsx:67` → `#me` |
| `#today` SelfCare in-card run | same hash; the sheet uses `history.pushState({ bantayBreathe: true })` (m-2) | L1 |
| Jack `OfflinePanel` (safety/firstaid, medid) | unchanged | |
| Notification `href`s (templates.ts `tab`) | unchanged (tabs are only today/health/family/safety; mirrored server-side, not touched) | |

e2e specs that must change, each with one owner (M-5): L1 `today-auth`, `s14-t2-today.auth`, `s7-today-shots.auth`, `s12-storm-shots.auth`, `s5-alerts`, `s1-alerts-shots`, `s13-t-today.auth`, new `s16-today.auth`. L2 `health-overview`, `health-auth`, `health-a11y`, `health-v6`, `health-labs`, `s14-l-labs.auth`, `w2-health-shots(.auth)`, `s13-h-shots.auth`, `medicines`, new `s16-health.auth`. L3 `s13-d-discover`, `s12-learn`, `media`, `s12-play`, new `s16-discover`. L4 `family-plan`, `family-messages`, `family-report`, `records`, `records-db`, `s14-f2-family.auth`, `s13-f-shots.auth`, new `s16-family.auth`. L5 `profile-auth`, `sensors`, `s6c-lock.auth`, new `s16-settings.auth`. L6 `admin-view-as.auth`, new `s16-viewas-privacy.auth`. L7 `subpage-header`, `ask-sheet`, `scan`, `onboarding`, `s14-j-jack`, `s12-shell`, `s12-shell.auth`, `s12-f3-shots`, `tabbar-overlap`, `no-sideways-scroll`, `s12-core.auth`, `s12-polish`, `shell`, `admin`, `auth`, `phone-warnings`, `s12-marked-by.auth`, `s12-sharing.auth`, `s16-narrow-text.auth` (ROUTES gains `#family/papers`, `#discover/learn/library`, `#discover/watch`, `#discover/learn/together`, `#me/alerts`, `#me/display`, `#me/family`, `#me/phone`, `#me/signin`, `#me/about`; drops `#health/library`, `#family/records`, `#family/people`), new `s16-redirects` (visits every "Old" hash and asserts `location.hash` = New). L0 `shell/routes.test.ts`.

---

## 3. Accent tokens (D-96; v6 tokens unchanged)

Added to `src/styles/tokens.css` in both themes (L0). Ink is always `--ink`; muted text `--muted`; icon colour per row. Ratios computed (WCAG, sRGB) against the tint.

| Section | Token | Light tint | Light icon | Ink / icon / muted | Dark tint | Dark icon | Ink / icon / muted |
|---|---|---|---|---|---|---|---|
| Track / vitals | `--tint-vitals`, `--tint-vitals-ic` | `#DCEBF0` | `#1F5A6E` | 13.6 / 6.3 / 5.1 | `#1B3038` | `#8CC6DA` | 12.0 / 7.3 / 6.2 |
| Medicines | `--tint-meds` | `#DCE5D8` (= `--soft`) | `#2E5A3F` | 12.8 / 6.1 / 4.8 | `#22352A` (= `--soft`) | `#8FD1A6` | 11.4 / 7.4 / 5.8 |
| Labs | `--tint-labs` | `#E6E0F0` | `#4F3F80` | 12.9 / 6.9 / 4.8 | `#2A2540` | `#C2B5EA` | 12.7 / 7.7 / 6.5 |
| Body | `--tint-body` | `#E4ECE8` | `#2E5A3F` | 13.8 / 6.6 / 5.2 | `#1F2E27` | `#8FD1A6` | 12.4 / 8.0 / 6.4 |
| Move & eat / Play | `--tint-live`, `--tint-play` (same values) | `#E2EEDD` | `#2A6B3A` | 13.8 / 5.4 / 5.2 | `#1F3324` | `#8FD1A6` | 11.7 / 7.6 / 6.0 |
| Learn | `--tint-learn` | `#F3E4CC` | `#7A4E05` | 13.3 / 5.8 / 5.0 | `#3A2D16` | `#F0B54C` | 11.7 / 7.3 / 6.0 |
| Watch / Video | `--tint-watch` | `#F6DFD6` | `#9A3B22` | 13.0 / 5.4 / 4.9 | `#3A231C` | `#F2A58F` | 12.7 / 7.3 / 6.5 |
| Family | `--tint-family` | `#F6E9C8` | `#7A4E05` | 13.8 / 6.0 / 5.2 | `#3A3016` | `#F0B54C` | 11.3 / 7.1 / 5.8 |
| Weather / News | `--tint-weather` | `#DDE8F5` | `#2F5C8F` | 13.4 / 5.6 / 5.0 | `#1E2D40` | `#9CC0EA` | 12.2 / 7.4 / 6.3 |
| Calm / Listen / breathing | `--tint-calm` | `#E4ECE8` | `#2E5A3F` | 13.8 / 6.6 / 5.2 | `#1F2E27` | `#8FD1A6` | 12.4 / 8.0 / 6.4 |

All ink ≥ 4.5:1, all icons ≥ 3:1, muted ≥ 4.5:1 in both themes (ML-39; Opus recomputed within ±0.05). The tightest are muted on Meds light (4.81) and Labs light (4.83). Warning cards keep `--red`/`--warn-bg` (not a section tint). The tokens go into **all three** theme blocks of `tokens.css` (`:root` line 4, `[data-theme=dark]` line 22, and the `prefers-color-scheme: dark` media block lines 39-53; m-6). `contrast.test.ts` (look) gets a table test over every pair in **both** themes, asserting `ratio >= 4.5` (text) and `>= 3` (icon) on the unrounded value, never on a rounded one.

---

## 4. Data needs

- **Migration: none.** View as uses 0029 (`admin_log_view_as`) and in-memory state only; acknowledge is local kv (`warn.ack`); family alerts use `carer_alerts.seen_at` (0030); calendar reads `family_events`, `family_tasks`, `medications`; the ID card reads `people` + the Medical ID rows. If Lloyd wants acknowledgements shared across his phones later, that is migration **0044_warn_ack** (table `warn_ack(user_id, alert_id, issued_at)`, RLS self only) in a later session, not this one.
- **RLS impact: none.** View as reads only what `is_admin()` policies already return; a non-admin cannot enter it and sees self (tested); no write ever carries the viewed id (backstop + allowlist guard).
- **Edge functions: none.** The `ask` function's `open_screen` tab list is unchanged (`records` stays a value; the app maps it to `#family/papers`).

---

## 5. Lanes (multi-lane build; 7 lanes + L0 by the orchestrator)

Contract file: `docs/session-16/contracts.md` (from CONTRACT-TEMPLATE), written by the orchestrator with sections C-1..C-6 below before launch. Every brief carries the LIVING CHECKLIST line and the base sha (PLAYBOOK 0.3). Fix rounds = new runs with only the failing lanes.

### L0 Base (orchestrator, before launch, one commit)
Files: `src/styles/tokens.css` (section 3, three theme blocks), `src/features/shell/routes.ts` + `routes.test.ts` (section 2), `src/App.tsx:86` track line (`'#family/papers'`), `src/features/look/HeroCard.tsx`, `src/features/look/FeatureCard.tsx`, `src/features/look/cards.css`, `src/features/look/index.ts` (exports), `src/features/look/contrast.test.ts` (token table), **stubs** in `src/features/viewas/`: `viewAs.ts` with the final signatures from 1.6 (`getViewedPersonId` → null, `enterViewAs` → false, `exitViewAs` no-op, `useViewedPersonId` → `useSelfPersonId()`, `useViewAs` → `{ viewing: false, personId: null }`, `useViewedVisibleIds` → null), `ViewAsRow.tsx` and `ViewAsBanner.tsx` returning `null` (L6 replaces all three; M-7), `docs/session-16/contracts.md`. Steps: write tokens → write cards → stubs → routes + redirects → `npx tsc --noEmit` 0 → `npm test` green → `npx playwright test e2e/shell.spec.ts e2e/no-sideways-scroll.spec.ts` green → commit `feat(s16): base tokens, cards, redirects, viewas stubs`.

**C-1 HeroCard / FeatureCard (shared, L0 owns; no lane edits them, requests go to the orchestrator):**
```tsx
export type Tint = 'vitals' | 'meds' | 'labs' | 'body' | 'live' | 'learn' | 'watch' | 'play' | 'family' | 'weather' | 'calm' | 'none'
export interface CardAction { label: string; href?: string; onClick?: () => void }
/** Big card: one title, one body, ONE primary action; optional close (N-10) and a media slot (video poster, body figure). */
export function HeroCard(p: { tint: Tint; icon: IconName; kicker: string; title: string; body?: ReactNode; action?: CardAction; onClose?: () => void; closeLabel?: string; media?: ReactNode; testId?: string; children?: ReactNode }): JSX.Element
/** Smaller tinted door: icon + label + status + one action, optional second-row links. */
export function FeatureCard(p: { tint: Tint; icon: IconName; label: string; status?: string; action: CardAction; links?: CardAction[]; testId?: string }): JSX.Element
```
Rules: icon and label are required (never colour alone); `tint:'none'` = cream; close button 48 px, `aria-label={closeLabel}`; at 195 px the action goes full width under the text.

**C-2 Tint tokens:** names in section 3; CSS `.card[data-tint=<t>] { background: var(--tint-<t>); } .card[data-tint=<t>] .sh-icbox { color: var(--tint-<t>-ic) }`.

**C-3 Routes:** `canonicalHash` redirects (section 2) and the `parseHash` additions are in the base; lanes never edit `routes.ts` or `App.tsx` except the hook lines listed in C-5.

**C-4 Screen rules:** one primary action per card; 48 px targets; body ≥ 14 px; words wrap, never break; 195 px one column; every tinted card has icon + label; system back closes any sheet (one history entry per sheet/sub-page).

**C-5 Hook lines in shared files (one line each, prefix comment `// S16-<lane>`):**
| File | Anchor | Lane | Hook |
|---|---|---|---|
| `src/App.tsx` | after `<OfflineBar />` | L6 | `<ViewAsBanner />` (the stub is already imported by L0, so this line is in the base; L6 only fills the component) |
| `src/App.tsx` | `title` ternary `'Me'` | L5 | `'Settings'` |
| `src/features/viewas/ViewAsBanner.tsx` (L6's own file) | mount effect | L6 | `useEffect(() => onAuthChange(exitViewAs), [])`; `auth/session.ts` is not edited (R-2) |
| `src/db.ts` | `enqueue` | L6 | the fail-closed backstop block in 1.6 (R-1); nobody else edits `db.ts` |
| `src/features/records/useHealthData.ts` | `setChosen` | L6 | export `resetPersonChoice` is already there; L6 calls it from `enterViewAs`/`exitViewAs` (no edit to the file) |
Removed in rev 1 (M-7): the `sync/profile.ts` VA block (B-1), the Assistant mapping and the templates tab (not needed).

**C-6 Invariants:** Today and Simple Today show a given alert title once; **no write path reads the View as id** (allowlist guard in L6: `useViewedPersonId`, `getViewedPersonId` and `useViewedVisibleIds` are imported only by the 1.6 reader-table files, `viewas/**` and `src/db.ts`; `useViewAs` is free) and **no queued write leaves the phone while viewing** except `sos_events` and `usage_events` (`db.ts` backstop); the View as id is never persisted (grep: no `viewas` string in any `db.kv`, `localStorage` or `sessionStorage` call); SOS always acts as the signed-in person; IncomingSos and the SOS screen never get a close button; a closed warning stays on Safety > Warnings and the roll-call answer stays on Today while a signal is live; every current Me row remains reachable; every old hash in section 2 lands.

**C-7 Composition limits (ML-41, m-5):** stacks that can appear together: `TopBar` + `OfflineBar` + `ViewAsBanner` + (Today) `WarningCard`/`NoticeStack`, on every tab root and on `#family/papers`, `#health/labs`, `#me/<group>`. Rule: at most one Jack (`JackArt`) per screen: none on `WarningCard`, the storm variant, `FamilyNotice`, `IncomingSos` or the SOS screen (D-91); the only Jack on Today stays the WeatherCard's calm-state one. Each lane lists the screens its new element can share and tests the limit there, at 390 and 195 px.

### Lane table
| Lane | Owns (only these) | Depends on | Builder | Reviewer | Port |
|---|---|---|---|---|---|
| **L1 Today** | `src/screens/Today.tsx`, `src/features/today/{WarningCard,NoticeStack,BreathSheet,SelfCare,WeatherCard,SimpleToday,QuickLog,NextUp}.tsx` (QuickLog/NextUp: disable while viewing, R-1), `today/quickLog.test.tsx`, `today/{warnAck.ts,today.css,selfcare.css,breath.css}`, `src/features/notify/AlertCardToday.tsx` + `AlertCardToday.test.tsx`, `src/features/safety/StormCard.tsx` (**kept**; exports a `StormBlock` for WarningCard, still mounted by Safety; M-2), `today/AlertBand.tsx` (**kept**, Simple mode), tests: `today/{today,weatherCard,nextUp,s14t2,s14t2r2,s15s1,SelfCare,AlertBand}.test.tsx`, `family/stormrollcall.test.tsx`, new `today/{warnAck,WarningCard,NoticeStack,BreathSheet}.test.tsx`; e2e: `today-auth`, `today`, `s13-t-today.auth`, `s14-t2-today.auth`, `s7-today-shots.auth`, `s12-storm-shots.auth`, `s5-alerts`, `s1-alerts-shots`, new `s16-today.auth` | L0 | Sonnet | Opus | 4411 |
| **L2 Health** | `src/screens/Health.tsx`, `src/features/health/{BodyHero,ProgressHero,MedicinesHero,LabsHero,VideoHero,HealthBrowse}.tsx`, `health/HealthLinks.tsx` (deleted), `health/{LabsScreen,LabsList,LabDetail,MetricScreen}.tsx`, `health/useHealthPerson.ts` (viewed id), `health/labsLogic.ts` (`labInfo.short`), `health/health.css`, tests: `health/{health-screen,LabsList,LabDetail,m7a-screens,labsLogic}.test.*`, new `health/{BodyHero,HealthBrowse,ProgressHero}.test.tsx`; e2e: `health-overview`, `health-auth` (+ `health-auth-mock.ts`), `health-a11y`, `health-v6`, `health-labs`, `s14-l-labs.auth`, `w2-health-shots`, `w2-health-shots.auth`, `s13-h-shots.auth`, `medicines`, new `s16-health.auth` | L0 | Sonnet | Opus | 4412 |
| **L3 Discover** | `src/screens/Discover.tsx`, `src/features/discover/**` (new `Overview.tsx`; `learn/Screen.tsx` library + together cards; `watch/Screen.tsx` checked videos first), `health/library/Library.tsx` + `Article.tsx` (back-link line only; files **not moved**, M-4), `discover.css`, tests under `discover/**`, `health/library/medline.test.ts` (if a href changes); e2e: `s13-d-discover`, `s12-learn`, `media`, `s12-play`, new `s16-discover` | L0 | Sonnet | Opus | 4413 |
| **L4 Family** | `src/screens/Family.tsx`, `src/features/family/{ProfileCard,FacesRow,Calendar,NeedYouNow,Papers}.tsx`, `family/People.tsx` (deleted; its `LearningHub` import goes with it), `family/calendarLogic.ts`, `family/family.css`, tests: `family/{people,family-ui,carer-cards,roster-loaded,MemberPage,Report,memoriesLogic}.test.*` as touched, new `family/{calendarLogic,ProfileCard,FacesRow,NeedYouNow}.test.*`; e2e: `family-plan`, `family-messages`, `family-report`, `records`, `records-db`, `s14-f2-family.auth`, `s13-f-shots.auth`, new `s16-family.auth` | L0 | Sonnet | Opus | 4414 |
| **L5 Settings** | `src/screens/Me.tsx`, `src/features/settings/{Overview,Group,ChoiceSheet,AlertsGroup,DisplayGroup,FamilyGroup,PhoneGroup,SigninGroup,AboutGroup}.tsx`, `settings/settings.css`, `settings/*.test.tsx`, `src/features/shell/TopBar.tsx` (label), `src/features/privacy/PrivacyScreen.tsx` (mounts `ConsentNotice`, m-3), `App.tsx` title line (C-5); e2e: `profile-auth`, `sensors`, `s6c-lock.auth`, new `s16-settings.auth` | L0 (imports the `ViewAsRow`/`useViewAs` stubs) | Sonnet | Opus | 4415 |
| **L6 View as** (critical) | `src/features/viewas/**` (fills the three stubs; `ViewAsBanner` registers `onAuthChange(exitViewAs)`, so `auth/session.ts` is **not** touched, R-2), `src/db.ts` (backstop block only) + new `db.enqueue.test.ts`, `src/features/today/useDueMeds.ts` + `useDueMeds.test.tsx`, `today/useMyTakes.ts` + test, `today/MyWeek.tsx` + `myWeekLogic.test.ts` if touched, new `viewas/{viewAs,viewAs.imports}.test.ts`; e2e: `admin-view-as.auth`, new `s16-viewas-privacy.auth`. **Does not touch** `sync/profile.ts`, `records/useHealthData.ts`, `setup/useProfile.ts` or any file in the C-6 grep list | L0 | Sonnet | **Opus first, re-audit after any fix** | 4416 |
| **L7 IA sweep** | `src/features/inbox/build.ts`, `shell/AskSheet.tsx`, `scan/{ScanFlow.tsx,open.ts}`, `family/CarerCards.tsx` (hrefs), `inbox/MissedDoseActions.tsx` (hrefs **and** disable its dose buttons while `useViewAs().viewing`, R-1), `medid/MedicalId.tsx` (hrefs), `health/MedDetail.tsx:147` (href), tests those files have; e2e: `subpage-header`, `ask-sheet`, `scan`, `onboarding`, `s14-j-jack`, `s12-shell`, `s12-shell.auth`, `s12-f3-shots`, `tabbar-overlap`, `no-sideways-scroll`, `s12-core.auth`, `s12-polish`, `shell`, `admin`, `auth`, `phone-warnings`, `s12-marked-by.auth`, `s12-sharing.auth`, `s16-narrow-text.auth` (ROUTES), new `s16-redirects`. (Assistant and templates dropped, M-7; `PrivacyScreen` moved to L5.) | merges **last**, after L1-L6 (its specs need the new screens) | Sonnet | Opus | 4417 |

No two lanes share a file and no file moves (M-4): `Health.tsx` is L2 only and drops four branches; `health/library/*` stays, L3 edits only the two back-link lines in `Library.tsx`/`Article.tsx` and nothing else there; `family/LearningHub*` stays, L4 deletes the only importer (`People.tsx`) and L3 adds the Discover mount; `StormCard.tsx`/`AlertBand.tsx` stay and are L1's; `screens/Records.tsx` is untouched (L4 mounts it); `records/*`, `sync/*`, `sos/*`, `sensors/*` are touched by nobody. `App.tsx` lines are split by C-5 (L5 title, L0 banner import + track line).

Merge order: L0 → L6 → L3 → L2 → L1 → L4 → L5 → L7. After each merge: tier-0 smoke (`e2e/shell.spec.ts` + `no-sideways-scroll`), the merged lane's specs, duplicate scan, and `npx tsc --noEmit` (catches a stale import path).

### Per-lane test plan
Every lane: `npx tsc --noEmit` 0, `npm test` green (quote exit codes, ML-20), `npx playwright test <own specs> --repeat-each 2 --workers 2` with `PW_PORT=<lane port>`, `git status --porcelain` empty after gates (ML-32). Screenshots: 390×844 and 195×844, light and dark, compared with the named mockup v10 frame (ML-37), written only with `S16_SHOTS=1`.

- **L1:** vitest `warnAck.test.ts` (same stamp hides; newer issuedAt, higher level, signal 2→3 and a new id re-show; trim), `WarningCard.test.tsx` (quake fixture once on Today; storm variant shows the StormBlock; acknowledged storm keeps the answer row; `air` never drawn; stale amber with a fixed clock, m-4), `NoticeStack.test.tsx` (one expanded; "checked N min ago" at a fixed clock), `BreathSheet.test.tsx` (phase word/count at fixed elapsed values; reduced motion; back closes via popstate; no log write while viewing), `weatherCard.test.tsx` (no warning line on Today and Simple Today), `stormrollcall.test.tsx` still green (StormCard kept). Clocks fixed at 23:30 and 00:30 local for `useNext` (ML-38). Playwright `s16-today.auth.spec.ts`: order of sections, close button, breathe sheet opens/closes on back, no write control enabled while viewing, 195 px light+dark; the six existing Today/alert specs updated to the new DOM.
- **L2:** vitest `health-screen.test.tsx` (hero order, wiki nudge on blank, tints with icon+label), `LabsList.test.tsx` and `LabDetail.test.tsx` (1.2.7 items), `HealthBrowse.test.tsx` (hrefs incl. `#family/papers`, `#discover/watch`). Playwright `s16-health.auth.spec.ts` + `s14-l-labs.auth` updated: shots vs mockup v10 health frames and v9 labs frames.
- **L3:** vitest `discover/overview.test.tsx` (5 cards + hero), `health/library/*.test` still passing from their current paths, `watch.test.tsx` (checked videos listed first). Playwright `s16-discover.spec.ts`, updated `s13-d-discover`, `s12-learn`, `media`.
- **L4:** vitest `calendarLogic.test.ts` (month cells; dose rows come from `medSlots`/`pickSlot` and match them for a fixture, ML-10; readable members only; fixed clocks 23:30/00:30), `ProfileCard.test.tsx` (fields = Medical ID fields; ingest row hrefs; Edit/Scan disabled while viewing), `FacesRow.test.tsx` (status words; "See their stats" only when `visibleTo(...).records`; list filtered while viewing), `NeedYouNow.test.tsx` (newest 5, CarerCards mounted, none state). Playwright `s16-family.auth.spec.ts` (papers under Family, redirects from `#records`), updated `family-*`, `records*`.
- **L5:** vitest `settings/overview.test.tsx` (every row label of `Me.tsx` on the base sha reachable; the lane counts them), `ChoiceSheet.test.tsx` (radiogroup, value applied via `applyTheme`/`applyTextSize`/`setLang`). Playwright `s16-settings.auth.spec.ts` (back from a group lands on `#me`; switch roles), updated `profile-auth`, `sensors`, `s6c-lock.auth`.
- **L6:** the full list is in 1.6: vitest `viewAs.test.ts` (enter refused for non-admin and when `logViewAs` is false; exit clears; mounted Today re-renders on switch/exit), `viewAs.imports.test.ts` (grep guard, C-6), `useDueMeds.test.tsx` (targets = viewed id, clocks 23:30/00:30). Playwright `admin-view-as.auth.spec.ts` (one `admin_log_view_as` call per switch, bar on 5 tabs + SOS screen, writes disabled, SOS hold enabled, exit, reload = self), `s16-viewas-privacy.auth.spec.ts` (member sees only self and no row; airplane mode after Exit shows own Next up).
- **L7:** `s16-redirects.spec.ts` (every old → new), `s16-narrow-text.auth.spec.ts` on the full ROUTES list light + dark, the updated specs green.

Final (orchestrator): full vitest + Playwright on the integration tip, Opus whole-branch review, `retro.mjs` with every run journal, APK 2.7.0 release block (D-50 updater), live phone check of View as and the breathe sheet (G-2).

---

## 6. Risks and open questions for Lloyd

**Decided, not asked (rev 1):** View as is read-only (0029, desk ViewAs, B-1). Writes stay disabled while viewing; SOS acts as you. If you ever want an explicit "act as" for dependants, that is a separate design with its own decision, not this release.

**Q1. Today order deviation (ML-04, m-1):** a live incoming SOS and the alarm-fixed toast sit above the weather card; they are not cards and have no close. Everything else follows N-9. Say "weather above SOS too" to change it.
**Q2. Papers under Family (D-97) means the Labs screen links across tabs to `#family/papers` for the source paper.** Plan keeps that one cross-tab link. Say if you would rather keep a "Papers" door inside Health too (then Health > Browse > Track gets a second link; no route change).
**Q3. Tint hues (section 3) need your eye on mockup v10 before the lanes start (D-77).** Only the hues are open; the rule (cream + one tint + icon + label) is D-96.
**Q4. "I'm OK" lives on the Family faces card header; Today's QuickLog keeps the mood check-in.** Say if you want I'm OK back on the Today page as well (D-43 "everywhere" is met by Family + Safety + Simple mode today). Memories stays under the Family calendar (M-6); say "drop Memories" if you would rather lose it.

Risks: (R1) L7 merges last and touches 20 specs: a long tail; mitigated by the redirect spec and the narrow-text sweep running on the integration tip only. (R2) No file moves now (M-4), so the remaining import risk is the `People.tsx` delete (L4) racing the Discover mount of `LearningHub` (L3): both keep the file, `tsc` after each merge catches a miss. (R3) The calendar's dose rows re-implement "due today" unless they call `medSlots`/`pickSlot` (ML-10): the brief says call them and the test compares. (R4) Local acknowledge means a warning closed on one phone shows on another; accepted for 2.7.0 (section 4). (R5) The breathe sheet pushes a history state; a stray `location.replace` elsewhere could pop it; the Playwright back test covers it. (R6) With the `db.ts` backstop (R-1), only direct-RPC writes (`raise_mood_alert`, roll call, consent, share RPCs) still depend on the owning lane disabling its control (1.6 list); the L6 Playwright spec walks Today, Health and Family and fails on any enabled write control while viewing, and the final Opus review re-checks the list.

---

## 7. Mockup v10 brief (frames to add to `bantay-complete-mockup.html`, group "s16")

Each frame 390×844 light + dark; the 195 px variant for the starred ones.

1. `today-s16` Today calm: weather hero first, Next up, QuickLog, SOS, Take a breath hero, plan, More (NoticeStack collapsed).*
2. `today-s16-quake` Today with a quake: weather, WarningCard (close button, "Hide on Today. Still listed under Safety."), FamilyNotice.*
3. `today-s16-storm` Today storm variant: WarningCard with the StormBlock inside (How are you? faces, I'm safe / I need help, Do now).
4. `breathe-pick` Breathe sheet, pattern grid (calm tint cards), minutes, Start.
5. `breathe-run` Breathe sheet running: layered orb, "HOLD 3", 02:51, End early.*
6. `breathe-mood` Mood faces after a session.
7. `health-s16` Health with data: body hero with stats, My progress, Medicines, Lab results, nudge, Video hero, Browse feature cards (4 tints).*
8. `health-s16-empty` Health blank person: body wiki nudge, Browse.
9. `health-s16-viewas` Health while viewing as Mama (banner, no person chips).
10. `health-labs` (v9 kept) with items 1-7 of 1.2.7 marked as the target; `health-labs-empty` with the Scan a paper camera action.
11. `discover-s16` Discover overview: pick hero (learn tint), season, 5 feature cards.*
12. `discover-learn-s16` Learn sub: wiki, recipes, Library, Learn together cards.
13. `discover-watch-s16` Watch sub: checked videos first, playlists, live TV.
14. `family-s16` Family root: ID-style profile card, faces row with I'm OK, calendar month+week with tags, Need you now.*
15. `family-faces-sheet` Tap a face: "See their stats" / "Send a message".
16. `family-papers` Papers under Family (the Records screen with the Family back header).
17. `settings-s16` Settings overview: account card, View as row (admin), 8 group rows with value text.*
18. `settings-display` Display group with the Theme choice sheet open (radiogroup).
19. `settings-alerts` Alerts and reminders group.
20. `viewas-pick` View as picker sheet (offline state "Needs internet to switch"); `viewas-banner` any tab with "Viewing as Mama, read only · Exit" and a disabled write control showing "Viewing only. Exit to act as yourself."; `viewas-sos` the SOS screen with the bar still visible and the hold enabled.
21. `family-s16-viewas` Family root while viewing: faces row limited to the people Mama can see, no "See their stats" on members whose records she cannot read.

---

## Self-review
- Spec coverage: N-5..N-23 each have a landing section and a lane (section 0); G-4 and G-5 covered; D-94/96/97 applied; D-82/D-84 kept (1.6 read-only lens, M-1 visibility filter, section 4).
- Placeholders: none; every new file is named with its owner; copy is quoted where it changes.
- Type consistency: `Tint` names match the token table; `CardAction` used by both cards; `ackWarning(a)` takes `Pick<Alert, 'id'|'issuedAt'|'level'|'kind'>` from `safety/alerts.ts`; the `viewas/viewAs.ts` signatures in 1.6 are the ones L0 stubs and L2/L4/L5 import.
- Rev 1 check: every PLAN-REVIEW finding (B-1..B-3, M-1..M-7, m-1..m-8) is in the changelog and applied in the body; none declined.
