import { describe, expect, it } from 'vitest'
import css from './calm.css?raw'
import orbCss from '../look/orb.css?raw'
import { PHASE_WORD } from '../today/breathLogic'
import { over, pair, parse, ratio, tokensOf } from '../look/contrastMath'

const PAIRS = [['--ink', '--tint-teal'], ['--muted', '--tint-teal'], ['--tint-teal-ink', '--tint-teal'], ['--ink', '--card'], ['--ink', '--ground'], ['--muted', '--card'], ['--on-green', '--green'], ['--green', '--ground']] as const
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
  it('the hero sits on the page with no card fill (S22-C)', () => expect(css).toMatch(/\.cm-hero\s*\{[^}]*background: none/))
  // Hand-computed WCAG ratios (sRGB; the 8% white card is composited over the lightest stop of the page gradient).
  it('S22-C: every text colour passes 4.5 on the LIGHTEST gradient stop #1D3A6E, not only the flat #0E1B3A', () => {
    const light = parse('#1D3A6E')[0]
    const r = (fg: string, bg = light) => ratio(parse(fg)[0], bg)
    expect(r('#FFFFFF')).toBeCloseTo(11.15, 1)
    expect(r('#B4C2E2')).toBeCloseTo(6.24, 1) // muted
    expect(r('#A8C7FF')).toBeCloseTo(6.52, 1) // links, done pill text
    expect(r('#BFD4FF')).toBeCloseTo(7.48, 1) // overline and icon head
    for (const fg of ['#FFFFFF', '#B4C2E2', '#A8C7FF', '#BFD4FF']) expect(r(fg), fg).toBeGreaterThanOrEqual(4.5)
    const card = over(parse('rgba(255,255,255,.08)'), light)
    expect(r('#FFFFFF', card)).toBeCloseTo(8.82, 1)
    expect(r('#B4C2E2', card)).toBeCloseTo(4.94, 1)
    expect(r('#A8C7FF', card)).toBeCloseTo(5.16, 1)
    const pill = over(parse('rgba(160,190,255,.16)'), light) // the done-today pill
    expect(r('#A8C7FF', pill)).toBeCloseTo(4.74, 1)
  })
  it('S22-C: the old #A9B8DA and #6FA2FF text colours are gone from the page text', () => {
    expect(css).not.toMatch(/--muted: #A9B8DA/)
    expect(css).not.toMatch(/--calm-mint: #6FA2FF/)
  })
  it('S22-C: light Start, chip text and the solid disc behind the sphere word and count are >= 4.5', () => {
    expect(ratio(parse('#0E1B3A')[0], parse('#EAF0FF')[0])).toBeCloseTo(14.89, 1) // Start
    expect(ratio(parse('#0A1430')[0], parse('#6FA2FF')[0])).toBeGreaterThanOrEqual(4.5) // selected chip
    expect(ratio(parse('#FFFFFF')[0], parse('#0E1B3A')[0])).toBeCloseTo(16.98, 1) // word on the --ground disc
  })
  it('S22-C: the Today card white text on its lightest stop is >= 4.5', () => {
    const light = parse('#1D3A6E')[0]
    expect(ratio(parse('#FFFFFF')[0], light)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(over(parse('rgba(255,255,255,.86)'), light), light)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('Calm page on its own deep navy (#0E1B3A, both themes)', () => {
  const deep = parse('#0E1B3A')[0]
  it('white text, muted text and the link blue on the deep navy are >= 4.5', () => {
    for (const fg of ['#FFFFFF', '#B4C2E2', '#A8C7FF']) expect(ratio(parse(fg)[0], deep), fg).toBeGreaterThanOrEqual(4.5)
  })
  it('the page root pins the one hex', () => {
    expect(css).toMatch(/\.cm-root\s*\{[^}]*--calm-deep: #0E1B3A/)
    expect(css).toContain('background-color: var(--calm-deep)')
  })
})

describe('S22-C fix2: crisis card and breath label', () => {
  const card = parse('#14284F')[0], pill = parse('#EAF0FF')[0]
  const r = (fg: string, bg: typeof card) => ratio(parse(fg)[0], bg)
  it('crisis card is a solid colour and its text passes 4.5 on it (hand-computed)', () => {
    expect(css).toMatch(/\.cm-root \.cm-crisis \{ background: #14284F;/)
    expect(r('#FFFFFF', card)).toBeCloseTo(14.52, 1)
    expect(r('#B4C2E2', card)).toBeCloseTo(8.13, 1)
    expect(r('#A8C7FF', card)).toBeCloseTo(8.49, 1)
  })
  it('call pills are solid with dark text and a dark network line >= 4.5', () => {
    expect(css).toMatch(/\.cm-call \{[^}]*background: #EAF0FF; color: #0E1B3A/)
    expect(css).toMatch(/\.cm-call \.cm-net \{ color: #2B3A5E; \}/)
    expect(r('#0E1B3A', pill)).toBeCloseTo(14.89, 1)
    expect(r('#2B3A5E', pill)).toBeCloseTo(9.85, 1)
  })
  it('breath label is a one-line pill whose min-width covers the longest phase word', () => {
    const rule = orbCss.match(/\.bo-label \{([^}]*)\}/)![1]!
    expect(rule).toContain('white-space: nowrap')
    const min = Number(rule.match(/min-width: (\d+)px/)![1]), pad = Number(rule.match(/padding: \d+px (\d+)px/)![1])
    const longest = Math.max(...Object.values(PHASE_WORD).map((w) => w.length))
    expect(longest).toBe(11)
    // 15px/600 sans: about 8 px a character at most (11 chars -> 88 px), plus the side padding
    expect(min).toBeGreaterThanOrEqual(longest * 8 + 2 * pad - 0)
  })
})
