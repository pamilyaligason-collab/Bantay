# Session 15 fix contract

Base: the commit that adds this file on `claude/family-bantay-review-check-ac44fa` (from main 6f32f97).
Findings: `REVIEW.md` and the audit files in this folder (DS-n, SEC-n, UI-n, C-n). Each lane fixes only its findings and touches only its files.
No lane edits a file another lane owns. Anything needed outside your files goes in `needs`.

## Shared names (use exactly)
- `EmptyState` gains `jack?: JackName` (`JackName` from `src/features/look/JackArt.tsx`). When `jack` is set and `icon` is not, it renders `<JackArt name={jack} .../>` at its usual empty-state size. `icon` still wins when both are passed. Lane L1 owns it; L2/L3/L4 may pass `jack` before L1 merges (the orchestrator merges L1 first).
- `.who-chip` (person chip, replaces "Showing: Name" text) lives in `src/styles/app.css`, owned by L1. L3/L6 use the class name only.
- Unwell result type in `src/features/today/actions.ts` (lane S1): `raise()` returns `'sent' | 'nobody' | 'offline' | 'refused'`. `'nobody'` = RPC returned 0 and no Unwell was already sent today (kv `mood.told.<YYYY-MM-DD Manila>` set when the RPC returns > 0). Toast for `'nobody'`: "Saved. No one gets your alerts yet. Call your family."
- Migration number reserved: `0043_s15_security.sql` + `.down.sql` (lane X only).
- PIN reset approvers: **admins only** (`public.is_admin()`), both for who gets the `pin_approve` alert and who may call `approve_pin_reset`. Requester can no longer approve their own request.
- D-91 (Jack): never on SOS, IncomingSos, emergency results, flagged labs, the health report or a diagnosis; at most one per screen (Ask button head excluded).
- Copy: plain words, never weaken an emergency or medical warning. Strings marked do-not-shorten in `audit-ui.md` stay as they are.

## Lanes

| Lane | Findings | Files owned |
|---|---|---|
| S1 Safety: Today + alerts | DS-1, DS-3, DS-5, DS-8, DS-9 | `src/features/today/actions.ts`, `src/features/today/QuickLog.tsx`, `src/features/today/SimpleToday.tsx`, `src/features/today/NextUp.tsx`, `src/features/health/bpcheck/CrisisCard.tsx` (+ its direct caller if a prop is needed), `src/features/health/reminders.ts`, `src/screens/Today.tsx`, `src/screens/Me.tsx`, their tests |
| S2 Safety: SOS + doses + offline id | DS-2, DS-11, DS-4, DS-6 | `src/features/sos/SosScreen.tsx`, `src/features/records/useHealthData.ts`, `src/features/health/doseCount.ts`, tests `sosFlow.test.tsx`, `MedDetail.test.tsx`, `doseCount.test.ts` |
| X Server security + dose-watch | SEC-1..SEC-5, DS-7 | `supabase/migrations/0043_s15_security.sql` (+down), `supabase/functions/pin-login/index.ts`, `supabase/functions/_shared/login.ts` (+tests), `supabase/functions/dose-watch/logic.ts` (+test), `src/features/auth/pinReset.ts`, `src/features/setup/ApprovePinSheet.tsx`, `src/features/notify/templates.ts` (+ their tests) |
| L1 Shell + look | UI-1, UI-3, UI-4, UI-9, UI-10 (prop), UI-16 (test), UI-18 (shell), UI-19, `.who-chip` | `src/features/shell/shell.css`, `src/features/shell/JackFab.tsx`, `src/features/shell/Icon.tsx`, `src/features/shell/TabBar.tsx`, `src/features/look/EmptyState.tsx` (+test), `src/features/look/contrast.test.ts`, `src/styles/app.css` |
| L2 Today look | UI-16 (CSS), UI-18 (today), UI-10 caller (My week), C16, C27 | `src/features/today/today.css`, `src/features/today/SelfCare.tsx`, `src/features/today/SeeWeek.tsx`, `src/features/today/nextPick.ts` (+test), `src/features/today/MyWeek.tsx` |
| L3 Health look | UI-5, UI-7, UI-9 (labs empty icon), UI-11, UI-14 (Health), UI-15, C6, C7, C17-C21 | `src/features/health/LabsList.tsx`, `LabsScreen.tsx`, `Medicines.tsx`, `medicines.css`, `medDetailLogic.ts` (+test), `NudgeCard.tsx`, `nudge.css`, `nudgeLogic.ts`, `LatestList.tsx`, `bpcheck/BpWords.tsx`, `m7a.css`, `src/features/nudge/NudgeEntry.tsx`, `src/screens/Health.tsx` (all under `src/features/health/` unless a path is given) |
| L4 Family | UI-2, UI-10 callers (Plan, Messages), UI-13, C12-C14 | `src/features/family/plan.css`, `Plan.tsx`, `Messages.tsx`, `People.tsx`, `family.css`, `Memories.tsx` |
| L5 Copy sweep | C1-C5, C15, C25, C26, C28-C30, UI-8, numbered steps (PhoneWarnings, ZonePicker) | `src/features/medid/MedicalId.tsx`, `privacy/PrivacyScreen.tsx`, `safety/PhoneWarnings.tsx`, `safety/alerts.ts`, `safety/stormMode.ts`, `docs/DocsScreen.tsx`, `sos/SosHold.tsx`, `sensors/SensorSettings.tsx`, `setup/Wizard.tsx`, `update/UpdateSheet.tsx`, `weather/WeatherScreen.tsx`, `weather/wxs7w.css`, `inbox/Inbox.tsx`, `location/ZonePicker.tsx` (all under `src/features/`) |
| L6 Discover + food + Ask | C8-C11, C22-C24, UI-12, UI-14 (Food) | `src/features/nutrition/NutrientsToday.tsx`, `NutritionScreen.tsx`, `src/features/discover/learn/Meds.tsx`, `src/features/discover/play/Facts.tsx`, `src/features/health/library/Videos.tsx`, `src/features/assistant/OfflinePanel.tsx`, `assistant.css` |

Each lane may also edit tests that assert the strings or behaviour it changes (grep the old string in `*.test.ts*` and `e2e/*.spec.ts` first). If such a test file is owned by another lane's feature folder, list it in `applyNotes`.

After merge (orchestrator): UI-17 44→48 px sweep (Haiku + grep check), fresh 375 px / 195 px light + dark shots of the touched screens vs mockup v9, full gates, final Opus review.

## Out of scope this round
UI-6 (Today order), DS-12 (Video of the day), D-64, the cross-midnight display in `health/meds.ts:108`, new mockup screens. Live apply of 0043 / pin-login / dose-watch needs Lloyd.

## Gates per lane
`npx tsc --noEmit` exit 0; `npx vitest run <changed + related test files>` exit 0; Playwright only for specs the diff can break, with a unique `PW_PORT` (S1 5401, S2 5402, X 5403, L1 5411, L2 5412, L3 5413, L4 5414, L5 5415, L6 5416). Server lane: `deno test` on the touched function tests if deno is available, else vitest where the repo runs them; SQL reviewed by reading, never applied.
