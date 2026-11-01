# v13 test policy

Tests measure rendered boxes and computed colours. They do not count pixels of page height and they do not grep css
text for a token name. A height budget encodes one layout; hero-first order, 44 px targets and AA contrast encode the
design rule. Source: `contracts-phase0.md` section 8.

## Helpers (`e2e/v13.ts`, 390x844, light and dark)

| Helper | Meaning |
|---|---|
| `assertHero(page)` | exactly one `[data-hero]` in `.bt .scroll`; its top is within 320 px of the scroll top |
| `assertOrder(page, ids)` | each `data-testid` is present and lower than the one before |
| `assertTargets(page)` | every visible `a[href]`, `button`, `input`, `[role=button]` in `.bt` is >= 44 x 44; failures named with size |
| `assertNoSideways(page)` | `.bt .scroll` is no wider than its box and nothing pokes past the right edge (boxes inside a horizontal scroller are skipped) |
| `assertTextContrast(page, min=4.5)` | every visible text node: computed colour vs the composited ancestors (rgba layers over the first opaque one, then the body). 3:1 for large text (WCAG: >= 24 px, or >= 18.66 px bold). Chrome's `color(srgb ...)` colours (from `color-mix`) are read |
| `assertJackClear(page)` | at scroll end no control sits under the Jack button |
| `assertNoWrappedButtons(page)` | `.btn` / `.btn2` stay on one line |
| `assertNarrow(page)` | 195 px wide, reload, then `assertNoSideways`, `assertTargets`, `assertNoWrappedButtons` |
| `shotsLightDark(page, name)` | with `V13_SHOTS=<dir>` writes `<dir>/<name>-light.png` and `-dark.png`; without it, nothing |

`ROUTES`, `FIXED_CLOCKS` and `setScheme` are re-exported from `e2e/s16.ts`. `assertBudget` and `liveShot` are gone.
`e2e/s16-helpers.spec.ts` has fail-case self-tests for `assertTargets`, `assertTextContrast`, `assertNoSideways`, `assertHero` and `assertJackClear`. `assertOrder`, `assertNarrow`, `assertNoWrappedButtons` have no fail-case self-test yet (assertNarrow is a composition of the others).

## Marking the page

- `data-hero`: the first content block of every tab root, one per page. Phase 0 marks only the Today weather card
  (`section[aria-label="Weather"]` in `WeatherCard.tsx`); each Phase 1 lane adds its own and calls `assertHero`.
- `data-contrast-bg="#1C2F57"`: on a gradient or image element, the darkest stop. `getComputedStyle` cannot read a
  gradient, so `assertTextContrast` uses this colour as the opaque background for text inside it.

## Vitest

Contrast is computed from `src/styles/tokens.css` with `src/features/look/contrastMath.ts` (`tokensOf`, `pair`, `over`,
`parse`, `ratio`). A screen's test asserts the token pair it uses (`pair(t, '--green', '--soft') >= 4.5`) and keeps at
most one `toMatch` on its css to prove the rule still names that token. `look/contrast.test.ts` owns the token matrix;
`today/chipContrast.test.ts` and `viewas/viewas.contrast.test.ts` follow this rule. `family/family-ui.test.tsx`
(reduced-motion css block) and `weather/scene.test.ts` (sky stops from `scene.ts`) test logic, not token text, and stay.

## `test.fixme` rule

A failure from these helpers on a screen Phase 0 did not restyle is a real v13 finding. If the miss is in a token, it
is F0-A's (report it). Otherwise record it under "Known until lane X" below with the exact text and ratio (or element
and size), and wrap that single call in `test.fixme(...)` naming the lane. Never a blanket `test.skip`, never delete
the assertion.

## Shots

```
$env:V13_SHOTS='docs/redesign-2026-10-31/shots/gate0'; $env:PW_PORT=4430; npx playwright test e2e/v13-foundation.spec.ts -g shots
```

## Gate 0

`npx tsc --noEmit` = 0; `npx vitest run` green; `PW_PORT=4430 npx playwright test e2e/v13-foundation.spec.ts
e2e/jack-sheet.spec.ts e2e/shell.spec.ts e2e/health-a11y.spec.ts e2e/no-sideways-scroll.spec.ts
e2e/tabbar-overlap.spec.ts e2e/subpage-header.spec.ts e2e/s16-*.spec.ts` green (fixmes listed below).

## Known until lane X

Gate 0 run 2026-11-01 (PW_PORT 4440, chromium, workers 1, on 098583a): 19 passed, 8 failed. Resolved and recorded:
- Narrow 195 px: the five tabs measured 32x52. Five 44 px tabs cannot fit in 195 px, so `assertNarrow` gives the tab bar the WCAG 2.2 AA floor of 24 px at narrow widths only (`assertTargets(page, { tabFloor })`); 44 px still applies to the tab bar at 390 and 360 px and to everything else at every width.
- `#today` light/dark: resolved by lane T (T2/T8): the weather card is the one `[data-hero]` and the fixme is removed.
- `#safety` light/dark and 195 px: `Sources 45x17` under 44 px. Resolved by lane S (S10): the footer link is a 44 px target and the fixme is removed.
Each lane removes its fixme when it lands.
