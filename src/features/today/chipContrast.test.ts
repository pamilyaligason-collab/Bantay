import { describe, expect, it } from 'vitest'
import tokens from '../../styles/tokens.css?raw'
import css from './today.css?raw'

const vars = (sel: string): Record<string, string> => {
  const body = tokens.slice(tokens.indexOf(sel + ' {') + sel.length + 2).split('}')[0]
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]))
}
const lum = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const colorOf = (re: RegExp) => css.match(re)![1]

// Reads the chip colour the CSS really uses per theme, so a token swap in today.css is caught.
describe('My week chip text >= 4.5 on --soft (UI-16)', () => {
  const light = vars(':root')
  const dark = vars(':root[data-theme="dark"]')
  it('light: .td-chip', () => {
    const fg = colorOf(/^\.td-chip \{[^}]*color: var\((--[\w-]+)\)/m)
    expect(ratio(light[fg], light['--soft'])).toBeGreaterThanOrEqual(4.5)
  })
  it('dark: .td-chip (both theme selectors)', () => {
    const fg = colorOf(/^:root\[data-theme="dark"\] \.td-chip \{ color: var\((--[\w-]+)\)/m)
    expect(css).toContain(`:root:not([data-theme="light"]) .td-chip { color: var(${fg})`)
    expect(ratio(dark[fg], dark['--soft'])).toBeGreaterThanOrEqual(4.5)
  })
})
