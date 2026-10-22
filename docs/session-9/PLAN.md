# Session 9 plan: UI polish, food log, Jack at near-zero cost

Status: DRAFT, waiting for Lloyd's approval. Nothing is built yet.

Sources (all 2026-10-22, read-only lanes):
- docs/ui-audit/APP-AUDIT.md (phone app, 218 shots, axe 0 violations)
- docs/ui-audit/ADMIN-AUDIT.md (admin, 312 shots)
- docs/research/OPENFITNESSPAL.md (reuse nothing: MyFitnessPal-scraped data, AGPL / unlicensed code)
- docs/research/BIOMISTRAL-VPS.md (dropped: MedQA 50.6%, 2k context, no tools, 45 s to 3 min on CPU)
- docs/research/JACK-COST.md (image is ~8-10% of a scan; chat costs more than scans; ~$1/month today)

Screenshots stay out of git (59 MB); they live in the worktree folders named above.

## Wave 1: bugs and shared pieces (6 lanes, parallel)

| Lane | What | Files (no overlap) | Review |
|---|---|---|---|
| APP-A | Shell and tokens: `.btn` box-sizing (Full report clipped), off-switch contrast 3:1, 13 px floor, text-size setting, Simple mode easy to find, drop "App dev" row, plain dates | app.css, shell.css, Settings, safety/family css | Opus |
| APP-B | One verdict helper for BP/sugar/labs words and one dose counter, so KPI, Vitals, body map and report agree | kpisLogic.ts, model.ts, vitals.ts, labsLogic.ts, ranges.ts, visitSummaryLogic.ts, Report.tsx | Fable (health logic) |
| ADM-A | Admin shell: blank auth page gets a fallback (optional prop set in admin-main.tsx, phone default unchanged), phone search box, shared confirm dialog with title + danger colour, one date format, readable status words, dark avatar | desk.css, ui.tsx, WebShell.tsx, shared.tsx, admin-main.tsx | Opus |
| JACK-A | Cost guard: max_tokens + minimal reasoning on extraction, log token counts and cost only (no text) | supabase/functions/records-extract, scripts/import/* | Opus |
| JACK-C | Small vetted knowledge base: topics + Tagalog synonyms, full-text search, MedlinePlus Connect build script | migration 0025_knowledge.sql (+ .down, rehearsal), scripts/knowledge/* | Fable (health text) |
| FOOD-1 | High-salt tag on dish tiles; quick-add a food not in the list (unknown values stay blank) | nutrition/logic.ts, PlateSheet.tsx, actions.ts | Opus |

## Wave 2: screens and Jack (after wave 1 merges)

| Lane | What | Review |
|---|---|---|
| APP-C | Health screens: headline not cut at 360 px, Vitals toggle, water card heading, wine-glass icon, BP placeholders, old "Family > Records" hints | Opus |
| APP-D | Today + weather: one heat number, scan hint stops covering SOS, Simple mode SOS works, Call button on roll call, late dose state | Opus |
| ADM-B | Home + Calendar: layout gap, readable chart labels, "1 paper", per-person queue link, week deltas, meds not flooding the month view | Opus |
| ADM-C | Records workflow: Queue error state (bug), split view with the paper beside the values, range + High/Low tag, sticky Confirm, readable field names, tab overflow | Fable (records correctness) |
| ADM-D/E | Members; Files, IDs, History (IDs expiring tile goes to the right list, expiring-soon tag) | Opus |
| JACK-B | New `ask` edge function: emergency keyword gate (EN/TL/Taglish, no model call), own records as context under RLS, knowledge base + MedlinePlus answers first, cheapest safe model with ZDR, 20 s timeout + fallback, metadata-only logs. Replaces n8n on the Alfred VPS (B-9 cleaner) | Fable (safety) |
| JACK-D | App switches to `ask` behind an env flag; Tagalog/Taglish reply rule | Opus |
| FOOD-2 | Optional doctor-set potassium limit for kidney patients (migration 0026, blank by default) | Fable |

## Wave 3
- APP-E Tagalog labels across the app (after APP-B and APP-D).
- On-device OCR (ML Kit, free) only if scan cost passes ~$2/month.

## Lloyd's part (Phase 0, about 30 min, no code)
1. Create three OpenRouter keys (chat, scan, laptop), each with a spend limit; turn on ZDR-only.
2. Let me run 20 old papers through Haiku 5.5 vs Gemini; if Haiku reads them as well, it becomes the main model (3-5x cheaper).

## Cost
- Today: ~$1/month realistic, ~$11 if everyone hits the daily cap (estimates; nothing logs cost yet).
- After: ~$0.20/month realistic, ~$2.20 worst case (estimates until JACK-A logs real numbers).

## Gates
- Every migration: rehearsal on WSL Postgres, then Lloyd says "apply".
- Every wave: tsc, vitest, e2e, review pass, then a PR; Lloyd says "merge".
- Privacy notice gains one line: the assistant processes data abroad (RA 10173).

## Revision 1 (Lloyd 2026-10-22): "proceed and carry out all recommended improvements", plus new asks

Approved: all waves above. This chat is the orchestrator. New asks folded in:

Today
- Weather card: dynamic graphics by condition and time of day (no flat green). -> W1-WEATHER
- Meal logging redesign; Salt today merged into the meal flow (no separate salt card). -> W1-NUTRI
- Move: more options, especially mobility; embedded official videos where graphics are hard. -> W1-MOVE
- Family card on Today becomes self-care: breathing exercise to relax or sleep. -> W2-FAMILY

Health
- Interactive, engaging nudge card instead of "no reading this week" and "0" KPIs. -> W2-HEALTH
- Move more comprehensive. -> W1-MOVE
- Food: macros and nutrients for age and condition, food vs supplement view. -> W1-NUTRI

Ask
- "Scan a paper" becomes "Scan & Capture": also reads a photo of a BP monitor or glucometer into a reading. -> W2-ASK

Family
- Hide today's check-in once logged; members as status bubbles (emoji); tap opens messages with text, voice note and file attach (video -> link to Messenger). -> W2-FAMILY (migration 0027 messages + private bucket)
- Video previews for all videos. -> W1-MOVE (shared LiteVideo)
- Admin: "View as member" toggle. -> W2-ADM-VIEW (read-only, Fable review)

Safety
- Subtle grouped backgrounds: emergency vs first aid vs sources. -> W2-SAFETY

Wave 1 lanes (8): APP-A, APP-B, ADM-A, JACK-A, JACK-C, W1-NUTRI (absorbs FOOD-1/FOOD-2, migration 0026), W1-WEATHER (absorbs the heat-number fix), W1-MOVE.
Wave 2 lanes: APP-C + W2-HEALTH, APP-D, W2-FAMILY, W2-ASK, W2-SAFETY, ADM-B..E, W2-ADM-VIEW, JACK-B, JACK-D.
Wave 3: Tagalog labels, on-device OCR if needed.
