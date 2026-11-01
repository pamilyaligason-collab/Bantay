import { describe, expect, it } from 'vitest'
import css from './calm.css?raw'
import { over, pair, parse, ratio, tokensOf } from '../look/contrastMath'

const PAIRS = [['--ink', '--tint-teal'], ['--muted', '--tint-teal'], ['--tint-teal-ink', '--tint-teal'], ['--ink', '--card'], ['--muted', '--card'], ['--on-green', '--green'], ['--green', '--ground']] as const
describe('Calm contrast pairs from tokens.css', () => {
  for (const theme of ['light', 'dark'] as const) {
    const t = tokensOf(theme)
    it(`${theme}: every text pair the page uses is >= 4.5`, () => {
      for (const [fg, bg] of PAIRS) expect(pair(t, fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    })
    it(`${theme}: face buttons (--ink on the --fill wash over --card) >= 4.5`, () => {
      const card = parse(t['--card']!)[0], face = over(parse(t['--fill']!), card)
      expect(ratio(parse(t['--ink']!)[0], face)).toBeGreaterThanOrEqual(4.5)
    })
  }
  it('the hero fill is the teal tint token', () => expect(css).toMatch(/\.cm-hero\s*\{[^}]*var\(--tint-teal\)/))
})
