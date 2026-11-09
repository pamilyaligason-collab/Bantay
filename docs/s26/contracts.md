# S26 phase 1 contract (approved by the owner 2026-11-09)

Base: the commit that adds this file. Decisions D-160..D-170 (vault 02-DECISIONS). Mockups: canvas "Bantay v13 refresh", row "Session 26 plans" (boards S26Lock, S26Today, S26Explainer, S26Discover). Evidence: the S26 audit report (path given in each lane brief).

## Shared rules
- Repo is PUBLIC: no personal data in fixtures, tests or screenshots.
- Depth tokens exist in `src/styles/tokens.css` (light + dark): `--shadow` (rest), `--shadow-raised` (tappable card), `--shadow-hero` (one per screen), `--shadow-press` (`:active`). Use them; do not invent new shadow values. Motion uses the existing `--dur-*` / `--ease-out` and stops under `prefers-reduced-motion`.
- Text for seniors: body >= 16 px, status/value text >= 17 px, targets >= 44 px, contrast >= 4.5:1 (3:1 for 24 px+).
- Health wording: plain, cautious, 911 first. Any new health text is marked for Opus clinical review in the lane result.
- Tests: `npx vitest run --maxWorkers=2 <related files>`; `npx tsc --noEmit -p .` once at the end of the lane. One full vitest run per machine at a time.

## Lane ownership (no lane edits another lane's files)
| Lane | Owns |
|---|---|
| L1 explainer | `src/features/health/ForYou.tsx`, `src/features/health/library/**`, `src/features/health/labGlossary.ts`, anatomy "learn more" link helpers under `src/features/anatomy/**`, their tests |
| L2 today/lock/calm | `src/features/today/Lotto.tsx`, `src/features/today/lotto.css`, new `src/features/today/FxCard.tsx` (+ css/test), `src/screens/Today.tsx`, `src/features/auth/FingerGate.tsx`, `src/features/auth/lock.css`, `src/features/calm/CrisisCard.tsx`, `src/features/calm/calm.css`, their tests |
| L3 discover | `src/features/discover/**` (except files L5 deletes), `src/features/health/HealthVideos.tsx` + its css block + tests (video card a11y only) |
| L4 evidence | `src/features/admin/events.ts` (+ test), `src/App.tsx` (screen-tracking line only), `src/features/phonecheck/**`, `supabase/migrations/0056_usage_allowlist.sql` + `.down.sql`, `src/data/migrations.json` is NOT touched (added after the owner applies 0056) |
| L5 dead code | deletes only: `src/features/family/NeedYouNow.tsx`, `src/features/family/ProfileCard.tsx`, `src/features/health/NudgeCard.tsx`, `src/features/nudge/NudgeEntry.tsx`, `src/features/setup/ChecklistCard.tsx`, `src/features/today/useOthers.ts`, `src/features/today/VideoCard.tsx`, `src/features/anatomy/Silhouette.tsx`, `src/features/look/Aurora.tsx`, `src/features/media/AnimatedDemo.tsx`, `src/assets/mascot.ts`, and tests that only import them |

## Usage event names (D-160) - L4 adds them; other lanes call `track('action', <name>)` from their own files
- screen: add `weather`, `calm`.
- action: `card_talk`, `card_fx`, `card_lotto`, `card_explainer`, `card_top_story`, `card_farm_video`, `card_regional_video`, `card_learn`, `phone_check_fail_notif`, `phone_check_fail_exact`, `phone_check_fail_battery`, `phone_check_fail_alarms`, `phone_check_fail_call`.
- Who calls: L2 `card_talk`, `card_fx`, `card_lotto`; L1 `card_explainer`; L3 `card_top_story`, `card_farm_video`, `card_regional_video`, `card_learn`; L4 the `phone_check_fail_*` names. Until L4 merges, `track()` returns false for the new names (harmless), so lanes test the call, not the insert.
- Server (0056): a BEFORE INSERT trigger on `public.usage_events` returns NULL (drops the row silently, no error) when `(kind, name)` is not on the same allowlist, so old app builds never get a sync error. The list lives in one SQL function; the migration has a down file.

## L1 explainer chain (D-161)
One resolver used by ForYou, Article, Library search and anatomy: 1 lab glossary (`labEntry`) -> `t:<code>`; 2 exact curated topic -> `e:<id>`; 3 full library (if ready) via a fixed code -> mdwiki key map or the glossary's long alias -> `f:<key>`; 4 MedlinePlus Connect by code only (LOINC for labs, a small ICD-10 map for profile conditions, RxNorm names for medicines). Cache "none" for 1 day; bump the cache key prefix so phones drop stale empties. Glossary entries gain optional `loinc` and `topic` fields. `Article.tsx` runs the glossary check for `s:` keys too.

## L2 (D-164, D-170)
- Lotto: game name + date on one line, balls on their own line below, left-aligned, no mid-word breaks; stray spaced full stop removed. Jackpot is P2 (server), not this lane.
- FX card on Today: open.er-api.com `/v6/latest/USD` once a day, cached; shows PHP per USD, change since the saved value, "Market rate, not the BSP reference rate", and an offline chip with the saved time. No key.
- Lock: the prompt chip, PIN and "Not you?" links become frosted glass (backdrop-filter with a solid fallback that keeps >= 4.5:1), failed attempt text in `role="alert"`, 17 px.
- "Need to talk to someone?": calm teal accent (not SOS red), the Today hero card (`--shadow-hero`).

## L3 (Discover order)
Learn > Top stories (hero video + 2 half cards + 2 wide rows) > Farming and DIY (channel chips -> one labelled `<select>`, most-watched lead card, 4 + Show more) > Regional news > Listen > the rest. Every video card: play icon, accessible name "Video, <title>, <channel>, <length>", focus moves to the player on open. Cold deep link into a Discover section must not flash "Coming in this update".

## L4 phone check (D-162)
`call_ok` counts only when Hold-for-help is on; `battery` is a warning (not a fail) when exact alarms and notifications are OK; on fail, also track the first failing `phone_check_fail_<probe>`; no events from web (non-native).
