import { describe, expect, it } from 'vitest'
import css from './health.css?raw'
import { pair, tokensOf } from '../look/contrastMath'

// S28 C1: the strokes the new visuals draw (rings, sparklines) are graphics: 3:1 against what they sit on (WCAG 1.4.11), light and dark.
const TINTS = ['blue', 'red', 'amber', 'teal', 'purple', 'green'] as const
const rule = (sel: string) => css.split('\n').find((l) => l.startsWith(sel + ' {'))!

describe('Today tiles: ring and sparkline strokes', () => {
  it('both are drawn in the tile ink (currentColor), the one colour tested below', () => {
    expect(rule('.tk .rg-val')).toContain('stroke: currentColor')
    expect(rule('.tk-spark')).toContain('stroke: currentColor')
    expect(rule('.tk-spark circle')).toContain('fill: currentColor')
    for (const x of TINTS) expect(rule(`.tk[data-tint="${x}"]`)).toContain(`--tint-fill: var(--tint-${x}); --tint-ink: var(--tint-${x}-ink)`)
  })
  for (const theme of ['light', 'dark'] as const) {
    const t = tokensOf(theme)
    for (const x of TINTS) {
      it(`${theme}: ring / spark stroke (--tint-${x}-ink) on its tile tint >= 3`, () => expect(pair(t, `--tint-${x}-ink`, `--tint-${x}`)).toBeGreaterThanOrEqual(3))
      it(`${theme}: tile text (--tint-${x}-ink) on its tint >= 4.5`, () => expect(pair(t, `--tint-${x}-ink`, `--tint-${x}`)).toBeGreaterThanOrEqual(4.5))
    }
  }
})

describe('Family rings and the water ring', () => {
  // FamilyRings draws steps = amber, medicines = green, check-in = blue (Ring hue -> --h-ic = --tint-<hue>-ink) on the card surface.
  for (const theme of ['light', 'dark'] as const) {
    const t = tokensOf(theme)
    for (const x of ['amber', 'green', 'blue'] as const) {
      it(`${theme}: ${x} ring (--tint-${x}-ink) on the card surface >= 3`, () => expect(pair(t, `--tint-${x}-ink`, '--card')).toBeGreaterThanOrEqual(3))
    }
    it(`${theme}: the water ring on the blue hero tint >= 3`, () => expect(pair(t, '--tint-blue-ink', '--tint-blue')).toBeGreaterThanOrEqual(3))
  }
})

describe('Tinted hero and compare cards: body text', () => {
  // WaterDetail (blue), the BP hero (blue), the pulse hero (red) and the compare cards (green, blue, amber) put --ink and the muted --ink2 on a tint fill.
  for (const theme of ['light', 'dark'] as const) {
    const t = tokensOf(theme)
    for (const x of ['blue', 'red', 'green', 'amber'] as const) {
      it(`${theme}: --ink and --ink2 on --tint-${x} >= 4.5`, () => {
        expect(pair(t, '--ink', `--tint-${x}`)).toBeGreaterThanOrEqual(4.5)
        expect(pair(t, '--ink2', `--tint-${x}`)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})
