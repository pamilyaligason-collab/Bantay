import { describe, expect, it } from 'vitest'
import tokens from '../../styles/tokens.css?raw'
import { DARK_SEL, MEDIA_SEL, parse, ratio, tokensOf, varsOf } from '../look/contrastMath'
import css from './viewas.css?raw'

// ML-39: the Today bar (.va-bar, solid fill, dark Back to me), the member page bar (.mh-stack, white Back to me) and the tint View as pill (.va-open), light AND dark, computed from viewas.css and tokens.css.
describe('the css still uses the tokens this test reproduces', () => {
  it('bar, Back to me, member bar and View as pill pairs', () => {
    expect(css).toMatch(/\.va-open \{[^}]*background: var\(--tint-purple\); color: var\(--tint-purple-ink\);/)
    expect(css).toMatch(/\.va-bar \{[^}]*background: var\(--va-bar\); color: var\(--va-ink\);/)
    expect(css).toMatch(/\.va-exit \{[^}]*background: var\(--va-btn\); color: var\(--va-btn-ink\);/)
    expect(css).toMatch(/\.va-note \{[^}]*color: var\(--va-ink\);/)
    expect(css).toMatch(/\.mh-bar\.mh-stack \{[^}]*background: var\(--va-m-bar\); color: var\(--va-m-ink\);/)
    expect(css).toMatch(/\.mh-acts > \.mh-back \{ background: var\(--va-m-btn\); color: var\(--va-m-btn-ink\); border: 1\.5px solid var\(--va-m-edge\);/)
  })
  it('the media-query dark block carries the same values as the data-theme dark block', () => {
    expect(varsOf(css, MEDIA_SEL)).toEqual(varsOf(css, DARK_SEL))
  })
})

for (const theme of ['light', 'dark'] as const) {
  describe(`acting bars contrast (${theme})`, () => {
    const t = tokensOf(theme, tokens)
    const v = theme === 'light' ? varsOf(css, ':root') : varsOf(css, DARK_SEL)
    const c = (k: string) => parse(v[k] ?? t[k]!)[0]
    it('Today bar: text on the fill and the Back to me label on its button at least 4.5:1; the button against the fill at least 3:1', () => {
      expect(ratio(c('--va-ink'), c('--va-bar'))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(c('--va-btn-ink'), c('--va-btn'))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(c('--va-btn'), c('--va-bar'))).toBeGreaterThanOrEqual(3)
    })
    it('member bar: text on the fill and the Back to me label on its button at least 4.5:1; the button against the fill at least 3:1', () => {
      expect(ratio(c('--va-m-ink'), c('--va-m-bar'))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(c('--va-m-btn-ink'), c('--va-m-btn'))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(c('--va-m-edge'), c('--va-m-bar'))).toBeGreaterThanOrEqual(3) // the white button is told apart by its ink border
    })
    it('the View as pill text (--tint-purple-ink on --tint-purple) is at least 4.5:1', () => {
      expect(ratio(c('--tint-purple-ink'), c('--tint-purple'))).toBeGreaterThanOrEqual(4.5)
    })
  })
}
