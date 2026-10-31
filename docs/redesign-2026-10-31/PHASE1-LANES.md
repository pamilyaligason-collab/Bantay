# Phase 1 lanes: shared brief (v13 tabs)

Base: integration branch `claude/v13-phase0` (F0-A tokens/components, F0-B P0 bugs, F0-C glass tab bar + Jack sheet merged at 888ad6f). F0-D (test policy) runs in parallel and owns every `e2e/s16-*.spec.ts`, `e2e/v13.ts`, `e2e/v13-foundation.spec.ts` and the stylesheet contrast tests: do NOT edit those files; add your own `e2e/v13-<lane>.spec.ts` and, until F0-D lands, measure boxes with Playwright `boundingBox()` directly.

## Every lane
1. Plan first: spawn ONE planning subagent on Fable (model `fable`) that writes `docs/plans/2026-11-01-v13-<lane>.md` (TDD, exact files, tests, commands) from the boards and this brief; then build it test first.
2. Visual spec = the boards in `docs/redesign-2026-10-31/mockup/*.dc.html` (+ `BRIEF.md`). Use the F0-A components (`src/features/look/`: LargeTitle, Section, GroupedList/Row, PreviewTile, Carousel, Segmented, Sheet, MapCard) and v13 tokens; never hard-code colours.
3. Real data only from existing hooks/tables. Anything the boards mark "sample", "new" or "[placeholder]" ships as an empty state or behind a feature flag (default off), never as fake data.
4. 44 px targets, computed contrast >= 4.5:1 in light AND dark, reduced motion honoured (motion via existing `look/gsap.ts` / CSS), works at 360 px and the 195 px narrow test, no sideways scroll.
5. Gate: `npx tsc --noEmit` 0; `npx vitest run` for your areas green; your `e2e/v13-<lane>.spec.ts` green on your PW_PORT; 390x844 light + dark screenshots compared with the board (save under `docs/redesign-2026-10-31/shots/<lane>/`); then ONE Opus review subagent (model `opus`) on your diff; fix must-fix; re-run. Commit per step on your branch. No merge, push, PR, migration or deploy.
6. Final report: branch, last SHA, test counts, review verdict, done/total, `checklist:` line.

## File ownership (one owner per file; shared files get hook lines only)
| Lane | Boards | Owns | PW_PORT |
|---|---|---|---|
| T Today | Main | `src/screens/Today.tsx`, `src/features/today/*` (not SOS, already moved by F0-C) | 4500 |
| H Health | Health, HealthMember, Readings, Labs, Medicines, Visits, MoveFood, BodyWiki | `src/screens/Health.tsx`, `src/features/health/*`, `anatomy/*`, `exercise/*`, `nutrition/*` (Family health card: read-only feed preview component in `health/FamilyHealthCard.tsx` reading existing check-ins/readings/memories) | 4510 |
| S Safety | Safety, Warnings, StormTracker, Hazards, RescueMap, FirstAid, FirstAidCPR, OfflineMaps, World, AlertSettings | `src/screens/Safety.tsx`, `src/features/safety/*`, `rescuemap/*`, `gobag/*`, `medid/*`, new `src/features/world/*` | 4520 |
| F Family | Family, FamilyFeed (UI shell, flag off until lane P) | `src/screens/Family.tsx`, `src/features/family/*` | 4530 |
| W Weather | Weather | `src/features/weather/*` (consume `useBlendedWeather` from branch `claude/weather-blend-89aa47` only after it is merged; until then today's forecast hook) | 4540 |
| D Discover | Discover | `src/screens/Discover.tsx`, `src/features/discover/*` | 4550 |
| C Calm | Mindful, JackSheet chat entry | new `src/features/calm/*`, `today/BreathSheet.tsx` reuse via import only | 4560 |
Shared: `src/features/shell/routes.ts` (add your views as one hook line each; keep REDIRECT rules), `src/App.tsx` (lazy route line only). The orchestrator resolves conflicts in shared files at merge.
