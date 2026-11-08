import { describe, expect, it } from 'vitest'
import css from './health.css?raw'
import { pair, tokensOf } from '../look/contrastMath'

const TINTS = ['blue', 'red', 'amber', 'teal', 'purple', 'green'] as const
const rule = (sel: string) => css.split('\n').find((l) => l.startsWith(sel + ' {'))!

describe('S25 Health videos and Browse contrast, light and dark', () => {
  it('the CSS uses the tested pairs (no white text on the tab accent)', () => {
    expect(rule('.hv-chip[aria-pressed="true"]')).toContain('background: var(--tint-amber); color: var(--tint-amber-ink)')
    expect(rule('.hv-ph')).toContain('background: var(--tint-amber); color: var(--tint-amber-ink)')
    expect(rule('.hv-chip')).toContain('color: var(--ink)')
    expect(rule('.card.hb .hb-s')).toContain('color: var(--tint-ink')
  })
  for (const theme of ['light', 'dark'] as const) {
    const t = tokensOf(theme)
    it(`${theme}: chip pressed and PH flag (--tint-amber-ink on --tint-amber) >= 4.5`, () => expect(pair(t, '--tint-amber-ink', '--tint-amber')).toBeGreaterThanOrEqual(4.5))
    it(`${theme}: chip text --ink on --card and --ground >= 4.5`, () => { for (const bg of ['--card', '--ground']) expect(pair(t, '--ink', bg)).toBeGreaterThanOrEqual(4.5) })
    for (const x of TINTS) it(`${theme}: Browse subtitle --tint-${x}-ink on --tint-${x} >= 4.5`, () => expect(pair(t, `--tint-${x}-ink`, `--tint-${x}`)).toBeGreaterThanOrEqual(4.5))
  }
})
