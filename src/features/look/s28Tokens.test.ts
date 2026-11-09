import { describe, expect, it } from 'vitest'
import tokens from '../../styles/tokens.css?raw'
import { DARK_SEL, MEDIA_SEL, pair, ratio, parse, tokensOf, varsOf } from './contrastMath'

const HUES = ['teal', 'green', 'amber', 'rose', 'blue', 'violet', 'slate']
const NAMES = [
  '--fs-display', '--fs-value', '--fs-title', '--fs-body', '--fs-meta', '--fw-title', '--fw-value', '--fw-body', '--fw-meta', '--lh-tight', '--lh-body',
  '--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6', '--card-pad', '--card-gap',
  '--shadow', '--shadow-raised', '--shadow-hero', '--shadow-press', '--depth-card',
  ...HUES.flatMap((h) => [`--tint-${h}`, `--tint-${h}-ink`]),
]
const blocks = {
  light: varsOf(tokens, ':root'),
  dark: varsOf(tokens, DARK_SEL),
  media: varsOf(tokens, MEDIA_SEL, tokens.indexOf('prefers-color-scheme: dark')),
}
describe('S28 design tokens', () => {
  for (const [name, vars] of Object.entries(blocks)) {
    it(`${name} block defines every contract token`, () => expect(NAMES.filter((n) => !vars[n])).toEqual([]))
  }
  it('type floor: body 17, meta 15, card pad 16', () => { expect(blocks.light['--fs-body']).toBe('17px'); expect(blocks.light['--fs-meta']).toBe('15px'); expect(blocks.light['--card-pad']).toBe('16px') })
  for (const theme of ['light', 'dark'] as const) {
    const t = tokensOf(theme)
    for (const h of HUES) {
      it(`${theme} --tint-${h}-ink on --tint-${h} >= 4.5`, () => expect(pair(t, `--tint-${h}-ink`, `--tint-${h}`)).toBeGreaterThanOrEqual(4.5))
      it(`${theme} --tint-${h}-ink on --card >= 4.5`, () => expect(ratio(parse(t[`--tint-${h}-ink`]!)[0], parse(t['--card']!)[0])).toBeGreaterThanOrEqual(4.5))
    }
  }
})
