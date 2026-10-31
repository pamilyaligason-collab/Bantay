import { describe, expect, it } from 'vitest'
import { over, pair, parse, ratio, tokensOf } from '../look/contrastMath'
import css from './today.css?raw'

// The rule under test is "the chip's token pair is AA in both themes", computed from tokens.css; the css text is only checked for which tokens the chip uses.
describe('My week chip text >= 4.5 on --soft (UI-16)', () => {
  it('light: .td-chip uses --green on --soft', () => {
    expect(css).toMatch(/^\.td-chip \{[^}]*color: var\(--green\)/m)
    expect(pair(tokensOf('light'), '--green', '--soft')).toBeGreaterThanOrEqual(4.5)
  })
  it('dark: .td-chip uses --ok on --soft (both theme selectors)', () => {
    expect(css).toMatch(/^:root\[data-theme="dark"\] \.td-chip \{ color: var\(--ok\)/m)
    expect(css).toContain(':root:not([data-theme="light"]) .td-chip { color: var(--ok)')
    expect(pair(tokensOf('dark'), '--ok', '--soft')).toBeGreaterThanOrEqual(4.5)
  })
  it('every pair the chip can show is AA in both themes: green/ok and the high-low warn pair', () => {
    for (const theme of ['light', 'dark'] as const) {
      const t = tokensOf(theme)
      expect(pair(t, theme === 'light' ? '--green' : '--ok', '--soft'), `${theme} ok chip`).toBeGreaterThanOrEqual(4.5)
      const wb = over([parse(t['--amber']!)[0], 0.22], parse(t['--card']!)[0]) // --warn-bg = color-mix(amber 22%, card)
      expect(ratio(parse(t['--warn']!)[0], wb), `${theme} high/low chip: --warn on --warn-bg`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
