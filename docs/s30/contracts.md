# S30 contract (Lloyd approved 2026-11-10: "Approve, build S30")

Base: main 865ae448 + this file. Every lane rebases on the commit that adds this file.

## Lanes, files and ports
| Lane | Owns (only these) | PW_PORT | Migration no. |
|---|---|---|---|
| L1 Location | src/features/garden/climate.ts, src/data/provinceClimate.*, src/features/location/** (new helpers only), place-following hooks in garden/weather/safety they need; e2e/s30-location.spec.ts | 5311 | none |
| L2 Integrity | src/features/health/** sleep tiles/selectors, new src/features/integrity/**, supabase/functions/integrity-check/**, supabase/migrations/0064_* ; admin System health row via src/features/admin/desk/System* | 5312 | 0064 |
| L3 Failed runs | supabase/functions/alerts-ingest/**, supabase/functions/pagasa-warnings/**, supabase/functions/da-prices/** (no client files) | none | none |
| L4 Admin + notifications | src/features/settings/** (admin link), src/features/notify/** inbox, src/features/sync/** outbox explanation; ops/sql/s30_archive_alerts.sql (written, NOT applied) | 5314 | none |
| L5 Texas | round 1 read-only research: docs/s30/TEXAS.md only | none | none |
| L6 Watch + leftovers | src/features/discover/** Watch rows, src/features/today/heroCards.ts rain-line repeat, src/features/world/World.tsx banner wording | 5316 | none |
| L7 Medicines | read-only: docs/s30/MEDS-DRAFT.md only (no app or DB writes) | none | none |

A lane that needs a file another lane owns writes it in `needs`, never edits it.

## Shared names
- `placeProvince(p: LatLon): Promise<string | null>` (L1, src/features/location/province.ts): the PAGASA province name for a point, with aliases (Manila, City of Manila, NCR, National Capital Region, Metropolitan Manila -> "Metro Manila"; cities inside provinces -> their province).
- `job_runs.job = 'integrity-check'` (L2) with summary counts only: `{dupes, impossible, mismatched, checked}`.
- Archive = set `carer_alerts.seen_at = now()` where `seen_at is null and created_at < <cutoff>`; never delete (L4).

## Rules
- Medical data: never invent a value, a unit, a medicine or a dose. Unknown stays null. Any automatic fix of a record is proposed, logged and reversible; deletion of duplicates only through the existing records_dedupe_log path.
- Rule A (D-184) still holds for any UI change (e2e/s29-cards.spec.ts at 4 sizes).
- Never deploy, push, apply SQL or call live functions with writes. The orchestrator does.
- Playwright: `--workers=1` (memory is tight; another project runs dev servers on 5182/5183/5191/5291).

## Wave 3 (Lloyd 2026-11-11: "proceed and close all open items")
| Lane | Owns (only these) | PW_PORT | Migration no. |
|---|---|---|---|
| L6 round 2 | L6 files above + src/features/safety/alerts.ts outdatedLine wording (one shared never-checked sentence) | 5316 | none |
| L8 (merged) | Texas round 1-2: time zone per person, units, 988, labelled PH alerts | 5318 | 0065 |
| L9 Texas client leftovers | src/features/location/** (home place), src/features/settings/** (My home place, digest time), src/features/garden/** (Plant route outside PH), src/features/family/** (map fit, CarerCards), src/features/health/** temperature input + zone-reactive hooks, src/features/time/**, e2e/s30-texas*.spec.ts | 5319 | none (home place stays on the phone) |
| L10 Server + Jack region + base test fixes | supabase/functions/ask/**, supabase/functions/alerts-ingest/** (push titles), supabase/functions/world-news/**, src/features/assistant/** request body only, src/features/notify/inApp*, src/features/sensors/** steps-dedupe test | 5320 | none |
