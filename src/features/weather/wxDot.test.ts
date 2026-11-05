import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SCRIM, SKY } from './scene'

// The Weather page is a dark veiled sky in both themes, so the status dot has its own two colours (wxs7w.css). Measure them on every sky stop under the veil and the card glass (rgba(255,255,255,.14), weather.css).
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! }
const mix = (top: number[], a: number, under: number[]) => top.map((v, i) => v * a + under[i]! * (1 - a))
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const css = readFileSync('src/features/weather/wxs7w.css', 'utf8')
const dot = (rule: RegExp) => rgb(rule.exec(css)![1]!)
const calm = dot(/\.wx-dot \{[^}]*background: (#[0-9A-Fa-f]{6})/)
const watch = dot(/\.wx-dot\[data-tone="watch"\] \{ background: (#[0-9A-Fa-f]{6})/)
const skies = Object.values(SKY).flat().map((h) => mix([255, 255, 255], 0.14, mix([5, 12, 28], SCRIM, rgb(h))))

describe('.wx-dot on the Weather sky', () => {
  it('has 8 sky stops to test (4 times of day, 2 stops each)', () => expect(skies).toHaveLength(8))
  it.each([['calm green', calm], ['watch amber', watch]] as const)('%s is at least 3:1 on every stop in both themes', (_n, c) => {
    for (const s of skies) expect(ratio(c, s)).toBeGreaterThanOrEqual(3)
  })
  it('the page tokens it replaced fail 3:1 somewhere on this sky (light green, dark green, light amber)', () => {
    for (const t of ['#1E6B4E', '#4FA37F', '#D97706']) expect(Math.min(...skies.map((s) => ratio(rgb(t), s)))).toBeLessThan(3)
  })
})
