# v13 Phase 0: foundation (tokens, components, shell, P0 bugs, test policy)

**Goal:** One branch (`claude/v13-phase0`) on which every Phase 1 tab lane can build: v13 tokens in light and dark,
the shared components the boards use, the glass tab bar and the Jack sheet (SOS out of Today), the four P0 bugs
fixed at their root, and a test policy that measures boxes and computed contrast instead of pixel budgets.

**Contract:** `docs/redesign-2026-10-31/contracts-phase0.md` (tokens, props, paths, test ids, test policy). Master
plan: `docs/redesign-2026-10-31/PLAN.md` tasks 0.1-0.5. Audit: `AUDIT.md` P0-1..P0-6. Boards: `mockup/Main`,
`Health`, `Safety`, `JackSheet`, `Labs` (pushed-page header).

**Stack:** React 19, TypeScript 7, Vite 8, Vitest 5 (jsdom, `src/test-setup.ts`), Playwright 1.64 (`PW_PORT` per
lane; the `auth` project runs on `PW_PORT+500` and matches `*.auth.spec.ts`), Dexie 4, Capacitor 8.

**Rules every lane follows:** plan approved before code (this file); Sonnet builds, Opus reviews each lane
before merge; nothing in Phase 0 needs a migration, deploy or the owner's OK; 44 px targets; contrast computed (never
by eye); reduced motion honoured on every animation; px type sizes that survive 195 px (`narrow.css`); every new
token in both themes; no new dependency; commit after every green step with the message given; never commit a
red test.

## Lanes, order, parallelism

```
t0 ─ F0-A tokens + components ─────────────┐
t0 ─ F0-B P0 bugs ─────────────────────────┤  (A and B share no file: full parallel)
      A1+A7 landed ─ F0-C shell ───────────┤  (C needs tokens and look/Sheet; starts C1-C3 at t0 on its own branch, rebases on A1/A7 for C4+)
                           merge A,B,C ──── F0-D test policy ─── Gate 0
```

Lane briefs carry the LIVING CHECKLIST line from the multi-lane PLAYBOOK and return `checklist`. Worktrees:
`git worktree add ../v13-f0-a -b claude/v13-f0-a claude/penpot-figma-analysis-a4dc0a` (same for b, c, d).
Ports: A 4400, B 4410, C 4420, D 4430.

Commands used below (run from the lane worktree):
- `npx tsc --noEmit` (exit 0 is the gate)
- `npx vitest run <path>` (one file) and `npx vitest run` (all)
- `$env:PW_PORT=44x0; npx playwright test <spec>` (PowerShell 5.1; the config reads `process.env.PW_PORT`)

---

## Lane F0-A: tokens and shared components

Files: see contract section 1. Nothing outside `src/styles/`, `public/fonts/`, `src/features/look/`.

### A1. v13 tokens, both themes, with the legacy aliases (commit first: F0-C rebases on it)

**Test first.** Create `src/features/look/contrastMath.ts`:

```ts
import tokens from '../../styles/tokens.css?raw'
export type RGB = [number, number, number]
export type Theme = 'light' | 'dark'
const block = (css: string, selector: string, from = 0) => { const at = css.indexOf(selector + ' {', from); if (at < 0) throw new Error(`no block ${selector}`); return css.slice(at + selector.length + 2).split('}')[0]! }
export const varsOf = (css: string, selector: string, from = 0): Record<string, string> => Object.fromEntries([...block(css, selector, from).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
export const DARK_SEL = ':root[data-theme="dark"]'
export const MEDIA_SEL = ':root:not([data-theme="light"])'
/** Every token of a theme from tokens.css, var() aliases resolved. */
export function tokensOf(theme: Theme, css = tokens): Record<string, string> {
  const v = theme === 'light' ? varsOf(css, ':root') : varsOf(css, DARK_SEL)
  const out: Record<string, string> = {}
  for (const k of Object.keys(v)) { let val = v[k]!; for (let n = 0; n < 4 && val.startsWith('var('); n++) val = v[val.slice(4, -1)] ?? val; out[k] = val }
  return out
}
export const parse = (c: string): [RGB, number] => {
  if (c.startsWith('#')) return [[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as RGB, 1]
  const n = c.match(/[\d.]+/g)!.map(Number); return [[n[0]!, n[1]!, n[2]!], n[3] ?? 1]
}
export const over = (fg: [RGB, number], bg: RGB): RGB => fg[0].map((v, i) => v * fg[1] + bg[i]! * (1 - fg[1])) as RGB
export const lum = (c: RGB) => { const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! }
export const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }
/** ratio of two tokens (fg may be rgba: composited over bg). */
export const pair = (t: Record<string, string>, fg: string, bg: string) => ratio(over(parse(t[fg]!), parse(t[bg]!)[0]), parse(t[bg]!)[0])
```

Rewrite `src/features/look/contrast.test.ts` to the contract 8.1 list (replace the whole file):

```ts
import { describe, expect, it } from 'vitest'
import app from '../../styles/app.css?raw'
import glass from '../../styles/glass.css?raw'
import tokens from '../../styles/tokens.css?raw'
import { DARK_SEL, MEDIA_SEL, over, pair, parse, ratio, tokensOf, varsOf } from './contrastMath'

const TINTS = ['blue', 'red', 'amber', 'teal', 'purple', 'green'] as const
const FILLS = ['--ground', '--card', '--card2', '--green-tint', ...TINTS.map((t) => `--tint-${t}`)]
const WHITE: [number, number, number] = [255, 255, 255]
for (const theme of ['light', 'dark'] as const) {
  describe(`v13 tokens ${theme}`, () => {
    const t = { ...tokensOf(theme), ...tokensOf(theme, glass) }
    const c = (k: string) => parse(t[k]!)[0]
    for (const bg of FILLS) {
      it(`--ink on ${bg} >= 4.5`, () => expect(pair(t, '--ink', bg)).toBeGreaterThanOrEqual(4.5))
      it(`--muted on ${bg} >= 4.5`, () => expect(pair(t, '--muted', bg)).toBeGreaterThanOrEqual(4.5))
    }
    for (const x of TINTS) {
      it(`--tint-${x}-ink on its fill >= 4.5`, () => expect(pair(t, `--tint-${x}-ink`, `--tint-${x}`)).toBeGreaterThanOrEqual(4.5))
      it(`--tint-${x}-ink on --card >= 4.5`, () => expect(pair(t, `--tint-${x}-ink`, '--card')).toBeGreaterThanOrEqual(4.5))
    }
    for (const bg of ['--card', '--ground', '--green-tint']) it(`--green on ${bg} >= 4.5`, () => expect(pair(t, '--green', bg)).toBeGreaterThanOrEqual(4.5))
    it('white on --btn and --danger-bg >= 4.5', () => { expect(ratio(WHITE, c('--btn'))).toBeGreaterThanOrEqual(4.5); expect(ratio(WHITE, c('--danger-bg'))).toBeGreaterThanOrEqual(4.5) })
    it('--on-green on --green >= 4.5', () => expect(pair(t, '--on-green', '--green')).toBeGreaterThanOrEqual(4.5))
    it('--focus on --ground and --card >= 3', () => { expect(pair(t, '--focus', '--ground')).toBeGreaterThanOrEqual(3); expect(pair(t, '--focus', '--card')).toBeGreaterThanOrEqual(3) })
    for (const back of ['--ground', '--card', '--tint-red', '--green']) {
      it(`tab label --ink on --glass-bg over ${back} >= 4.5`, () => expect(ratio(c('--ink'), over(parse(t['--glass-bg']!), c(back)))).toBeGreaterThanOrEqual(4.5))
      it(`sheet --muted on --glass-sheet over dim over ${back} >= 4.5`, () => expect(ratio(c('--muted'), over(parse(t['--glass-sheet']!), over([[0, 0, 0], 0.38], c(back))))).toBeGreaterThanOrEqual(4.5))
    }
    it('active tab --green on --fill over --glass-bg over --card >= 4.5', () => expect(ratio(c('--green'), over(parse(t['--fill']!), over(parse(t['--glass-bg']!), c('--card'))))).toBeGreaterThanOrEqual(4.5))
    it('keeps 8 sky stops', () => expect(Object.keys(t).filter((k) => k.startsWith('--sky-'))).toHaveLength(8))
    it('legacy aliases stay defined', () => { for (const k of ['--green2', '--soft', '--line', '--ok', '--warn', '--warn-bg', '--link', '--act', '--fill', '--bg', '--cell', '--ink2', '--sep', '--btn-fg', '--danger', '--hue-blue', '--hue-blue-ic', '--hue-terra-ic']) expect(t[k], k).toBeDefined() })
  })
}
describe('dark blocks and fonts', () => {
  it('prefers-color-scheme dark equals data-theme dark (tokens and glass)', () => {
    for (const css of [tokens, glass]) expect(varsOf(css, MEDIA_SEL, css.indexOf('prefers-color-scheme: dark'))).toEqual(varsOf(css, DARK_SEL))
  })
  it('system font only: no @font-face, no googleapis, --f-ui starts with -apple-system', () => {
    expect(app).not.toMatch(/@font-face|fonts\.googleapis/)
    expect(app).toMatch(/--f-ui: -apple-system, "SF Pro Text", "Inter", system-ui/)
    expect(app).not.toMatch(/--f-display/)
  })
  it('--warn-bg keeps its exact color-mix text (viewas test reads it)', () => expect(tokens.match(/--warn-bg: color-mix\(in srgb, var\(--amber\) 22%, var\(--card\)\);/g)!.length).toBeGreaterThanOrEqual(2))
})
```

Run `npx vitest run src/features/look/contrast.test.ts`: **fails** (new tokens missing, fonts present).

**Implement.** Rewrite `tokens.css` with contract 2.1 + 2.2, hex literals, three blocks (light; dark attribute;
dark media with the same body). In `app.css`: delete the four `@font-face` lines; set `--f-ui` per contract; delete
`--f-display`; `h1, .h-display { font-family: var(--f-ui); font-weight: 700; letter-spacing: -.02em; }`; `.h2`,
`.sh-h2` equivalents in app.css use `var(--f-ui)`; `--tap: 44px`; `--tabbar-h: 64px; --tabbar-gap: 14px`;
`.grp { border-radius: var(--r-group); box-shadow: var(--shadow); }`; `.row { min-height: 56px; padding: 10px 14px; }`;
`.grp .row + .row::before { height: 0.5px; background: var(--hair); }`; `.card { border-radius: var(--r-card); }`;
`.btn, .btn2 { min-height: 44px; border-radius: 999px; font-size: 15px; width: auto; padding: 0 18px; display: inline-flex; align-items: center; justify-content: center; }`
plus `.btn.block, .btn2.block { width: 100%; }`; `.btn { background: var(--btn); color: #fff }`; `.btn2 { background: var(--green-tint); color: var(--green) }`;
`.seg` radius 12 and thumb `--card`; `.sheet` radius 30 and glass. `glass.css`: tokens per contract, add `.lk-sheet`
to the glass selector lists (next to `.sh-sheet`), delete the `.tile` dark override (now in cards.css hue rule).
Delete `public/fonts/*.woff2` (`git rm`). In `cards.css`: map `--hue-*` rules to the tint tokens, delete the dark
"no fill + 3 px top edge" rules and the dark `.hc-ic` chip rule (tints are real in dark now).

Run the contrast test: **green**. `npx tsc --noEmit`: 0. `npx vitest run`: expect failures only in
`src/features/today/chipContrast.test.ts` and `src/features/viewas/viewas.contrast.test.ts` if a hex it greps
moved; both read `--soft`, `--amber`, `--card`, `--ink` as hex from `:root` and `:root[data-theme="dark"]`: with the
contract's hex literals they stay green. Anything else red is a bug in this step: fix the token, not the test.

Commit: `feat(v13): tokens in light and dark, system font, legacy aliases (0.1)`

### A2. `LargeTitle` + `Section` (test first)

Create `src/features/look/v13.test.tsx`:

```tsx
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Carousel, GroupedList, LargeTitle, MapCard, PreviewTile, Row, Section, Segmented } from './index'
afterEach(cleanup)

describe('LargeTitle', () => {
  it('kicker, 34 px h1 and right actions', () => {
    render(<LargeTitle kicker="Saturday, Oct 31" title="Good evening, Rey" actions={<a href="#me" aria-label="You and settings">L</a>} testId="head" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Good evening, Rey' })).toHaveClass('lt-title')
    expect(screen.getByTestId('head')).toHaveTextContent('Saturday, Oct 31')
    expect(screen.getByRole('link', { name: 'You and settings' })).toBeInTheDocument()
  })
  it('a pushed page draws Back with the parent name and no kicker', () => {
    render(<LargeTitle title="Labs" back={{ href: '#health', label: 'Health' }} />)
    const back = screen.getByRole('link', { name: 'Back to Health' })
    expect(back).toHaveAttribute('href', '#health'); expect(back).toHaveTextContent('Health')
  })
})
describe('Section', () => {
  it('h2 names the region; the link is a real anchor; meta is plain text', () => {
    const { rerender } = render(<Section title="My day" link={{ href: '#family', label: 'All' }}><p>x</p></Section>)
    expect(screen.getByRole('region', { name: 'My day' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('href', '#family')
    rerender(<Section title="My day" meta="0 of 5 done"><p>x</p></Section>)
    expect(screen.queryByRole('link')).toBeNull(); expect(screen.getByText('0 of 5 done')).toBeInTheDocument()
  })
})
```

(`toHaveClass`/`toBeInTheDocument` need `@testing-library/jest-dom`? It is not installed: use
`expect(el.className).toContain('lt-title')` and `expect(el).not.toBeNull()` instead; keep that rule for every test
in this file.) Run `npx vitest run src/features/look/v13.test.tsx`: **fails** (no module).

Implement `LargeTitle.tsx` and `Section.tsx` per contract section 4, styles in `src/features/look/v13.css`
(imported by each component): `.lt { display:flex; flex-direction:column; gap:2px; padding: 4px 0 0 }`,
`.lt-row { display:flex; align-items:center; justify-content:space-between; min-height:44px; gap:8px }`,
`.lt-kicker` (13/600 uppercase .04em muted), `.lt-back { display:inline-flex; align-items:center; gap:2px; min-height:44px; padding:0 8px 0 0; color:var(--green); font-size:17px; font-weight:500; text-decoration:none }`
(uses `<Icon name="back" size={22} />` + label; `aria-label="Back to {label}"`), `.lt-title { margin:0; font-size:34px; line-height:40px; font-weight:700; letter-spacing:-.02em; overflow-wrap:anywhere }`,
`.lt-actions { display:flex; gap:10px; align-items:center }`; `.sec { display:flex; flex-direction:column; gap:10px }`,
`.sec-h { display:flex; align-items:baseline; justify-content:space-between; margin:12px 2px 0 }`,
`.sec-h h2 { margin:0; font-size:22px; font-weight:700; letter-spacing:-.01em }`,
`.sec-h a, .sec-h button { display:inline-flex; align-items:center; min-height:44px; padding:0 6px; margin:-13px -6px; font-size:15px; font-weight:500; color:var(--green); background:none; border:0; text-decoration:none; font:inherit }`,
`.sec-meta { font-size:15px; color:var(--muted) }`. Export both from `index.ts`. Narrow: `:root[data-narrow] .lt-title { font-size: 28px; line-height: 34px }` in `narrow.css`.

Run the test: **green**. Commit: `feat(v13): LargeTitle and Section (0.2)`

### A3. `GroupedList` + `Row` v13 (test first; extend the Row cases in `cards.test.tsx` and `v13.test.tsx`)

Append to `v13.test.tsx`:

```tsx
describe('GroupedList + Row', () => {
  it('a list of rows: icon box with tint, title, sub, value, chevron on links, badge text', () => {
    render(<GroupedList icons label="Right now" testId="now">
      <Row icon="bolt" tint="amber" title="Earthquake M4.6" sub="Near Tago · 272 km · USGS" badge="Minor, far away" badgeTint="amber" href="#safety/warnings" />
      <Row icon="cloud" tint="blue" title="Rain tomorrow" value="100%" href="#weather" />
      <Row icon="heart" title="Toggle" control={<button type="button">on</button>} />
    </GroupedList>)
    const list = screen.getByRole('list', { name: 'Right now' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    const quake = screen.getByRole('link', { name: /Earthquake M4\.6/ })
    expect(quake.getAttribute('href')).toBe('#safety/warnings')
    expect(quake.querySelector('.rw-ic')?.getAttribute('data-tint')).toBe('amber')
    expect(screen.getByText('Minor, far away').className).toContain('rw-badge')
    expect(screen.getByText('100%').className).toContain('rw-value')
    expect(screen.getByRole('button', { name: 'on' }).closest('.rw-main')).toBeNull() // control outside the link
  })
})
```

Implement: `GroupedList.tsx` per contract; `Row.tsx` gains `tint`, `value`, `badge`, `badgeTint`, wraps itself in
`<div class="rw" role="listitem">` when inside a GroupedList (pass `role="listitem"` always: a lone Row is still a
list item of its card, harmless). Replace the old `.rw*` block in `cards.css` with v13 values: `.rw { min-height:56px; padding:0 14px }`,
`.rw-main { gap:12px; padding:10px 0 }`, `.rw-ic { width:32px; height:32px; border-radius:var(--r-ic); background:var(--tint-fill, var(--card2)); color:var(--tint-ink, var(--ink)) }`
with `[data-tint="blue"] { --tint-fill: var(--tint-blue); --tint-ink: var(--tint-blue-ink) }` for each tint (one shared
rule block `.rw-ic[data-tint], .pt[data-tint], .jk-tile[data-tint]` in `v13.css`), `.rw-title { font-size:17px; font-weight:500; line-height:22px }`,
`.rw-sub { font-size:13px; line-height:18px; color:var(--muted) }`, `.rw-value { margin-left:auto; font-size:15px; color:var(--muted); white-space:nowrap }`,
`.rw-badge { padding:3px 9px; border-radius:999px; font-size:13px; font-weight:700; background:var(--tint-fill, var(--card2)); color:var(--tint-ink, var(--ink)) }`
(numeric badge keeps the red disc look when `badgeTint` is unset and the value is a number), hairline:
`.grp .rw + .rw::before { content:""; position:absolute; top:0; left:14px; right:0; border-top:.5px solid var(--hair) }`,
`.grp.ic .rw + .rw::before { left:58px }`. Update `cards.test.tsx` Row case for the new markup (badge now a text pill).

Run `npx vitest run src/features/look`: **green** (`cards.test.tsx` included). Commit: `feat(v13): GroupedList and v13 Row (0.2)`

### A4. `PreviewTile` + `Carousel` (test first)

Append:

```tsx
describe('PreviewTile + Carousel', () => {
  it('a tile is one link with kicker, value, sub and action text', () => {
    render(<PreviewTile kicker="Blood pressure" tint="blue" value="--/--" sub="None this week" action="Log now" href="#health/readings" testId="bp" />)
    const a = screen.getByRole('link', { name: /Blood pressure.*Log now/ })
    expect(a.getAttribute('href')).toBe('#health/readings'); expect(a.getAttribute('data-tint')).toBe('blue')
  })
  it('a carousel is a named group that lists its items', () => {
    render(<Carousel label="First aid"><a href="#a">A</a><a href="#b">B</a></Carousel>)
    expect(within(screen.getByRole('group', { name: 'First aid' })).getAllByRole('link')).toHaveLength(2)
  })
})
```

Implement per contract. CSS: `.pt { display:flex; flex-direction:column; min-height:150px; padding:14px; text-decoration:none; color:var(--ink); box-sizing:border-box }`,
`.pt-k { font-size:13px; font-weight:600; color:var(--tint-ink, var(--ink)) }`, `.pt-v { font-size:26px; font-weight:700; letter-spacing:-.02em; margin-top:10px }`,
`.pt[data-size="md"] .pt-v { font-size:20px }`, `.pt-s { font-size:13px; color:var(--muted); line-height:18px }`,
`.pt-a { margin-top:auto; padding-top:8px; font-size:15px; font-weight:600; color:var(--green); min-height:24px }`,
`.pt-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px }` (a helper class for the 2x2 the
boards use); `:root[data-narrow] .pt-grid { grid-template-columns: minmax(0,1fr) }`. `.carousel { display:flex; gap:12px; overflow-x:auto; padding:0 16px; margin:0 -16px; scroll-snap-type:x proximity; scrollbar-width:none; -webkit-overflow-scrolling:touch }`,
`.carousel > * { flex:none; scroll-snap-align:start }`, `.carousel::-webkit-scrollbar { display:none }`,
`:root[data-narrow] .carousel { padding:0 12px; margin:0 -12px }`. Commit: `feat(v13): PreviewTile and Carousel (0.2)`

### A5. `Segmented` (test first)

```tsx
describe('Segmented', () => {
  it('links carry aria-current, buttons aria-pressed and call onChange', () => {
    const on = vi.fn()
    const { rerender } = render(<Segmented label="Show" value="near" options={[{ id: 'near', label: 'Near me', href: '#safety' }, { id: 'world', label: 'World', href: '#safety/world' }]} />)
    expect(screen.getByRole('link', { name: 'Near me' }).getAttribute('aria-current')).toBe('page')
    rerender(<Segmented label="Range" value="week" onChange={on} options={[{ id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }]} />)
    screen.getByRole('button', { name: 'This month' }).click()
    expect(on).toHaveBeenCalledWith('month')
    expect(screen.getByRole('button', { name: 'This week' }).getAttribute('aria-pressed')).toBe('true')
  })
})
```

Implement. CSS: `.segd { display:grid; grid-auto-flow:column; grid-auto-columns:1fr; background:var(--card2); border-radius:12px; padding:3px; gap:2px }`,
`.segd > * { display:flex; align-items:center; justify-content:center; min-height:44px; border-radius:10px; font-size:15px; font-weight:500; color:var(--ink); background:none; border:0; text-decoration:none; font:inherit }`,
`.segd > [aria-current="page"], .segd > [aria-pressed="true"] { background:var(--card); box-shadow:0 1px 3px rgba(40,30,10,.14); font-weight:600 }`,
`:root[data-narrow] .segd { grid-auto-flow:row }`. Commit: `feat(v13): Segmented (0.2)`

### A6. `MapCard` (test first)

```tsx
describe('MapCard', () => {
  it('static image with credit and a 44 px recentre button; live render mounts and cleans up', () => {
    const cleanup = vi.fn(); const render_ = vi.fn(() => cleanup); const re = vi.fn()
    const { unmount, rerender } = render(<MapCard image={{ src: '/maps/dampas.jpg', alt: 'Map around Dampas' }} credit="Map: OpenStreetMap" onRecentre={re} testId="map" />)
    expect(screen.getByRole('img', { name: 'Map around Dampas' })).not.toBeNull()
    expect(screen.getByText('Map: OpenStreetMap')).not.toBeNull()
    screen.getByRole('button', { name: 'Recentre' }).click(); expect(re).toHaveBeenCalled()
    rerender(<MapCard render={render_} credit="Windy" />)
    expect(render_).toHaveBeenCalledTimes(1)
    unmount(); expect(cleanup).toHaveBeenCalled()
  })
})
```

Implement: `useEffect(() => p.render?.(ref.current!), [p.render])`; layer `aria-hidden` for the live div; the image
is a real `<img alt>`; `.mapc { padding:0; overflow:hidden; position:relative }`, `.mapc-layer { height: var(--h, 200px); background: var(--card2) }`,
`.mapc img { width:100%; height:100%; object-fit:cover; display:block }`, `.mapc-credit { padding:8px 14px; font-size:13px; color:var(--muted) }`,
`.mapc-re { position:absolute; right:10px; bottom:46px; width:44px; height:44px; border-radius:50%; background:var(--card); box-shadow:var(--shadow-float); border:0; color:var(--green); display:grid; place-items:center }`
(icon `locate` if present in `Icon.tsx`, else `send`; check `ICONS` keys). Commit: `feat(v13): MapCard (0.2)`

### A7. `Sheet` (test first; F0-C rebases on this commit)

Create the test in `v13.test.tsx`:

```tsx
describe('Sheet', () => {
  it('dialog named by title, grabber, close button, Escape closes, focus returns, one at a time', async () => {
    const { Sheet } = await import('./Sheet')
    const a = vi.fn(), b = vi.fn()
    const opener = document.createElement('button'); document.body.appendChild(opener); opener.focus()
    const { rerender } = render(<><Sheet title="Jack" onClose={a}><button type="button">one</button></Sheet></>)
    const dlg = screen.getByRole('dialog', { name: 'Jack' })
    expect(dlg.querySelector('.lk-grab')).not.toBeNull()
    expect(document.activeElement?.textContent).toBe('one')
    screen.getByRole('button', { name: 'Close' }).click(); expect(a).toHaveBeenCalledTimes(1) // jsdom has no matchMedia: reduced path, closes at once
    rerender(<><Sheet title="A" onClose={a}><button type="button">a</button></Sheet><Sheet title="B" onClose={b}><button type="button">b</button></Sheet></>)
    expect(a).toHaveBeenCalledTimes(2) // the second sheet closed the first
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'B' }), { key: 'Escape' }); expect(b).toHaveBeenCalled()
  })
})
```

Implement `Sheet.tsx`: copy `src/features/family/Sheet.tsx` (keep its drag maths import from `../family/sheetDrag`),
rename classes `fm-` -> `lk-`, add `hideTitle`, `closeLabel`, `testId` (`data-testid={testId ?? 'sheet'}` on
`.lk-sheet`), add the history entry (`history.pushState({ bantaySheet: 1 }, '')` on mount if not present; `popstate`
calls `close`; `onClose` callers that navigate first pop it, as `AskSheet.leave` did: export `leaveSheet(then)` from
`Sheet.tsx` for that), and the one-at-a-time rule: module `let current: (() => void) | null`; on mount, if `current`
exists call it, then `current = close`; on unmount clear if it is ours. CSS in `v13.css`: `.lk-sheet-wrap { position:absolute; inset:0; z-index:30; background:rgba(28,27,25,calc(.38 * var(--lk-dim, 1))); display:flex; align-items:flex-end }`,
`.lk-sheet { width:100%; max-height:90%; overflow-y:auto; border-radius:30px 30px 0 0; padding:8px 16px calc(28px + var(--sab)); box-sizing:border-box; display:flex; flex-direction:column; gap:12px; color:var(--ink) }`
(glass fill from glass.css), `.lk-grab-zone { padding:4px 0 8px; touch-action:none }`, `.lk-grab { width:40px; height:5px; border-radius:3px; background:var(--hair); margin:0 auto }`,
`.lk-sheet-h { display:flex; align-items:center; gap:12px }`, `.lk-sheet-h h2 { flex:1; margin:0; font-size:22px; font-weight:700 }`,
`.lk-x { width:44px; height:44px; border-radius:50%; background:var(--card2); border:0; color:var(--ink); display:grid; place-items:center }`,
motion: `.lk-sheet-wrap { animation: sh-fade-in var(--dur-base) var(--ease-out) } .lk-sheet { animation: sh-sheet-in var(--dur-sheet) var(--ease-sheet) }`
(keyframes live in `shell.css`; duplicate them as `lk-*` keyframes in `v13.css` so look/ does not depend on shell/),
`[data-closing="true"]` exit rules, and `@media (prefers-reduced-motion: reduce) { .lk-sheet-wrap, .lk-sheet, [data-closing="true"] > [role="dialog"] { animation:none } }`.

Run `npx vitest run src/features/look`: **green**. `npx tsc --noEmit`: 0. Commit: `feat(v13): Sheet with grabber, swipe, focus trap, one at a time (0.2)`

### A8. Lane gate

- `npx tsc --noEmit` = 0; `npx vitest run` green (chip/viewas tests included).
- `$env:PW_PORT=4400; npx playwright test e2e/look.spec.ts e2e/no-sideways-scroll.spec.ts e2e/health-a11y.spec.ts e2e/s16-narrow-text.auth.spec.ts` green
  (narrow text at 195 px must still pass with the new sizes; fix in `narrow.css` only).
- Shots: `$env:S16_SHOTS='docs/redesign-2026-10-31/shots/f0a'; npx playwright test e2e/s16-today.auth.spec.ts` is expected
  to FAIL on budgets (F0-D rewrites them); the shots it writes are still the review evidence: Today light + dark.
- Report: `checklist:` line, token diff summary, the contrast table from the test output.

---

## Lane F0-B: P0 bugs

### B1. Health opens on Me (root cause + fix, test first)

**Root cause (found in the code read, 2026-10-31):** `src/screens/Health.tsx` `Overview` has an effect
`if (!ready || picked.current || ownId || acting || readings.length > 0) return; … setPersonId(withData.id)`. `ready`
(Dexie `loadAll`) resolves before `member` (`getMember()` then `selfIdOrCached()`, both async), so for one render
`ownId === ''` and `readings` (for `personId = people[0]`) is empty: the effect picks the first person **with readings**
(Ma) and writes it into the module-level `chosen` in `useHealthData.ts`. `chosen` wins at line 46 forever after, so
the admin lands on Ma on every visit until `resetPersonChoice()` runs (sign-out or view-as). The "else the first
one" at line 46 is not the bug; the early `setChosen` from the screen is.

**Test first.** Create `src/features/records/useHealthData.test.tsx`:

```tsx
import 'fake-indexeddb/auto'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const who = vi.hoisted(() => ({ gate: null as null | (() => void) }))
vi.mock('../auth/session', () => ({ getMember: () => new Promise((res) => { who.gate = () => res({ userId: 'u1', personId: 'me', role: 'admin', handle: null }) }) }))
vi.mock('./useRecordsServer', () => ({ usePeople: (p: unknown[]) => p }))
import { hdb } from './store'
import { resetPersonChoice, useHealthData } from './useHealthData'

function Probe() { const d = useHealthData(); return <p data-testid="who">{d.ready ? d.personId || '(none)' : 'loading'}</p> }
beforeEach(async () => { resetPersonChoice(); who.gate = null; await hdb.people.clear(); await hdb.readings.clear()
  await hdb.people.bulkPut([{ id: 'ma', name: 'Ma' }, { id: 'me', name: 'Rey' }])
  await hdb.readings.put({ id: 'r1', personId: 'ma', test: 'bp_systolic', value: 140, unit: 'mmHg', takenAt: new Date().toISOString() } as never) })
afterEach(cleanup)

describe('useHealthData default person', () => {
  it('waits for the member, then lands on Me even though only Ma has readings', async () => {
    render(<Probe />)
    await waitFor(() => expect(who.gate).not.toBeNull())
    expect(screen.getByTestId('who').textContent).toBe('loading') // ready only once the member is known
    act(() => who.gate!())
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('me'))
  })
  it('with nobody signed in it lands on the first person with readings', async () => {
    vi.mocked(await import('../auth/session')).getMember = (() => Promise.reject(new Error('no auth'))) as never
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('ma'))
  })
})
```

(The second test mocks a rejected `getMember`: adapt the hoisted mock to a switch flag instead of reassigning if
`vi.mock` returns a frozen module; the behaviour under test is what matters.) Run
`npx vitest run src/features/records/useHealthData.test.tsx`: **fails** (`ready` is true before the member, person is
`ma` or empty).

**Implement** in `useHealthData.ts`: add `const [memberReady, setMemberReady] = useState(false)`; in the `getMember`
effect `.finally(() => live && setMemberReady(true))` (also on catch); derive
`const firstWithData = people.find((p) => data.readings.some((r) => r.personId === p.id))?.id ?? people[0]?.id ?? data.readings[0]?.personId ?? ''`
and `const personId = known(picked) ? picked : known(ownId) ? ownId : firstWithData`; return
`ready: ready && memberReady` (keep the raw flag out of the API). In `Health.tsx` `Overview`: delete the
`picked` ref, the `loadAll` import if now unused, and the whole "Default person" effect; `pick` becomes
`setPersonId`. Add `data-testid="person-chips"` to the `PersonChips` root (`records/PersonChips.tsx` is F0-B's by this
line; add it there). Run the new test and `npx vitest run src/features/records src/features/health src/screens`:
**green** (`records-people.test.tsx` "default to me" still passes; if it asserted the old flash, fix the assertion to
the new truth).

Commit: `fix(health): the admin lands on Me; Health no longer pre-picks the first person with readings before the member is known (P0-3)`

### B2. View-only hero (test first)

`src/features/health/BodyHero.test.tsx` (new or extend): render `<BodyHero nodes={[]} blank canLog={false} canEdit={false} onAdd={() => {}} viewOnly={{ name: 'Ma', reason: 'You can see Ma but not log for her.' }} />`;
expect `screen.getByTestId('bodyhero-viewonly').textContent` to contain `View only`, the heading to read `Ma`, and
`screen.queryByRole('button', { name: /Reading/ })` and `queryByRole('link', { name: 'Scan' })` to be null; with
`viewOnly` unset and `canLog` true the two actions exist (existing behaviour). Run: **fails**.

Implement: `viewOnly?: { name: string; reason: string }` prop; when set: `title={<>{viewOnly.name} <span className="bh-badge" data-testid="bodyhero-viewonly">View only</span></>}`,
`body` = the stats (or the blank line "No readings yet for {name}."), `action`/`secondary` undefined, and
`<p className="sub bh-reason">{reason}</p>` under the stats. `health.css`: `.bh-badge { display:inline-flex; align-items:center; padding:3px 9px; border-radius:999px; background:var(--card2); color:var(--muted); font-size:13px; font-weight:700; vertical-align:middle }`,
`.bh-reason { margin:6px 0 0 }`. `Health.tsx` passes `viewOnly={!canLog ? { name, reason: lockReason ?? 'You can see this person but not log for them.' } : undefined}`.
Run `npx vitest run src/features/health/BodyHero.test.tsx src/features/health/health-screen.test.tsx`: **green**.

Commit: `fix(health): read-only hero draws the name, a View only badge and no log buttons (P0-4)`

### B3. Sub-page safe-area top (test first, Playwright)

Add to `e2e/subpage-header.spec.ts`? That file is F0-D's. Use a vitest instead: `src/styles/safearea.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
it('own-header routes pad the scroller by the status bar inset', () => {
  expect(readFileSync('src/styles/safearea.css', 'utf8')).toMatch(/\.bt:not\(:has\(\.sh-top\)\) > \.scroll \{ padding-top: calc\(10px \+ var\(--sat\)\); \}/)
  expect(readFileSync('src/main.tsx', 'utf8')).toMatch(/import '\.\/styles\/safearea\.css'/)
})
```

(A text test is acceptable here: the rule is one line and the behaviour needs a real WebView inset to observe.)
Implement `src/styles/safearea.css` with that one rule and a comment `/* P0-6: pushed pages have no top bar, so the
scroller itself clears the status bar. */`; import it in `main.tsx` after `narrow.css`. Manual check in the lane
report: `$env:PW_PORT=4410; npx playwright test e2e/subpage-header.spec.ts` green, and one shot of `#health/metric/alt`
at 390x844 with `document.documentElement.style.setProperty('--safe-area-inset-top','47px')` injected (the Capacitor
fallback token) showing the back button 47 px down.

Commit: `fix(shell): pushed pages clear the status bar (P0-6)`

### B4. Last real GPS fix (test first)

Extend `src/features/location/useLocation.test.ts`:

```ts
describe('last known fix (D-105)', () => {
  beforeEach(async () => { h.native = false; h.plugin = false; h.os = 'granted'; h.pos = null; await db.kv.clear() })
  it('a GPS success is stored as loc.last', async () => {
    setup('granted'); await resolveLocation(false)
    expect((await db.kv.get('loc.last'))?.value).toMatchObject({ lat: 6.11, lon: 125.17 })
  })
  it('without GPS the stored fix comes back as last, with its time', async () => {
    await db.kv.put({ key: 'loc.last', value: { lat: 9.65, lon: 123.85, at: 1700000000000 } }); setup('denied')
    expect(await resolveLocation(false)).toEqual({ lat: 9.65, lon: 123.85, source: 'last', at: 1700000000000 })
  })
  it('with no fix ever, the home zone (Dampas) is the labelled fallback', async () => {
    setup('denied'); expect((await resolveLocation(false)).source).toBe('home')
  })
})
```

And `place.test.ts`: `resolvePlace({ gps: { lat: 9.65, lon: 123.85, stale: true }, lastZone: 'conel' })` ->
`{ source: 'last', zone: 'dampas', weather: {lat:9.65, lon:123.85} }`. And a `placeName.test.ts` in `today/`:
`placeNameOf({ source: 'last', weather: {lat 9.65, lon 123.85}, zone: 'dampas', … })` -> `'Tagbilaran · last known'`
(the area from `pickLocalSet`). Run: **fail**.

Implement: `geo.ts` `Loc { source: 'gps' | 'last' | 'home'; at?: number }`; `useLocation.ts` `resolveLocation`:
after a GPS success `void db.kv.put({ key: 'loc.last', value: { lat, lon, at: Date.now() } })`; a new
`const last = async (): Promise<Loc | null>` reading `loc.last` and returning `{ ...v, source: 'last' }`; every
`return fallback` becomes `return (await last()) ?? fallback`. `useGpsLoc` returns the position for `'gps'` and
`'last'`. `usePlaceFrom`: `gps: l.source === 'gps' || l.source === 'last' ? { lat: l.lat, lon: l.lon, stale: l.source === 'last' } : null`.
`place.ts resolvePlace`: `o.gps` gains `stale?: boolean`; the in-Philippines branch returns `source: o.gps.stale ? 'last' : 'gps'`;
`alertRef` treats `'last'` like `'gps'`. `safety/alerts.ts placeLabel`: add `place.source === 'last' ? \`Last known · ${name}\``.
`safety/dial.ts`: unchanged (`'zone'` only). `safety/MapsPanel.tsx` line 41: `own.source === 'gps' || own.source === 'last'`.
`today/placeName.ts`: `localName` uses the area for `'gps'` and `'last'`; `placeNameOf` appends `' · last known'` for
`'last'`. `today/WeatherCard.tsx whereOf`: `'last'` -> `${name} (last known, ${ago})` with `ago` from the fix's `at`
(minutes under 60, hours under 24, else days; the hook passes `at` through `usePlaceFrom` as `fixAt`); `'zone' && settled`
-> `${name} (no location yet, set your home in Settings)`. `npx tsc --noEmit` will list every other `source` consumer
(the union grew): fix each by including `'last'` where `'gps'` is meant. Run `npx vitest run src/features/location src/features/today src/features/safety`: **green**.

Commit: `feat(location): keep the last real GPS fix and label it "last known"; Dampas only as the labelled first-run fallback (P0-5)`

### B5. Lane gate

`npx tsc --noEmit` = 0; `npx vitest run` green; `$env:PW_PORT=4410; npx playwright test e2e/s16-health.auth.spec.ts e2e/health-overview.spec.ts e2e/subpage-header.spec.ts e2e/weather.spec.ts e2e/safety.spec.ts`
(the health budget assertion `assertBudget(page, 1250)` may fail only if F0-A's tokens are merged first; on this lane's
own branch, without F0-A, it must pass). Report the root cause text of B1 verbatim for the vault (`02-DECISIONS`).

---

## Lane F0-C: shell (glass tab bar, Jack sheet, SOS out of Today)

C1-C3 need nothing from F0-A. C4+ rebase on F0-A commits A1 and A7 (`git rebase claude/v13-f0-a` once those two
exist; the orchestrator tells the lane when).

### C1. SOS leaves Today (test first)

`src/screens/Today.simple.test.tsx` and `src/features/today/s14t2r2.test.tsx`: find the assertions on `.td-sos` /
"Hold for help" in the full (non-Simple) Today and flip them: `expect(container.querySelector('.td-sos')).toBeNull()`
and `expect(screen.queryByRole('button', { name: 'Hold to call and text your family' })).toBeNull()`; Simple mode
assertions stay. Run: **fail**.

Implement in `Today.tsx`: remove the `SosHold`, `SosScreen` imports, the `sos` state, the `if (sos) return` line and
the `<section className="td-sos">`; keep `useSosActive` (the weather card still reads `sosLive`). In `JackFab.tsx`
`coversText`: delete the `.td-sos` check (two lines). Run `npx vitest run src/screens src/features/today src/features/shell`:
**green**. Commit: `feat(today): the SOS hold leaves Today; Simple mode and Safety keep theirs (0.3)`

### C2. Glass tab bar (test first)

`TabBar.test.tsx`: add `it('marks the active tab for assistive tech and gives each tab a test id', …)` expecting
`screen.getByTestId('tab-health').getAttribute('aria-current')` to be `'page'` for `active="health"`, five
`tab-*` ids, and `screen.getByTestId('tabbar')`. Run: **fail**.

Implement: `data-testid="tabbar"` on the nav, `data-testid={\`tab-${t.id}\`}` on each button. `shell.css` tab block
per contract: `.tabbar.sh-tabs { left:12px; right:12px; bottom:calc(var(--tabbar-gap) + var(--sab)); height:var(--tabbar-h); border-radius:32px; padding:0 6px; box-shadow:var(--shadow-float) }`
(glass fill from glass.css), `::before` pill: `top:6px; bottom:6px; border-radius:26px; background:var(--fill)`,
`.sh-tabs button { gap:2px; font-size:12px; font-weight:600; color:var(--muted); min-height:52px; border-radius:26px }`,
`.sh-tabs button[aria-current="page"], .sh-tabs button[aria-current="page"] .sh-ic { color:var(--green) }`; delete the
dark amber override (dark `--green` is `#4FA37F`, >= 4.5 on the dark glass per A1's test). Commit:
`feat(shell): glass tab bar, green active state, tab test ids (0.3)`

### C3. Jack button look + tap-only (test first)

`JackFab.test.tsx`: delete the hold/context-menu cases (`press and hold 500 ms …`, `a hold whose release …`,
`a short press cancels …`, `right click …`) and the `AskSheet` import; change `a tap opens Jack (the assistant event)`
to `a tap opens the Jack sheet` expecting `screen.getByRole('dialog', { name: 'Jack' })` (mock `./JackSheet` with a
stub dialog until C4 lands: `vi.mock('./JackSheet', () => ({ JackSheet: ({ onClose }) => <div role="dialog" aria-label="Jack"><button onClick={onClose}>x</button></div> }))`);
coach mark text `Help, scan or chat`; `aria-label` `Jack: help, scan, chat`; `data-testid="jack"`. Run: **fail**.

Implement `JackFab.tsx`: drop `HOLD_MS`, `timer`, `held`, the pointer handlers, `onContextMenu`, `AskSheet`; `onClick`
sets `sheet`; render `<JackSheet onClose onSos firstName />` (import; a temporary `JackSheet.tsx` exporting the stub
above is fine until C4, replaced in C4); `firstName` from `getMember` + `loadFamily` as `TopBar` does (copy the 6
lines; a shared hook is lane T's call). `shell.css` `.sh-jackfab { right:18px; bottom:calc(var(--tabbar-h) + var(--tabbar-gap) + var(--sab) + 14px); width:62px; height:62px; background:var(--card); border:3px solid var(--card); box-shadow:var(--shadow-float) }`,
`.sh-jackfab img { width:56px; height:56px }`, `.bt[data-jack] .scroll::after { height: calc(var(--tabbar-clear) + 62px + 8px) }`,
delete the `.bt[data-jack] .sos-simple-btn` margin rule and the `--amber` ring. Delete `AskSheet.tsx`, `AskSheet.test.tsx`,
`e2e/ask-sheet.spec.ts` (`git rm`). Run `npx vitest run src/features/shell`: **green**. Commit:
`feat(shell): Jack is one tap; the Ask choice sheet is gone (0.3)`

### C4. `JackSheet` (test first; after rebasing on A1 + A7)

`src/features/shell/JackSheet.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const spy = vi.hoisted(() => ({ scan: vi.fn(), scanFile: vi.fn(), ask: vi.fn() }))
vi.mock('../scan/open', () => ({ openScan: spy.scan, openScanWithFile: spy.scanFile }))
vi.mock('../sos/active', () => ({ startSos: vi.fn() }))
import { ASK_EVENT } from '../assistant/Assistant'
import { JackSheet } from './JackSheet'
afterEach(cleanup)
const mount = () => { document.body.innerHTML = '<div class="bt"></div>'; const onClose = vi.fn(), onSos = vi.fn(); render(<JackSheet onClose={onClose} onSos={onSos} firstName="Rey" />); return { onClose, onSos } }

describe('JackSheet', () => {
  it('greets by name, offers Help (hold), Safety link, Scan, Chat and Upload, all >= 44 px by class', () => {
    mount()
    expect(screen.getByRole('dialog', { name: 'Jack' }).textContent).toContain('Hi Rey, what do you need?')
    expect(screen.getByTestId('jack-sos').querySelector('.sos-simple-btn')).not.toBeNull()
    expect(screen.getByTestId('jack-safety').querySelector('a')?.getAttribute('href')).toBe('#safety')
    for (const id of ['jack-scan', 'jack-chat', 'jack-upload', 'jack-close']) expect(screen.getByTestId(id)).not.toBeNull()
  })
  it('Scan closes then opens the scanner; Chat closes then fires the assistant event', () => {
    const { onClose } = mount(); window.addEventListener(ASK_EVENT, spy.ask)
    fireEvent.click(screen.getByTestId('jack-scan')); expect(onClose).toHaveBeenCalled(); expect(spy.scan).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('jack-chat')); expect(spy.ask).toHaveBeenCalled()
  })
  it('a full 3 s hold hands over to onSos', () => {
    vi.useFakeTimers(); const { onSos } = mount()
    const btn = screen.getByTestId('jack-sos').querySelector('.sos-simple-btn')!
    fireEvent.pointerDown(btn, { pointerId: 1 }); vi.advanceTimersByTime(3000)
    expect(onSos).toHaveBeenCalled(); vi.useRealTimers()
  })
})
```

Run: **fail**. Implement `JackSheet.tsx` per contract section 4 (uses `Sheet` from `../look` with `hideTitle`,
`JackArt name="head" size={56}`, `SosHold` from `../sos/SosHold`, `leaveSheet` from `../look/Sheet` for Scan/Chat/Upload
so the history entry pops before acting). `shell.css` additions: `.jk-head { display:flex; align-items:center; gap:12px; padding:0 4px 16px }`,
`.jk-head b { display:block; font-size:22px; font-weight:700; letter-spacing:-.01em }`, `.jk-head .sub { font-size:15px }`,
`.jk-sos .sos-simple-btn { display:flex; align-items:center; gap:14px; min-height:84px; padding:16px; border-radius:20px; background:var(--danger-bg); color:#fff; text-align:left; width:100% }`,
`.jk-sos .sos-simple-btn::before { content:"SOS"; width:52px; height:52px; border-radius:16px; background:rgba(255,255,255,.16); display:grid; place-items:center; font-size:13px; font-weight:800; flex:none }`,
`.jk-sos .sos-simple-btn > span { font-size:20px; font-weight:700 }`, `.jk-sos .sos-simple-sub { color:#FDE3DF; font-size:15px; margin:-6px 0 0 }`
(this sub line sits under the button in SosHold's markup; keep it visible, it is the "Hold 3 seconds …" copy; when
holding it reads "Let go to cancel"), `.jk-safety { font-size:13px; color:var(--muted); text-align:center; margin:8px 0 12px }`,
`.jk-safety a { display:inline-flex; align-items:center; min-height:44px; padding:0 8px; font-weight:600; color:var(--green) }`,
`.jk-tiles { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px }`,
`.jk-tile { display:flex; flex-direction:column; align-items:flex-start; gap:10px; min-height:150px; padding:16px; border-radius:20px; background:var(--card); border:0; text-align:left; font:inherit; color:var(--ink) }`,
`.jk-tile .big { width:52px; height:52px; border-radius:16px; display:grid; place-items:center; background:var(--tint-fill); color:var(--tint-ink) }` (tint via `data-tint`, rule from v13.css),
`.jk-tile b { font-size:20px; font-weight:700 }`, `.jk-tile .sub { font-size:15px }`, `.jk-upload { display:inline-flex; align-items:center; min-height:44px; padding:0 8px; margin-top:8px; font-size:15px; color:var(--ink); text-decoration:underline; background:none; border:0; font:inherit }`,
`:root[data-narrow] .jk-tiles { grid-template-columns: minmax(0,1fr) }`, `.sh-sosfull` per contract section 5.
`JackFab.tsx`: `sos` state; `onSos={() => { setSheet(false); setSos(true) }}`; the SOS portal. Run
`npx vitest run src/features/shell`: **green**. Commit: `feat(shell): Jack sheet with Help hold, Scan, Chat and Upload (0.3)`

### C5. Playwright `e2e/jack-sheet.spec.ts`

```ts
import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'
test.use({ viewport: { width: 390, height: 844 } })
test.beforeEach(async ({ page }) => { await skipOnboarding(page); await page.goto('/#today') })
test('tap Jack: the sheet opens with Help, Scan, Chat; Back closes it; Today has no SOS block', async ({ page }) => {
  await expect(page.locator('.td-sos')).toHaveCount(0)
  await page.getByTestId('jack').click()
  const sheet = page.getByRole('dialog', { name: 'Jack' })
  await expect(sheet).toBeVisible()
  for (const id of ['jack-sos', 'jack-scan', 'jack-chat', 'jack-safety', 'jack-close']) {
    const box = (await page.getByTestId(id).boundingBox())!; expect(box.height, id).toBeGreaterThanOrEqual(44)
  }
  await page.goBack(); await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('jack')).toBeFocused()
})
test('Chat opens the assistant; Escape closes the sheet; a 3 s hold opens the SOS screen', async ({ page }) => {
  await page.getByTestId('jack').click(); await page.getByTestId('jack-chat').click()
  await expect(page.getByRole('dialog', { name: /Jack Jack|Ask/ })).toBeVisible()
  await page.keyboard.press('Escape'); await page.getByTestId('jack').click()
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
  await page.getByTestId('jack').click()
  const hold = page.getByTestId('jack-sos').locator('.sos-simple-btn')
  await hold.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true }); await page.waitForTimeout(3100)
  await expect(page.getByTestId('sos-full')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
})
test('reduced motion: the sheet still opens and closes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.getByTestId('jack').click()
  await expect(page.getByRole('dialog', { name: 'Jack' })).toBeVisible(); await page.getByTestId('jack-close').click()
  await expect(page.getByRole('dialog', { name: 'Jack' })).toHaveCount(0)
})
```

`$env:PW_PORT=4420; npx playwright test e2e/jack-sheet.spec.ts e2e/shell.spec.ts e2e/s16-nofab.auth.spec.ts e2e/tabbar-overlap.spec.ts e2e/s15-l1-shell.spec.ts`:
green (fix any `.sh-jackfab` size assumption in `s15-l1-shell` / `tabbar-overlap` only by the number 56 -> 62;
nothing else). Commit: `test(shell): Jack sheet e2e (0.3)`

### C6. Lane gate

`npx tsc --noEmit` = 0; `npx vitest run` green; the C5 Playwright list green; shots: Today, Health, Safety and the open
Jack sheet, 390x844, light and dark (`page.screenshot` in a throwaway spec or the `V13_SHOTS` helper once F0-D lands),
saved to `docs/redesign-2026-10-31/shots/f0c/`. Known red until F0-D: `s16-today.auth.spec.ts` SOS block and budgets.

---

## Lane F0-D: test policy (after A, B, C are merged into `claude/v13-phase0`)

### D1. `e2e/v13.ts` helpers (test first with `e2e/s16-helpers.spec.ts`)

Rewrite `s16-helpers.spec.ts` to exercise the new helpers on a `page.setContent` fixture: one page with a 30 px
button (must fail `assertTargets` naming it), a muted-on-white line at 3.9:1 (must fail `assertTextContrast`), an
element 20 px past the right edge (must fail `assertNoSideways`), two `[data-hero]` (must fail `assertHero`); and a
clean page that passes all four. Run: **fail** (no module).

Implement `e2e/v13.ts` per contract 8.2. Core of `assertTextContrast` (the rest are short):

```ts
export async function assertTextContrast(page: Page, min = 4.5): Promise<void> {
  const bad = await page.evaluate((min) => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const lum = ([r, g, b]: number[]) => [r, g, b].map((v) => { const s = v! / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0)
    const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }
    const bgOf = (el: Element | null): number[] => { // composite rgba backgrounds up the tree until an opaque one
      let acc: number[] | null = null
      for (let e = el; e; e = e.parentElement) {
        const s = getComputedStyle(e); const c = parse(s.backgroundColor); const a = c[3] ?? 1
        if (c.length < 3 || a === 0) continue
        if (!acc) { if (a >= 1) return c.slice(0, 3); acc = [c[0]!, c[1]!, c[2]!, a]; continue }
        // acc over c
        const [r, g, b, aa] = acc as [number, number, number, number]
        const out = [r, g, b].map((v, i) => v * aa + c[i]! * (1 - aa) * a / (aa + a * (1 - aa) || 1)); const na = aa + a * (1 - aa)
        if (a >= 1 || na >= 0.995) return out
        acc = [...out, na]
      }
      const body = parse(getComputedStyle(document.body).backgroundColor).slice(0, 3)
      return acc ? [acc[0]!, acc[1]!, acc[2]!].map((v, i) => v * acc![3]! + body[i]! * (1 - acc![3]!)) : body
    }
    const out: string[] = []
    const walker = document.createTreeWalker(document.querySelector('.bt')!, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue?.trim(); const el = n.parentElement; if (!t || !el || el.closest('[aria-hidden="true"], script, style')) continue
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.opacity === '0' || parseFloat(s.fontSize) === 0) continue
      const fg = parse(s.color); const bg = bgOf(el); const big = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && parseInt(s.fontWeight) >= 700)
      const need = big ? 3 : min; const got = ratio(fg.slice(0, 3), bg)
      if (got < need) out.push(`${t.slice(0, 30)} | ${s.color} on rgb(${bg.map(Math.round).join(',')}) = ${got.toFixed(2)} < ${need}`)
    }
    return out
  }, min)
  expect(bad, 'text under the contrast floor').toEqual([])
}
```

Text over a scene hero (weather sky, glass) is composited the same way; the scene's own gradient is not read by
`getComputedStyle(backgroundColor)`, so lanes put `data-contrast-bg="#1C2F57"` (the darkest stop) on a gradient
element and `bgOf` reads that attribute first when present. Add that branch. Run `s16-helpers.spec.ts`: **green**.
Delete `assertBudget` and `liveShot` from `e2e/s16.ts`; keep `ROUTES`, `assertNoWrappedButtons`, `assertJackClear`,
`setScheme`, `FIXED_CLOCKS` and re-export them from `v13.ts`. Commit: `test(v13): measured-box and computed-contrast helpers replace assertBudget`

### D2. Rewrite the `s16-*` specs

For each: replace every `assertBudget(page, N)` with `await assertTargets(page); await assertTextContrast(page)` (and
`assertHero(page)` on tab roots: Today, Health, Discover, Family, Safety, Me; lanes mark `data-hero` in Phase 1, so
for Phase 0 `assertHero` is called only on Today where F0-C marks the weather card `data-hero` — add that attribute in
`WeatherCard.tsx`? That file is F0-B's (`whereOf` line) and lane T's. F0-D adds the one attribute
`data-hero` on the `section[aria-label="Weather"]` root in `WeatherCard.tsx` after F0-B merged; the orchestrator
notes it in the lane T brief). `s16-today.auth.spec.ts`: delete the SOS block (last 35 lines) and the 232/196 px hero
height assertion (a v12 number); keep order, warning, Next up, notice, weather screen cases. `s16-health.auth.spec.ts`:
budgets -> helpers; add `it('the admin lands on Me')`: with `full()` seeded for `me` and a reading for `ma`, expect
`page.getByTestId('person-chips').getByRole('button', { pressed: true })` to have text `Me` after
`health-loading` disappears. `s16-motion.spec.ts`: budget -> helpers. `s16-family`, `s16-discover`, `s16-settings`,
`s16-onboarding`: budgets -> helpers. Run each with `PW_PORT=4430`; every failure is now a real v13 finding: a target
under 44 px or a contrast miss in a screen Phase 0 did not restyle. Policy for those: if the miss is in a token
(fix in `tokens.css` is F0-A's: report it), else record it in `TESTING.md` under "Known until lane X" with the exact
text and ratio and wrap that single call in `test.fixme` with the lane name, never a blanket skip. Commit:
`test(v13): s16 specs on the v13 policy; SOS block and hero height numbers removed`

### D3. `e2e/v13-foundation.spec.ts`

Light and dark, 390x844, `#today`, `#health`, `#safety`, `#me`: `assertTargets`, `assertTextContrast`,
`assertNoSideways`, `assertJackClear`; `assertNarrow` on the same four; the tab bar: `page.getByTestId('tabbar')`
bounding box height 64, each `tab-*` box >= 44 tall; `shotsLightDark(page, name)` with `V13_SHOTS`. Commit:
`test(v13): foundation spec (shell, four roots, narrow)`

### D4. Feature stylesheet tests on `contrastMath`

`src/features/today/chipContrast.test.ts`: replace the regex over `today.css` with
`const t = tokensOf(theme); expect(pair(t, '--green', '--green-tint')).toBeGreaterThanOrEqual(4.5)` for both themes
plus one text assertion that `.td-chip` uses `color: var(--green)` (the rule under test is "the chip token pair is
AA", not the css text; keep one `toContain` so a token swap in the css is still caught). `viewas.contrast.test.ts`:
use `tokensOf` + `over` for the 22% amber mix; keep its three `toMatch` lines (they are the acting-bar rule). Run
`npx vitest run src/features/today/chipContrast.test.ts src/features/viewas`: green. Commit:
`test(v13): chip and acting-bar contrast computed from tokens`

### D5. `docs/redesign-2026-10-31/TESTING.md`

One page: the policy (contract 8), the helper list with one-line meanings, how a lane marks `data-hero` and
`data-contrast-bg`, the `test.fixme` rule, the shot command, the known-until list. Commit: `docs(v13): test policy`

### D6. Gate 0 (orchestrator)

`npx tsc --noEmit` = 0; `npx vitest run` green; `$env:PW_PORT=4430; npx playwright test e2e/v13-foundation.spec.ts e2e/jack-sheet.spec.ts e2e/shell.spec.ts e2e/health-a11y.spec.ts e2e/no-sideways-scroll.spec.ts e2e/tabbar-overlap.spec.ts e2e/subpage-header.spec.ts e2e/s16-*.spec.ts e2e/s16-*.auth.spec.ts`
green (fixmes listed in TESTING.md); shots in `docs/redesign-2026-10-31/shots/gate0/` compared with `mockup/Main`,
`Health`, `Safety`, `JackSheet` boards; Opus review of each lane and of the integration diff; then
`claude/v13-phase0` is the base of every Phase 1 lane.

---

## Self-review against PLAN.md 0.1-0.5

- **0.1 tokens** (system font, warm grouped ground, white cards, green accent, tint families, radii 16/20/24, per-tab
  theme hooks, light + dark): A1 covers all; per-tab hooks = the sky stops kept + `--tint-teal` for calm; dark values
  for every token; the contrast test is the gate. Inter is not downloaded (system stack is the spec; noted).
- **0.2 components** (LargeTitle, Section, GroupedList + Row, PreviewTile, Carousel, Segmented, Sheet, MapCard): A2-A7,
  each test-first with props fixed in the contract. HeroCard/Tile/AlertCard/SceneHero stay for the old screens until
  Phase 1 retires them.
- **0.3 shell** (glass tab bar, Jack button -> sheet with Help hold 3 s / Scan / Chat, Today loses the SOS pill, Safety
  keeps SOS): C1-C5. The "Try saying" chips wait for lane C (assistant prefill); Upload a photo is kept so nothing is lost.
- **0.4 P0 bugs**: B1 (root cause named: the Overview effect pre-picks before the member is known), B2 (view-only hero),
  B3 (safe-area via one `:has` rule), B4 (`loc.last`, "last known" labels, Dampas labelled as first-run fallback).
  The "Me ▾" switcher sheet is lane H's (Phase 1), as PLAN 1 lists it.
- **0.5 test policy**: D1-D5 replace `assertBudget` and the css-text regex tests with measured boxes and computed
  contrast; a11y, no-sideways and tab-bar overlap specs stay; the SOS-on-Today spec goes with the feature.
- **Gate 0** as written in PLAN: tsc, vitest, Playwright shell + a11y, 390x844 light/dark shots, Opus pass (D6).
- **Parallelism**: A ∥ B from t0; C in parallel for C1-C3, then on A1+A7; D last. No two lanes share a file (the one
  WeatherCard attribute is D's after B merged).

Skipped on purpose: Inter font download, the Jack "Try saying" chips, the Health "Me ▾" sheet, a GPS "ago" ticker
(the label is computed at render), deleting the dead `.td-sos` css (lane T). Risk: the contract's dark tint values
are chosen by hand; A1's test computes every pair and the builder adjusts a value that misses, so the numbers in the
contract are a starting point, not a promise, until A1 is green.
