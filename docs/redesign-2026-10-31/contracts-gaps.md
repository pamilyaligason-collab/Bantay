# v13 gaps contract (fixed before launch; changes go through the orchestrator)

Base sha: `0fa856e` on `main` (batch 1). Later batches base on the integration tip the orchestrator names in the brief (ML-01).
Plan: `docs/plans/2026-11-02-v13-gaps.md`. Owner rules: D-105, D-108, D-109 (referenced only, not applied). Phase 0 contract `contracts-phase0.md` stays in force (tokens, component APIs, test ids, test policy); this file adds to it and never redefines a name it fixed.

## 1. Lanes, files, ports

| Lane | Batch | Owns (nobody else edits) | PW_PORT | Reviewer |
|---|---|---|---|---|
| G0 Shared shell | 1 | `src/App.tsx`; `src/features/shell/*` except `JackSheet.tsx`, `JackSheet.test.tsx`; `src/features/look/*`; `src/styles/*`; `src/features/location/*` (new `placeWords.ts`, `placeWords.test.ts`, `useLocation.test.ts`); `src/features/safety/alerts.ts` (body of `placeLabel` only) + `alerts.test.ts` (placeLabel cases only); `src/features/today/placeName.ts` + test; `src/features/today/WeatherCard.tsx` (`whereOf` and the `!settled` skeleton only); `e2e/v13.ts`, `e2e/s16.ts`, `e2e/s16-helpers.spec.ts`, `e2e/v13-foundation.spec.ts`, `e2e/subpage-header.spec.ts`, `e2e/tabbar-overlap.spec.ts`; `docs/redesign-2026-10-31/TESTING.md`. Deletes `shell/TopBar.tsx`, `TopBar.test.tsx`, `settings/topbar.css`. | 4600 | Opus |
| D1 Wrong data | 1 | `src/features/today/numbers.ts` + test; `src/features/health/attention.ts` + test; `src/features/health/verdict.ts` + test; `src/features/health/vitals.ts` + tests; `src/features/health/MetricChart.tsx` + new test; `src/features/health/labsLogic.ts` (`overBy` only) + test; `src/features/sensors/health.ts` + test; `src/features/safety/warningsLogic.ts` + test; `src/features/safety/hazardCards.ts` + test; `src/features/today/heroCards.ts` (`rainLine` only) + test; `src/data/safety/hotlines.count.test.ts` (new, prints the count) | 4610 | Opus |
| T Today | 2 | `src/screens/Today.tsx`, `src/screens/Today.*.test.tsx`; `src/features/today/*` minus D1's and G0's files above; `src/features/weather/WeatherScene.tsx`, `scene.ts`, `scene.css`, `scene.test.ts`; new `today/heroRain.ts` + test; `e2e/v13-today.spec.ts`, `e2e/s16-today.auth.spec.ts`, `e2e/today*.spec.ts` | 4620 | Opus |
| H Health | 2 | `src/screens/Health.tsx` + tests; `src/features/health/*` minus D1's files; `src/features/anatomy/*`; `src/features/exercise/*`; `src/features/nutrition/*`; `src/features/records/useHealthData.ts` + test; `e2e/v13-health.spec.ts`, `e2e/s16-health.auth.spec.ts`, `e2e/health-*.spec.ts`, `e2e/medicines.spec.ts`, `e2e/visits.spec.ts` | 4630 | Opus |
| S Safety | 3 | `src/screens/Safety.tsx`; `src/features/safety/*` minus `alerts.ts`, `warningsLogic.ts`, `hazardCards.ts` and their tests; `src/features/rescuemap/*`; `src/features/gobag/*`; `src/features/medid/*`; `src/features/world/*`; `src/data/safety/*` (data only, after the owner's hotline answer); `public/maps/map-quake.jpg` (copy); `e2e/v13-safety.spec.ts`, `e2e/safety.spec.ts`, `e2e/firstaid.spec.ts`, `e2e/phone-warnings.spec.ts` | 4640 | Opus |
| W Weather | 3 | `src/features/weather/*` minus T's four scene files and `actionLine.ts`/`actionLine.test.ts` (frozen); new `weather/advice.ts`, `tempTint.ts` + tests; `e2e/v13-weather.spec.ts`, `e2e/weather*.spec.ts` | 4650 | Opus |
| F Family | 4 | `src/screens/Family.tsx` + test; `src/features/family/*`; `src/features/records/useRecordsServer.ts`; new `family/queueWords.ts` + test; `e2e/v13-family.auth.spec.ts`, `e2e/family-*.spec.ts`, `e2e/s16-family.auth.spec.ts` | 4660 | Opus |
| D Discover | 4 | `src/screens/Discover.tsx` + test; `src/features/discover/*`; `src/features/health/library/*`; `e2e/v13-discover.spec.ts`, `e2e/s12-learn.spec.ts`, `e2e/s12-play.spec.ts`, `e2e/s13-d-discover.spec.ts`, `e2e/s16-discover.spec.ts` | 4670 | Opus |
| C Calm | 4 | `src/features/calm/*`; `e2e/v13-calm.spec.ts` | 4680 | Opus |
| O Other | 5 | `src/screens/Me.tsx` + tests; `src/features/settings/*` (minus `topbar.css`, deleted by G0); `src/features/inbox/*`; `src/features/shell/JackSheet.tsx`, `JackSheet.test.tsx`; new `docs/redesign-2026-10-31/PHONE-CHECK.md`; `e2e/jack-sheet.spec.ts`, `e2e/s16-settings.auth.spec.ts`, `e2e/s1-alerts-shots.spec.ts` | 4690 | Opus |
| Gate (orchestrator) | after 5 | integration branch, full suite | 4700 | Opus (whole branch) |

Rules: a lane that needs a line in a file it does not own asks the orchestrator, except the hook lines in section 4 (pre-agreed, one line each). Files not listed are frozen for this release. Builders run `git reset --hard <base>` first and report the sha.

## 2. Shared tokens and values

No new token in `tokens.css` this release (G0 may fix a token's value only if `contrast.test.ts` demands it). Fixed values lanes share without a token:

| Name | Value | Used by | Where defined |
|---|---|---|---|
| Calm deep | `#1F3B45` (light and dark), white text, `data-contrast-bg="#1F3B45"` | T (`.td-calm`), C (`.cm-root`) | each lane in its own css, same literal; the gate greps that no third value appears |
| Night sky stops | top `#1C2F57`, bottom `#46608A` (board Main) | T (`scene.ts`), W reads via `scene.ts` exports | `scene.ts` (T) |
| Jack box | right 18 px, bottom `calc(var(--tabbar-h) + var(--tabbar-gap) + var(--sab) + 14px)`, 62x62 (`shell.css:135`, unchanged) | every screen lane: no control inside this box at scroll 0 or at scroll end | `shell.css` (G0) |
| Status band | `.bt::before`, height `var(--sat)`, z 7, `--glass-bg` + `--glass-blur` | all | `safearea.css` (G0) |
| Bottom fade | `.bt::after`, height `calc(var(--tabbar-h) + var(--tabbar-gap) + var(--sab) + 12px)`, z 4 | all | `shell.css` (G0) |
| Hero temperature | 76 px / 200 / line 1 (board), condition + High/Low stacked under it | T (Today hero), W (Weather hero) | each in its own css |
| Row heights | grouped `Row` min 56 (about 60 with a sub), title clamp 2, sub clamp 1 | all | `v13.css` (G0, unchanged values) |
| Severity words | `In range`, `High`, `Low`, `A little raised`, `Above target`, `No range` only (no "A bit high") | D1 (`verdict.ts`), every surface via `verdictFor` | `verdict.ts` (D1) |
| Rain labels | daily max: "Today up to N%"; hourly: "Next 12 h N%" (was 6 h; the same 12 h window as the rain line) / "Next hours: N%"; hero line: "Rain N% this <part of day>" | D1 (`heroCards.rainLine`, `hazardCards`), T (`heroRain.ts`), W (`advice.ts`) | each in its own file, strings as written here |
| Water default | `DEFAULT_GOAL.waterMl = 1500` (6 glasses of 250 ml), unchanged unless the owner picks 8 | T reads via `useGoal` | `nutrition/logic.ts` (H) |
| Reduced motion | every animation inside `@media (prefers-reduced-motion: no-preference)` or gated by `useReducedMotion()`; e2e asserts `document.getAnimations().length === 0` under `reducedMotion: 'reduce'` | T, C, O, W | per lane |

## 3. Shared names, signatures, props

### 3.1 Place words (G0, `src/features/location/placeWords.ts`)
```ts
export interface PlaceWords { title: string; sub?: string; stale: boolean } // stale -> callers add data-testid="place-last"
export function placeWords(place: PlaceLike | null, now: number = Date.now()): PlaceWords
// place.source 'gps'       -> title = GPS area name (pickLocalSet(place.weather).area.name); outside every named area (incl. elsewhere in the Philippines) -> "where you are" (G0 ruling, round 2: a home zone far away is not the phone's place); never "Near you"
// 'last'                   -> title = "<area> · last known, <age>" (age: "N min ago" | "N h ago" | "N d ago"), stale = true
// 'home' (never any fix)   -> title = "<zone short name> · your home area"
// 'zone' (picked by hand)  -> title = "<zone short name>"
// 'gps-abroad'             -> title = "Away · <zone short name>"
// null, or place.settled === false (first position not found yet) -> title = "where you are"; never a home zone while unknown (G0 round 2)
```
Callers (G0 switches them; later lanes must not add a second wording): `safety/alerts.ts placeLabel(place) = placeWords(place).title`; `today/placeName.ts placeNameOf(place) = placeWords(place).title`; `today/WeatherCard.tsx whereOf = placeWords(place).title`; `location/ZonePicker.tsx` chip label = `placeWords(place).title`. `usePlace()` adds `fixAt?: number` (from `loc.last.at`) and keeps `settled`. Lanes S and W read `placeWords` for their chips and kickers; no lane writes "Near you" for a place.

### 3.2 Shell (G0)
```ts
// src/features/shell/HeadActions.tsx: right side of every tab root's LargeTitle.
export function HeadActions(p: { children?: ReactNode }): JSX.Element
// <div class="lt-actions-set">{children}<SyncStatus/><a class="ha-bell" href="#notif" aria-label="Notifications[, N new]" data-testid="head-bell">…{dot}</a><a class="ha-me" href="#me" aria-label="You and settings" data-testid="head-me">{photo|initial}</a></div>
// unread comes from UnreadContext (today/unread.ts). Each control >= 44x44. No Admin key anywhere (Admin is a row under Me, lane O).

// src/features/shell/SubHeader.tsx (same props as today; new body)
export function SubHeader(p: { title: string; backHref: string; backLabel: string; trailing?: ReactNode }): JSX.Element
// renders <LargeTitle title={p.title} back={{ href: p.backHref, label: p.backLabel.replace(/^Back to /, '') }} actions={p.trailing} />

// src/features/shell/names.ts (moved from TopBar.tsx; same behaviour)
export const firstName: (full: string) => string

// src/features/look/MapCard.tsx: one new optional prop
overlay?: ReactNode // drawn top-right inside the map box (layer switch); lane S uses it on Storm tracker

// src/features/shell/TabBar.tsx: one new attribute for lane O's A2 test
// <nav … data-active={active ?? 'none'}>; shell.css: .tabbar.sh-tabs[data-active="none"]::before { transition: none; opacity: 0 }
```
`TopBar` is deleted. `App.tsx` renders no header; every tab root draws `LargeTitle` with `actions={<HeadActions>…</HeadActions>}`.

### 3.3 Test helpers (G0, `e2e/v13.ts`)
```ts
export async function assertJackClear(page: Page, opts?: { at?: 'rest' | 'end' | 'both' }): Promise<void> // default 'both'; failures prefixed "at rest:" / "at end:"
// assertHero, assertOrder, assertTargets, assertNoSideways, assertTextContrast, assertNarrow, shotsLightDark: unchanged
```
Settled state before any assertion (ML-25): `await expect(page.locator('.bt .scroll')).toBeVisible()`, then `await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))`, then `await page.evaluate(() => document.fonts.ready)`. Lanes wait for their own busy flags the same way, never `waitForTimeout`.

### 3.4 Data helpers (D1)
```ts
// today/numbers.ts
export function pickLeadLab(readings: Reading[], now: Date, familyOf?: (r: Reading) => Range | undefined): Reading | undefined // latest result per lab test, then health/attention `leadRow`: the furthest outside its range (overBy) within 180 days leads, ties by date; else the newest recent with a range; a result older than 180 days leads only when nothing newer has a range (then it shows with its year)
export function numberTiles(readings: Reading[], now: Date, familyOf?: (r: Reading) => Range | undefined): NumberTile[] // lab tile first (tint 'red') when its pos is above/below; else [bp, sugar, lab]; lane T passes familyOf so Today agrees with the Health hero; an old lead's sub carries the year
// health/labsLogic.ts
export function overBy(row: LabRow): number | null // fraction outside the range: (value - high) / (high - low) above, (low - value) / (high - low) below; null without a two-sided range (one-sided: over the known edge / edge)
// health/attention.ts
export function pickAttention(latest: Reading[], familyOf, now: Date): Attention | null // same `leadRow` as pickLeadLab (health/attention.ts); Attention gains `old: boolean` (older than 180 days: lane H shows its date with the year)
// health/verdict.ts
WORDS.vital.above.word === 'High'
// health/vitals.ts
export function averageNodes(...): AverageNode[] // NOT deduped (the double count was disproved on real data); `when` states the days used: "7-day average" only with 7 days of data, else "Average of N days"; sleep/steps average over the days with data; mood is not an average (`when` = its today/date note, `sub` ''); verdict text "Average in range · latest High" when they differ. Lane H must show `when` and `sub` (S7 stays open until then)
// sensors/health.ts
// dedupeSamples: REMOVED (no double count on real data)
// safety/warningsLogic.ts
export function sourceRows(alerts: Alert[], now: number, phivolcs: boolean, checkedAt: string | null): SourceRow[] // checkedAt = lastCheck(alerts, kv['alerts:checkedAt']); no rows -> sub = freshText(freshness(checkedAt)), live = tone === 'ok'; "No rows yet" is gone; "Never checked" only when checkedAt is null, with `never: true` and NO Stale badge (Warnings.tsx shows no badge); Stale only when checks stopped
// safety/hazardCards.ts
export function hazardSub(here: Reading | null, home: { zone: string; reading: Reading } | null): string // "Not checked here · <zone>: <reading>" when only the home zone has one
// today/heroCards.ts
export function rainLine(w: Wx, now: Date): string // hourly figure, worded "Next hours: N%"; the daily max is the row value "Today up to N%" (Safety rain row, D1 hook line in SafetyHub.tsx)
```

### 3.5 Today (T)
```ts
// today/heroRain.ts
export function heroRainLine(hourly: HourlyRain[], nowLocal: string): string | null // from 30%: "Rain N% this morning|afternoon|evening|tonight"; null under 30
// today/stormView.ts
export function stormSlots(slots: Slot[]): Slot[] // every kind 'storm', pct max(pct, 60)
// today/QuickLog.tsx keeps and exports its sheets; the grid is gone
export function MoodSheet(p: { onClose(): void; notify(msg: string): void }): JSX.Element
export function MoreSheet(p: { onClose(): void; notify(msg: string): void }): JSX.Element
// today/MyDay.tsx rows (test ids): myday-ring, myday-checkin, myday-bp, myday-water, myday-breath, myday-missed-<personId>, myday-more ("Log something else")
// today/SetupCard.tsx
export function setupSteps(state): { label: string; href: string }[] // first pending step's href is the row's href
```

### 3.6 Health (H), Weather (W), Family (F), Calm (C), Other (O)
```ts
// health/PinnedTiles.tsx: kv 'health.pins' = MetricCode[] (default ['bp_systolic','fasting_glucose','steps','visits'])
// health/nudgeLogic.ts
export function cadenceWord(plan: NudgePlan): string // one string for Today's row and For you ("Morning BP" | "Weekly BP" …)
// health: test ids rd-hero, rd-averages, rd-source, rd-last, rd-tips (Readings); vs-hero, vs-bring, vs-questions, vs-asked, vs-summary (Visits); meds-empty; pinned; foryou-video, foryou-because, foryou-log
// weather/advice.ts
export function adviceLine(dailyMax: number | null, hourlyNext: number | null, lines: ActionLine[], tomorrow?: { pct: number } | null): string
// weather/tempTint.ts
export function tempTint(c: number): Tint // <= 24 blue, 25-28 teal, 29-31 green, 32-34 amber, >= 35 red
// weather test ids: wx-hero, wx-advice, wx-rain, wx-48, wx-10, wx-details, wx-official
// family/queueWords.ts
export function queueWords(q: { count: number; byPerson: Record<string, number> }, meId: string): { together: string; papersKicker: string } // "12 to confirm · 2 yours", "12 in the family"
// family: the "I'm OK" row leaves TodayCarousel; the toast portals to .bt (role=status)
// calm/CalmScreen.tsx: Segmented ids pattern 'relax'|'box'|'sleep', length '1'|'3'|'5'; moodPromise(linked: boolean): string
// shell/JackSheet.tsx (O): chips data-testid jack-try-1..3; ASK_EVENT dispatched as new CustomEvent(ASK_EVENT, { detail: { text } }); SOS ring data-testid jack-sos-ring
// inbox: heading "New (N)", rows data-testid inbox-row, detail sheet data-testid inbox-detail
// settings/Overview.tsx: admin row title "Family admin tools" first NavRow for admins
```

## 4. App hook points (shared files, one line each, pre-agreed)

| File | Anchor | Lane | One-line hook |
|---|---|---|---|
| `src/screens/Health.tsx` | `<LargeTitle kicker="Summary" title="Health" actions={<PersonSwitcher …/>} />` | G0 | `actions={<HeadActions><PersonSwitcher …/></HeadActions>}` |
| `src/screens/Family.tsx` | `<LargeTitle kicker=… title="Family" actions={<a className="btn-round" …/>} />` | G0 | wrap the existing `<a>` in `<HeadActions>` |
| `src/features/discover/Overview.tsx` | `<LargeTitle testId="dc-head" kicker="Learn, watch, play" title="Discover" />` | G0 | add `actions={<HeadActions/>}` |
| `src/features/safety/SafetyHead.tsx` | `<LargeTitle title="Safety" kicker={p.kicker} actions={p.actions} />` | G0 | `actions={<HeadActions>{p.actions}</HeadActions>}` |
| `src/features/safety/Warnings.tsx` | the `sourceRows(` call | D1 | pass `lastCheck(alerts, saved)` as the 4th argument (`saved` from `useKv(CHECKED_KEY)`) |
| `src/features/safety/SafetyHub.tsx` | the Rain row (`title: 'Rain'`) | D1 | `value: "Today up to N%"`, `sub: rainLine(...)` |
| `src/features/shell/TabBar.tsx` + `shell.css` | `<nav … data-testid="tabbar"` | G0 (for O) | `data-active={active ?? 'none'}` and the one css rule in 3.2 |
| `src/features/gobag/GoBag.tsx`, `src/features/medid/MedicalId.tsx` | their header block | S | replace with `<LargeTitle title=… back={{ href: '#safety', label: 'Safety' }} />` |
| `src/features/discover/play/Memory.tsx`, `WordSearch.tsx` | their header block | D | `<LargeTitle title=… back={{ href: '#discover/play', label: 'Play' }} />` |
| `src/features/settings/Overview.tsx` | `<SubHeader title="Settings" …/>` | O | keep (SubHeader renders LargeTitle after G0); add the admin row |
| `e2e/v13-foundation.spec.ts`, `TESTING.md` "Known until lane X" | fixme list | each lane | remove only its own `test.fixme` lines when its screen passes |

## 5. Invariants every lane must keep

- No control (a, button, input, [role=button]) inside the Jack box at scroll 0 or at scroll end on any route that shows Jack (`assertJackClear` default 'both').
- One `[data-hero]` per tab root, top <= 320 px (`assertHero`). Every tap target >= 44x44 (`assertTargets`), no sideways scroll, computed text contrast >= 4.5 (3 for large) in light and dark, at 390, 360 and 195 px.
- One wording per fact: place words only from `placeWords`; severity words only from `verdictFor`; rain figures always labelled daily or hourly; a count and the list it summarises share one selector (ML-34).
- Unknown is unknown: no "Missed", "Stale", "0 today" or `0,0` from a missing signal (ML-05).
- Nothing the boards mark sample, new or placeholder ships as data: empty state with the reason, or a flag that defaults off.
- No real family names or health values in repo files; fixtures use invented people (Ana, Ben, Cora …) and round numbers.
- Reduced motion: zero running animations under `prefers-reduced-motion: reduce` on every screen a lane touches.
- No migration, no Supabase change, no deploy, no push, no merge by a lane. D-109 (migration 0046) is its own release.
- Tests measure boxes and computed colours and wait on settled state; no height budgets, no css-text greps, no sleeps.
- Shots: 390x844 light and dark of every touched screen under `docs/redesign-2026-10-31/shots/gaps-<lane>/`, compared with the named board; deviations listed in `risks` (ML-37). `git status --porcelain` empty after the gates (ML-32).

## 6. Release order

1. Batch 1 (G0, D1) -> merge G0 then D1 onto the integration branch `claude/v13-gaps` -> Tier 0 smoke (every root opens, no page error) -> batch 2 bases here.
2. Batches 2, 3, 4, 5 in order; after each merge: smoke + the merged lanes' specs.
3. Gate: tsc, full vitest, full Playwright (`--workers=1`, PW_PORT 4700), shots beside boards, Opus whole-branch review, retro.
4. The owner: written answers for T2, T3, T15, T14, H5, W4 hotline count; phone check (S1, S2, J2); C5 numbers; D-109 separately.
5. Merge to main = web live (Cloudflare Pages). No APK in this release.
