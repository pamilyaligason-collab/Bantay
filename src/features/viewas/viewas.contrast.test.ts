import { describe, expect, it } from 'vitest'
import tokens from '../../styles/tokens.css?raw'
import css from './viewas.css?raw'

// ML-39: the amber "Acting as" bar (.va-bar fill --warn-bg, text and Exit label --ink, Exit border --ink) in light AND dark.
type RGB = [number, number, number]
const vars = (selector: string): Record<string, string> => {
  const at = tokens.indexOf(selector + ' {')
  return Object.fromEntries([...tokens.slice(at + selector.length + 2).split('}')[0]!.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}
const hex = (c: string): RGB => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as RGB
const lum = (c: RGB) => { const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! }
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }
const mix = (a: RGB, b: RGB, pctA: number): RGB => a.map((v, i) => v * pctA + b[i]! * (1 - pctA)) as RGB

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

for (const [name, sel] of [['light', ':root'], ['dark', ':root[data-theme="dark"]']] as const) {
  describe(`acting bar contrast (${name})`, () => {
    const v = vars(sel)
    const fill = mix(hex(v['--amber']!), hex(v['--card']!), 0.22)
    it('--ink text on the bar fill is at least 4.5:1', () => expect(ratio(hex(v['--ink']!), fill)).toBeGreaterThanOrEqual(4.5))
    it('the Exit button border (--ink) against the bar fill is at least 3:1', () => expect(ratio(hex(v['--ink']!), fill)).toBeGreaterThanOrEqual(3))
  })
}
