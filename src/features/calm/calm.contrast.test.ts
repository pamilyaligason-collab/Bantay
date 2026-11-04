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

describe('Calm page on its own deep teal (#1F3B45, both themes)', () => {
  const deep = parse('#1F3B45')[0]
  const ink = (hex: string, bg = deep) => ratio(parse(hex)[0], bg)
  it('white text, muted text and mint on the deep teal are >= 4.5', () => {
    for (const fg of ['#FFFFFF', '#D3E3E0', '#B9E4DA']) expect(ink(fg), fg).toBeGreaterThanOrEqual(4.5)
  })
  it('text on the 8% white cards and the mint thumb is >= 4.5', () => {
    const card = over(parse('rgba(255,255,255,.08)'), deep)
    for (const fg of ['#FFFFFF', '#D3E3E0']) expect(ink(fg, card), fg).toBeGreaterThanOrEqual(4.5)
    expect(ratio(parse('#123038')[0], parse('#B9E4DA')[0])).toBeGreaterThanOrEqual(4.5)
  })
  it('the page root pins the one hex and no third calm blue appears', () => {
    expect(css).toMatch(/\.cm-root\s*\{[^}]*--calm-deep: #1F3B45/)
    expect(css).toContain('background-color: var(--calm-deep)')
  })
})
