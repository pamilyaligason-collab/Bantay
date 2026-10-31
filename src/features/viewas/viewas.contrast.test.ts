import { describe, expect, it } from 'vitest'
import tokens from '../../styles/tokens.css?raw'
import { over, parse, ratio, tokensOf } from '../look/contrastMath'
import css from './viewas.css?raw'

// ML-39: the amber "Acting as" bar (.va-bar fill --warn-bg, text and Exit label --ink, Exit border --ink) in light AND dark, computed from the tokens.
describe('the css still uses the tokens this test reproduces', () => {
  it('bar fill, text and Exit border', () => {
    expect(css).toMatch(/\.va-bar \{[^}]*background: var\(--warn-bg\); color: var\(--ink\);/)
    expect(css).toMatch(/\.va-exit \{[^}]*border: 1\.5px solid var\(--ink\); background: transparent; color: var\(--ink\);/)
    expect(css).toMatch(/\.va-note \{[^}]*color: var\(--ink\);/)
  })
  it('--warn-bg is 22% amber over --card in both themes', () => {
    expect(tokens.match(/--warn-bg: color-mix\(in srgb, var\(--amber\) 22%, var\(--card\)\);/g)!.length).toBeGreaterThanOrEqual(2)
  })
})

for (const theme of ['light', 'dark'] as const) {
  describe(`acting bar contrast (${theme})`, () => {
    const t = tokensOf(theme)
    const fill = over([parse(t['--amber']!)[0], 0.22], parse(t['--card']!)[0]) // --warn-bg is 22% amber over --card
    const ink = parse(t['--ink']!)[0]
    it('--ink text on the bar fill is at least 4.5:1', () => expect(ratio(ink, fill)).toBeGreaterThanOrEqual(4.5))
    it('the Exit button border (--ink) against the bar fill is at least 3:1', () => expect(ratio(ink, fill)).toBeGreaterThanOrEqual(3))
  })
}
