# Session 13 contracts (feel + Discover)

Base sha: see the orchestrator commit that adds this file. Every lane starts there (ML-01).

## Shared (orchestrator owns; lanes import, never edit)

| Name | Where | Use |
|---|---|---|
| `Skeleton({ lines?=3, card?=true, style? })` | src/features/look/Skeleton.tsx, exported from `features/look` | Loading placeholder. Put `aria-busy="true"` on the section and keep one visible or sr-only "Loading" text. |
| `EmptyState({ icon?: IconName, title, body?, action?: { label, onClick } })` | src/features/look/EmptyState.tsx, exported from `features/look` | Empty list. One action at most. |
| `.press` | src/styles/app.css | Add to any tappable non-button card/tile/row (scale .97 on :active, 100 ms, off under reduced motion). Buttons already scale .98. |
| `.skel`, `.skel-line`, `.empty-state` | src/styles/app.css | Styles for the two components. |
| Tokens | src/styles/tokens.css | `--ease-out`, `--ease-in-out`, `--ease-sheet`, `--dur-press` 100, `--dur-fast` 150, `--dur-base` 200, `--dur-sheet` 280. Use these; no literal curves or new colours. |
| `prefersReducedMotion()`, `useReducedMotion()` | src/features/look/useReducedMotion.ts | Motion guard in JS. |
| `countTo`, `springIn`, `Reveal` | src/features/look | Existing motion helpers. |
| `dayKey(d?)` | src/features/discover/play/score.ts | Local-day key (device local date). Discover lane uses it for the daily pick and seasons. |

## Lane-owned names

| Lane | Name | Signature |
|---|---|---|
| D | `pickOfDay(day: string)` | src/features/discover/today/pick.ts -> `{ kind: 'recipe' \| 'trivia' \| 'fact' \| 'video', id: string }`, deterministic per day key |
| D | `seasonFor(d: Date)` | src/features/discover/today/season.ts -> the active season entry from src/data/discover/seasons.json or null |
| D | `speak(text) / stopSpeaking()` | src/features/discover/listen/speech.ts; TTS plugin on native, `speechSynthesis` on web, no-op when neither |
| D | `discover.css` | src/features/discover/discover.css; the `.dc-*` rules move here from shell.css (D deletes them from shell.css; that deletion is its only shell.css edit) |
| F | `projectRelease(v, d=0.99)`, `rubberband(over, dim)` | src/features/family/sheetDrag.ts (pure, tested); used only by family Sheet.tsx |

## Ownership

- T: src/screens/Today.tsx, src/features/today/**.
- H: src/screens/Health.tsx, src/features/health/{Kpis,BodyMap,LatestList,LabsList,HealthLinks}.tsx, src/features/health/health.css.
- D: src/screens/Discover.tsx, src/features/discover/**, src/data/discover/**, shell.css `.dc-*` deletion only.
- F: src/screens/Family.tsx, src/features/family/** except IncomingSos.tsx, family css files.
- Nobody else edits app.css, tokens.css, glass.css, shell.css, look/**, routes.ts, App.tsx. A lane that needs one stops and reports it in `needs`.
- e2e specs: each lane edits only specs for its own tab; new specs are named `e2e/s13-<lane>-*.spec.ts`.
