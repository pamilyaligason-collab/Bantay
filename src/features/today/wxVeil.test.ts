import { describe, expect, it } from 'vitest'
import { SCRIM, SKY } from '../weather/scene'
import { TEXT_VEIL } from './wxVeil'

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! }
const over = (top: number[], a: number, under: number[]) => top.map((v, i) => v * a + under[i]! * (1 - a))
const ratio = (bg: number[]) => 1.05 / (lum(bg) + 0.05)
const INK = rgb('#050C1C')

describe('weather card text on every sky state (white text, WCAG AA 4.5:1)', () => {
  // Nothing in the scene can be brighter than white (stacked clouds, fog bands, a lightning flash, the sun glow all composite towards it),
  // so a pure white picture under the scrim and the text veil is the worst case of every time of day and condition, light and dark theme alike.
  it('worst case, a white picture, passes with the scene scrim and the Today veil', () => {
    const c = over(INK, TEXT_VEIL, over(INK, SCRIM, [255, 255, 255]))
    expect(ratio(c)).toBeGreaterThanOrEqual(4.5)
  })
  it('the veil adds real margin over the scrim alone (hand-computed: 4.77 alone, above 5.9 with the veil)', () => {
    expect(ratio(over(INK, SCRIM, [255, 255, 255]))).toBeGreaterThan(4.7)
    expect(ratio(over(INK, TEXT_VEIL, over(INK, SCRIM, [255, 255, 255])))).toBeGreaterThan(5.9)
  })
  it.each(Object.entries(SKY))('%s sky stops with a bright sun disc keep AA', (_t, stops) => {
    for (const s of stops) for (const lit of [rgb(s), [255, 244, 200]]) {
      expect(ratio(over(INK, TEXT_VEIL, over(INK, SCRIM, lit)))).toBeGreaterThanOrEqual(4.5)
    }
  })
})
