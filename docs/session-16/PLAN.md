# Session 16 redesign plan (N-5..N-23, D-94, D-96..D-103)

## Revision 9 (2026-10-30, Lloyd approved mockup v12 = artifact K7J3qEr6Zv6GMb3mqz5ci6 version 4; D-101, D-102, D-103)

| Decision | What changed |
|---|---|
| D-101 | Scene hero is the fifth card type (shared rules, C-1 `SceneHero`); Q5 closed. Mockup v12 v4 is the UI contract: every lane compares its shots against the v12 frame named in its brief. |
| D-102 Q1 | Labs footer keeps the v9 sentence (1.2.7). |
| D-102 Q2 | Migration **0044_logged_by** (`readings.logged_by`, `activity.logged_by`, BEFORE INSERT trigger from `auth.uid()`, grants restated, down file) is written by **L6**, rehearsed in WSL Postgres, and **applied only with Lloyd's OK at release**; the app never requires it (reads tolerate a missing column). RLS unchanged. |
| D-102 Q3 | A live incoming SOS and the alarm-fixed toast stay above the weather hero (1.1 row 0). |
| D-102 Q4 | Health **version B** (compact grid) is the build; **all version A work is removed** (no `ProgressHero`, `MedicinesHero`, `LabsHero`, `VideoHero` files; the `health-A` frames are reference only). |
| D-102 Q6 | Final budgets: Today calm ≤ 1150, Health B ≤ 1250, Health acting ≤ 1350, Family ≤ 1650 (empty-needs ≤ 1500, acting ≤ 1550), Weather screen ≤ 1900; Discover ≤ 800 and Settings unchanged. Every "pending Lloyd / Q6" note is replaced by these numbers. |
| D-103 | Icon and Jack clean-up rule added to the shared rules and C-7: one icon set (Tabler via `shell/Icon.tsx`, sizes 16 / 20 / 24 / 32 only), `JackArt` names only from `JACK_ALT`, art never overlaps a control, badge or text (its own grid cell; badges drawn by the app, never baked into the art), no clipping at 390 or 360, one Jack per screen. `docs/session-16/ICON-JACK-AUDIT.md` (Sonnet, in progress) lists every moment; its fixes go to the lane that owns the file (table in section 1 shared rules) and are part of that lane's acceptance. |
| Contract | `docs/session-16/contracts.md` written from CONTRACT-TEMPLATE: every cross-lane name, signature, token, route, hook point, fixture, migration number and C-1..C-8; L0 deliverables listed there. Lanes code only against it. |

## Revision 8 (2026-10-30, orchestrator: final v12 heights; supersedes every Q6 number below)

Final measured heights in mockup v12 (390 px): Health A 1475, Health B 1244, Health acting 1312, Family 1610, Family empty-needs 1495, Family acting 1550, Weather screen 1863 (Season and sun row restored). **Q6 proposes: Health A ≤ 1500, Health B ≤ 1250, Health acting ≤ 1350, Family ≤ 1650 (empty ≤ 1500, acting ≤ 1550), Weather screen ≤ 1900**, pending Lloyd. Where a line below says 1450 / 1200 / 1700 or quotes 1424 / 1194 / 1609, read these numbers. Also from re-verification: no read receipts in the family chat (live has none); the chat header keeps Call and Messenger video (`family/Messages.tsx:18`); Weather screen keeps "Season and sun" (`WeatherScreen.tsx:194-198`).

## Revision 7 (2026-10-30, after the v12 verification in V11-REGRESSIONS.md: FIX_FIRST items)

| Finding | What changed |
|---|---|
| N1 | The Weather screen (`#weather`, `weather/WeatherScreen.tsx`) keeps its three live controls: the place switcher "Use my location / Home 1 / Home 2" above the hero (the N-2 fix), the 4-band PAGASA heat-index strip under it, and the 2×2 detail tiles (Rain next 6 h, Wind, Humidity, UV) before the rain map. Owner: **L1** (the file is otherwise unchanged; L9 only supplies the scene). Budget ≤ 1700. |
| N2 | Family Messages is the **single shared family chat** (`family/Messages.tsx:17,102`, migration 0027), never one-to-one threads. The Messages row previews the latest message of that chat; the faces sheet "Send a message" opens the shared chat (no `?to=`); frames `family-messages` / `family-thread` draw mixed senders in one thread. |
| N3 | Height budgets proposed, **pending Lloyd (Q6)**: Health A ≤ 1450 (measured 1424), Health B ≤ 1200 (1194), Family ≤ 1650 (1609), because the body figure, the ring nudge row, the face rings and legend and the Messages/Plan rows came back (rev 6). The acceptance lines gate on these numbers once Lloyd says yes; until then the trim fallbacks are named (Family: Messages + Plan as one 2-up row, −80 px; Health B: drop the Progress tile ring, −50 px). |
| Greeting | The top-bar greeting never truncates: "Magandang umaga, Mama" wraps to 2 lines (22 px) with the date on its own 13 px line; no ellipsis on names (L-5 exemption stated in 1.1 row 1). |
| Today More rows | `NearbyList`, `WeekLine`, `UpdateCard` (update sheet: version, size, what changed, Install / Later) and the add-to-home row are placed under "More" as rows (1.1 row 11) and get frames `today-more`, `start-update`. |
| Medical ID | The ProfileCard has **no max-height**: it grows to fit the full field set (all medicines listed in the stat strip's sheet, the Call contact, allergies and conditions chips); the ~312 px figure is the typical height, not a cap. |
| N4, N5, R10 minor | Nudge sub line "Morning BP not logged · Family streak 12 days" (W-22 kept); the feels line adds "· Drink water" at ≥ Extreme caution; the Sleep breathe tile is hidden while `SLEEP_478_ENABLED` is false, as the live app does (orchestrator correction; matches lines 27 and 188). |
| R15 | Scene hero recorded as **Q5 → D-101** (pending Lloyd's "A"); nothing else changes. |

## Revision 6 (2026-10-30, after V11-REGRESSIONS.md: v11 regressed against live 2.6.1 and approved v9)

| Finding | What changed |
|---|---|
| R15 (cause) | A fifth card type, **Scene hero** (animated scene + scrim; one per tab; ≤ 240 px compact / ≤ 280 px expanded; may carry Jack art; white text on a contrast-gated scrim), joins the four density types. Used for the Today weather hero, the Health body hero, the Breathe sheet backdrop, the Discover pick hero and onboarding 1 / 5. The density rules stay for everything else. Serif is allowed on the h1, the hero number and scene-hero numbers. Recorded for Lloyd as an amendment to the D-96 card grammar (Q5). |
| R1, R2 | The weather hero is rebuilt on the shipped `weather/WeatherScene.tsx` + `scene.ts` + `scene.css` per the V11 spec: expanded 232 px calm / compact 196 px, 56/44 px serif temperature, condition, W-2 line, pills inline, action box with Jack (expanded only, D-91 gates), 3-slot hourly strip, kicker "General Santos · as of 9:00", whole card = link. L9 **extends** `WeatherScene` (moon + glow, two-depth cloud parallax with negative delays, heat shimmer, reduced-motion static positions, off-screen + hidden-page pause, no scene animation during SOS / IncomingSos). **No new `look/Sky.tsx`** (it exists for App/SignIn). Scrim gate extended in `scene.test.ts` (moon glow, heat glow). |
| R3 | `JackFab` stays mounted on every tab; the real `JackArt` moments are kept and owned: weather action box (L1), Next up done morph "well-done" (L1), breathe-mood "well-done" (L1), Learn "reading" (L3), Watch / Listen (L3), Medicines (L2), Plan / Messages (L4), Needs-you-now empty "family-hug" (L4), SignIn / onboard-1 "hello" and onboard-5-done "celebrate" (L8), setup get-help (L8). Never on alerts, storm, FamilyNotice, IncomingSos or SOS (D-91, C-7). Mock frames never set `data-nofab`. |
| R4, R16, R17 | Quick log back to the 3×2 grid: BP, Sugar, Weight, **How are you?** (+ small I'm OK), Water, **More** (Dose taken, Food, Walk, Move sheet, `QuickLog.tsx:17-26`); the salt line under the grid (`SaltLine`). Today calm budget 1000 → ≤ 1150. |
| R5 | Next up keeps **Take / Snooze ("In 10 min") / Skip** (Skip as a 48 px text button when every slot has a medicine id, `NextUp.tsx:92`), the multi-pick, and the done morph with Jack well-done (`doneMorph.ts`). |
| R6, R7 | Health: `BodyHero` draws the real frosted `anatomy/Silhouette` with organ glows (pulse 3 s on a metric that needs a look) at 96×180 beside the 2×2 averages (≤ 240 px); the insight headline (`insightHeadline`, ≤ 2 lines) returns under the chips; the nudge becomes an 88 px row with 3 mini rings (BP / Meals / Move this week, `look/Ring.tsx`) + the family streak + "Log". `LatestList` lives in Readings, `MedReview` "Still taking it?" in Medicines (stated). |
| R8, R9 | Family faces: 48 px avatar + 3 px status ring + 16 px corner glyph (✓ / ! / –) + the legend line "OK today · Needs a look" (colour plus shape, a11y); ring draws in 400 ms on check-in. A **Messages row** (latest preview + unread badge → `#family/messages`) and a **Plan row** ("3 of 5 done today" → `#family/plan`) sit under the faces; `#family/messages` and `#family/plan` keep their own screens and frames. |
| R10 | Breathe pick draws the **real** `breathLogic.ts` patterns: Relax (In 4, out 6), Sleep (4-7-8, hidden while `SLEEP_478_ENABLED` is false), Calm (Box 4-4-4-4), each with its `why` and a one-line source link; the sheet backdrop is a radial green gradient that breathes with the orb (±6% lightness; night SKY pair after sunset for Sleep); outer two rings blurred 2 px. |
| R11 | Storm: the hero shows the storm scene (rain + flash, no sun/moon, no Jack) with forecast copy that matches the state; the WarningCard storm variant keeps the source line ("PAGASA · 11:00 AM · Source"), "All warnings", the Go-bag row ("n of N packed" → `#gobag`) and "Track the storm" (`#safety/storms`), as `StormCard.tsx:56-81` has today. |
| R12 | Learn gets the 5th tile **Your benefits** (PhilHealth Konsulta, Senior ID; `discover/learn/Screen.tsx:10,62`), 2×2 + 1 full width. |
| R13 | Settings > Alerts: `DigestToggle` copy is the live one, "8 PM summary · Who still has medicine to take", **carers only** (`notify/DigestToggle.tsx:10,55`). |
| R14 | Mock coverage restored under "Current app · not changed by this redesign": Weather screen, Storm tracking, Today offline, dose-done morph, alarm-fixed toast, Quick log sheet, My week, carer SOS banner, Messages / thread / Plan / Add, nudge hub, update sheet. PLAN rows that say "as now" now point at those frames. |
| R18 | D-71 glass: the tab bar, the scrolled top bar and every sheet use `--glass-bg` + `blur(20px)` (`styles/glass.css:49-55`); drawn in v12 and asserted in `s15-l1-shell` / `look` specs. |
| R19 | Discover pick hero carries art (`JackArt` 'cooking' / 'reading' / 'watching' by pick type, 96 px, right) with the 8 px parallax, and the season row a season gradient. |
| R20 | The Medical ID "Show on lock screen" switch stays on the Medical ID screen (`MedicalId.tsx:48`), with the lock-screen preview; Settings > Family and sharing only links there. |
| Parity gate | Every lane's acceptance now includes: compare the lane's screens against `docs/session-16/shots/live/<tab>-<light|dark>.png`, list anything less rich than live in `risks`, and tick the section-B feature-parity checklist (C-8) — all rows present or covered by a cited decision. |
| Budget | Today calm ≤ 1150 (was 1050); Health A ≤ 1300, B ≤ 1050, Family ≤ 1450 were kept here in rev 6 but the restored richness measured over them in v12 — **rev 7 proposes Health A ≤ 1450, B ≤ 1200, Family ≤ 1650, pending Lloyd (Q6)**. |

## Revision 5 (2026-10-30, after Re-review 3, Opus GO; four minors folded into the L6/L9 briefs)

| Finding | What changed |
|---|---|
| r3-1 | The profile guard moves from `saveProfile` into **`adoptPerson`** (`profile.ts:27`), the single choke point for `saveProfile`, `savePhoto` (`:146`) and pulls (`:106`); still before any local write; same one line. |
| r3-2 | L9 owns one mount/unmount hook line in `sos/SosScreen.tsx` that sets the Sky SOS flag (import from `look/`, not `viewas`), covering all four mounts: `Today.tsx:66`, `SimpleToday.tsx:76`, `Safety.tsx:49`, `assistant/Assistant.tsx:372`. |
| r3-3 | Dependency-free `viewas/store.ts` holds the acting id, `getActingPersonId` and the subscribe set; `sync/profile.ts` imports only `store.ts`; hooks stay in `viewAs.ts`. No `sync/profile → viewAs → setup/useProfile → sync/profile` cycle. |
| r3-4 | `enterActing(ownPersonId)` returns false; the picker leaves the admin out; `getActingPersonId` is never the admin's own id, so the `adoptPerson` guard never blocks his own edits. Tests added. |

## Revision 4 (2026-10-30, after Re-review 2, Opus NO_GO on 1.6 only)

| Finding | What changed |
|---|---|
| B2-1 | The `db.ts enqueue` person backstop is **removed** (it refused offline SOS, `sos_events_update`/`sos_acks`/`phone_health`/`push_subscriptions`, and silently stranded the admin's own local-first rows: HC steps, own reminder Taken, Move, BP-reply pulse, other dependants; and imported a cycle). One guard remains: `saveProfile` refuses a `people_profile` write whose `id === getActingPersonId()` **before** its local write. `db.ts` imports nothing from `viewas` or `sync/profile`. Tests: SOS enqueues while acting online and offline; `sos_acks`, `sos_events_update` pass; a sensors sync and an own reminder Taken reach the outbox while acting. |
| B2-2 | `asPerson` stays on `selfIdOrCached()`; no global acting id in `today/actions.ts`. Every exported logger takes an optional explicit `personId`; only the named UI entry points pass `useActingPersonId()` (QuickLog, NextUp, SimpleToday, Today I'm OK, FacesRow I'm OK, StormCard, AddReadingSheet, nutrition sheets). `asPerson` row dropped from C-5. The allowlist test forbids `getActingPersonId`/`useActingPersonId` in `today/actions.ts`, `nudge/*`, `health/reminderActions*`, `health/reminders*`, `sensors/*`, `sos/*`, `sync/*`, `privacy/*`, `setup/*` (except the onboarding files L8 owns, which never import it either). |
| M2-1 | Queued Unwell keyed `mood.unsent.<personId>`; a later mood supersedes only the same person's; `retryUnsentMood` sends every key; test. |
| M2-2 | `nutrition/{actions.ts,PlateSheet,WaterSheet,SaltSummary,NutritionScreen}.tsx` → L2 with explicit `personId` (acting via `useHealthPerson`). Exercise is **yourself only**: `exercise/actions.ts`, `exercise/data.ts`, `MoveScreen.tsx` → L2; the Move log button is off while acting with "Move logs are yours only. Exit to log." |
| M2-3 | `Sky` renders static with no `<canvas>` while the SOS screen, Simple-mode SOS or a live `IncomingSos` is up and on `#safety*` (`useSosActive` + hash); C-6 line; `s16-motion` case: hold SOS with Aurora on → no canvas. |
| M2-4 | Consent/sharing copy: "Your records stay private until you or a family admin share them and the person accepts. Family admins can see them. Change this in Settings > Family and sharing." (0037, D-80/D-82). |
| M2-5 | L0 stubs `look/BreathOrb.tsx` (static disc + label) and `look/CheckDraw.tsx` (static tick) with final props; L9 replaces them; other lanes import by file path, not `look/index.ts`. |
| m2-1 | `useActingCan` reads carers once at `enterActing` (online) and caches in memory; offline or a failed read with no cache = "View only". |
| m2-2 | First success reuses `phonecheck/probe.ts scheduleTestAlarm(5)` (alarm channel, permission check); with step 3 skipped it shows "Turn on reminders first". |
| m2-3 | After two notification denials step 3 and the Today alerts-off card offer "Open app settings" (`NativeSettings`/intent fallback in `steps.turnOnReminders`). |
| m2-4 | `contrast.test.ts` tests the dark icon against the 18% chip colour (its real background): terra 5.67 … green 6.10, all ≥ 3. |
| m2-5 | No new `motionBudget.ts`: extend `look/useReducedMotion.ts` and `look/motion.ts`; the chunk-size check lives in L9's `motion.test.tsx` over `dist/` after `vite build` (no new script). |
| m2-6 | Bar/toast copy says who acts: Unwell toast "Family told. Sent as Lloyd."; messages while acting "Sent as Lloyd". |
| m2-7 | `useActingCan.rollcall = family member && (self || writer)`; section 4 states both conditions. |

## Revision 3 (2026-10-30, after DESIGN-AUDIT.md, RESEARCH-GRAPHICS.md, D-98, D-99, D-100)

| Input | What changed |
|---|---|
| D-98, P-1, A-5 | Every 195 px gate, state, shot and mockup frame is gone. Replaced by L-6 (no button wraps at 360 px, `s16-buttons-360.spec.ts`) and L-10 page-height budgets per screen. `s16-narrow-text.auth` stays only as the D-95 regression on existing routes (`narrowMode.ts` kept), never as a design gate for new screens. |
| L-1..L-11 | Section 1 shared rules and contract C-4 replaced by the audit's layout system: 4 card types (hero ≤ 1 per tab, tile, row, alert), 8 pt scale, serif only on h1 + the hero number, cards are links (no "Open X" buttons), no card in a card, 2 columns only for short values and doors, empty states as one hero. |
| W-1..W-52 | All 52 wording fixes applied where each string lands (1.1-1.6, 1.7, labs copy W-29 flagged as Q1). |
| F-1, P-2, A-7 | ProfileCard = the Medical ID fields exactly (`medid/MedicalId.tsx`: name, age, blood type, allergies, conditions, medicines, call); Carers and Last check-in dropped; dense 312 px layout; "Not added" fields as "Add …" chips. |
| F-2, P-6, L-9 | Tokens: 5 hue families in light (blue, green, lilac, amber, terracotta); dark mode has no fills (icon chip + 3 px top edge + kicker). Contrast table recomputed for both. |
| F-3, F-4, P-3, W-6 | Today: ~1000 px budget; "Phone alerts are off. Reminders will not ring." is an alert card directly under weather with "Turn on"; weather card tappable; breathing is a 72 px row. |
| F-5..F-7, P-8, W-11, A-22 | Family notice is a 72 px row; storm card keeps only the roll-call pair "I'm OK" / "I need help" (D-43) + 4 one-line Do-now rows; roll call never relies on push (A-10, push_tokens = 0); breathe mood faces "Worse / Same / Better". |
| F-8, F-9, P-5, D-100 | Health specifies **both** version A (stacked heroes, N-14/N-18) and version B (compact grid, ~1000 px); mockup v11 draws both; Lloyd picks. Empty Health = one empty hero + More grid. |
| F-10, F-11 | Discover: pick hero ~160 px, season row, 2-column tile grid; Learn 2x2 tiles; Watch horizontal poster row. |
| F-12, P-4, D-100 | Family order: ID card → Needs you now (only when it has items) → I'm OK on the faces row → week strip (month behind a toggle at every width) → Memories row. |
| F-14, F-15, F-16 | Settings account row 72 px, group rows 64 px; View-as picker "Needs internet" once; inline 24 px icons, no eyebrow that repeats the tab, no "Open X". |
| A-10, A-14, A-15, A-16, A-17, A-21 | Wrong assumptions fixed: roll call works in-app only until Firebase (no push dependency); setup row mounted on Today via NoticeStack (SetupCard never hides at half done); sharing copy = the real D-86 behaviour (private until shared **and accepted**; admins can read); no lat/lon typing (zone chips + Use my location); Bigger text only in Settings > Display. |
| O-1..O-8, P-7 | New section 1.7 Onboarding (5 screens, exact copy, permissions in context, first success = a test reminder rings, Skip on 3-5) and lane L8. |
| RESEARCH-GRAPHICS | New section 8 Motion and graphics + lane L9: CSS gradient sky, optional React Bits Aurora (WebGL2, static fallback), GSAP breathing orb, SVG rings, GSAP check-draw, CC0 illustrations (Open Peeps / Humaaans), budgets in KB gz, lazy load, reduced motion, off-screen pause, low-end fallback; Rive Jack as a later phase. |
| D-99 | View as = **look and act**. 1.6 and L6 redesigned: writes carry the viewed person id explicitly, the admin stays the actor (`marked_by` trigger 0039, `created_by` triggers 0008, `rollcall.user_id`); `selfIdOrCached` / `SELF_ID` / `adoptPerson` / profile sync / consent / sensors / SOS untouched (SOS always as the admin); in-memory id, audited switch (0029), cleared on restart/sign-out/exit; each action offered only where RLS allows it for this admin (table list from `supabase/migrations`), otherwise off with the reason; bar "Acting as X"; ~~`db.ts enqueue` backstop checks `person_id = acting id` and refuses the admin's own self rows~~ (removed in rev 4, B2-1); tests per write path; optional migration 0044 for `logged_by` on readings/activity (Q2). |
| D-100 | I'm OK sits on Today next to How are you and on the Family faces row; Papers only under Family (Labs keeps its one source-paper link, no Health door). |
| Mockup | Section 7 is the v11 brief: no 195 frames, both Health versions, 5 onboarding screens, act-as frames, dense Medical ID, a motion note per frame, measured height target per frame. |

## Revision 2 (2026-10-30, after Re-review 1, Opus GO_WITH_CHANGES)

| Finding | What changed |
|---|---|
| R-1 | QuickLog/NextUp/quickLog.test → L1; SimpleToday controls on the gating list; MissedDoseActions → L7; `useHealthPerson` keeps `ownId` = admin; ~~`db.ts enqueue` backstop owned by L6~~ (removed in rev 4, B2-1). (Rev 3 re-targets these from "disable" to "act for the viewed person where allowed".) |
| R-2 | Allowlist import guard for the acting id; `exitViewAs` from `ViewAsBanner`'s `onAuthChange`, not `auth/session.ts`. |
| R-3 | `useViewedVisibleIds` fails closed to the viewed person when the roster load fails. |
| r-1..r-4 | Stale text fixed; archived-member auto-exit owned by L6; Move/Food/Water/Plate/Privacy show yourself while viewing; `viewAsData.ts` dynamically imported. |

## Revision 1 (2026-10-30, after PLAN-REVIEW.md, Opus NO_GO)

| Finding | What changed |
|---|---|
| B-1..B-3 | View as no longer overrides `selfIdOrCached`; memory-only state; audited switch; subscribing readers. (Rev 3 keeps all three and adds explicit-person writes per D-99.) |
| M-1..M-7 | Visibility filter from `visibleTo`; StormCard/AlertBand kept; ack stamp with level and kind; no file moves; e2e owners; ingest row, CarerCards, Memories placed; C-5 trimmed, stubs in L0. |
| m-1..m-8 | SOS-above-weather deviation stated; breathe sheet via history state; ConsentNotice in Privacy; fixed clocks; ML-41 list; tokens in all three theme blocks; no swipe-dismiss; no `air` on WarningCard. |

---

**Goal:** Rebuild Today, Health, Discover, Family, Settings and onboarding as dense, plain-worded cream screens with one accent per section, move wiki/videos/Learn together into Discover and records into Family, group Settings the Android way, give admins a "look and act" View as, and add calm motion within a byte budget, without a required migration.

**Architecture:** One shared `HeroCard` / `Tile` / `Row` / `AlertCard` set and five hue-family tint tokens (D-96, F-2) carry the look; each screen is rebuilt in render order from existing hooks and tables inside a page-height budget (L-10). The router gains redirects so every old hash still lands. "View as" is a memory-only acting-person lens: named readers show the member, named write entry points pass the member's id explicitly while every row keeps the admin as actor and RLS decides; identity (`selfIdOrCached`), sync, consent, sensors and SOS stay the admin's. Motion is CSS first, GSAP second, WebGL opt-in with a static fallback.

**Tech stack:** React 18 + Vite + Capacitor Android, Dexie, Supabase (RLS, RPC), GSAP (`features/look/gsap.ts`, present), React Bits single-file components (MIT + Commons Clause, copied in), vitest + Playwright at 360 and 390 px, fixed clocks (ML-38).

**Base:** branch `claude/family-bantay-session-16-6fa7b5`, commit after the D-95 bug PR merges; the orchestrator names the sha in every brief (ML-01).

**Plan before code (D-77):** mockup v11 (section 7) goes to Lloyd first; lanes start after his "A" and his picks on Q1-Q4.

---

## 0. Scope map

| Note / decision | Lands in | Lane |
|---|---|---|
| N-5 grouped Settings | 1.5 | L5 |
| N-6 Android rules | ANDROID-RULES applied in 1.5, 1.1, C-4 | all |
| N-7 + D-99 View as, look and act | 1.6 | L6 (critical) |
| N-8 one place per warning | 1.1 WarningCard; WeatherCard and SimpleToday lose the warning line | L1 |
| N-9 weather first | 1.1 (alerts-off card and SOS exceptions stated) | L1 |
| N-10 close = acknowledge | 1.1 `warnAck.ts` + `markSeen` | L1 |
| N-11 merge notices | 1.1 WarningCard, NoticeStack | L1 |
| N-12 breathing overhaul | 1.1 BreathSheet; 8 orb motion | L1 + L9 |
| N-13 body hero | 1.2 (both versions) | L2 |
| N-14 hero order | 1.2 version A; version B keeps the order in a grid | L2 |
| N-15 sub-tabs | 1.2 doors open full sub-screens | L2 |
| N-16 feature cards | 1.2 "More in Health" tiles | L2 |
| N-17 colour per section | 3 | L0 + all |
| N-18 video hero | 1.2 version A hero / version B tile | L2 |
| N-19 labs to mockup v9 | 1.2.7 | L2 |
| N-20..N-22 Discover | 1.3 | L3 |
| N-23 Family ingest and review | 1.4 | L4 |
| D-98 space and wording | section 1 rules, every screen | all |
| D-100 I'm OK, Papers, Health choice | 1.1, 1.4, 1.2 | L1, L4, L2 |
| Audit O-1..O-8 onboarding | 1.7 | L8 |
| RESEARCH-GRAPHICS | 8 | L9 |
| G-4 (UI-6, DS-12), G-5 IA | 1.1, 1.2, section 2 | L1, L2, L7 |

---

## 1. Screens

### Shared rules (contract C-4, from the audit's L-1..L-11)

- **Grid.** One column, 16 px gutters: content 358 px at 390, 328 px at 360. Two-column grids use an 8 px gap: tiles 175 px at 390, 160 px at 360.
- **Scale.** 4 / 8 / 12 / 16 / 24 / 32 only. Card padding 16. Gap between cards 12. Gap before a section heading 24. Row height 56 (one sub line) or 72 (two).
- **Five card types, nothing else.** **Scene hero** (R15): at most 1 per tab, an animated scene (`WeatherScene` for weather; frosted anatomy for Health; radial breath backdrop; season/pick art) under a contrast-gated scrim, white or ink text as the scene dictates, may carry Jack art where D-91 allows, ≤ 240 px compact / ≤ 280 px expanded, one primary action or the whole card as the link; every layer `aria-hidden`, CSS + inline SVG only (no canvas on Today), static under reduced motion, paused off-screen and during SOS. Used by: Today weather hero, Health BodyHero, Breathe sheet backdrop, Discover pick hero, onboarding 1 and 5. **Hero** (flat, tinted): the Family ID card and any tab without a scene, ≤ 280 px, one primary action. **Tile**: 2-column grid, 24 px icon, label, one value line, optional sparkline or mini ring; whole tile is the target (≥ 96 px tall), no buttons inside. **Row**: 40 px leading icon or avatar, title, one sub line, trailing chevron or one control. **Alert**: full width, red or amber, icon + title + ≤ 3 lines + one action + close where N-10 applies. No card inside a card; dividers inside.
- **Type.** Serif for the page h1 (22-24 px, one line), the hero number and scene-hero numbers (the 56/44 px temperature). Card titles 17-18 px sans semibold, body 15, meta 13 (never below 12 sp). At most one uppercase kicker per card, none when the title says the same thing. No eyebrow that repeats the tab name.
- **Jack (D-91).** `JackFab` is mounted on every tab root. `JackArt` moments stay where live has them (weather action box, Next up done, breathe-mood, Learn, Watch, Listen, Medicines, Plan, Messages, empty states, onboarding). Never on alerts, storm, FamilyNotice, IncomingSos or SOS; one Jack per screen (C-7).
- **Glass (D-71).** Tab bar, scrolled top bar and every sheet use `--glass-bg` + `--glass-blur` (`styles/glass.css`); cards stay opaque.
- **Icons and Jack art (D-103).** One icon set: Tabler through `shell/Icon.tsx` (`IconName`), sizes 16 (inline meta), 20 (row leading / chips), 24 (tiles, card titles), 32 (alerts) only; boxed icons only on tiles and rows; filled twin only for the active tab. Jack: `JackArt` with a `JACK_ALT` name only (`hello`, `well-done`, `reading`, `listening`, `watching`, `playing`, `walking`, `drink-water`, `sleepy`, `family-hug`, `medicine`, `cooking`, `ready-for-rain`, `celebrate`, `offline`, `empty-list`, `get-help`, `head`, `thinking`), sizes 56 (action box), 96 (hero / success), 112 (onboarding); the art sits in its own grid cell and **never overlaps a control, a badge or text**; badges (check, count) are drawn by the app beside the art, never baked in; no clipping at 390 or 360 (`overflow: visible` on the cell, `object-fit: contain`). `docs/session-16/ICON-JACK-AUDIT.md` lists every moment with its finding; the owner of each file applies the fix and ticks it in `checklist` (`D-103`). Owners: Today/Breathe/Next up/Weather box → L1; Health/Medicines → L2; Discover/Learn/Watch/Listen/Play → L3; Family/Messages/Plan → L4; Settings → L5; onboarding/SignIn/StartDone → L8; `JackArt.tsx`, `Icon.tsx`, `EmptyState.tsx` and the asset files → L9.
- **Lines.** Title 1 line (ellipsis only for names). Sub ≤ 2. Body ≤ 3. Safety, medicine and privacy text are exempt and wrap fully.
- **Buttons never wrap at 360 px.** Height 48. 1-up ≤ 28 characters. 2-up (160 px) ≤ 10 characters at 15 px semibold with a 20 px icon. 3-up (104 px) ≤ 6 characters, no icon. If a label does not fit, stack 1-up; never shrink text. Gate: `e2e/s16-buttons-360.spec.ts` asserts every `.btn` has a one-line box at 360 px on every route in the IA map.
- **One primary action per card.** A navigation card has no button: the card is the link with a chevron. "Open X" labels are banned.
- **Two columns** only for short label/value pairs (values ≤ 12 characters), feature doors and choice sets of 2. Never for sentences, safety steps or ordered lists.
- **Colour.** Light: tint fill on heroes and tiles only, 5 hue families, no two adjacent cards share a hue. Dark: no fills; tint on the icon chip (18% alpha behind the icon), a 3 px top edge and the kicker. Always icon + label (D-96).
- **Page budget at 390×844** (about 700 px visible; D-102): Today ≤ 1150 calm (≤ 1150 alerts-off, ≤ 1400 quake, ≤ 1500 storm); Health B ≤ 1250, Health acting ≤ 1350, Health empty ≤ 700; Family ≤ 1650 (empty-needs ≤ 1500, acting ≤ 1550); Discover ≤ 800; Weather screen ≤ 1900; a Settings group ≤ 1 screen (overview ≤ 850); each onboarding screen ≤ 700. Gate: each lane's Playwright spec asserts `scrollHeight` ≤ budget with the fixture named in `contracts.md`. Gate: each lane's Playwright spec asserts `document.scrollingElement.scrollHeight` ≤ budget with the fixture named in its brief.
- **Empty states.** One empty hero with one action replaces a stack of empty cards. "Not added" fields render as an "Add …" chip.
- **Context only where it prevents a mistake** (safety, medicine, privacy); those lines are marked **keep** below.
- Every touch target 48 px; system back closes any sheet (one history entry per sheet / sub-page).

### 1.1 Today (`src/screens/Today.tsx`, lane L1; budget ≤ 1150 px calm (R4 More row + 232 px scene hero), ≤ 1150 alerts-off, ≤ 1400 quake, ≤ 1500 storm)

| # | Section (type) | One action | Reads | States |
|---|---|---|---|---|
| 0 | `AlarmFixedToast`, `IncomingSos` (not cards) | as now | as now | **Stated deviation from N-9 (ML-04):** a live incoming SOS and the alarm-fixed toast sit above weather; never closable (D-102 Q3, decided) |
| 1 | h1 "Today" (sr-only; the greeting and date live in the top bar: "Magandang umaga, Mama" at 22 px **wrapping to 2 lines when needed, never an ellipsis** (names are exempt from L-5 truncation), the date on its own 13 px line) | | `shell/TopBar.tsx` (L5 owns the label line; the wrap rule is one CSS line there) | |
| 2 | `WeatherCard` (**Scene hero** on the shipped `WeatherScene`; expanded **232 px** when calm, compact **196 px** when Next up, the alerts-off card or a warning is on screen; R1 spec). Top to bottom: kicker "General Santos · as of 9:00" (13 px); temperature 56 px serif expanded / 44 compact with the condition "Partly cloudy" beside it; the W-2 line "Sunny till 2 PM, rain after 3. Bring an umbrella."; pills inline "Feels 38° · Extreme caution" · "Drink water"; expanded only: the cream action box with `JackArt` 'ready-for-rain' / 'drink-water' at 56 px (never on a warning, Danger heat or a storm, `WeatherCard.tsx:70-71`); a 3-slot hourly strip (time, 22 px sky icon, rain %; 56 px expanded, 40 compact). Whole card = link to `#weather`, chevron top right. White text on the SCRIM (`scene.ts:17`, .58) + text-shadow on the number; the light theme uses the same scene (no pale tint). Layers (all shipped unless marked): SKY gradient by time of day, sun + glow, **moon + glow (add)**, stars, clouds at **two depths with negative delays (add)**, fog, rain streaks, lightning (one double flash / 7 s), heat glow, **heat shimmer (add)**. Storm state = night storm scene, forecast copy "Rain and strong wind · Feels 31°", no Jack (R11). | tap = `#weather` | `today/useWeather`, `weather/WeatherScene.tsx` + `scene.ts` + `scene.css` (L9 extends), `weather/actionLine.ts` with `warning: null` (N-8), `heroCards.skyOf` | loading skeleton; offline = cached + "as of 2:05 PM, may be out of date" (frame `today-offline`); no permission = zone label from the N-2 fix; reduced motion = static positions (sun/moon in place, clouds at 20%/60%, 8 static streaks); off-screen / hidden page = paused; SOS / IncomingSos up = static |
| 3 | **Alerts-off card** (alert, amber; F-4, P-3): "Phone alerts are off. Reminders will not ring." (**keep** the consequence) | "Turn on" → `setup/steps.turnOnReminders`; after two denials the action is "Open app settings" (m2-3) | `notify/alerts.ts` permission state, `phonecheck` kv, `steps.notifyState` denial count | drawn only when true; ranked above every other notice |
| 4 | `WarningCard` (alert, red; N-8, N-11). Hazard text from AlertBand's content; storm variant composes `StormBlock` from `StormCard.tsx` (kept for Safety and Simple mode): the roll-call pair "I'm OK" / "I need help" (W-11, D-43, 2-up ≤ 10 chars), 4 one-line Do-now rows (W-12), **and the links live has (R11)**: a source line "PAGASA · 11:00 AM · Source" (`sourceUrl`), "All warnings" (`#safety/warnings`), a Go-bag row "n of N packed" (`#gobag`, `gobag/state`), "Track the storm" (`#safety/storms`). Mood faces are not in this card (they live in Quick log). Status line W-10 "OK: Lloyd, Papa · Waiting: Mama, Lola". `air` never shown here. Close X; after close a toast "Hidden here. Still in Safety." (W-7). | "What to do" → `#safety/warnings` | `safety/store.useKv(ALERTS_KEY)`, `heroCards.zoneAlert`, `stormMode.liveSignals`, `safety/rollcall` (RPC, in-app; **no push dependency**, A-10) | none = not drawn; acknowledged = hazard text hidden, roll-call row stays while a signal is live and unanswered; stale = amber "Checked N min ago" (fixed clock in tests) |
| 5 | `FamilyNotice` (row, 72 px; F-5, W-9): avatar, "Ate Joy added a visit", sub "Dr. Santos · Thu 5 Nov, 3 PM · Kuya Ben drives"; whole row tappable; close X = `markSeen` | tap → `#<template.tab>` | `notify/useAlerts`, `pickAlert` | none = not drawn |
| 6 | `NextUp` (card ~168 px; W-4, R5): kicker "Next up · 9:00" inline with a 20 px icon, title 18 px, sub "1 tablet after breakfast · on time until 9:30" (**keep** the window), **Take** (primary) + **Snooze "In 10 min"** 2-up, **Skip** as a 48 px text button when every slot has a medicine id (`NextUp.tsx:92`), the multi-pick when several doses are due, and the done morph with `JackArt` 'well-done' ("Taken 9:02 · Saved", `doneMorph.ts`; frame `today-dose-done`) | Take / Snooze / Skip | `useNext`, `useDueMeds` (targets = acting person, 1.6) | calm = not drawn |
| 7 | `QuickLog` (3×2 grid of 96 px tiles ≈ 200 px; R4, R16, R17): BP, Sugar, Weight, **How are you?** (storm: "Is everyone safe?", `QuickLog.tsx:111`) with the **small "I'm OK" button beside it** (D-100; `checkIn()`), Water, **More** (opens the sheet with Dose taken, Food, Walk, Move, Pain, Sleep, Temperature; `QuickLog.tsx:17-26`, frame `today-log`). One 32 px **salt line** under the grid ("Salt 1,300 of 1,500 mg", `SaltLine`). | tile taps; I'm OK; More | as now; acting person (1.6) | as now |
| 8 | SOS hold (92 px; always as the signed-in person) | Hold for help | as now | empty contacts = "No one set · Add" (A-20) |
| 9 | `SelfCare` row (72 px; W-5): icon, "Take a breath", sub "In 4, out 6 · last: yesterday", trailing "Start" opens `BreathSheet` | Start | kv `selfcare.log`, `selfcare.buzz` | reduced motion = count only |
| 10 | `PlanToday` (rows 56), `SeeWeek` | as now | as now | as now |
| 11 | "More" (rows, 56-72 px each; frame `today-more`): `NoticeStack` = setup row "2 left: SOS contacts, Photo · Set up" (A-14; `useSetupLeft()` from L8, never hides at half done) → `UpdateCard` row "Update ready · 2.7.0 · 38 MB" opening the update sheet (version, size, what changed, Install / Later; frame `start-update`, D-50: never above a warning) → `PwaBanner` row "Add to home screen" (web only) — one expanded row at most, the rest one line; then `NearbyList` rows (nearest hospital, health station, from `safety/nearby`) and `WeekLine` (the 7-day dose line → My week) | one per row | `update/*`, `setup/steps`, `today/NearbyList`, `today/WeekLine` | nothing = heading hidden |
| 12 | Weather screen `#weather` (`weather/WeatherScreen.tsx`, **L1 owns**, N1): place switcher "Use my location / Home 1 / Home 2" above the hero (the N-2 fix, `location/useLocation`), the Scene hero, the 4-band PAGASA heat-index strip, the 2×2 detail tiles Rain next 6 h / Wind / Humidity / UV, the rain map + scrubber, 48 h hourly, 10-day, outlook, "Season and sun" (`WeatherScreen.tsx:194-198`) (frame `today-weather`); budget ≤ 1900 (D-102) | place chips | `weather/*` (unchanged data) | as now |

**Acknowledge (N-10):** `today/warnAck.ts` as in rev 1 (kv `warn.ack`, stamp `${issuedAt}|${level ?? ''}|${kind}`, trim to live ids; family alerts via `markSeen`). No migration.

**BreathSheet (N-12, F-7, W-13..W-16, R10):** pick screen "Pick a pattern." + the **real `breathLogic.ts` patterns as tiles** (green hue): Relax "In 4, out 6", Calm "Box 4-4-4-4", and Sleep "In 4, hold 7, out 8" only when `SLEEP_478_ENABLED` is true; each tile shows its `why` and a one-line "Source" link (`sourceUrl`); the selected tile gets a slow 6 s gradient drift; minutes chips, "Buzz with each breath", "Stop if you feel dizzy. Not a treatment." (**keep**); run screen = the GSAP orb from section 8 with "HOLD" / "3" inside and `mm:ss` under it on a full-sheet radial green backdrop that brightens and dims with the phase (±6% lightness; the night SKY pair from `scene.ts` after sunset for Sleep), outer two rings `filter: blur(2px)`, "End early"; mood = 3 faces "Worse / Same / Better" (3-up ≤ 6 chars) with `JackArt` 'well-done' at 96 px and the `CheckDraw` on a small badge. Back closes via `history.pushState({ bantayBreathe: true })` + popstate. Logic stays in `breathLogic.ts`. While acting for a member the log is written for the acting person (local kv is per phone, so it stays the admin's phone log; the entry carries `personId`).

**Simple mode (`SimpleToday.tsx`):** `warning: null` on its WeatherCard (N-8); "Took it" and faces follow the acting person rules in 1.6.

Acceptance: each alert title once on Today and Simple Today; alerts-off card is the first card under weather when alerts are off; order 2-3-4-5-6-7 by `data-testid`; close writes `warn.ack`, a higher `level` re-shows, the roll-call row survives a close; no `.btn` wraps at 360; `scrollHeight` ≤ 1150 px with the calm fixture and ≤ 1500 px with the storm fixture (if calm goes over, hide the "More" heading text, saves 32 px); the weather hero renders `WeatherScene` layers (`.wxs-*`) in both themes and no pale tint; Skip present when every slot has a medicine id; the More tile opens the sheet; Jack button visible; parity gate vs `shots/live/today-*.png`; Playwright shots 390 light + dark vs v12 frames.

### 1.2 Health (`src/screens/Health.tsx`, lane L2; **version B, compact grid (D-102 Q4)**; budget ≤ 1250, acting ≤ 1350, empty ≤ 700; v12 frames `health-B`, `health-empty`, `health-acting`)

Shared by both versions: h1 "Health" only (W-17); `PersonChips` (filtered by `useViewedVisibleIds()` while acting; default = acting person; `resetPersonChoice()` + `setPersonId(acting)` on enter/exit); **the insight headline** (`insightHeadline`, `Health.tsx:92`, ≤ 2 lines, under the chips; R7); empty person = one empty hero "No readings yet" / "Add one or scan a lab paper." (W-26) with the faint `Silhouette` (no glows) behind the text, 2-up "+ Reading" / "Scan" and then the More grid only (F-9). `LatestList` (Latest vs normal with the Previous switch, D-38) lives in Readings; `MedReview` "Still taking it?" lives in Medicines (`#health/meds`); `JackArt` 'medicine' stays on the Medicines screen.

**Version A (stacked heroes) is not built (D-102 Q4).** N-14's order survives as the tile order below; N-18's video is the Video tile (inline player sheet). The `health-A` frames stay in the mockup as reference only.

**Health, version B (compact grid; F-8, D-102):**
| # | Section | One action | Reads |
|---|---|---|---|
| 1 | `BodyHero` (**Scene hero**, ≤ 240 px; W-18 "7-day averages"; R6): the real frosted `anatomy/Silhouette` with organs at 96×180 on the left, a glow that pulses 3 s (opacity .6→1) on any metric that needs a look (BP when above the guide), the 7 metric points kept (sleep/mood at the head, BP/pulse heart, sugar abdomen, weight hips, steps legs, D-38); on the right the 2×2 averages (BP 132/84, Sugar 118, Weight 61, Pulse 74; value 20 px, label 13 px) each with a mini ring that draws in 600 ms; 2-up "+ Reading" / "Scan" | + Reading | `health/BodyMap.tsx` nodes, `anatomy/Silhouette`, `vitals.averageNodes`, `useActivity`, readings, `look/Ring.tsx` |
| 2 | `GlanceGrid` "At a glance" 2×2 tiles 171×104 (order N-14): **Progress** "BP near guide 5/7" + sparkline + mini ring (→ `#health/metric/<code>`); **Medicines** "2 of 4 left today" (→ `#health/meds`); **Labs** "4 to ask · 2 Oct" (→ `#health/labs`); **Video** "Walking after meals · 6 min" (opens the inline `LiteVideo` sheet) | tile taps | `Kpis`, `kpisLogic` ("this week" from the shared local-day helper, clocks 23:30/00:30), `MedicinesSummary`, `doseCount`, non-vital readings + `labsLogic`, `videoOfTheDay`, `videosLogic.playable` |
| 3 | Nudge row (88 px; W-22, R7, N4): 3 mini rings BP / Meals / Move this week (`NudgeCard` rings, `look/Ring.tsx`), sub line "Morning BP not logged · Family streak 12 days" ("start your streak" when 0), trailing "Log"; the guided check (`#health/nudge`) stays, frame `nudge-home` | Log | `NudgeCard` logic, `nudgeLogic`, `kpisLogic` streak |
| 4 | `HealthBrowse` "More in Health" (W-24) 2-column tiles, 3 rows of 80 px: Readings, Medicines & refills, Labs, Visits, Move & food, Body wiki (no Papers door, D-100) | tile taps | `HealthLinks` data (file deleted; data hooks reused) |
Measured in v12: 1244 px (health-B), 1312 acting; budgets ≤ 1250 / ≤ 1350 (D-102).

Sub-screens keep their routes and own headers (N-15): `#health/meds`, `labs`, `body`, `refill`, `visits`, `summary`, `move`, `nutrition`, `metric/<code>`, `med/<id>`, `nudge`. Removed from Health: `papers` (→ Family), `library`, `library/<key>`, `videos` (→ Discover); `Health.tsx` drops those four branches and its imports of `Library`, `Article`, `Videos`, `Records`. Files stay where they are (M-4).

**Accent (hue families):** Readings/Progress = blue; Medicines, Move & food, Body = green; Labs = lilac; Video = terracotta. Adjacent tiles never share a hue (grid order checked in `HealthBrowse.test.tsx`).

**1.2.7 Labs restored to mockup v9 (N-19):** items 1-7 from rev 0 stand (eyebrow "from the lab's own paper"; empty state drop icon, "No lab papers yet", "A person checks every number." (W-27, **keep**), action `#scan`; source card is the link with a chevron, "Ranges are the lab's own printed ranges, not Bantay's." (W-30, **keep**); "Show previous result" always shown, disabled with "No earlier result yet" when none; Before line under the foot; lab detail sub from `labInfo.short`). Footer copy (D-102 Q1, decided): the v9 sentence "A result outside the range is a question for your doctor, not a diagnosis. Tap a test to see what it means and the last 3 results." (W-29 not applied).

Acceptance: version B rendered (no version A files in the tree); BodyHero → GlanceGrid (Progress, Medicines, Labs, Video) → Nudge row → More tiles by `data-testid` order; empty person = one hero + grid; tints with icon + label; labs items 1-7 and the v9 footer on 390 shots vs the v12 labs frames; D-103 fixes from ICON-JACK-AUDIT.md for `health/**` applied; no `.btn` wraps at 360; `scrollHeight` ≤ 1250 with the full fixture, ≤ 1350 acting, ≤ 700 empty (D-102); shots vs `health-B`, `health-empty`, `health-acting`; parity gate vs `shots/live/health-*.png`.

### 1.3 Discover (`src/screens/Discover.tsx`, lane L3; budget ~760 px)

| # | Section | Reads |
|---|---|---|
| 1 | h1 "Discover" (no eyebrow, W-31) | |
| 2 | `PickCard` hero (amber; ~160 px): title, one line "⅓ less salt · 25 min" (W-32), chevron; whole card tappable | `discover/today/pick.ts` |
| 3 | `SeasonCard` as a 72 px row | `data/discover/seasons.json` |
| 4 | 2-column tiles 171×96: Learn "Medicines, recipes, topics" (W-34), Watch "18 videos · live TV" (W-35), Listen, Play, News (spans both columns in row 3); tiles tappable, no "Open X" (W-33) | `DISCOVER_SUBS`, counts from each sub's data |

`#discover/<sub>` = that sub's full screen with the existing pill row. Route moves only (M-4): Learn screen = 2×2 tiles + 1 full-width: Medicine wiki "What each medicine is for" (W-36), Recipes, Library "40 health topics" (mounts `health/library/Library` at `#discover/learn/library[/<key>]`; the per-condition "For Mama's conditions" list stays inside Library), Learn together (mounts `family/LearningHub` at `#discover/learn/together`), and **Your benefits** "PhilHealth Konsulta · Senior ID" (R12; the shelf from `discover/learn/Screen.tsx:10,62`); `JackArt` 'reading' stays on the Learn screen. Watch keeps the v9 line "Opens in YouTube, official channel" on each poster where `LiteVideo` cannot play inline. The Discover pick hero is a **Scene hero**: `JackArt` 'cooking' / 'reading' / 'watching' by pick type at 96 px on the right with an 8 px scroll parallax (R19); the season row gets a season gradient (rainy: 6 slow `wxs-rain` streaks; Undas: amber candle glow), static under reduced motion. Watch screen = a horizontal 160×90 poster row "Checked videos · 18" scrolling inside itself, then 64 px playlist rows (F-11). `Library.tsx` / `Article.tsx` back links → `#discover/learn` (L3's two lines there). Hues: Learn amber, Watch terracotta, Listen green, Play green (not adjacent to Listen: order Learn, Watch, Listen, Play, News), News blue.

Acceptance: `#discover` draws hero + row + 5 tiles; each tile opens its sub; redirects from `#health/library*`, `#health/videos`; `scrollHeight` ≤ 800; no `.btn` wraps at 360; poster row does not widen the page (`no-sideways-scroll`).

### 1.4 Family (`src/screens/Family.tsx`, lane L4; D-97, D-100; budget ≤ 1650, empty-needs ≤ 1500, acting ≤ 1550 (D-102; measured 1610 / 1495 / 1550 in v12); frames `family-s16`, `family-s16-empty-needs`, `family-acting`)

| # | Section | One action | Reads | States |
|---|---|---|---|---|
| 0 | `AcceptCard`, `IncomingSos` (placement family) above the card when active | | | |
| 1 | h1 "Family" (no eyebrow, W-37) | | | |
| 2 | `ProfileCard` (hero, amber, ~312 px typical, **no max-height: it grows to fit every field**, F-1, P-2; the full medicine list opens from the Medicines stat in a sheet, so the card never clips a name like "Atorvastatin 20 mg"). Row 1: 56 px avatar (photo or initial in a circle), "Mama · 68 · A+", trailing ✎ 48×48 (aria "Edit name and photo"). Row 2: allergy chips, red with ⚠ ("Penicillin"). Divider. 3-column stat strip 56 px: Medicines 4 · Conditions 2 · Call "Ate Joy" (value 17 px, label 13 px). Primary "Show to a doctor" (1-up) → `#medid`. 2-up "Scan" / "Papers" + badge 2 (W-38; ≤ 10 chars). Fields = `medid/MedicalId.tsx` exactly: name, age, blood type, allergies, conditions, medicines, call. **No** Carers, **no** Last check-in. "Not added" = "Add blood type" chip (L-11). | Show to a doctor | `useActingPersonId()`, `useProfile`, `useOwnAvatar`, the Medical ID reads (`medid/MedicalId`), `useMedications`, `records/api.listDrafts` for the Papers badge | acting = that member's card; ✎ disabled while acting (profile edits go through `saveProfile` → `adoptPerson`, see 1.6) with "Exit to edit" |
| 3 | `NeedYouNow` (alert rows; F-12, P-4): family alerts newest 5, newest message, `CarerCards` (review asks, missed doses with their own actions) | per row | `useAlertRows`, `messagesApi`, `CarerCards` | **drawn only when it has items**, directly under the ID card; empty = not drawn at all |
| 4 | `FacesRow` (~152 px; R8): horizontal row of 48 px avatars, each with a **3 px status ring and a 16 px corner glyph (✓ OK today / ! needs a look / – no check-in)** (colour plus shape, a11y; ring draws in 400 ms on check-in, static under reduced motion), the status word under each ("Mama · OK 6:40"), a one-line legend "OK today · Needs a look"; no hint line (W-39); tap opens a sheet "See their stats" (only when `visibleTo(...).records`) / "Send a message" (`#family/messages`, the one shared family chat, N2; the composer is prefilled with "@Ate Joy "). **"I'm OK" small button in the row header** (D-100, D-43). | I'm OK | `useFamilyPeople` filtered by `useViewedVisibleIds()` while acting, `useCheckInsLoaded`, `rollCall`, `useFlagLines`, `visibleTo` (dynamic import) | storm = `StormRollCall` replaces the words; acting = line "Showing only who Mama can see." (W-41, **keep**) |
| 5 | `Calendar` (~460 px; F-12, P-4): header "Calendar · October" (W-40); **week strip default at every width**, month grid behind a "Month" toggle; selected day rows tagged Dose / Visit / Event / Task / Note (icon + label); "Add" opens `PlanSheets.ItemSheet`; "Full plan" → `#family/plan` | Add | `usePlan`, `events.weekOf`, `eventsOn`, `planList.dayRows`; dose rows from `medSlots`/`pickSlot` (ML-10), readable members only (D-82) | empty day = `emptyHint` |
| 5a | **Messages row** (72 px; R9, N2): "Messages · Ate Joy: Dinner at 6?" + unread badge → `#family/messages`, which is the **single shared family chat** (`family/Messages.tsx:17,102`, migration 0027: one thread, mixed senders, voice notes, photos, quick replies "All good / On my way"; never per-person threads; frames `family-messages`, `family-thread` draw that one chat) | tap | `family/messagesApi` newest + unread count (same selector as the list, ML-34) | none = "Messages · Say hello" |
| 5b | **Plan row** (56 px; R9): "Plan · 3 of 5 done today" → `#family/plan` (own screen kept: tasks with ticks, notes shared / only me, Add; frames `family-plan`, `family-add`) | tap | `usePlan`, `planList.progressOf` | none = "Plan · Nothing planned" |
| 6 | `Memories` as a 64 px row | tap | as now | as now |

Sub-screens: `#family/people/<id>` (`MemberPage`), `#family/people/<id>/report`, `#family/messages` (the one shared chat; a face sheet only prefills "@name"), `#family/plan`, **`#family/papers`** (`screens/Records.tsx` mounted under `SubHeader` "Papers"; sub "Read by Bantay, checked by a person" W-42 **keep**; the 2-up in the papers frame becomes "Confirm 2" / "Fix" or stacks 1-up, F-13). `#family/people` redirects to `#family`; `People.tsx` deleted after its pieces move (check-in + roll call + flags → FacesRow, CarerCards → NeedYouNow, Memories → row 6, FamilyPhones → Settings > Phone, LearningHub → Discover mount; file stays).

Acceptance: ProfileCard fields equal the Medical ID render (vitest); NeedYouNow absent when empty and second when not; week strip default, month on toggle; faces row scrolls only inside itself; "See their stats" absent for unreadable members; `#records`, `#family/records`, `#health/papers` land on `#family/papers`; while acting, the faces row lists only `useViewedVisibleIds()` and non-permitted write controls are off; the Messages screen renders one shared thread with mixed senders (N2); the ProfileCard clips nothing with a 6-medicine fixture (DOM check: no text past the card box); no `.btn` wraps at 360; `scrollHeight` ≤ 1650 with the full fixture, ≤ 1500 with the empty-needs fixture, ≤ 1550 acting (D-102); the chat has no read receipts and its header keeps Call and Messenger video (`family/Messages.tsx:18`); D-103 fixes from ICON-JACK-AUDIT.md for `family/**` applied; shots vs the three v12 family frames; parity gate vs `shots/live/family-*.png`.

### 1.5 Settings (`src/screens/Me.tsx` → overview + groups, lane L5; N-5, N-6; budget ≤ 800 px overview, ≤ 1 screen per group)

Title "Settings". Overview: account **row** 72 px (avatar 48, name, "Admin" (W-43), trailing ✎ icon button), Simple mode switch row 56 px, then group rows 64 px (24 px icon, label, one-line value, chevron). Each group opens `#me/<group>` with its own header and one history entry.

| Group (route) | Rows from `Me.tsx` | Control |
|---|---|---|
| **View as** (admin only; L6 `ViewAsRow`) | new; row text "View as · See the app as a family member" (W-44) | child screen |
| **Alerts and reminders** (`#me/alerts`) | Alerts list (`#notif`), `DigestToggle` with the **live copy "8 PM summary · Who still has medicine to take", carers only** (`DigestToggle.tsx:10,55`; R13), `PushPermissionRow`, Quiet hours, `AlarmHealthRow`, `CallRow` ("Hold for help can call for you") | switches + rows |
| **Display** (`#me/display`) | Text size ("Bigger text" lives only here, A-21), Theme, Language (choice sheets with `role="radiogroup"`; Language sub says plainly which parts are translated, A-3) | choice sheet |
| **Family and sharing** (`#me/family`) | Who can see my records (`#sharing`), Who gets your SOS text, Medical ID (`#medid`; the **"Show on lock screen" switch and lock-screen preview stay on the Medical ID screen**, `MedicalId.tsx:48`, R20), carer-of rows | rows |
| **Phone** (`#me/phone`) | `SensorSettings`, `SetupCard` (full list, never hidden), `FamilyPhones` | rows |
| **Privacy** (`#privacy`) | Agreement, AI, my data, `ConsentNotice` (not rendered while acting: `ensureConsent` writes `people.consent_at`) | rows |
| **Sign-in** (`#me/signin`) | fingerprint/face, Switch person, Forget this phone | rows |
| **About** (`#me/about`) | version, update (admin), Family admin tools (admin), "Signed in as" | rows |

While acting, Settings shows the admin's own settings under the bar; rows that write for a person (Sharing, SOS contacts, consent, ✎) are off with a lock icon + "View only" (W-28; the bar carries the reason once, F-9).

Acceptance: every current `Me.tsx` row label reachable (the lane counts them on the base sha); switch rows `role="switch"`; choice sheets `role="radiogroup"`; back from a group lands on `#me`; overview `scrollHeight` ≤ 850; no `.btn` wraps at 360.

### 1.6 Admin "View as": look **and act** (lane L6, critical; D-99 supersedes the read-only part of D-94 and rev 1-2)

**What stays from rev 1-2 (B-1..B-3, M-1, R-2, R-3):** `selfIdOrCached`, `selfIdNow`, `getMember().personId`, `SELF_ID`/`SELF_USER`, `adoptPerson`, `syncOwnProfile`, `migrateKv`, `flushPhoto`, `ensureConsent`, Health Connect (`sensors/health.ts`), reminders (`health/reminders.ts`), SOS (`sos/*`), `AuthGate`, `JoinFlow` are **not edited and never import `viewas`**. The acting id is memory only (module variable + `useSyncExternalStore`), never Dexie or localStorage; a cold start, sign-out (`onAuthChange(exitViewAs)` registered in `ViewAsBanner`'s mount effect) and Exit clear it; a switch happens only after `logViewAs(personId)` (RPC `admin_log_view_as`, 0029) returns true, so every session has its audit row and needs internet ("Needs internet to switch", once at the top of the picker, F-15). `useViewedVisibleIds()` from `visibleTo` (dynamic import of `admin/desk/viewAsData.ts`, r-4) fails closed to the acting person when the roster fails (R-3). The viewed person leaving `hdb.people` exits automatically (r-2). The roster offered in the picker is `useFamilyPeople()` for an admin (all people, RLS already returns them) **without the admin's own person** (r3-4); you cannot act as yourself.

**What changes (D-99):** while acting, the named display readers show the member **and** the named write entry points write **for** the member, passing the member's id explicitly. Every row still carries the admin as actor; RLS, not the client, decides.

Module `src/features/viewas/viewAs.ts` (final signatures; L0 stubs them):
```ts
// viewas/store.ts (dependency-free: no imports from the app; r3-3). sync/profile.ts imports ONLY this file.
export const getActingPersonId = (): string | null      // the member while acting, else null (never the admin's own id)
export const subscribeActing = (cb: () => void) => () => void   // used by the hooks in viewAs.ts
// viewas/viewAs.ts (hooks; imports store.ts, setup/useProfile, auth/session)
export async function enterActing(personId: string): Promise<boolean>   // admin only; false for the admin's own person id (r3-4); after logViewAs() true; resets the Health picker
export function exitActing(): void
export function useActingPersonId(): string | null      // acting id ?? useSelfPersonId(); subscribes (B-3)
export const useActing = (): { acting: boolean; personId: string | null; name: string }
export function useViewedVisibleIds(): Set<string> | null   // R-3 fail-closed
/** What this admin may do FOR the acting person, mirrored from the RLS rules below. Null when not acting. */
export function useActingCan(): { log: boolean; edit: boolean; rollcall: boolean; mood: boolean; reason: string | null } | null
```
`useActingCan` is computed **once at `enterActing`** (online by construction) from `listCarers()` (dynamic import, `admin/api`) + `getMember().role`, cached in the same memory module (m2-1); offline or a failed read with no cache = every flag false with the reason "Could not check your access. Exit and try again online." Flags: `log = self || writer` (can_write carer link), `edit = log || admin`, `rollcall = isFamilyMember && log` (0041:71 needs both, m2-7), `mood = log`. Reason when `log` is false: "You can see Mama but not log for her. Ask her (or an admin) to make you a carer with edit access." (one sentence, **keep**, privacy).

**Actor and permission per write path (read from `supabase/migrations`, L6 re-verifies on the base sha):**
| Write | Table / RPC | RLS allows for the admin when | Actor column | Entry point that passes the acting id | Lane |
|---|---|---|---|---|---|
| Take / Snooze / Took it | `meds_taken` insert (0003:88) | `is_self or is_writer_of` (**not** admin alone) | `marked_by` ← `auth.uid()` by trigger 0039; `marked_by_name` = admin's first name when not self | `takeDose(item, personId?)` / `takeMedication(…, personId?)` in `today/actions.ts` gain an optional explicit `personId`; **`asPerson` stays `selfIdOrCached()`** (B2-2). NextUp, QuickLog, SimpleToday pass `useActingPersonId()`. `health/reminderActions.ts` (notification Taken) never passes it. | L6 (actions.ts signatures), L1 (callers) |
| Log a reading | `readings` insert (0001:115) | `is_self or is_writer_of`, `confirmed_by` null or self | none today (Q2: 0044 `logged_by`) | `AddReadingSheet` already takes `personId` (acting default from `useHealthPerson`); `logBp/logSugar/logWeight(…, personId?)` optional param; `nudge/bpReminder.ts` (notification reply) never passes it | L2 (sheet), L6 (signatures) |
| How are you? mood + check-in, I'm OK | `activity` insert (0003:98) | `is_self or is_writer_of` | none today (Q2) | `checkIn(personId?)`, `logFeeling(f, personId?)`; Today I'm OK, QuickLog faces, SimpleToday faces and FacesRow I'm OK pass `useActingPersonId()` | L6 (signatures), L1 / L4 (callers) |
| Unwell alert | RPC `raise_mood_alert(p_person)` (0030:75) | self or can_write carer | RPC uses `auth.uid()`; `notify_family` also reaches the acting admin (0030:60) | `logFeeling(f, personId)` → `raise(personId)`; queued copy keyed `mood.unsent.<personId>` (M2-1); toast "Family told. Sent as Lloyd." (m2-6) | L6 |
| Storm roll call | RPC `rollcall_set(p_person, …)` (0041:67) | `is_family_member()` **and** `is_self or is_writer_of` | `rollcall.user_id` = `auth.uid()` | `StormCard.roll` uses `useActingPersonId()` instead of `useSelfPersonId()` | L1 |
| Water / Food / Plate / Salt | nutrition tables (0024:77) | `is_self or is_writer_of or is_admin()` | `created_by` default `auth.uid()` | `nutrition/actions.ts` loggers take explicit `personId`; `PlateSheet`, `WaterSheet`, `SaltSummary`, `NutritionScreen` pass the person from `useHealthPerson` (acting) | L2 (M2-2) |
| Move log | `activity` insert | `is_self or is_writer_of` | none | **yourself only**: `exercise/actions.ts` and `exercise/data.ts` keep `selfIdOrCached`; `MoveScreen` log button off while acting with "Move logs are yours only. Exit to log." | L2 (M2-2) |
| Family messages | `family_messages` | member | sender = `auth.uid()` | unchanged; composer shows "Sent as Lloyd" while acting (m2-6) | L4 |
| Medicines add/edit, Scan a paper, confirm records | records tables (0008:539, `records_editor` = self, writer or admin) | admin allowed | `created_by` ← `auth.uid()` by trigger 0008:382/405 | already explicit `personId` (MedicineEditor, ScanFlow PersonChips preselect the acting person) | L2 / L7 (ScanFlow preselect) |
| Profile edit (name, photo, about) | `people_profile` update via `saveProfile` → **`adoptPerson(personId)`** (sets `SELF_ID`) | `records_editor` | — | **disabled while acting** ("Exit to edit"): the only app path adopts the person and would re-create B-1. A split `saveProfileFor(personId)` without adopt is a later change if Lloyd wants it. | L4 (✎), L5 |
| Plan tasks / events / notes | `family_*` (0012:83) family-wide | member | `created_by = auth.uid()` | unchanged (no person scoping) | — |
| SOS | `sos_events` | self or writer | — | **always the admin** (`sos/useSelf` untouched); bar line "This SOS is from Lloyd, not Mama." (W-47, **keep**) | — |
| Sharing, SOS contacts, consent, sign-in | RPC / kv | — | — | **off while acting**, lock + "View only" | L5 |

Controls: each entry point reads `useActingCan()`; when the relevant flag is false the control is disabled with a lock icon and "View only" (W-28), and the bar shows the reason once. When true the control works and its toast names the member ("Saved for Mama.").

**No outbox backstop (B2-1).** `db.ts enqueue` is **unchanged** and imports nothing from `viewas` or `sync/profile`. While acting, the admin's phone keeps working as the admin: SOS (online and offline), `sos_events_update`, `sos_acks`, `phone_health`, `push_subscriptions`, Health Connect sync, his own reminder Taken, Move logs, BP-reply pulse and other dependants' reminders all queue as before. Correctness comes from (a) explicit ids at the named UI entry points, (b) the import allowlist, and (c) one narrow guard:
```ts
// sync/profile.ts adoptPerson (profile.ts:27), first line (L6's one hook line in that file; r3-1: the single choke point for saveProfile :85, savePhoto :146 and applyPulledProfiles :106)
import { getActingPersonId } from '../viewas/store' // store.ts has no imports, so no cycle (r3-3)
if (personId === getActingPersonId()) throw new Error('acting:profile') // the member's profile is never adopted; before any local write
```
Because `enterActing` refuses the admin's own id (r3-4), this guard never fires for the admin's own edits. Tests (`actingWrites.test.ts`, L6): while acting, `enqueue('sos_events', …)` succeeds online and with `getMember` rejecting (offline); `sos_acks` and `sos_events_update` pass; a `sensors/health` sync row and a `reminderActions` Taken for the admin reach the outbox; `saveProfile(acting)` and `savePhoto(acting)` throw before any Dexie write; `saveProfile(self)` and `savePhoto(self)` still work while acting; `enterActing(self)` returns false and writes no audit row; the picker list excludes the admin's own person.

Bar: "Acting as Mama · Exit" (amber, under the top bar, on every screen incl. the SOS screen); one reason line when `useActingCan()` has a false flag; W-46 "Every view is recorded in the family history." on the picker (**keep**). Toasts name the actor where it matters (m2-6): Unwell "Family told. Sent as Lloyd." (the alert also reaches Lloyd himself, `notify_family` 0030:60), messages "Sent as Lloyd", doses "Saved for Mama."

Tests (L6): vitest `viewAs.test.ts` (non-admin cannot enter; enter waits for `logViewAs`; exit clears; mounted Today re-renders), `viewAs.imports.test.ts` allowlist (`getActingPersonId`/`useActingPersonId`/`useViewedVisibleIds` imported only by: `viewas/**`, `screens/{Today,Health,Family}.tsx`, `today/{QuickLog,NextUp,SimpleToday,useDueMeds,useMyTakes,MyWeek}.tsx`, `safety/StormCard.tsx`, `health/{useHealthPerson,AddReadingSheet,LabsScreen}.tsx`, `nutrition/{PlateSheet,WaterSheet,SaltSummary,NutritionScreen}.tsx`, `exercise/MoveScreen.tsx` (gating only), `family/{ProfileCard,FacesRow,Calendar}.tsx`, `settings/**`, `inbox/MissedDoseActions.tsx`, `scan/ScanFlow.tsx`, `sync/profile.ts` (the one `adoptPerson` guard line, importing `viewas/store.ts` only); **forbidden importers asserted by name**: `today/actions.ts`, `nudge/**`, `health/reminderActions.ts`, `health/reminders.ts`, `sensors/**`, `sos/**`, `sync/**` other than the guard line, `privacy/**`, `setup/**`, `exercise/{actions,data}.ts`, `db.ts`), `actingWrites.test.ts` (B2-1 list above), `actions.test.ts` (`checkIn(p)`, `logFeeling(f, p)`, `takeDose(item, p)`, `logBp(…, p)` write `personId = p` when given and `selfIdOrCached()` when not; `raise(p)`; `mood.unsent.<p>` per person: queue Unwell for Mama, log own Great, Mama's stays and is sent by `retryUnsentMood`), `useActingCan.test.ts` (admin without a carer link → log false with the reason; can_write carer → true), `useDueMeds.test.tsx` (targets = acting; clocks 23:30/00:30). Playwright `admin-view-as.auth.spec.ts`: enter (one RPC call), bar on 5 tabs + SOS screen, Take a dose for Mama → server row `person_id = Mama`, `marked_by = Lloyd`, `marked_by_name = 'Lloyd'`; I'm OK for Mama → activity row for Mama; SOS hold → `sos_events.person_id = Lloyd`; exit → own Next up; reload → yourself. `s16-viewas-privacy.auth.spec.ts`: a member account has no row and sees self; an admin with no carer link sees "View only" on Take and the reason line. Opus reviews this lane first and re-audits after any fix.

**Migration (Q2, optional 0044_logged_by):** `readings` and `activity` have no actor column, so "who logged for Mama" is known only from the 0029 audit row at switch time. 0044 would add `logged_by uuid references auth.users` with a BEFORE INSERT trigger like 0039 (`coalesce(auth.uid(), new.logged_by)`), grants restated (ML-21), down file. Not required for D-99 to work; recommended for the audit trail.

### 1.7 Onboarding (lane L8; audit section 4; 5 screens, each ≤ 1 screen tall, Skip on 3-5)

| # | Screen | Exact copy | Action | Reuses |
|---|---|---|---|---|
| 1 | Welcome + who (one screen for both paths; O-4) | Jack art 112 px. h1 "Hi! I'm Jack Jack." Sub "Tap your name." Name list. Footer "Not on the list? Ask whoever sent the link." (W-48: JoinFlow's second intro is removed) | tap a name | `SignIn` welcome + `JoinFlow` list |
| 2 | PIN | h1 "Choose a 6-digit PIN" → "Type it again". Sub "Numbers you will remember." Switch "Open with fingerprint" (on) | PIN ×2 | `SetPin` |
| 3 | Reminders (permission in context; O-2) | h1 "Medicine reminders". Body "Bantay rings at each dose, even with the screen off." With medicines on file: list "Losartan 50 mg · 9:00 AM" + "Not right? Fix later in Health." Else "No medicines yet. Your carer can add them." | primary "Turn on reminders" (`steps.turnOnReminders`: notifications → exact alarms → battery). After Android stops prompting (two denials, m2-3) the button becomes "Open app settings" (app-settings intent) with "Android needs you to allow notifications there." Secondary "Not now" | `steps.turnOnReminders` (+ the settings fallback, L8), `notifyState`, `ldb.medications` |
| 4 | Where you are (O-3, A-17, W-52) | h1 "Where are you most days?" Body "For weather and quake warnings near you. Stays on this phone." Chips "Use my location", "Dampas, Tagbilaran", "Conel, GenSan" | one tap | `resolveLocation(true)`, `saveHome`, `HOME_ZONES` |
| 5 | First success (O-1) | h1 "Let's test it." Body "Tap below. Your phone rings in 5 seconds." Button "Send a test reminder". After it fires: `CheckDraw` + "It works. You're set, {name}." If step 3 was skipped or denied: "Turn on reminders first" with a button back to step 3 (m2-2). Consent line (A-15, M2-4; matches 0037 / D-80 / D-82): "Your records stay private until you or a family admin share them and the person accepts. Family admins can see them. Change this in Settings > Family and sharing." | "Send a test reminder", then "Open Today" | `phonecheck/probe.ts scheduleTestAlarm(5)` (alarm channel, permission check, `'no-permission'` result; not `steps.scheduleTest`, ML-10), `recordConsent` |

Progress: dots only, aria "Step n of 5" (W-49; O-5). System back steps back; on screen 1 it exits. Skip on 3-5 records nothing and leaves the step on the Today setup row (1.1 #11; `useSetupLeft()` exported from `setup/steps.ts`). Removed: the StartDone promise (W-50), the Bigger text and Simple mode switches (O-6, A-21; they live in Settings > Display), the "Step 1 of 3 · then Today" eyebrow. The Wizard's Sharing step copy (`Wizard.tsx:199`) and `StartDone` consent (`StartDone.tsx:65`) both change to the sentence above (A-15, M2-4); `StartDone.test.tsx:61` updated.

Asked later, in context: SOS contacts the first time "Hold for help" has no one ("Who should get your SOS text?"); photo / blood type / allergies as "Add …" chips on the ID card; Health Connect on the first Health visit ("Read steps and sleep from your phone?"); phone warnings on Safety.

Acceptance: each screen `scrollHeight` ≤ 700 at 390; the test reminder fires within 5 s on the Android build (G-2 live check) and the mock fires in e2e; Skip on 3 leaves "Reminders" in `useSetupLeft()`; copy matches this table verbatim; `onboarding.spec.ts` + new `s16-onboarding.auth.spec.ts`.

---

## 2. IA map and redirects

Router (`routes.ts`, L0):
```ts
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
`parseHash`: `me/<group>` → `{ tab: null, view: 'me' }`; `family/papers` → `{ tab: 'family', view: 'papers' }`. L0 owns `routes.test.ts` (its `#health/papers` assertion → `#family/papers`) and the `App.tsx:86` track line.

| Old | New | Who links there (fix in L7 unless named) |
|---|---|---|
| `#records`, `#family/records`, `#health/papers` | `#family/papers` | `inbox/build.ts:111`, `HealthLinks` (L2, deleted), `Health.tsx:99` (L2), `LabDetail.tsx:57` + `LabsList.tsx:77,93` (L2; the one source-paper link, D-100), `shell/AskSheet.tsx:50`, `scan/ScanFlow.tsx:218`, `scan/open.ts:12`. Jack `open_screen 'records'` needs no change (lands on the redirect) |
| `#health/library`, `/<key>` | `#discover/learn/library[/<key>]` | `discover/learn/Screen.tsx:56` (L3), `health/library/Article.tsx:33` + `Library.tsx` back link (L3) |
| `#health/videos` | `#discover/watch` | `HealthLinks.tsx:64` (L2) |
| `#family/people` | `#family` | `Me.tsx:136` (L5), `CarerCards.tsx:133`, `People.tsx` (deleted, L4) |
| `#me` | `#me` + `#me/<group>` | `TopBar.tsx:64` label (L5); `MedDetail.tsx:147` → `#me/alerts`; `MedicalId.tsx:8,45` → `#me/family`; `PrivacyScreen.tsx:67` → `#me` |
| Breathe | same hash, `history.pushState({ bantayBreathe: true })` | L1 |

e2e owners (one each): L1 `today-auth`, `today`, `s13-t-today.auth`, `s14-t2-today.auth`, `s7-today-shots.auth`, `s12-storm-shots.auth`, `s5-alerts`, `s1-alerts-shots`, new `s16-today.auth`. L2 `health-overview`, `health-auth` (+ mock), `health-a11y`, `health-v6`, `health-labs`, `s14-l-labs.auth`, `w2-health-shots(.auth)`, `s13-h-shots.auth`, `medicines`, `nutrition-auth`, new `s16-health.auth`. L3 `s13-d-discover`, `s12-learn`, `media`, `s12-play`, new `s16-discover`. L4 `family-plan`, `family-messages`, `family-report`, `records`, `records-db`, `s14-f2-family.auth`, `s13-f-shots.auth`, new `s16-family.auth`. L5 `profile-auth`, `sensors`, `s6c-lock.auth`, new `s16-settings.auth`. L6 `admin-view-as.auth`, new `s16-viewas-privacy.auth`. L7 `subpage-header`, `ask-sheet`, `scan`, `s14-j-jack`, `s12-shell`, `s12-shell.auth`, `s12-f3-shots`, `tabbar-overlap`, `no-sideways-scroll`, `s12-core.auth`, `s12-polish`, `shell`, `admin`, `auth`, `phone-warnings`, `s12-marked-by.auth`, `s12-sharing.auth`, `s16-narrow-text.auth` (ROUTES updated for moved routes; D-95 regression only, not a design gate), new `s16-redirects`, new `s16-buttons-360`. L8 `onboarding`, `s6a-onboard-shots.auth`, `s12-join.auth`, new `s16-onboarding.auth`. L9 `look`, `weather-scene`, new `s16-motion`. L0 `routes.test.ts`.

---

## 3. Accent tokens (D-96, F-2, L-9; v6 tokens unchanged)

Five hue families. Light = fill on heroes and tiles. Dark = **no fill**: `--card` surface, icon chip `color-mix(in srgb, var(--hue-ic) 18%, var(--card))`, 3 px top edge and kicker in `--hue-ic`. Ratios computed (WCAG, sRGB); ink `#1D1F1C` / muted `#5E625B` light, `#EEF0EA` / `#A7B0A6` dark on `--card #18231C`.

| Family | Sections | Light fill | Light icon | Ink / icon / muted on fill | Dark icon (on `--card`) | Icon on card / ink on card / muted on card |
|---|---|---|---|---|---|---|
| blue | Readings, Progress, Weather, News | `#DCEBF0` | `#1F5A6E` | 13.6 / 6.3 / 5.1 | `#8CC6DA` | 8.7 / 14.1 / 7.3 |
| green | Medicines, Move & food, Body, Listen, Play, Calm (breathing) | `#DCE5D8` | `#2E5A3F` | 12.8 / 6.1 / 4.8 | `#8FD1A6` | 9.1 / 14.1 / 7.3 |
| lilac | Labs | `#E6E0F0` | `#4F3F80` | 12.9 / 6.9 / 4.8 | `#C2B5EA` | 8.6 / 14.1 / 7.3 |
| amber | Family, Learn, Discover pick | `#F3E4CC` | `#7A4E05` | 13.3 / 5.8 / 5.0 | `#F0B54C` | 8.8 / 14.1 / 7.3 |
| terracotta | Watch, Video | `#F6DFD6` | `#9A3B22` | 13.0 / 5.4 / 4.9 | `#F2A58F` | 8.1 / 14.1 / 7.3 |

Tokens `--hue-blue`, `--hue-blue-ic`, … in all three theme blocks of `tokens.css` (light fill; dark fill = `var(--card)`). Alerts keep `--red` / `--warn-bg`. The tightest are muted on green (4.81) and lilac (4.83) light. In dark the icon's real background is the 18% chip (`color-mix(in srgb, var(--hue-ic) 18%, var(--card))`), not `--card`: icon on chip = 5.67 (terra) … 6.10 (green), all ≥ 3 (m2-4). `contrast.test.ts` asserts `>= 4.5` text and `>= 3` icons on unrounded values in both themes, **icon against the chip colour** in dark (ML-39), and a layout test asserts no two adjacent tiles share a family on Health and Discover.

---

## 4. Data needs

- **Required by the app: none.** Acting writes use existing policies and actor triggers (0039 `marked_by`, 0008 `created_by`, 0041 `rollcall.user_id`). Acknowledge is local kv; View as is in memory + 0029 audit.
- **Migration 0044_logged_by (D-102 Q2; number reserved; owner L6; applied only with Lloyd's OK at release):** `alter table public.readings add column if not exists logged_by uuid references auth.users (id) on delete set null;` same on `public.activity`; one BEFORE INSERT trigger per table in the 0039 pattern (`new.logged_by := coalesce(auth.uid(), new.logged_by)`), function `security definer set search_path = ''`, grants restated (revoke from public, anon; ML-21); `0044_logged_by.down.sql` drops the triggers, functions and columns. **RLS unchanged** (no policy reads the column). The app sends nothing for it (the trigger stamps it) and reads it only in the admin desk "who logged" line when present, so a server without 0044 keeps working. Rehearsal step (L6, before its report): `supabase/tests/chain_rehearsal` + `rls_rehearsal.sql` in WSL Postgres 18 with 0001-0044, then an insert as a can_write carer shows `logged_by = carer`, an insert as self shows `logged_by = self`; quote the exit codes. Release block: 0044 is a separate, last step that runs only after Lloyd types "apply 0044".
- **RLS impact: none.** An admin without a can_write link is refused by RLS for doses, readings, activity and mood; roll call needs `is_family_member()` **and** self-or-writer (0041:71); the UI says so; records and nutrition tables already allow admins.
- **Edge functions: none.** Push copy unchanged; roll call does not depend on push (A-10).

---

## 5. Lanes (multi-lane build; L0 by the orchestrator + 9 lanes)

Contract file `docs/session-16/contracts.md` (from CONTRACT-TEMPLATE) with C-1..C-7 fixed before launch; every brief carries the LIVING CHECKLIST line and the base sha; fix rounds are new runs with only the failing lanes.

### L0 Base (orchestrator, one commit before launch)
Files: `src/styles/tokens.css` (section 3, three blocks), `src/features/shell/routes.ts` + `routes.test.ts`, `src/App.tsx` (track line; `<ViewAsBanner />` import after `<OfflineBar />`), `src/features/look/{HeroCard,Tile,Row,AlertCard}.tsx`, `look/cards.css`, `look/index.ts`, `look/contrast.test.ts`, stubs `src/features/viewas/{viewAs.ts,ViewAsRow.tsx,ViewAsBanner.tsx}` (signatures from 1.6; `getActingPersonId` → null, `enterActing` → false, `useActingPersonId` → `useSelfPersonId()`, `useActing` → `{ acting: false, personId: null, name: '' }`, `useViewedVisibleIds` → null, `useActingCan` → null), stub `src/features/setup/steps.ts` export `useSetupLeft(): { left: string[] }` (L8 fills), stubs `src/features/look/BreathOrb.tsx` (`{ moment: Moment; reduced?: boolean }` → static disc + phase label + count) and `src/features/look/CheckDraw.tsx` (`{ size?: number; onDone?: () => void }` → static tick) with their final props (M2-5; L9 replaces the bodies; L1 and L8 import them **by file path**, never via `look/index.ts`), `e2e/s16-buttons-360.spec.ts` (shared helper, routes list), `docs/session-16/contracts.md`. Gates: `tsc` 0, vitest green, `shell` + `no-sideways-scroll` green, commit `feat(s16): base tokens, cards, redirects, stubs`.

**C-1 Cards (L0 owns; change requests go to the orchestrator):**
```tsx
export type Hue = 'blue' | 'green' | 'lilac' | 'amber' | 'terra' | 'none'
export interface CardAction { label: string; href?: string; onClick?: () => void; disabled?: boolean; lockReason?: string }
/** ≤ 1 per tab; one primary action; `href` makes the whole card the link (chevron drawn, no button). */
export function HeroCard(p: { hue: Hue; icon: IconName; kicker?: string; title: string; body?: ReactNode; href?: string; action?: CardAction; onClose?: () => void; closeLabel?: string; media?: ReactNode; testId?: string; children?: ReactNode }): JSX.Element
/** 2-column door or stat: whole tile is the target, ≥ 96 px, no buttons inside. */
export function Tile(p: { hue: Hue; icon: IconName; label: string; value?: string; spark?: number[]; href?: string; onClick?: () => void; testId?: string }): JSX.Element
/** 56/72 px list item: leading icon or avatar, title, one sub, trailing chevron OR one control. */
export function Row(p: { icon?: IconName; avatar?: ReactNode; title: string; sub?: string; href?: string; onClick?: () => void; control?: ReactNode; testId?: string }): JSX.Element
/** Full-width red or amber: icon, title, ≤ 3 lines, one action, optional close. */
export function AlertCard(p: { tone: 'red' | 'amber'; icon: IconName; title: string; body?: ReactNode; action?: CardAction; onClose?: () => void; closeLabel?: string; testId?: string }): JSX.Element
/** D-101: one per tab. `scene` is an aria-hidden layer stack (WeatherScene, Silhouette, radial backdrop, art); `scrim` darkens it for white text; `inkOnScene` keeps ink text (Health body hero). `jack` is a JACK_ALT name drawn in its own cell (D-103), never over a control. */
export function SceneHero(p: { scene: ReactNode; scrim?: boolean; inkOnScene?: boolean; kicker?: string; title: ReactNode; body?: ReactNode; href?: string; action?: CardAction; secondary?: CardAction; jack?: JackName; jackSize?: 56 | 96 | 112; compact?: boolean; testId?: string; children?: ReactNode }): JSX.Element
```
Rules: icon + label required; `disabled` with `lockReason` draws the lock + "View only" (W-28); dark theme draws no fill (L-9); close button 48 px.

**C-2 Tokens:** section 3 names; `.card[data-hue=<h>]` fill in light, `--card` + chip/edge in dark.
**C-3 Routes:** redirects and `parseHash` in the base; lanes never edit `routes.ts` or `App.tsx` beyond C-5.
**C-4 Screen rules:** section 1 shared rules (L-1..L-11) verbatim.
**C-5 Hook lines (one each, `// S16-<lane>`):**
| File | Anchor | Lane | Hook |
|---|---|---|---|
| `src/App.tsx` | `title` ternary `'Me'` | L5 | `'Settings'` |
| `src/features/viewas/ViewAsBanner.tsx` | mount effect | L6 | `onAuthChange(exitActing)` |
| `src/features/sync/profile.ts` | `adoptPerson` first line (`:27`) | L6 | `if (personId === getActingPersonId()) throw new Error('acting:profile')`, importing from `viewas/store.ts` (dependency-free; the only `viewas` import in `sync/`; r3-1, r3-3) |
| `src/features/sos/SosScreen.tsx` | mount/unmount effect | L9 | `useEffect(() => setSosScreenOpen(true) … return () => setSosScreenOpen(false)` from `look/motion.ts` (not `viewas`); covers all four mounts: `Today.tsx:66`, `SimpleToday.tsx:76`, `Safety.tsx:49`, `assistant/Assistant.tsx:372` (r3-2) |
| `src/features/today/actions.ts` | exported logger signatures | L6 | optional trailing `personId?: string` on `checkIn`, `logFeeling`, `takeDose`, `takeMedication`, `logBp`, `logSugar`, `logWeight`; `asPerson` unchanged (B2-2); `mood.unsent.<personId>` (M2-1) |
| `src/features/safety/StormCard.tsx` | `useSelfPersonId()` | L1 | `useActingPersonId()` |
| `src/features/today/NoticeStack.tsx` | setup row | L1 | reads `useSetupLeft()` (L8 stub in L0) |
| `src/features/today/BreathSheet.tsx` | orb slot | L1 | `import { BreathOrb } from '../look/BreathOrb'` (L0 stub, L9 body) |
| `src/features/setup/FirstSuccessStep.tsx` | tick | L8 | `import { CheckDraw } from '../look/CheckDraw'` (L0 stub, L9 body) |
| `src/features/weather/WeatherScene.tsx` | render | L9 | every animation stopped (static positions) while `useSosActive()`, the `sosScreenOpen` flag or `#safety*` (M2-3); no canvas anywhere on Today (R2). `look/Sky.tsx` (App/SignIn) is untouched |
**C-6 Invariants:** each alert title once on Today and Simple Today; the acting id is read only by the allowlisted files and never by `today/actions.ts`, `nudge/**`, `health/reminder*`, `sensors/**`, `sos/**`, `privacy/**`, `setup/**`, `exercise/{actions,data}.ts`, `db.ts`; `db.ts enqueue` is unchanged and the admin's own rows always queue while acting; the member's profile is never adopted (`saveProfile` guard); SOS always acts as the signed-in person and is never refused; no WebGL canvas while SOS, IncomingSos or Safety is up; IncomingSos / SOS screen never closable; a closed warning stays on Safety and its roll-call row stays on Today; every current Me row reachable; every old hash lands; no `.btn` wraps at 360; each screen within its L-10 budget.
**C-7 Composition (ML-41):** stacks TopBar + OfflineBar + ViewAsBanner + alerts-off card + WarningCard + NoticeStack can appear together on Today; `JackFab` on every tab root (never removed; mock frames never set `data-nofab`); one `JackArt` per screen, none on alerts, storm, FamilyNotice, IncomingSos, SOS (D-91); glass tab bar / top bar / sheets (D-71); checked at 360 and 390.

**C-8 Feature parity (section B of V11-REGRESSIONS.md; every row present in the merged build or covered by the cited decision):**
| Live feature | Where it lands | Owner |
|---|---|---|
| Weather scene, hourly strip, action box + Jack | 1.1 row 2 (Scene hero on `WeatherScene`) | L1 (card), L9 (scene layers) |
| Next up Took it / Skip / In 10 min / multi-pick / done morph + Jack well-done | 1.1 row 6 | L1 |
| Quick log 6 tiles + More sheet + salt line, "How are you?" | 1.1 row 7 | L1 |
| SOS hold, SelfCare, PlanToday, SeeWeek, My week | 1.1 rows 8-10 (frames `today-week`) | L1 |
| AlertBand / StormCard content incl. source, All warnings, Go-bag, Track the storm | 1.1 row 4 | L1 |
| AlarmFixedToast, IncomingSos (carer SOS banner) | 1.1 row 0 (frames `today-alarmfix`, `lock-sos`) | L1 (unchanged) |
| AlertsBanner, UpdateCard (update sheet), PwaBanner, NearbyList, WeekLine | 1.1 row 11 NoticeStack + rows | L1 |
| Jack button on every tab + Ask sheet | C-7 | L0 (unchanged), L7 (AskSheet hrefs) |
| Health PersonChips, Kpis, MedicinesSummary, LabsRow, insight headline, NudgeCard rings + streak, BodyMap anatomy, LatestList, MedReview | 1.2 | L2 |
| Health Papers / Library / Videos | Family / Discover (D-100, N-21) | L4 / L3 |
| Discover PickCard, SeasonCard, 5 subs, Learn 5 tiles incl. Your benefits, Watch posters | 1.3 | L3 |
| Family check-in, roll-call rings + glyphs + legend, Messages, Plan, CarerCards, Report, Member page, Memories | 1.4 | L4 |
| Me rows (all), 8 PM carers digest copy, call permission row | 1.5 | L5 |
| Medical ID lock-screen switch + preview | Medical ID screen (unchanged) | L7 (hrefs only) |
| Safety hub, SOS, first aid, go-bag, IDs | unchanged | — |
| Glass tab bar, top bar, sheets (D-71) | shell (unchanged); mock draws it | L0 check |

### Lane table
| Lane | Owns | Depends | Builder | Reviewer | Port |
|---|---|---|---|---|---|
| **L1 Today** | `screens/Today.tsx`, `today/{WarningCard,NoticeStack,BreathSheet,SelfCare,WeatherCard,SimpleToday,QuickLog,NextUp}.tsx`, `today/{warnAck.ts,today.css,selfcare.css,breath.css}`, `notify/AlertCardToday.tsx` (+test), `safety/StormCard.tsx` (kept; `StormBlock` export; "I'm OK" wording P-8; acting id), `today/AlertBand.tsx` (kept), today tests it touches, `family/stormrollcall.test.tsx`; e2e per section 2 | L0, L9 (`BreathOrb`) | Sonnet | Opus | 4411 |
| **L2 Health** | `screens/Health.tsx`, `health/{BodyHero,GlanceGrid,HealthBrowse}.tsx` (version B only, D-102; no version A files), `health/HealthLinks.tsx` (deleted), `health/{LabsScreen,LabsList,LabDetail,MetricScreen,useHealthPerson,labsLogic}.ts(x)`, `health/AddReadingSheet.tsx` (acting default), `nutrition/{actions.ts,PlateSheet.tsx,WaterSheet.tsx,SaltSummary.tsx,NutritionScreen.tsx}` (explicit `personId`, M2-2), `exercise/{actions.ts,data.ts,MoveScreen.tsx}` (yourself only; log button off while acting, M2-2), `health/health.css`, health + nutrition + exercise tests; e2e per section 2 (+ `exercise-auth`, `nutrition-auth`) | L0 | Sonnet | Opus | 4412 |
| **L3 Discover** | `screens/Discover.tsx`, `discover/**`, `health/library/{Library,Article}.tsx` (back-link lines only), `discover.css`, discover tests; e2e per section 2 | L0 | Sonnet | Opus | 4413 |
| **L4 Family** | `screens/Family.tsx`, `family/{ProfileCard,FacesRow,Calendar,NeedYouNow,Papers}.tsx`, `family/People.tsx` (deleted), `family/calendarLogic.ts`, `family/family.css`, family tests; e2e per section 2 | L0 | Sonnet | Opus | 4414 |
| **L5 Settings** | `screens/Me.tsx`, `settings/**`, `shell/TopBar.tsx` (label), `privacy/PrivacyScreen.tsx` (ConsentNotice mount), `App.tsx` title line; e2e per section 2 | L0 | Sonnet | Opus | 4415 |
| **L6 View as, look and act** (critical) | `viewas/**` (+ `viewAs.test.ts`, `viewAs.imports.test.ts`, `actingWrites.test.ts`), `today/actions.ts` (optional `personId` params, per-person `mood.unsent`, "Sent as" toast) + `actions.test.ts`, `sync/profile.ts` (the one `adoptPerson` guard line) + its test, `viewas/store.ts` (dependency-free), `today/useDueMeds.ts` + test, `today/useMyTakes.ts` + test, `today/MyWeek.tsx` if touched, **`supabase/migrations/0044_logged_by.sql` + `.down.sql`** (D-102 Q2; rehearsed, never applied by the lane), `admin/desk/**` "who logged" line reading `logged_by` when present; e2e `admin-view-as.auth`, `s16-viewas-privacy.auth`. **Does not touch** `db.ts`, `records/useHealthData.ts`, `setup/useProfile.ts`, `sos/*`, `sensors/*`, `privacy/*`, `nudge/*`, `health/reminder*` | L0 | Sonnet | **Opus first, re-audit after any fix** | 4416 |
| **L7 IA sweep** | `inbox/build.ts`, `shell/AskSheet.tsx`, `scan/{ScanFlow.tsx,open.ts}` (hrefs + preselect the acting person), `family/CarerCards.tsx` (hrefs), `inbox/MissedDoseActions.tsx` (hrefs + `useActingCan` gating), `medid/MedicalId.tsx` (hrefs), `health/MedDetail.tsx:147`; e2e per section 2 incl. `s16-redirects`, `s16-buttons-360` routes, `s16-narrow-text.auth` ROUTES | merges last | Sonnet | Opus | 4417 |
| **L8 Onboarding** | `screens/SignIn.tsx` (welcome copy), `screens/Onboarding.tsx`, `setup/{JoinFlow,SetPin,StartDone,Wizard}.tsx`, new `setup/{RemindersStep,WhereStep,FirstSuccessStep}.tsx`, `setup/steps.ts` (`useSetupLeft`, `scheduleTest`), `setup/onboarding.css`, setup tests incl. `StartDone.test.tsx`; e2e `onboarding`, `s6a-onboard-shots.auth`, `s12-join.auth`, new `s16-onboarding.auth` | L0 (stub `useSetupLeft`) | Sonnet | Opus | 4418 |
| **L9 Motion and graphics** | `weather/WeatherScene.tsx` + `weather/scene.ts` + `weather/scene.css` + `weather/scene.test.ts` (**extend the shipped scene**, R2: moon + glow, two-depth cloud parallax with negative `animation-delay`, heat shimmer band, reduced-motion static positions, IntersectionObserver + `visibilitychange` pause, static while `sosScreenOpen` / `useSosActive()`; scrim gate extended to the moon and heat glows), **no new `look/Sky.tsx`** (the existing one stays for App/SignIn, untouched), `look/Aurora.tsx` (React Bits copy, WebGL2 gate; never on Today in this release), `look/BreathOrb.tsx` + `orb.css` (GSAP timeline; replaces the L0 stub body, same props), `look/Ring.tsx` (SVG stroke-dashoffset), `look/CheckDraw.tsx` (replaces the L0 stub body), `look/useReducedMotion.ts` + `look/motion.ts` **extended** with the capability check, off-screen pause, DPR cap and the `sosScreenOpen` flag (no new `motionBudget.ts`, m2-5), `sos/SosScreen.tsx` (one mount/unmount hook line setting that flag, r3-2), `src/assets/illustrations/*.svg` (CC0, with `LICENSES.md`), `look/motion.test.tsx` (incl. the chunk-size check over `dist/` after `vite build`; no new script, m2-5); e2e `look`, `weather-scene`, new `s16-motion` | L0 | Sonnet | Opus | 4419 |

No two lanes share a file; no file moves. `StormCard.tsx` is L1 only (wording, StormBlock, acting hook). `today/actions.ts` and the `adoptPerson` guard line are L6 only; the `SosScreen.tsx` flag line is L9 only. `useHealthPerson.ts`, nutrition and exercise files are L2 only. `BreathOrb.tsx` / `CheckDraw.tsx` are L0 (stub) then L9 (body); L1 and L8 only import them. `App.tsx` lines split by C-5.

Merge order: L0 → L9 → L6 → L3 → L2 → L1 → L4 → L5 → L8 → L7. After each merge: tier-0 smoke (`shell`, `no-sideways-scroll`), the lane's specs, `tsc`, duplicate scan.

### Per-lane test plan
Every lane: `tsc` 0; vitest green; `npx playwright test <own specs> --repeat-each 2 --workers 2` with `PW_PORT=<lane port>`; `s16-buttons-360` on its routes; `scrollHeight` budget assertion with the named fixture; shots 390×844 light + dark compared with the v12 frame (ML-37), written only with `S16_SHOTS=1`; **parity gate (R-all):** open `docs/session-16/shots/live/<tab>-light.png` and `<tab>-dark.png` for every tab the lane touches, list in `risks` anything the lane's screen shows less richly than live (art, scene, rings, links, controls), and tick every C-8 row the lane owns in `checklist` (a missing row with no cited decision = status partial); **D-103 gate:** apply every `ICON-JACK-AUDIT.md` finding for files the lane owns, report each as `checklist: {id: 'D-103:<finding>', ok}` and prove it with a 390 and 360 shot of that moment (no overlap with a control or badge, no clipping, size from the shared rule); shots compared with the **v12 frame named in the brief** (artifact K7J3qEr6Zv6GMb3mqz5ci6 v4 = contract); `git status --porcelain` empty (ML-32); fixed clocks 23:30 / 00:30 local where a day matters (ML-38).
- **L1:** `warnAck`, `WarningCard` (once; StormBlock; acked keeps the roll-call row; no `air`; "I'm OK" label), `NoticeStack` (alerts-off first; setup row never hides), `BreathSheet` (phases; back; 3 faces), `weatherCard` (no warning line on Today/Simple), `quickLog` (I'm OK button; acting gating), `nextUp` (acting gating). Playwright `s16-today.auth`: order, close + toast, budget, 360 buttons.
- **L2:** `health-screen` (version B order; empty = one hero + grid; hue adjacency; no version A file exists), `LabsList`/`LabDetail` (1.2.7), `useHealthPerson` (acting default; `ownId` = admin; `canMark` follows `useActingCan`), `AddReadingSheet` (writes `personId` = acting). Playwright `s16-health.auth` + labs specs vs v9 frames.
- **L3:** `overview` (hero + row + 5 tiles), Learn 2×2, Watch poster row, redirects from old hashes. Playwright `s16-discover`.
- **L4:** `ProfileCard` (fields = Medical ID; "Add …" chips; ✎ disabled while acting), `NeedYouNow` (absent when empty; second when not), `FacesRow` (I'm OK; stats only when readable; filtered while acting), `calendarLogic` (week default; dose rows = `medSlots`/`pickSlot`). Playwright `s16-family.auth`.
- **L5:** `overview` (every Me row reachable; 72/64 px rows), `ChoiceSheet` (radiogroup), acting locks. Playwright `s16-settings.auth`.
- **L6:** as in 1.6, plus the 0044 rehearsal in section 4 (exit codes quoted; the migration is never applied by the lane).
- **L7:** `s16-redirects`, `s16-buttons-360` over the IA map, `s16-narrow-text.auth` ROUTES, updated specs green.
- **L8:** copy-table vitest (verbatim strings), `useSetupLeft` after Skip, `scheduleTest` 5 s with a fake timer. Playwright `s16-onboarding.auth`: 5 screens, back behaviour, budget.
- **L9:** `motion.test.tsx` (reduced motion → static; no WebGL2 → static poster; off-screen → paused; SOS active / `#safety*` → no `<canvas>`; chunk sizes in `dist/` ≤ the budgets in section 8), `BreathOrb` scale at fixed moments, `Ring` dashoffset math. Playwright `s16-motion`: Today renders with WebGL disabled; hold SOS with Aurora enabled → no `<canvas>` in the DOM (M2-3).

Final (orchestrator): full suite on the integration tip, Opus whole-branch review, `retro.mjs` with every run journal, APK 2.7.0 release block (D-50), live phone check of acting writes, the test reminder and the orb (G-2).

---

## 6. Risks and open questions for Lloyd

**All open questions are closed (rev 9):** Q1 v9 labs footer, Q2 migration 0044 written and rehearsed, applied only with Lloyd's OK at release, Q3 SOS and the alarm toast above weather, Q4 Health version B, Q6 budgets Today ≤ 1150 / Health B ≤ 1250 / acting ≤ 1350 / Family ≤ 1650 (empty ≤ 1500, acting ≤ 1550) / Weather ≤ 1900 (D-102); Q5 Scene hero (D-101); icon and Jack clean-up (D-103). Nothing waits on Lloyd before launch except his "apply 0044" at release.

Decided, not asked: View as is look and act (D-99); I'm OK on Today and Family (D-100); Papers only under Family (D-100); sharing copy = D-86 behaviour; profile edit is off while acting (the only path adopts the person); Memories kept as a row; Rive Jack is a later phase.

Risks: (R1) L7 merges last and touches 20 specs. (R2) Acting writes depend on Lloyd being a can_write carer; an admin without the link sees "View only" with the reason, by design. (R3) With no outbox backstop, a future caller that forgets the explicit `personId` writes for the admin, never for the member (safe direction); the allowlist test and the per-entry-point tests are the guard. (R4) Local acknowledge is per phone. (R5) WebGL Aurora is not on Today in this release; if used elsewhere later it is gated with a static fallback; the APK is checked on the slowest family phone before release. (R6) 0044 applied at release changes nothing for the app (trigger-stamped, tolerant reads), but the release block keeps it as the separate last step so a refusal by Lloyd leaves 2.7.0 complete.

---

## 7. Mockup v12 (approved: artifact K7J3qEr6Zv6GMb3mqz5ci6 version 4 = the UI contract, D-101; frames in `docs/session-16/mockup-v11.html` group "v12"; the `health-A` frames are reference only, D-102). The brief below is what v12 drew; each lane's brief names its frames.
(390×844 light + dark; each frame note states its measured height and its motion note; **no frame sets `data-nofab`: the Jack button shows on every tab frame**; the tab bar, scrolled top bar and sheets are drawn with `--glass-bg` + blur 20 px, D-71)

Weather Scene hero frames (R1): day partly (calm, expanded 232), day rain (compact 196, with Next up), night clear (moon + stars), storm (no Jack, forecast copy), Danger heat (shimmer, no Jack), reduced-motion static; each light + dark. "Current app · not changed by this redesign" group restored (R14): Weather screen, Storm tracking, Today offline, dose-done morph, alarm-fixed toast, Quick log sheet, My week, carer SOS banner (`lock-sos`), Messages, thread, Plan, Add, nudge hub, update sheet, Member page, Report. `v11-hues` gets a sixth swatch "Scene" with the 4 SKY pairs + SCRIM and their white-text ratios.


1. `today-s16` calm (target ≤ 1050): weather hero, Quick log row with I'm OK, SOS, breath row, plan, More with the setup row. Motion: gradient sky by time; reveal stagger 60 ms.
2. `today-s16-alertsoff`: the amber alerts-off card under weather with "Turn on".
3. `today-s16-quake` (≤ 1400): WarningCard with close; FamilyNotice row. Motion: none on alerts.
4. `today-s16-storm` (≤ 1500): WarningCard storm variant, StormBlock = "I'm OK" / "I need help" + 4 Do-now rows, status line.
5. `breathe-pick`, `breathe-run` (orb with "HOLD 3", 02:51), `breathe-mood` ("Worse / Same / Better"). Motion: orb timeline per phase; reduced-motion variant drawn.
6. `health-A` stacked heroes (≤ 1300) and `health-B` compact grid (≤ 1050), same data; `health-empty` (one hero + grid); `health-acting` (bar "Acting as Mama", chips filtered, Take enabled for a carer).
7. `health-labs`, `health-labs-empty`, `health-labdetail` (v9 kept, items 1-7 marked; footer copy per Q1).
8. `discover-s16` (≤ 800), `discover-learn` (2×2), `discover-watch` (poster row). Motion: parallax on the pick illustration (CC0 Open Peeps).
9. `family-s16` (≤ 1450): dense ID card (56 avatar, name·age·blood, allergy chip, stat strip, Show to a doctor, Scan / Papers 2), NeedYouNow rows, faces row with I'm OK, week strip + Month toggle, Memories row; `family-s16-empty-needs` (NeedYouNow absent); `family-faces-sheet`; `family-papers` ("Confirm 2" / "Fix"); `family-acting` (faces filtered, "Showing only who Mama can see.").
10. `medid-dense`: the ID card half-empty with "Add blood type" / "Add allergies" chips.
11. `settings-s16` (≤ 850): account row, Simple mode row, View as row, 8 group rows; `settings-display` (choice sheet open); `settings-alerts`; `settings-acting` (locked rows with "View only").
12. `viewas-pick` ("Needs internet to switch" once; "Every view is recorded in the family history."), `viewas-bar` on Today with a reason line for an admin without edit access, `viewas-sos` (SOS screen with the bar: "This SOS is from Lloyd, not Mama.").
13. `onboard-1..5`: Welcome + who, PIN, Reminders, Where you are, First success (before and after the ring, check-draw). Motion: one slide transition; check-draw 600 ms.
14. Dark versions of 1, 6, 9, 11 showing the no-fill rule (chip + top edge + kicker).

---

## 8. Motion and graphics (lane L9; from RESEARCH-GRAPHICS.md)

Principles: CSS first, GSAP second (already in `look/gsap.ts`), WebGL opt-in behind a capability check added to the existing `look/useReducedMotion.ts` / `look/motion.ts` (m2-5); every effect lazy-loaded, stopped on `prefers-reduced-motion`, paused off-screen (IntersectionObserver) and when the tab is hidden, DPR capped at 1, with a static fallback; **no canvas at all while the SOS screen, Simple-mode SOS or a live IncomingSos is up, or on `#safety*`** (M2-3: `Sky` reads `useSosActive()`, the `sosScreenOpen` flag in `look/motion.ts` that `SosScreen.tsx` sets on mount and clears on unmount (L9's one hook line, r3-2; covers Today, SimpleToday, Safety and Jack's SOS), and the hash); all assets self-hosted (offline).

| Place | Build | Budget (KB gz, lazy chunk) | Fallback |
|---|---|---|---|
| Today weather Scene hero (`weather/WeatherScene.tsx`, shipped) | Keep every shipped layer (SKY by time of day, sun + glow, stars, clouds, fog, rain streaks, lightning one double flash / 7 s, heat glow). Add: moon 40 px `#F4F1E6` + 28 px glow `rgba(244,241,230,.35)` for clear/partly nights; clouds at two depths drifting 70 s / 110 s with negative delays; heat shimmer = a 40%-height bottom band of 2 px `repeating-linear-gradient` lines, `translateY` ±2 px / 1.6 s, opacity .18, `isHot` only; static positions under reduced motion (sun/moon in place, clouds 20% / 60%, 8 static streaks); pause off-screen and on hidden page; static during SOS | ~1 (moon + shimmer CSS) | static frame of the same condition |
| Health BodyHero scene | shipped `anatomy/Silhouette` + `BodyMap` glows; glow pulse 3 s on a metric that needs a look; mini rings draw 600 ms | 0 | static glow |
| Breathe backdrop | radial green gradient on the sheet, lightness ±6% with the orb phase (GSAP on a CSS variable); night SKY pair after sunset for Sleep | 0 | static gradient |
| Discover pick / season | `JackArt` by pick type with 8 px parallax; season gradient (rain streaks reuse `wxs-rain`; Undas candle glow) | 0 | static |
| Family faces / ID card | ring draw 400 ms on check-in (`look/Ring.tsx`); ID card amber-to-cream gradient + 1 px inner edge; no moving background | 0 | static ring |
| Night-clear sky accent (optional, **not in v12 mocks and not on Today in this release**) | React Bits `Aurora` or `SoftAurora` copied as one file (MIT + Commons Clause), WebGL2 only, half-resolution canvas, high-end devices only (`navigator.hardwareConcurrency >= 4` and `deviceMemory >= 4` when known); never on Safety or SOS; the CSS moon + stars cover night | ≤ 12 | none (plain gradient) |
| Breathing orb (`look/BreathOrb.tsx`) | 4 nested rings + disc; GSAP timeline driven by `momentAt` phases (scale 0.55→1 in, hold, 1→0.55 out, rest), label "HOLD" + count inside | GSAP core already shipped; +2 | static disc + count text |
| Progress rings (Health glance, Papers badge) | SVG circle, `stroke-dashoffset`, GSAP or CSS transition | 0 | instant fill |
| Sparklines | inline SVG polyline | 0 | — |
| Success (test reminder, dose taken, check-in) | `look/CheckDraw.tsx`: SVG path `stroke-dashoffset` draw 600 ms, no DrawSVG plugin | 0 | static tick |
| Discover pick / empty states | CC0 illustrations (Open Peeps, Humaaans) as inline SVG, GSAP parallax 8 px on scroll | ≤ 6 per illustration, ≤ 30 total | static |
| Skeletons | CSS shimmer (`background-position`) | 0 | — |
| Icons | existing `shell/Icon.tsx` set; Lucide single imports only when a glyph is missing (ISC) | ~0.3 each | — |
| Breathing sound | not in this release (off by default would still ship bytes); Pixabay/CC0 .ogg later | 0 | — |
| Jack mascot | **later phase**: Rive `@rive-app/canvas-lite` (57 KB gz) + one `.riv`, lazy on mascot screens only | — | current `JackArt` SVG |

Do not use: Vanta, ShaderGradient, three.js backgrounds, tsParticles, lottie-web, Recharts, react-joyride, Storyset, unDraw (bundling ambiguity), high-energy React Bits shaders, Lenis in the shell.

Gates: `motion.test.tsx` reads `dist/` after `vite build` and fails when a lazy chunk exceeds its budget (no separate script), and covers reduced motion, no WebGL2, off-screen pause and the SOS/Safety no-canvas rule; `s16-motion` renders Today with WebGL disabled, with `prefers-reduced-motion: reduce`, and holds SOS with Aurora on (no `<canvas>`).

---

## Self-review
- Coverage: N-5..N-23, D-94 (as amended by D-99), D-96 (as amended by F-2), D-97..D-100, audit F-1..F-16, W-1..W-52, A-1..A-22, O-1..O-8, L-1..L-11, P-1..P-8, graphics research: each has a landing place in sections 0-8.
- Placeholders: none; every new file has an owner; copy quoted where it changes; open items are Q1-Q4 only.
- Type consistency: `Hue` names match section 3; card signatures in C-1 match their uses; `viewAs.ts` signatures in 1.6 are the L0 stubs; `enqueue` keeps its `(table, op, payload)` shape; `useSetupLeft` stubbed in L0 and filled by L8.
- Assumptions verified in code for this revision: `meds_taken_insert` and `readings_insert` are self-or-writer only (0003:88, 0001:115); `raise_mood_alert` and `rollcall_set` check self or can_write (0030:78, 0041:71); nutrition inserts allow admin (0024:77); `marked_by` is trigger-stamped (0039); `saveProfile` calls `adoptPerson` (`profile.ts:85`); `StartDone.tsx:65` and `Wizard.tsx:199` contradict each other; `share_accept` exists (0037:140); `usage_events` is the telemetry table (`admin/events.ts:40`).
