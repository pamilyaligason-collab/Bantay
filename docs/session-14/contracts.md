# Session 14 contracts (round B: labs, medicines, Today v7, Family messages, Jack Jack)

Base sha: the orchestrator commit that adds this file (on top of e51aca4). Every lane starts there (ML-01).
Design contract: mockup v8, vault `D:/ObsidianVault/20-projects/family-bantay/mockups/bantay-complete-mockup.html`
(grep `data-s="<id>"`). Decisions: vault `02-DECISIONS-bantay.md` D-9 (source of every record), D-38 (Previous switch,
body map stays), D-62 (SOS hold + Self-care stay on Today), D-82/D-84 (member records private), D-90, D-91.

## Shared (orchestrator owns; lanes import, never edit)

| Name | Where | Use |
|---|---|---|
| `JackArt({ name, size?=96, decorative?=false, className? })` | src/features/look/JackArt.tsx, exported from `features/look` | Jack Jack sticker. Fixed width/height box, lazy. `decorative` when the text beside it says the same. |
| `JackName`, `JACK_ALT`, `jackSrc(name, 128\|256\|1024)` | same | Names: hello, head, well-done, thinking, reading, listening, watching, playing, walking, drink-water, sleepy, family-hug, medicine, cooking, ready-for-rain, celebrate, offline, empty-list, get-help. |
| Assets | src/assets/jack/jack-<name>-{256,1024}.webp (+ jack-head-128.webp) | Already converted; never add or edit files here. |
| `.jack` | src/styles/app.css | Base rule (block, contain). Size and placement rules go in the lane's own css with a lane prefix. |
| From session 13 | `Skeleton`, `EmptyState`, `.press`, tokens, `useReducedMotion`, `dayKey` | Unchanged (see docs/session-13/contracts.md). J alone may edit EmptyState.tsx (default art). |

**Jack Jack rules (D-91):** never on SOS, IncomingSos, emergency or high-reading results, a diagnosis, or a lab/medicine
warning. get-help is for set-up and to-do help, never SOS. Reduced motion: no entrance animation on the art. At most one
Jack per screen. Size 72-120 px in cards, 40-56 px inline, the Ask button uses `head`.

## Lane-owned names

| Lane | Name | Signature |
|---|---|---|
| L | `labHistory(results, testKey)` and helpers | src/features/health/labsLogic.ts (extend; pure, tested) -> newest-first list for one test with `{ value, unit, date, sourceFileId?, labName?, range? }` |
| L | `rangeSource(result)` | labsLogic.ts -> `{ kind: 'lab', text }` (the lab's own range on the paper) or `{ kind: 'guide', text: 'General guide (<source>, <year>)' }` |
| M | `medDetail` helpers | src/features/health/medDetailLogic.ts (new; pure, tested): days left, 7-day strip, who saw a miss |
| T2 | `snoozeCard(slotKey, minutes=10)` / `isSnoozed(slotKey, now)` | src/features/today/ (new file, e.g. snoozeCard.ts; pure, tested). Native alarm snooze reuses `reminderActions` (read-only). |
| F2 | Family segment hash | `#family` = Home, `#family/messages` = Messages, `#family/plan` (and `#plan`) = Plan. `#family/people` keeps opening Home. |

## Ownership (no two lanes touch the same file)

- **L Labs:** src/features/health/{LabsList,LabDetail,LabsScreen,MetricScreen,MetricChart,HealthLinks}.tsx, labsLogic.ts, their tests,
  health.css; **src/screens/Health.tsx only the Overview labs line** (swap the inline labs list for the
  "Lab results · last paper <date>" row; no other line).
- **M Medicines:** src/features/health/{Medicines,MedDetail,MedEditSheet,MedReview}.tsx, medDetailLogic.ts (new), medicines.css, m7a.css,
  their tests. Read-only: Refill.tsx, stock.ts, useMedications.ts, useMedicationRows.ts, doseCount.ts, today/myWeekLogic.ts.
- **T2 Today:** src/screens/Today.tsx, src/features/today/**, src/features/nutrition/**. Must not change the exported signatures of
  myWeekLogic.ts (M reads it).
- **F2 Family:** src/screens/Family.tsx, src/features/family/** except IncomingSos.tsx.
- **J Jack Jack:** src/screens/{Discover,SignIn,Onboarding}.tsx, src/features/{discover,setup,assistant,exercise,auth,update}/**,
  src/features/shell/JackFab.tsx, src/features/look/EmptyState.tsx (+ its test), src/features/sync/OfflineBar.tsx (the offline band).
- **Jack placements inside other lanes' screens are done by that lane** (they import `JackArt`):
  T2 well-done (dose marked taken), sleepy (Simple at night), ready-for-rain (storm advice), drink-water (heat advice / water log),
  celebrate (My week streak, if shown); M medicine (Medicines empty / pillbox); F2 well-done (I'm OK), family-hug (Family recap);
  L none (labs stay plain; the empty state may use EmptyState's default art).
  J places: hello (welcome / sign-in), head (Ask button), thinking (Ask loading), reading (Learn), listening (Listen), watching (Watch),
  playing (Play), walking (Move), cooking (Recipes / Cook), offline (offline band), empty-list (EmptyState default), get-help
  (set-up / to-do help), celebrate (Play streaks).
- Nobody else edits app.css, tokens.css, glass.css, shell.css, look/** (except J's EmptyState), App.tsx, src/assets/**. A lane that
  needs one stops and reports it in `needs`.
- e2e: each lane edits only specs for its own area; new specs are `e2e/s14-<lane>-*.spec.ts`; screenshots only when
  `S14_SHOTS=docs/session-14/shots/<LANE>` is set (ML-32), so a gate rerun leaves the tree clean. Old specs that rewrite committed
  PNGs: run them, then `git checkout -- docs/` before committing.

## Gates per lane

`npx tsc --noEmit`, `npx vitest run <your files>`, then the full vitest,
and the Playwright specs for your tab. Quote exit codes. The two vitest files that import `../../../node_modules/*AndroidManifest.xml`
cannot load inside a lane worktree; note them, do not fix them.
