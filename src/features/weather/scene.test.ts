import { describe, expect, it } from 'vitest'
import { condOf, feelsLike, isHot, SCRIM, SKY, todOf } from './scene'

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! }
const mix = (top: number[], a: number, under: number[]) => top.map((v, i) => v * a + under[i]! * (1 - a))

describe('todOf', () => {
  const up = '2026-10-20T05:50'
  const down = '2026-10-20T17:45'
  it.each([
    ['2026-10-20T03:00', 'night'], ['2026-10-20T05:30', 'dawn'], ['2026-10-20T06:30', 'dawn'], ['2026-10-20T12:00', 'day'],
    ['2026-10-20T16:50', 'dusk'], ['2026-10-20T18:00', 'dusk'], ['2026-10-20T18:30', 'night'], ['2026-10-20T23:59', 'night']
  ])('%s is %s', (now, want) => { expect(todOf(now, up, down)).toBe(want) })
  it('without sunrise and sunset it falls back to 6 AM and 6 PM, and an unreadable clock is day, not night', () => {
    expect(todOf('2026-10-20T02:00')).toBe('night')
    expect(todOf('2026-10-20T13:00', null, null)).toBe('day')
    expect(todOf('nonsense')).toBe('day')
  })
})

describe('condOf', () => {
  it.each([[0, 'clear'], [1, 'clear'], [2, 'partly'], [3, 'overcast'], [45, 'fog'], [53, 'drizzle'], [63, 'rain'], [81, 'rain'], [96, 'storm']])('code %i is %s', (c, want) => { expect(condOf(c)).toBe(want) })
  it('unknown is none, never clear', () => { expect(condOf(null)).toBe('none'); expect(condOf(undefined)).toBe('none') })
})

describe('feelsLike', () => {
  it('heat index with its PAGASA label when it applies (33 C at 70% is Danger)', () => {
    const f = feelsLike(33, 70, 42)
    expect(Math.round(f.value!)).toBe(43)
    expect(f.label).toBe('Danger')
  })
  it('everyday Caution shows a number but no label', () => { expect(feelsLike(29, 65, 31).label).toBeNull() })
  it('without humidity it is the forecast apparent temperature and never labelled', () => { expect(feelsLike(34, null, 38)).toEqual({ value: 38, label: null }) })
  it('nothing known is null', () => { expect(feelsLike(null, null, null)).toEqual({ value: null, label: null }) })
  it('hot tint starts at Danger', () => { expect(isHot(33, 70)).toBe(true); expect(isHot(30, 60)).toBe(false); expect(isHot(null, 70)).toBe(false) })
})

describe('contrast (WCAG AA 4.5:1 for white text)', () => {
  const scrim = rgb('#050C1C')
  // worst case per time of day: the brightest sky stop under a 60% white cloud, and a bright sun disc, both under the scrim
  it.each(Object.entries(SKY))('%s', (_tod, stops) => {
    const bright = stops.map(rgb).sort((a, b) => lum(b) - lum(a))[0]!
    for (const lit of [mix([255, 255, 255], 0.6, bright), [255, 244, 200]]) {
      const c = mix(scrim, SCRIM, lit)
      expect(1.05 / (lum(c) + 0.05)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
