# L0 (base) audit, session 16 redesign

Commit audited: `a0848ef` (parent `8221d75`), branch `claude/bantay-s16-redesign`. Contract: `contracts.md` section 0, C-1..C-11 and the "Orchestrator amendments" (added after L0, in `0002183`). Plan rev 9 section 3. Auditor: Opus 5.5, read-only (only this file written).

## Verdict: pass_with_issues

The L0 code matches every contract signature, and the gates are green. Do not launch the lanes until findings 1-4 are fixed: lanes code against these helpers and components, and the same mistake would repeat in every lane.

## Gates run by the auditor
| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` (full suite) | 320 files, 3563 tests passed, exit 0 |
| `PW_PORT=4491 npx playwright test e2e/shell e2e/no-sideways-scroll e2e/s16-buttons-360 e2e/records e2e/family-plan --project=chromium` | 67 passed, exit 0 |
| Cards in real Chromium (throwaway Vite harness, light and dark, 360 px wide; harness deleted afterwards) | renders; findings 2, 3, 5 come from this run |
| `git status --porcelain` after the gates | empty |

## Findings

| # | Sev | File:line | Finding | Fix | Checklist |
|---|---|---|---|---|---|
| 1 | **major (fix before launch)** | `e2e/s16.ts:40-43` (and contracts C-11 text) | `assertBudget` measures `document.scrollingElement.scrollHeight`. The app scrolls inside `main.scroll`, so the document is always the viewport height. Measured on `#today`: document 768, `main.scroll` 1389. Every D-102 budget check would pass, whatever the height. The amendment also says budgets are measured without the bottom clearance, which this helper ignores. | Measure `.bt .scroll` `scrollHeight` minus `getComputedStyle(scroll, '::after').height`, plus the top bars above it if the D-102 numbers count them (orchestrator decides). Amend the C-11 text. Add a self-test that the helper fails on a page known to be too tall. | ML-20, ML-17 |
| 2 | **major** | `src/features/look/cards.css:65` | Row lead icon in dark is `--green2 #3B7350` on `--soft #22352A`, about 2.3:1 (under 3:1). Seen in the dark render. The contrast test does not cover it. | Use `color: var(--c-neutral)` (dark resolves to ink), or `--ok` in dark as the UI-16 chips do. Add the pair to `contrast.test.ts`. | ML-39 |
| 3 | **major** | `src/features/look/cards.css:7` | `hue="none"` sets `--h-ic: var(--green2)`. In dark the icon, ring and spark are `#3B7350` on `--card`, about 2.9:1, and lower on the 18% chip. Seen in the dark render (the "none" tile icon is dim). The test covers only the five named hues. | Use `--h-ic: var(--c-neutral)` (light green2, dark ink), or `--ok`. Add `none` to the HUES loop in `contrast.test.ts`. | ML-39 |
| 4 | **major** | `e2e/s16.ts` (missing) | The amendment says "L1-L5 assert no control under the button at scroll end (e2e helper in e2e/s16.ts, L0/L7)". No such helper exists, and the contract gives it no name. L1-L5 would each invent one. | The orchestrator names it in C-11 (for example `assertJackClear(page): Promise<void>`: at scroll end, no visible `button, a, input, [role=button]` box intersects `.sh-jackfab`), adds it to `e2e/s16.ts` and runs it on one tab before launch. | ML-02 |
| 5 | **major** | `src/features/look/cards.css:51` | On `SceneHero` with `inkOnScene`, the `secondary` action (`.btn2`) keeps its normal colours: green `#2E5A3F` in light and amber in dark, on the sky gradient. It is barely readable in the render ("Later"). Only the title, copy and kicker turn white. | Add `.sc[data-ink="light"] .btn2 { color: #fff; border-color: rgb(255 255 255 / .7); background: rgb(0 0 0 / .18); }` and give it a contrast check against the darkest SKY pair (L9 owns SKY/SCRIM). | ML-39 |
| 6 | minor | `src/features/look/cards.css:63` | When a `Row` `control` is a `.btn` or `.btn2` (these are `width: 100%`), `.rw-main` shrinks to 0 px and the title disappears. Measured: `rw-main` width 0, the button 316 px. | Add `.rw > :not(.rw-main) { flex: none; width: auto; }`. | NEW |
| 7 | minor | `src/features/look/cardParts.tsx:13,16` | The fixed `id="cd-lock-reason"` repeats when more than one locked card is on a screen (Health and Family while acting). That gives duplicate ids, and `aria-describedby` points at the first one. Every locked button is also named just "View only", so a screen reader cannot tell them apart. | Use `useId()` for the id, and `aria-label={\`${action.label}, view only\`}` on the locked button (the visible text stays "View only", C-9). | NEW |
| 8 | minor | `src/App.tsx:30,112,87` | C-5 says hook lines in shared files carry a `// S16-<lane>` prefix comment. The `ViewAsBanner` import/render line and the track line have none. L5 also edits `App.tsx`, so the markers matter at merge. | Add `{/* S16-L0 */}` / `// S16-L0` to the three lines. | ML-03 |
| 9 | minor | `e2e/s16.ts:17` | `assertNoWrappedButtons` checks `.btn` only. `CardActionButton secondary` renders `.btn2`, so card secondaries are not gated at 360 px. | Select `.btn, .btn2`. | NEW |
| 10 | minor | `src/features/setup/steps.ts:126` | The comment says "S16 C-9/L0 stub", but `useSetupLeft` is L0-7 (C-9 is View as). | Change it to "S16 L0-7 stub". | ML-12 |
| 11 | info | specs owned by lanes | These old-hash specs are red on the base until their owner lane updates them. None are in the L0 gate. `scan.spec:144` and `subpage-header` → L7; `health-v6:122`, `health-a11y:24` and `health-overview:166,176` → L2; `records.spec:25,47` (still passes: it lands on Papers) and `records-db` → L4; `media.spec:16` → L3; `onboarding.spec:212` → L8; `s16-narrow-text.auth` old ROUTES → L7. Put this list in each lane brief so a lane does not report it as a regression. | none (brief text) | ML-13 |
| 12 | info | `Family.tsx:11`, `Library.tsx:39`, `Article.tsx:33` | Stale copy left for the owner lanes. The Family doc comment still says "Records moved to Health > Papers". The Library header says "Back to Health" while the Discover tab is active. L4 owns the first and L3 the other two (back-link lines). | owner lanes | ML-12 |

## Contract conformance (checked item by item)
- **L0-1 tokens:** all 10 values match C-2 and PLAN section 3 in `:root`, `[data-theme=dark]` and the dark media block. Dark fill = `var(--card)`. The existing test asserts that the media block equals the dark block.
- **L0-2 cards:** HeroCard, SceneHero, Tile, Row and AlertCard props match C-1 exactly. `Hue` and `CardAction` match too, are re-exported from `look/index.ts`, and live in `cardParts.tsx`. The close button measured 48x48. The dark 3 px top edge and the 18% chip render. `SceneHero` measured 256 px tall with Jack and two actions (≤ 280), with no clipping.
- **L0-3 contrast:** all section 3 pairs are asserted unrounded in both themes, including dark icon vs the 18% chip and dark kicker ≥ 4.5. Gaps: findings 2 and 3. The light icon on its 55%-white chip is not asserted, but that chip is lighter than the fill and the pair passes on both fill and `--card`, so it is safe.
- **L0-4 routes:** the REDIRECT table matches C-3 character for character. `me/<group>` → `{tab:null, view:'me'}` and `family/papers` → `{tab:'family', view:'papers'}`.
- **L0-5 App:** the banner is after `<OfflineBar />` and the track line is correct (missing marker comment: finding 8).
- **L0-6 view-as:** the signatures match C-9. `store.ts` has no imports. Every reader returns the "not acting" value (`useActingPersonId` = `useSelfPersonId()`, the contract's own fallback). Both components return `null`. The only importer is `App.tsx` (the banner), so no write path reads the stubs.
- **L0-7 / L0-8:** `useSetupLeft` returns `{left: []}`. `BreathOrb` and `CheckDraw` match C-10 (static disc + phase word, static tick, `onDone` never called).
- **L0-9 / L0-10:** `ROUTES` equals the C-3 list in order. The button gate passed on all 38 routes. The fixture README names all 7 files.

## Redirects: every entry point lands on a real screen (checked live in Chromium)
| From | Lands on | h1 / active tab |
|---|---|---|
| `#records`, `#family/records`, `#health/papers` | `#family/papers` | Papers / Family |
| `#health/library` | `#discover/learn/library` | Health library / Discover |
| `#health/library/m%3Ametformin`, `…/c%3AHigh%20blood%20pressure` | `#discover/learn/library/<key>` (key kept as written) | Health library / Discover |
| `#health/videos` | `#discover/watch` | Discover / Discover |
| `#family/people`, `#people` | `#family` | Family / Family |
| `#family/people/<id>` | unchanged (member page) | as before |
| `#plan`, `#me/<group>` (6 groups) | Family Plan; Me | Family; no tab (Me draws its root until L5) |
| Inbox hrefs (`inbox/build.ts`): `#safety`, `#today`, `#admin`, `#records`, and template tabs `safety/family/health/today` | all tab roots, or `#records` → `#family/papers` | ok |
| Jack `open_screen` (`assistant/tools.ts:50`): limited to `TABS` | the five tab roots | ok |
| e2e: all 38 `ROUTES` | draw an h1, no wrapped `.btn` | 38/38 |

## Placeholders and behaviour
- `Family.tsx:28` (`#family/papers`) mirrors the old `Health.tsx` `Papers()` wrapper exactly (SubHeader + `<Records />`), with Back pointing to Family. There are no hooks above the early return, so it is safe.
- `Discover.tsx:15-17` renders the existing `Library` / `Article` (with `safeDecode`) before the sub-nav. There are no hooks in `Discover`, so it is safe. `isDiscoverSubRoot` is false there, so the TopBar stays off and the screen's own SubHeader is the single h1.
- `Health.tsx` still holds the `#health/papers|library|videos` branches. After the redirect they are dead code, and L2 deletes them.
- The only `parseHash` behaviour change is that `#people` and `#family/people` now report view `null` instead of `'people'`. Nothing reads `view === 'people'` (grep).

## The builder's six ambiguities
1. **Ring ownership.** Accept. C-1 has `Tile` draw `ring` with `look/Ring.tsx`, so L0 had to create it, and the C-10 signature is exact. L9 inherits the file. Tell L9 to keep the signature, the `.rg` / `.rg-track` / `.rg-val` classes and `import type { Hue } from './cardParts'`.
2. **JSX type.** Accept. The cards infer `React.JSX.Element`, and the view-as components declare `ReactElement | null`. tsc accepts these against the C-1 and C-9 shapes.
3. **`me/<group>` header.** Accept. It is a non-tab view, so the TopBar is already off. `hasOwnHeader` is true. Me draws its own h1. L5 draws the group.
4. **ROUTES.** Accept. They are identical to C-3. `s16-narrow-text.auth`'s own older ROUTES belongs to L7 (finding 11).
5. **Import direction.** Accept. Components → `cardParts` (types and parts). `index.ts` only re-exports. `Ring` → `cardParts`. No cycle. `store.ts` has no imports, `viewAs.ts` → `setup/useProfile` only.
6. **`useSetupLeft` in `steps.ts`.** Accept, as the contract says. Note for L1: `steps.ts` imports `@capacitor/local-notifications`, which `NoticeStack` will then pull into the Today chunk. It is already in the bundle, so the cost is small.

Not checked: the auth-project specs (`*.auth`), the per-route visual match against mockup v12, and the 390 px composition (C-7). Those are lane gates.
