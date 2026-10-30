# Session 16 redesign contracts (fixed before launch; changes go through the orchestrator)

Base sha: `<set by the orchestrator at launch: the commit after the D-95 bug PR merges; worktree HEAD at writing = 5bf9af6>` on `claude/family-bantay-session-16-6fa7b5`. Owner rules: D-66, D-71, D-77, D-82, D-84, D-86, D-91, D-94, D-96, D-97, D-98, D-99, D-100, D-101, D-102, D-103. Plan: `docs/session-16/PLAN.md` rev 9. UI contract: mockup v12 = artifact K7J3qEr6Zv6GMb3mqz5ci6 version 4 (`docs/session-16/mockup-v11.html`, group "v12"). Checklist: `D:/ObsidianVault/30-knowledge/patterns/multi-lane/CHECKLIST.md` (every lane reads it and returns `checklist`).

Every name, signature, token, route, hook line, fixture and migration number that crosses a lane boundary is fixed here (ML-02). A lane that needs a name not listed stops and reports it in `needs`; it never invents one.

## 0. L0 base deliverables (orchestrator commits these before any lane starts; one commit `feat(s16): base tokens, cards, redirects, stubs, contracts`)

| # | Deliverable | File(s) | Done when |
|---|---|---|---|
| L0-1 | Hue tokens, three theme blocks | `src/styles/tokens.css` | `--hue-{blue,green,lilac,amber,terra}` and `-ic` in `:root`, `[data-theme=dark]` and the dark media block; dark fill = `var(--card)` |
| L0-2 | Card set | `src/features/look/{HeroCard,SceneHero,Tile,Row,AlertCard}.tsx`, `look/cards.css`, `look/index.ts` (exports the five) | signatures in C-1 compile; `cards.test.tsx` renders each in light + dark with icon + label |
| L0-3 | Contrast table test | `src/features/look/contrast.test.ts` | asserts section 3 of PLAN.md in both themes on unrounded values; dark icon vs the 18% chip |
| L0-4 | Routes + redirects | `src/features/shell/routes.ts`, `routes.test.ts` | C-3 table; `#health/papers` assertion moved to `#family/papers` |
| L0-5 | App hooks | `src/App.tsx` | `<ViewAsBanner />` imported and rendered after `<OfflineBar />`; track line `hash === '#family/papers' ? 'records'` |
| L0-6 | View-as stubs | `src/features/viewas/{store.ts,viewAs.ts,ViewAsRow.tsx,ViewAsBanner.tsx}` | signatures in C-9; every function returns the "not acting" value; components render `null` |
| L0-7 | Setup stub | `src/features/setup/steps.ts` | `export function useSetupLeft(): { left: string[] }` returning `{ left: [] }` (L8 fills) |
| L0-8 | Motion stubs | `src/features/look/BreathOrb.tsx`, `look/CheckDraw.tsx` | props in C-10; static disc + label / static tick (L9 fills the bodies) |
| L0-9 | Shared e2e helper + button gate | `e2e/s16.ts`, `e2e/s16-buttons-360.spec.ts` | helpers in C-11; the button spec runs on the C-3 route list and passes on the base |
| L0-10 | Fixture folder | `e2e/fixtures/s16/README.md` | names the per-lane fixture files in C-11 (lanes create their own) |
| L0-11 | This file | `docs/session-16/contracts.md` | committed |
| Gates | `npx tsc --noEmit` 0; `npm test` green; `npx playwright test e2e/shell.spec.ts e2e/no-sideways-scroll.spec.ts e2e/s16-buttons-360.spec.ts` green; `git status --porcelain` empty | | |

## 1. Lanes

| Lane | Name | Owns (files / prefix) | Migration no. | Port | Depends on | Critical | Reviewer |
|---|---|---|---|---|---|---|---|
| L1 | Today | `src/screens/Today.tsx`; `src/features/today/{WarningCard,NoticeStack,BreathSheet,SelfCare,WeatherCard,SimpleToday,QuickLog,NextUp}.tsx`; `today/{warnAck.ts,today.css,selfcare.css,breath.css}`; `src/features/notify/AlertCardToday.tsx` + `.test.tsx`; `src/features/safety/StormCard.tsx` (kept; `StormBlock` export; "I'm OK"; acting hook); `today/AlertBand.tsx` (kept); `src/features/weather/WeatherScreen.tsx` (place switcher, heat strip, tiles, season; scene from L9); tests `today/{today,weatherCard,nextUp,quickLog,s14t2,s14t2r2,s15s1,SelfCare,AlertBand}.test.tsx`, `family/stormrollcall.test.tsx`, new `today/{warnAck,WarningCard,NoticeStack,BreathSheet}.test.tsx`; e2e `today-auth`, `today`, `s13-t-today.auth`, `s14-t2-today.auth`, `s7-today-shots.auth`, `s12-storm-shots.auth`, `s5-alerts`, `s1-alerts-shots`, `weather`, new `s16-today.auth`; fixture `e2e/fixtures/s16/today.ts` | — | 4411 | L0, L9 (`BreathOrb` body, scene layers; stubs make L1 compile alone) | no | Opus |
| L2 | Health (version B) | `src/screens/Health.tsx`; `src/features/health/{BodyHero,GlanceGrid,HealthBrowse}.tsx`; `health/HealthLinks.tsx` (deleted); `health/{LabsScreen,LabsList,LabDetail,MetricScreen,useHealthPerson,labsLogic,AddReadingSheet}.ts(x)`; `health/health.css`; `src/features/nutrition/{actions.ts,PlateSheet.tsx,WaterSheet.tsx,SaltSummary.tsx,NutritionScreen.tsx}`; `src/features/exercise/{actions.ts,data.ts,MoveScreen.tsx}`; tests `health/{health-screen,LabsList,LabDetail,m7a-screens,labsLogic}.test.*`, new `health/{BodyHero,GlanceGrid,HealthBrowse,useHealthPerson}.test.tsx`, nutrition + exercise tests; e2e `health-overview`, `health-auth` (+ `health-auth-mock.ts`), `health-a11y`, `health-v6`, `health-labs`, `s14-l-labs.auth`, `w2-health-shots`, `w2-health-shots.auth`, `s13-h-shots.auth`, `medicines`, `nutrition-auth`, `exercise-auth`, new `s16-health.auth`; fixture `e2e/fixtures/s16/health.ts` | — | 4412 | L0 | no | Opus |
| L3 | Discover | `src/screens/Discover.tsx`; `src/features/discover/**` (new `Overview.tsx`; `learn/Screen.tsx`; `watch/Screen.tsx`); `src/features/health/library/{Library,Article}.tsx` (back-link lines only); `discover/discover.css`; tests under `discover/**`, `health/library/medline.test.ts` if a href changes; e2e `s13-d-discover`, `s12-learn`, `media`, `s12-play`, new `s16-discover`; fixture `e2e/fixtures/s16/discover.ts` | — | 4413 | L0 | no | Opus |
| L4 | Family | `src/screens/Family.tsx`; `src/features/family/{ProfileCard,FacesRow,Calendar,NeedYouNow,Papers}.tsx`; `family/People.tsx` (deleted); `family/calendarLogic.ts`; `family/family.css`; `family/Messages.tsx` (prefill "@name" only); tests `family/{people,family-ui,carer-cards,roster-loaded,MemberPage,Report,memoriesLogic,Messages}.test.*` as touched, new `family/{calendarLogic,ProfileCard,FacesRow,NeedYouNow}.test.*`; e2e `family-plan`, `family-messages`, `family-report`, `records`, `records-db`, `s14-f2-family.auth`, `s13-f-shots.auth`, new `s16-family.auth`; fixture `e2e/fixtures/s16/family.ts` | — | 4414 | L0 | no | Opus |
| L5 | Settings | `src/screens/Me.tsx`; `src/features/settings/**` (`Overview,Group,ChoiceSheet,AlertsGroup,DisplayGroup,FamilyGroup,PhoneGroup,SigninGroup,AboutGroup`.tsx, `settings.css`, tests); `src/features/shell/TopBar.tsx` (label + greeting wrap); `src/features/privacy/PrivacyScreen.tsx` (ConsentNotice mount); `src/App.tsx` title line only (C-5); e2e `profile-auth`, `sensors`, `s6c-lock.auth`, new `s16-settings.auth`; fixture `e2e/fixtures/s16/settings.ts` | — | 4415 | L0 | no | Opus |
| L6 | View as, look and act | `src/features/viewas/**` (fills the stubs; `store.ts`, `viewAs.ts`, `ViewAsRow.tsx`, `ViewAsBanner.tsx`, tests `viewAs.test.ts`, `viewAs.imports.test.ts`, `actingWrites.test.ts`); `src/features/today/actions.ts` + `actions.test.ts`; `src/features/sync/profile.ts` (the one `adoptPerson` guard line) + `profile.test.ts`; `today/useDueMeds.ts` + test; `today/useMyTakes.ts` + test; `today/MyWeek.tsx` if touched; `src/features/admin/desk/**` "who logged" line; `supabase/migrations/0044_logged_by.sql` + `0044_logged_by.down.sql`; e2e `admin-view-as.auth`, new `s16-viewas-privacy.auth`; fixture `e2e/fixtures/s16/acting.ts`. Never touches `db.ts`, `records/useHealthData.ts`, `setup/useProfile.ts`, `sos/**`, `sensors/**`, `privacy/**`, `nudge/**`, `health/reminder*` | **0044** (written + rehearsed; applied only on Lloyd's "apply 0044") | 4416 | L0 | **yes** (Opus first; re-audit after any fix) | Opus |
| L7 | IA sweep | `src/features/inbox/build.ts`; `src/features/shell/AskSheet.tsx`; `src/features/scan/{ScanFlow.tsx,open.ts}`; `src/features/family/CarerCards.tsx` (hrefs); `src/features/inbox/MissedDoseActions.tsx` (hrefs + `useActingCan` gating); `src/features/medid/MedicalId.tsx` (hrefs); `src/features/health/MedDetail.tsx` (`:147` href); tests those files have; e2e `subpage-header`, `ask-sheet`, `scan`, `s14-j-jack`, `s12-shell`, `s12-shell.auth`, `s12-f3-shots`, `tabbar-overlap`, `no-sideways-scroll`, `s12-core.auth`, `s12-polish`, `shell`, `admin`, `auth`, `phone-warnings`, `s12-marked-by.auth`, `s12-sharing.auth`, `s16-narrow-text.auth` (ROUTES), new `s16-redirects`, `s16-buttons-360` route list | — | 4417 | L1-L6, L8, L9 merged (merges last) | no | Opus |
| L8 | Onboarding | `src/screens/SignIn.tsx` (welcome copy); `src/screens/Onboarding.tsx`; `src/features/setup/{JoinFlow,SetPin,StartDone,Wizard}.tsx`; new `setup/{RemindersStep,WhereStep,FirstSuccessStep}.tsx`; `setup/steps.ts` (`useSetupLeft` body, settings fallback); `setup/onboarding.css`; setup tests incl. `StartDone.test.tsx`; e2e `onboarding`, `s6a-onboard-shots.auth`, `s12-join.auth`, new `s16-onboarding.auth`; fixture `e2e/fixtures/s16/onboarding.ts` | — | 4418 | L0 (stubs `useSetupLeft`, `CheckDraw`) | no | Opus |
| L9 | Motion and graphics | `src/features/weather/{WeatherScene.tsx,scene.ts,scene.css,scene.test.ts}` (extend); `src/features/look/{Aurora.tsx,BreathOrb.tsx,orb.css,Ring.tsx,CheckDraw.tsx,useReducedMotion.ts,motion.ts,motion.test.tsx,JackArt.tsx,JackArt.test.tsx,EmptyState.tsx}`; `src/features/shell/Icon.tsx` (D-103 sizes; no new names without the orchestrator); `src/features/sos/SosScreen.tsx` (one mount/unmount flag line); `src/assets/jack/**` and `src/assets/illustrations/**` + `LICENSES.md`; e2e `look`, `weather-scene`, new `s16-motion` | — | 4419 | L0 | no | Opus |

Exclusive ownership: no two lanes list the same file; no file moves (M-4). `App.tsx` lines are split by C-5 (L0 banner + track line, L5 title). `look/index.ts` is L0's; lanes import `BreathOrb` and `CheckDraw` by file path.

Merge order: L0 → L9 → L6 → L3 → L2 → L1 → L4 → L5 → L8 → L7. After each merge: `tsc`, tier-0 smoke (`shell`, `no-sideways-scroll`, `s16-buttons-360`), the lane's specs, duplicate scan.

## 2. Shared data (tables, columns, policies)

| Name | Owner lane | Shape | Who reads / writes | RLS rule |
|---|---|---|---|---|
| `readings.logged_by`, `activity.logged_by` (migration 0044) | L6 | `uuid references auth.users (id) on delete set null`, stamped by BEFORE INSERT trigger `coalesce(auth.uid(), new.logged_by)` | written by the trigger only; read by `admin/desk` "who logged" line when the column exists | unchanged (no policy reads it); grants restated in the migration (ML-21) |
| `meds_taken.marked_by`, `marked_by_name` (0039) | — (existing) | trigger-stamped | read by Today / Family "marked by" text | unchanged |
| kv `warn.ack` (Dexie `db.kv`) | L1 | `{ [alertId]: "<issuedAt>|<level ?? ''>|<kind>" }` | L1 only | local |
| kv `mood.unsent.<personId>` (Dexie `db.kv`) | L6 | `{ personId, at }` per person; replaces the single `mood.unsent` | `today/actions.ts` only | local |
| kv `selfcare.log`, `selfcare.buzz` | L1 | entries gain `personId` | L1 only | local |
| in-memory acting id | L6 | `viewas/store.ts` module variable; never persisted | readers in C-9 allowlist | n/a |
| `carer_alerts.seen_at` (0030) | — | existing | `markSeen` from `FamilyNotice` (L1) | unchanged |

Every other table is unchanged. `db.ts enqueue` is unchanged (B2-1).

## 3. Functions / RPCs / edge functions crossing lanes

| Signature | Owner | Callers | Returns | Rate limit |
|---|---|---|---|---|
| `admin_log_view_as(p_person uuid)` (0029, existing) | — | `viewAsData.logViewAs` ← `viewas/viewAs.enterActing` (L6) | void; raises `not_admin`, `not_found` | existing |
| `raise_mood_alert(p_person uuid)` (0030) | — | `today/actions.ts raise(personId)` (L6 signature; L1 callers) | int (carers told); refused for non self/writer | once per person per day |
| `rollcall_set(p_person, p_storm_ref, p_status)` (0041) | — | `safety/rollcall.sendRollcall` ← `StormCard.roll` (L1) with `useActingPersonId()` | void; `not allowed` unless family member and self/writer | existing |
| `share_accept(uuid, boolean)` (0037) | — | unchanged | | |
| Edge functions | — | none change | | |

## 4. Events and kinds

| Kind | Owner | Meta fields (no PII) | Retention | Who may read |
|---|---|---|---|---|
| `usage_events` `action`: `checkin_done` (existing), new `warn_ack`, `breathe_done`, `acting_enter`, `acting_exit`, `onboard_test_rang`, `onboard_skip_<step>` | L1 / L6 / L8 | `{ name }` only; no person id, no values | existing cap in `admin/events.ts` | admins (existing policy) |
| `audit_log.action = 'view'` (0029) | L6 | person id only | existing | admins |

## 5. App hook points (shared files; one line each, prefix comment `// S16-<lane>`)

| File | Anchor | Lane | One-line hook |
|---|---|---|---|
| `src/App.tsx` | after `<OfflineBar />` | L0 | `<ViewAsBanner />` (in the base) |
| `src/App.tsx` | `useTrackScreen` ternary | L0 | `hash === '#family/papers' ? 'records'` (in the base) |
| `src/App.tsx` | `title` ternary `'Me'` | L5 | `'Settings'` |
| `src/features/viewas/ViewAsBanner.tsx` | mount effect | L6 | `useEffect(() => onAuthChange(exitActing), [])` |
| `src/features/sync/profile.ts` | `adoptPerson` first line (`:27`) | L6 | `if (personId === getActingPersonId()) throw new Error('acting:profile')` — imports `../viewas/store` only |
| `src/features/today/actions.ts` | exported logger signatures | L6 | optional trailing `personId?: string` on `checkIn`, `logFeeling`, `takeDose`, `takeMedication`, `logBp`, `logSugar`, `logWeight`; `asPerson` unchanged; `mood.unsent.<personId>` |
| `src/features/safety/StormCard.tsx` | `useSelfPersonId()` | L1 | `useActingPersonId()` |
| `src/features/today/NoticeStack.tsx` | setup row | L1 | `const { left } = useSetupLeft()` |
| `src/features/today/BreathSheet.tsx` | orb slot | L1 | `import { BreathOrb } from '../look/BreathOrb'` |
| `src/features/setup/FirstSuccessStep.tsx` | tick | L8 | `import { CheckDraw } from '../look/CheckDraw'` |
| `src/features/sos/SosScreen.tsx` | mount/unmount effect | L9 | `useEffect(() => { setSosScreenOpen(true); return () => setSosScreenOpen(false) }, [])` from `../look/motion` |
| `src/features/weather/WeatherScene.tsx` | render | L9 | static positions while `useSosActive()`, `sosScreenOpen` or `#safety*`; never a canvas |
| `src/features/health/useHealthPerson.ts` | person default | L2 | `const acting = useActingPersonId()`; `ownId` stays the admin; `canMark = !!can?.log`, `canEdit = !!can?.edit` from `useActingCan()` while acting |
| `src/features/scan/ScanFlow.tsx` | PersonChips default | L7 | preselect `useActingPersonId()` |
| `src/features/inbox/MissedDoseActions.tsx` | dose buttons | L7 | disabled with lock + "View only" unless `useActingCan()?.log` |

## 6. Contract items (C-1..C-11)

### C-1 Cards (L0 owns; `src/features/look/`)
```tsx
export type Hue = 'blue' | 'green' | 'lilac' | 'amber' | 'terra' | 'none'
export interface CardAction { label: string; href?: string; onClick?: () => void; disabled?: boolean; lockReason?: string }
export function HeroCard(p: { hue: Hue; icon: IconName; kicker?: string; title: string; body?: ReactNode; href?: string; action?: CardAction; onClose?: () => void; closeLabel?: string; media?: ReactNode; testId?: string; children?: ReactNode }): JSX.Element
export function SceneHero(p: { scene: ReactNode; scrim?: boolean; inkOnScene?: boolean; kicker?: string; title: ReactNode; body?: ReactNode; href?: string; action?: CardAction; secondary?: CardAction; jack?: JackName; jackSize?: 56 | 96 | 112; compact?: boolean; testId?: string; children?: ReactNode }): JSX.Element
export function Tile(p: { hue: Hue; icon: IconName; label: string; value?: string; spark?: number[]; ring?: number; href?: string; onClick?: () => void; testId?: string }): JSX.Element
export function Row(p: { icon?: IconName; avatar?: ReactNode; title: string; sub?: string; href?: string; onClick?: () => void; control?: ReactNode; badge?: number; testId?: string }): JSX.Element
export function AlertCard(p: { tone: 'red' | 'amber'; icon: IconName; title: string; body?: ReactNode; action?: CardAction; onClose?: () => void; closeLabel?: string; testId?: string }): JSX.Element
```
Rules: icon + label required; `disabled` + `lockReason` draws the lock + "View only"; dark theme draws no fill; close button 48 px; `SceneHero` ≤ 240 px compact / ≤ 280 expanded, `jack` in its own cell (D-103), `scene` children are `aria-hidden`; `ring` on `Tile` is 0..1 drawn with `look/Ring.tsx`.

### C-2 Tokens (`src/styles/tokens.css`, three blocks)
| Token | Light | Dark |
|---|---|---|
| `--hue-blue` / `--hue-blue-ic` | `#DCEBF0` / `#1F5A6E` | `var(--card)` / `#8CC6DA` |
| `--hue-green` / `-ic` | `#DCE5D8` / `#2E5A3F` | `var(--card)` / `#8FD1A6` |
| `--hue-lilac` / `-ic` | `#E6E0F0` / `#4F3F80` | `var(--card)` / `#C2B5EA` |
| `--hue-amber` / `-ic` | `#F3E4CC` / `#7A4E05` | `var(--card)` / `#F0B54C` |
| `--hue-terra` / `-ic` | `#F6DFD6` / `#9A3B22` | `var(--card)` / `#F2A58F` |
CSS: `.card[data-hue=<h>] { background: var(--hue-<h>) }`; dark adds `.card[data-hue=<h>] { border-top: 3px solid var(--hue-<h>-ic) }` and the icon chip `color-mix(in srgb, var(--hue-<h>-ic) 18%, var(--card))`. Section mapping: blue = Readings, Progress, Weather, News; green = Medicines, Move & food, Body, Listen, Play, Calm; lilac = Labs; amber = Family, Learn, Discover pick; terra = Watch, Video. Scene SKY pairs and SCRIM stay in `weather/scene.ts` (L9).

### C-3 Routes and redirects (`src/features/shell/routes.ts`, L0)
```ts
const REDIRECT: [RegExp, string][] = [
  [/^#(records|family\/records|health\/papers)$/, '#family/papers'],
  [/^#health\/library$/, '#discover/learn/library'],
  [/^#health\/library\/(.+)$/, '#discover/learn/library/$1'],
  [/^#health\/videos$/, '#discover/watch'],
  [/^#family\/people$/, '#family'],
  [/^#people$/, '#family']
]
```
`parseHash`: `me/<group>` → `{ tab: null, view: 'me' }`; `family/papers` → `{ tab: 'family', view: 'papers' }`. Route list for gates (`e2e/s16.ts ROUTES`): `#today`, `#weather`, `#health`, `#health/meds`, `#health/labs`, `#health/body`, `#health/visits`, `#health/move`, `#health/nutrition`, `#health/refill`, `#discover`, `#discover/learn`, `#discover/learn/library`, `#discover/learn/together`, `#discover/watch`, `#discover/listen`, `#discover/play`, `#discover/news`, `#family`, `#family/papers`, `#family/messages`, `#family/plan`, `#safety`, `#safety/warnings`, `#safety/storms`, `#safety/hazards`, `#safety/cards`, `#me`, `#me/alerts`, `#me/display`, `#me/family`, `#me/phone`, `#me/signin`, `#me/about`, `#privacy`, `#sharing`, `#medid`, `#notif`. Settings groups: `alerts`, `display`, `family`, `phone`, `signin`, `about` (L5 draws from the hash). Breathe sheet: `history.pushState({ bantayBreathe: true }, '')`, no route.

### C-4 Screen rules
PLAN.md section 1 "Shared rules" verbatim (grid, scale, five card types, type, lines, buttons never wrap at 360, one primary action, two columns, colour, page budgets per D-102, empty states, context only where needed, Jack D-91, glass D-71, icons and Jack D-103, 48 px targets, one history entry per sheet).

### C-5 Hook lines
Section 5 above.

### C-6 Invariants every lane must keep
- Each alert title appears once on Today and once on Simple Today.
- The acting id (`getActingPersonId`, `useActingPersonId`, `useViewedVisibleIds`) is imported only by the C-9 allowlist and never by `today/actions.ts`, `nudge/**`, `health/reminder*`, `sensors/**`, `sos/**`, `privacy/**`, `setup/**`, `exercise/{actions,data}.ts`, `db.ts`.
- `db.ts enqueue` is unchanged; the admin's own rows always queue while acting.
- The member's profile is never adopted (`adoptPerson` guard); `enterActing(ownPersonId)` is false.
- SOS always acts as the signed-in person and is never refused; IncomingSos and the SOS screen are never closable; no WebGL canvas and no scene animation while SOS, IncomingSos or Safety is up.
- A closed warning stays on Safety > Warnings and its roll-call row stays on Today while a signal is live.
- Every current `Me.tsx` row remains reachable; every old hash in C-3 lands.
- No `.btn` wraps at 360; each screen is within its D-102 budget with its fixture.
- One `JackArt` per screen, never on alerts, storm, FamilyNotice, IncomingSos, SOS; art never overlaps a control, badge or text (D-103).

### C-7 Composition (ML-41)
TopBar + OfflineBar + ViewAsBanner + alerts-off card + WarningCard + NoticeStack may stack on Today; `JackFab` on every tab root; glass tab bar / top bar / sheets (D-71); checked at 360 and 390 in each lane's spec.

### C-8 Feature parity
PLAN.md C-8 table (section B of V11-REGRESSIONS.md): every row present in the merged build or covered by the cited decision; each lane ticks its rows in `checklist` and compares against `docs/session-16/shots/live/<tab>-<light|dark>.png`.

### C-9 View as (L6 owns; L0 stubs)
```ts
// src/features/viewas/store.ts (no imports from the app)
export const getActingPersonId = (): string | null
export const subscribeActing = (cb: () => void): (() => void)
// src/features/viewas/viewAs.ts
export async function enterActing(personId: string): Promise<boolean>   // admin only; false for own id; after logViewAs() true; resets the Health picker
export function exitActing(): void
export function useActingPersonId(): string | null      // acting id ?? useSelfPersonId(); subscribes
export const useActing = (): { acting: boolean; personId: string | null; name: string }
export function useViewedVisibleIds(): Set<string> | null   // null when not acting; fails closed to new Set([acting]) when the roster fails
export function useActingCan(): { log: boolean; edit: boolean; rollcall: boolean; mood: boolean; reason: string | null } | null
// src/features/viewas/ViewAsRow.tsx: export default function ViewAsRow(): JSX.Element | null  (Settings row + picker sheet; admin only)
// src/features/viewas/ViewAsBanner.tsx: export default function ViewAsBanner(): JSX.Element | null
```
Allowlist (the only importers of the three acting readers): `viewas/**`, `screens/{Today,Health,Family}.tsx`, `today/{QuickLog,NextUp,SimpleToday,useDueMeds,useMyTakes,MyWeek}.tsx`, `safety/StormCard.tsx`, `health/{useHealthPerson,AddReadingSheet,LabsScreen}.tsx`, `nutrition/{PlateSheet,WaterSheet,SaltSummary,NutritionScreen}.tsx`, `exercise/MoveScreen.tsx` (gating only), `family/{ProfileCard,FacesRow,Calendar}.tsx`, `settings/**`, `inbox/MissedDoseActions.tsx`, `scan/ScanFlow.tsx`, `sync/profile.ts` (store only). `useActing` / `useActingCan` may be imported anywhere.
Copy: bar "Acting as Mama · Exit"; lock label "View only"; reason "You can see Mama but not log for her. Ask her (or an admin) to make you a carer with edit access."; picker "Needs internet to switch" (once), "Every view is recorded in the family history."; toasts "Saved for Mama.", "Family told. Sent as Lloyd.", "Sent as Lloyd"; SOS "This SOS is from Lloyd, not Mama."

### C-10 Motion stubs (L0 stubs; L9 bodies)
```tsx
// src/features/look/BreathOrb.tsx
export function BreathOrb(p: { moment: Moment; reduced?: boolean; size?: number }): JSX.Element   // Moment from today/breathLogic
// src/features/look/CheckDraw.tsx
export function CheckDraw(p: { size?: number; onDone?: () => void }): JSX.Element
// src/features/look/motion.ts additions (L9)
export const setSosScreenOpen: (open: boolean) => void
export const useSosScreenOpen: () => boolean
export const motionOk: () => boolean   // reduced motion false, page visible, not SOS
// src/features/look/Ring.tsx (L9)
export function Ring(p: { value: number; size?: 20 | 28 | 40; hue?: Hue; label?: string }): JSX.Element
```

### C-11 Test fixtures and helpers (`e2e/s16.ts`, L0; fixtures per lane)
```ts
export const ROUTES: string[]                       // C-3 list
export async function assertNoWrappedButtons(page: Page): Promise<void>   // every .btn has one line box at 360
export async function assertBudget(page: Page, max: number): Promise<void> // document.scrollingElement.scrollHeight <= max
export async function setScheme(page: Page, s: 'light' | 'dark'): Promise<void>
export const liveShot = (tab: string, s: 'light' | 'dark') => `docs/session-16/shots/live/${tab}-${s}.png`
export const FIXED_CLOCKS = ['2026-10-30T23:30:00+08:00', '2026-10-31T00:30:00+08:00'] as const   // ML-38
```
Fixtures (each lane creates its own file under `e2e/fixtures/s16/`, named here so briefs can cite them): `today.ts` (`calm`, `alertsOff`, `quake`, `storm`, `offline`), `health.ts` (`full`, `empty`, `acting`), `discover.ts` (`full`), `family.ts` (`full`, `emptyNeeds`, `acting`, `sixMedicines`), `settings.ts` (`admin`, `member`), `acting.ts` (`adminWriter`, `adminNoLink`, `member`), `onboarding.ts` (`withMeds`, `noMeds`, `deniedTwice`). Mock server: `e2e/health-auth-mock.ts` (existing). Budgets (D-102): today calm 1150, alerts-off 1150, quake 1400, storm 1500, weather 1900; health 1250 / acting 1350 / empty 700; discover 800; family 1650 / empty-needs 1500 / acting 1550; settings overview 850, group 700; onboarding 700 each.

## 7. Invariants every lane must keep
See C-6. Plus: never `taskkill /IM node.exe`; stop only your own `PW_PORT` server (ML-14); a gate rerun leaves the tree clean (ML-32); days come from the shared local-day helper (ML-38); every colour checked in both themes against its real background (ML-39); no value only in an aria-hidden SVG (ML-40).

## 8. Release order
1. Web: integration branch → full suite + rehearsal → Opus whole-branch review → PR → CI green → merge → Cloudflare Pages (automatic).
2. APK 2.7.0 (D-50 updater).
3. **Last and separate:** migration 0044 applied only after Lloyd types "apply 0044" (D-102); 2.7.0 is complete without it.
4. `retro.mjs` with every run journal (PLAYBOOK step 5).
