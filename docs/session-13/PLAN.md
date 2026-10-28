# Session 13 plan: feel and Discover (Today, Health, Discover, Family)

Lloyd, 2026-10-28: "review and apply this skill apple-design + emilkowalski to this app. research and enrich discover tab - as its barren
at the moment. today, health, discover and family needs improvement." Then: "continue until completed."

Base: main fd3fb30 + orchestrator commit (Skeleton, EmptyState, .press). Contract: `docs/session-13/contracts.md`.
Research: tab inventory + Discover content research (session 13 transcript; summary in section 2).

## 1. Rules (frozen)

1. **v6 design stays (D-66).** Cream/green tokens, Fraunces + Plus Jakarta Sans, card radii and shadows do not change. No new colours.
   "Apply the skills" means behaviour, motion, hierarchy and states inside v6, not a reskin.
2. **Skills, as applied here** (apple-design = Apple WWDC fluid interfaces; emil-design-eng = Emil Kowalski):
   - Feedback on press, instantly: every tappable card or tile gets `.press` (scale .97, 100 ms ease-out). Buttons already scale .98.
   - Animate only what users see occasionally (sheets, a dose marked taken, first reveal). Nothing on tab switches beyond the existing
     springIn; nothing on 100x/day actions. Under 300 ms; `--ease-out` for enter, `--ease-in-out` for movement. Never `ease-in`, never
     `scale(0)`, never `transition: all`. Only transform and opacity (height only with the opacity+height collapse pattern).
   - State change is shown, not jumped: a completed action morphs in place (button -> "Taken 9:02") before the card leaves.
   - Interruptible gestures: sheet drag-to-dismiss follows the finger 1:1 from the grab point, rubber-bands upward, and on release
     decides by velocity projection (d=0.99), not position alone.
   - Every list has three states: loading (Skeleton, aria-busy), empty (EmptyState: what goes here + one action), error (one line
     with Try again). No silent `return null` for a list that the person expects to fill.
   - Reduced motion = cross-fade or nothing. Reduced transparency already handled in glass.css.
   - Simplicity, not minimalism (Apple principle 6): the most important thing first, the rest one level deeper.
3. Grade-6 English labels, Filipino-friendly words; no text under the bottom bar (--tabbar-clear); 48 px targets; 200% text works.
4. Health and safety content in Discover is short, sourced (URL + checked date in the data file), links out to the official source,
   and never gives a dose or a diagnosis. Anything not verified is left out, not marked UNVERIFIED in the UI.
5. Local day is Manila (ML-38): any "today's pick" or season uses the device local date through one helper and tests use a fixed
   clock at 23:30 and 00:30.
6. Merge, deploy and APK release stay with Lloyd.

## 2. What we found

- **Discover** (src/screens/Discover.tsx): Listen and Watch are "Coming in this update" cards. Learn shows one tile (recipes, 20);
  the medicine guide is off until a clinician signs (kv learn.medcards). Play has 4 games/facts. News depends on a feed that can be empty.
  Already in the app and unused here: 12 official videos (src/data/videos.json, AHA CPR, BE FAST stroke, Move...), the Health
  library (MedlinePlus summaries, #health/library), `articleText()` for read-aloud, the TTS plugin 8.0.2 already installed.
- **Today**: 18 blocks; loading is a bare h1; most empty blocks vanish; the weather headline sits over the art with weak contrast;
  the dose card has no "done" moment.
- **Health**: 18 blocks in one long column, three loose links ("Explore your body", "Move", "Food") plus HealthLinks; nothing shown
  until ready; no press feedback on anything.
- **Family**: check-in card and roll call are good; status is only an icon in the corner; the "Learn together" block is a large
  empty dark video area; sheets have no drag-to-dismiss; roster has no loading state.
- Research picks for Discover: PhilHealth Konsulta (official circular TS PC2024-0013), Expanded Senior Citizens Act (RA 9994:
  20% discount + VAT exemption on medicines), official videos, season hooks (heat Mar-May, typhoon Jun-Nov, Undas, Christmas food),
  Calm/Headspace pattern: one daily pick on top, then named shelves.

## 3. Lanes (4, Sonnet builds, Opus 5.5 audits each)

| Lane | Owns | Delivers |
|---|---|---|
| **T Today** | src/screens/Today.tsx, src/features/today/** | Skeleton while kv loads; dose card done-morph (check + "Taken h:mm", then opacity+height collapse 240 ms; cross-fade under reduced motion); `.press` on QuickLog tiles, MyWeek, PlanToday rows, NearbyList; weather headline legibility (solid scrim/vibrancy behind text, AA contrast on every sky state); MyWeek/PlanToday empty states only where the person expects them (first week); "More" group heading. |
| **H Health** | src/screens/Health.tsx, src/features/health/{Kpis,BodyMap,LatestList,LabsList,HealthLinks}.tsx, health.css | Summary-then-Browse layout (Apple Health): KPIs and the latest readings first, then one "Browse" grid of tiles (Body, Medicines, Readings, Labs, Move, Food, Papers, Visits, Library) replacing the three loose links + HealthLinks list; Skeleton until ready; EmptyState for no vitals / no labs / no readings with "Add a reading"; `.press` on tiles and rows; KPI count-up once per open (countTo), none under reduced motion. Routes unchanged. |
| **D Discover** | src/screens/Discover.tsx, src/features/discover/**, src/data/discover/** (new), discover CSS moved out of shell.css into src/features/discover/discover.css | (1) "Today's pick" card above the sub-nav: one item per local day (recipe, trivia, PH fact or video), deterministic by date. (2) Season card from src/data/discover/seasons.json (date windows; each with 2-3 do-now lines and a link to an in-app screen). (3) Learn: shelves "Recipes", "Health reads" (opens #health/library), "Your benefits" (PhilHealth Konsulta, senior 20% + VAT exemption; each sourced, link-out), medicine guide still behind learn.medcards. (4) Listen (register): read-aloud of recipes (and medicine cards when the flag is on) via articleText + TTS plugin, Web Speech fallback on web; play/stop, one at a time, stops on leaving. (5) Watch (register): shelves from videos.json grouped by topic, each opens YouTube outside the app (never embedded); one quiet line "Live TV is coming" (waits on Lloyd's list). (6) Sub-nav pill slides between subs (transform only). (7) `.press` on every tile. |
| **F Family** | src/screens/Family.tsx, src/features/family/** (except IncomingSos.tsx), family css | Status ring on each avatar (green OK today, amber needs a look, grey none) with the existing legend; "I'm OK" done-morph ("You're OK · 4:12 AM"); Skeleton for the roster before first load; Learn together card made compact (title + poster/first line, not a big empty block); Sheet drag-to-dismiss with 1:1 tracking, rubber-band, velocity projection (pure helper + tests); `.press` on bubbles, plan rows; Plan empty states via EmptyState. |

Not in this release: Safety tab, Ask/Jack FAB coachmark position, live TV list, medicine cards switch-on.

## 4. Gates

Per lane: tsc 0, vitest for new logic (daily pick, seasons by date with 23:30/00:30 fixed clock, velocity projection, TTS wrapper with a
fake), the Playwright specs the diff can break, shots light + dark of the changed screens (scroll to the new parts, ML-37) compared with
the v6 mockup boards, `git status --porcelain` clean after gates (ML-32). Orchestrator: merge one lane at a time, smoke after each,
full vitest + Playwright, final Opus whole-branch review, PR. Mockup canvas updated with the new shots.
