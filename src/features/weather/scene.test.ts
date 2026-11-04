import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CONDS, condOf, feelsLike, isHot, layersFor, LIT, litOf, SCRIM, scrimFor, SKY, TODS, todOf } from './scene'

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

// T6: Today's hero shows the board's night sky and a bright moon; Weather's page keeps the full SCRIM.
describe('lite scrim for Today at night (T6)', () => {
  const scrim = rgb('#050C1C')
  const board = { top: rgb('#1C2F57'), bottom: rgb('#46608A') }
  it('only a night with a moon is lighter; day, dawn, dusk, storms and the Weather page keep SCRIM', () => {
    expect(scrimFor('night', true, layersFor('night', 'clear').moon)).toBeLessThan(SCRIM)
    expect(scrimFor('night', true, layersFor('night', 'partly').moon)).toBeLessThan(SCRIM)
    expect(scrimFor('night', false, true)).toBe(SCRIM) // Weather's own hero
    expect(scrimFor('night', true, layersFor('night', 'storm').moon)).toBe(SCRIM)
    for (const t of ['dawn', 'day', 'dusk'] as const) expect(scrimFor(t, true, true)).toBe(SCRIM)
  })
  it('the night sky under the lite scrim stays within 25 per channel of the board (#1C2F57 to #46608A), unlike SCRIM', () => {
    const a = scrimFor('night', true, true)
    for (const [stop, want] of [[SKY.night[0], board.top], [SKY.night[1], board.bottom]] as const) {
      const seen = mix(scrim, a, rgb(stop))
      seen.forEach((v, i) => expect(Math.abs(v - want[i]!)).toBeLessThanOrEqual(25))
    }
    expect(Math.abs(mix(scrim, SCRIM, rgb(SKY.night[1]))[0]! - board.bottom[0]!)).toBeGreaterThan(25)
  })
  it('white text stays AA on the brightest sky stop, a night cloud (#9FB0D4 at .55)', () => {
    const a = scrimFor('night', true, true)
    const bright = rgb(SKY.night[1])
    for (const lit of [bright, mix(rgb('#9FB0D4'), 0.55, bright)]) {
      expect(1.05 / (lum(mix(scrim, a, lit)) + 0.05)).toBeGreaterThanOrEqual(4.5)
    }
    expect(readFileSync('src/features/weather/scene.css', 'utf8').toUpperCase()).toContain('#9FB0D4')
  })
})

describe('scrim gate for every state (tod x cond x hot), moon, heat and flash included', () => {
  const scrim = rgb('#050C1C')
  const css = readFileSync('src/features/weather/scene.css', 'utf8').toUpperCase()
  const worst = (tod: (typeof TODS)[number], cond: (typeof CONDS)[number] | 'none', hot: boolean) => {
    const stops = SKY[tod].map(rgb).sort((a, b) => lum(b) - lum(a))
    let lit = stops[0]! // the sky itself
    for (const k of litOf(layersFor(tod, cond, hot))) {
      const cand = mix(rgb(LIT[k].hex), LIT[k].a, stops[0]!)
      if (lum(cand) > lum(lit)) lit = cand
    }
    return 1.05 / (lum(mix(scrim, SCRIM, lit)) + 0.05)
  }
  for (const tod of TODS) for (const cond of [...CONDS, 'none' as const]) for (const hot of [false, true]) {
    it(`${tod} ${cond}${hot ? ' hot' : ''} keeps white text AA`, () => { expect(worst(tod, cond, hot)).toBeGreaterThanOrEqual(4.5) })
  }
  it('scene.css carries the colours the gate assumes', () => {
    for (const k of ['sun', 'sunGlow', 'moon', 'heat', 'fog'] as const) expect(css.includes(LIT[k].hex.toUpperCase()) || css.includes(rgb(LIT[k].hex).join(', ')), k).toBe(true)
    expect(css).toContain('244, 241, 230, .35') // moon glow
    expect(css).toContain('255, 120, 30, .5') // heat glow
    expect(css).toContain('.WXS-SHIMMER') // shimmer band
    expect(css).toMatch(/\.wxs-shimmer[^}]*opacity: \.18/i)
  })
  it('layers: moon only on clear/partly nights, shimmer and heat only when hot, flash only in a storm, rain count by condition', () => {
    expect(layersFor('night', 'clear').moon).toBe(true)
    expect(layersFor('day', 'clear').moon).toBe(false)
    expect(layersFor('night', 'rain').moon).toBe(false)
    expect(layersFor('day', 'clear').shimmer).toBe(false)
    expect(layersFor('day', 'clear', true)).toMatchObject({ shimmer: true, heat: true })
    expect(layersFor('day', 'storm').flash).toBe(true)
    expect(layersFor('day', 'rain').flash).toBe(false)
    expect([layersFor('day', 'drizzle').rain, layersFor('day', 'rain').rain, layersFor('day', 'storm').rain]).toEqual([10, 18, 24])
  })
})
