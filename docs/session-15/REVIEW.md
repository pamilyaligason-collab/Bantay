# Session 15 review: Family Bantay as released

Base: main 6f32f97 (APK 2.5.1, Supabase 0001-0042). Date: 2026-10-30. Read-only SQL only; nothing live changed.
Evidence files in this folder: `inventory.md`, `audit-decisions-safety.md` (DS-n), `audit-security.md` (SEC-n), `audit-ui.md` (UI-n, C-n).

## Gates on main 6f32f97

| Gate | Result | Exit |
|---|---|---|
| `npx tsc --noEmit` | clean | 0 |
| `npx vitest run` | 315 files, 3466 tests passed | 0 |
| `npx playwright test --workers=4` (PW_PORT 5391) | 663 passed, 13 skipped, 0 failed (10.8 min) | 0 |
| Android unit tests | passed in release run 40648766164 (v2.5.1); not re-run locally | - |

## Findings, ranked

### Blocker
| ID | Finding | Evidence | User impact | Fix |
|---|---|---|---|---|
| DS-1 | "Your family has been told" shows when nobody was told | `today/actions.ts:65` treats any non-error as sent; `notify_family` 'carers' scope inserts only writer carers (`0030_carer_alerts.sql:59`); live: the 3 login members with medicines have 0 writer carers | An unwell older person believes help is coming; nobody got an alert | Treat 0 recipients as "not told" and say "Call them"; only promise family alerts when a writer carer exists |

### Major
| ID | Finding | Evidence | Impact | Fix |
|---|---|---|---|---|
| SEC-1 | Any signed-in family member can reset another PIN member and sign in as them | `_shared/login.ts:89` returns the code to the requester; `pin-login/index.ts:67` alerts all but the victim; `0034_pin_reset_erasure.sql:76` refuses only the victim | Account takeover inside the family; breaks D-82/D-84. Not used (0 reset requests) | Approvers = admins only (migration + pin-login deploy) |
| DS-2 | A queued SOS can wait up to 30 min in the outbox | `sos/SosScreen.tsx:121` enqueues without `syncNow(true)`; backoff `sync.ts:356` | Family SOS alert delayed | Force sync after enqueue |
| DS-3 | Simple mode never shows the family SOS banner | `IncomingSos` only in `screens/Today.tsx:70`, not `SimpleToday.tsx` | Simple-mode users miss a family emergency | Render `IncomingSos` in Simple Today |
| DS-4 | Offline, MedDetail says "No alarm on this phone" for your own medicine | `records/useHealthData.ts` ownId from network `getMember()` | Wrong safety message; Edit/Pause hidden offline | Fall back to `selfIdOrCached()` |
| DS-5 | Weather Jack shows beside a live SOS banner (and can be a 2nd Jack) | `screens/Today.tsx:73`, `weather/WeatherCard.tsx:67` | Breaks D-91 | Pass `noJack` while SOS is live / another Jack shows |
| DS-10 | `push_tokens` = 0 rows | live SQL | Native push reaches no phone | Lloyd: install 2.5.1, finish Firebase setup |
| UI-1 | "Ask me anything" hint covers the SOS hold caption; cut at 200% | `shell/shell.css:143`; shot `docs/session-14/shots/T2/today-late.png` | SOS instructions hidden | Move hint above Jack, allow wrap |
| UI-2 | Family Plan "+ Add" hidden under the Jack button | `family/plan.css:42`; shot `docs/session-13/shots/F/plan-empty-light.png` | Cannot add a plan item | Pad the FAB row / move Add to top row |
| UI-3/4 | Tab labels collide and titles cut off at 200% text | `shell/shell.css:22,47,105` | Large-text users cannot read navigation | Icons-only tab bar under 300 px, 2-line titles |
| UI-9 | Sugar and Water share the droplet icon | `shell/Icon.tsx:28` | Confusing at a glance | `IconGlassFull` for water, flask for labs |
| UI-10 | EmptyState's Jack never shows | all 7 callers pass `icon` | Empty screens are text-only | `jack?: JackName` prop, used on Plan, My week, Messages |
| UI-16 | Green chip text 4.40:1 on light theme | `today/today.css:221` | Fails AA for older eyes | `--green` at 14 px; extend contrast test |
| UI-17 | 95 tap targets hard-code 44 px (token is 48) | 33 CSS files | Harder taps | 44→48 sweep after merge |

### Minor (detail in the audit files)
SEC-2 creator keeps reading a claimed profile (latent) · SEC-3 TRUNCATE grants · SEC-4/5 search_path on 2 functions ·
DS-6 dose counting across midnight (`health/doseCount.ts:31-34`) · DS-7 dose-watch midnight bucketing (latent, no slots near midnight) ·
DS-8 snooze says "I will remind you" with notifications off · DS-9 quiet-hours line wrong for Unwell pushes · DS-11 SOS waits ~7 s for GPS + id in series ·
DS-12 Video of the day built but never shown (D-64) · UI-5..8, UI-11..15, UI-18, UI-19 · C1-C30 copy cuts (Medical ID 317 chars, Privacy, Phone warnings, Labs disclaimer...) ·
`sos-events-prune` and `erasure` crons write no `job_runs` · `FAMILY_INVITE_TOKEN` unused by deployed code (Lloyd: unset).

## Verified OK
- RLS on all 61 public tables; health tables private by default (D-82/D-84); 4 storage buckets private; definer functions `search_path=''` except 2 (SEC-4/5).
- Edge functions check JWT / admin / cron secret; pin-login, family-names, join rate-limited; no secrets in repo or history; no analytics; logs carry no PII.
- Updater: GitHub-release allowlist re-checked per redirect, exact size + SHA-256, own file only.
- APK signing: v2.1.0, v2.2.0, v2.5.0, v2.5.1 share one signer cert (sha256 `bd95d4fd...c218`), so a manual 2.2.0 -> 2.5.1 install is not blocked by a key change.
- Crons fresh (alerts-ingest 144 runs/24 h, dose-watch 96 runs/24 h, 0 failures); alarm claims honest (remindPeople + KEY_ALARM_HEALTH.ok); SOS fan-out to all family; reduced motion honoured; icon buttons named.

## Not verified
- Live phone checks (session-12 PLAN 6.4): blocked on Lloyd installing 2.5.1; the exact manual-install error is still unknown.
- Mockup v9 screen-by-screen comparison: judged from session 13/14 screenshots plus code; fresh shots after the fixes.
- Deployed web bundle vs main (no deploy workflow; bantay.pages.dev serves `main-DvtXp59Q.js`).
- `.env.production` contents (read denied).

## Fix plan
See `contracts.md` (9 lanes, one owner per file). Server changes (migration 0043, pin-login and dose-watch deploys) are built and tested here and wait for Lloyd's approval to apply.

## Fix results (branch claude/family-bantay-review-check-ac44fa)

Built as 9 lanes (workflows wf_b4a3522d-8d8, fix round wf_a07207f0-4a8), Sonnet builders, Opus audit per lane, merged one at a time with tsc 0 after each.
Then a 44->48 px min tap-size sweep (82 lines, 31 CSS files) and a final whole-branch Opus review (GO_WITH_FIXES, all majors fixed in 0e73e20).

| Finding | Status |
|---|---|
| DS-1 | Fixed: 0 recipients -> "Saved. No one gets your alerts yet. Call your family."; family lines only when a writer carer exists; storm card keeps "hold SOS or call 911" |
| DS-2, DS-3, DS-4, DS-5, DS-6, DS-8, DS-9, DS-11 | Fixed with tests |
| DS-7 | Not changed: the app's `pickSlot` (`health/meds.ts:156`) tags a take with a slot of the day it was taken, and dose-watch's day bucketing mirrors it. Two attempts to change only the server created false missed-dose alerts. Needs one joint app + server change later. |
| SEC-1..SEC-5 | Fixed in `0043_s15_security.sql` + pin-login + client copy (admin approves a PIN reset). The down migration deliberately does not re-grant TRUNCATE. **Not applied: needs Lloyd.** |
| UI-1..UI-5, UI-7..UI-17, UI-19, C1-C30 | Fixed (UI-1: the Ask hint hides where it would cover text; UI-2: Plan Add sits at the list end) |
| UI-6, DS-12 | Out of scope this round |

Final gates on 0e73e20: tsc 0; vitest 318 files / 3491 tests, exit 0; Playwright: see the PR.
To ship: `0043` migration + pin-login deploy (dose-watch unchanged), web deploy, APK 2.6.0.
