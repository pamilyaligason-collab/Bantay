# Session 6 master plan and task list

Goal: finish the session 6 planning phase today (2026-10-20): Parts 1-4 approved-ready, so the build session can start
from `docs/plans/2026-10-20-s6-build.md` with no open questions. No app code in this phase. Public repo: no names,
health values or screenshots.

## Lloyd's decisions (2026-10-20)
| # | Decision | Answer |
|---|---|---|
| D1 | Medicines | **Auto-convert every imported prescription item into a scheduled medicine**, with a screen to edit, pause and delete each one. |
| D2 | Weather | One hero card, a "what to do" action line first, hourly strip, 7 days; weather shown once, not 3 times. |
| D3 | Safety localisation | Planned in Part 3 (map, news, hospitals, hotlines follow each member's place). |
| D4 | Autonomy | Run Parts 2-4 to completion without stopping; ping Lloyd only when his input is required. Audit first. |

## Task list (updated as work lands)
Status: [x] done and verified, [~] in progress, [ ] not started.

| # | Task | Output | Status |
|---|---|---|---|
| 1 | Part 1 research, code inventory, licence table | PART-1.md | [x] |
| 2 | Pre-start gap audit (Opus) | AUDIT.md | [x] |
| 3 | Part 2: personas and habit targets, with the events that measure them | PART-2.md | [x] |
| 4 | Part 3: IA plan (Rx -> scheduled medicine first, Today, weather, safety localisation) | PART-3.md | [x] |
| 5 | Part 4a: 390px light and dark mockups, one private Artifact | link in PART-4.md | [x] |
| 6 | Part 4b: usability script | PART-4.md | [x] |
| 7 | Part 4c: build lanes (implementation plan) | docs/plans/2026-10-20-s6-build.md | [x] |
| 8 | Final review (Opus): plan vs audit gaps, privacy scan of the diff | REVIEW section below | [x] |
| 9 | Push, update PR #2, HANDOFF lines for the vault | PR #2 | [ ] |

## Verification rules for this phase
- Every claim about code cites `file:line`; every claim about data cites a read-only query run on 2026-10-20.
- Privacy scan before each push: no person names, no health values, no addresses (`git diff` grep).
- Mockups checked at 390px wide in light and dark, no sideways scroll.
- Nothing merges to main without Lloyd's explicit yes.

## Facts used for D1 (read-only query, 2026-10-20)
`prescription_items`: 31 rows; 18 have frequency text (10 once-daily patterns, 1 twice, 2 three times, 1 as-needed,
4 other), 13 have none; 4 have a bounded duration; 8 flagged unclear; 0 have a generic name; 7 confirmed, 24 draft.
`medications` already has `schedule jsonb`, `as_needed`, `per_day`, `med_status`, `started_on`, `stopped_on`,
`source_item_id`, stock fields and confirm fields; it has 0 rows.

## Review (Opus, 2026-10-20)
Verdict before fixes: NOT READY (3 blockers). All fixed in the same push:
1. `confirmed_source` only accepts `user`/`auto` and is re-stamped on edit (`0013:63,96-101`): origin moved to a new
   `origin` column; converted rows use `auto` with confidence 1; down script selects on `origin`.
2. `track(kind, name)` has no payload: event list is names only, one table in PART-2 section 4 with an owner lane each.
3. Unowned files (profile writers, `assistant/tools.ts`, `location/place.ts`, check-in emit) assigned; shared-file
   rule covers `sync/tables.ts`, `today/weather.ts`, `SafetyPages.tsx`.
Also fixed: seed arithmetic (8 items -> 8 rows), profile copy step, IMMUTABLE `normalise_drug`, `schedule` default,
`meds_taken` grant, `review_since`, 16:00 chip, 0015 down + rehearsal, all rehearsals run, unnamed tests listed,
new files marked. Privacy scan: no emails, keys, phones, addresses, health values or family names; the owner's first
name appears as in earlier plans.

## Lloyd's changes after review (2026-10-20)
- Today: family list replaced by a one-line family card; Today order is weather, next up + medicines to check,
  My week health KPIs, family, plan, more. Feature map added: nothing removed.
