import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Forecast } from './forecast'
import SunArc, { sunPosition } from './SunArc'
import { SCRIM, SKY } from './scene'

// a +08:00 place: sunrise 05:41, sunset 17:32 on 2026-11-10 (place clock). The tests use epoch ms, so the phone's own zone cannot matter.
const fc = { utcOffset: 28800, daily: [{ date: '2026-11-10', code: 0, min: 24, max: 31, prob: 10, uvMax: 9, sunrise: '2026-11-10T05:41', sunset: '2026-11-10T17:32' }] } as unknown as Forecast
const at = (hhmm: string) => Date.parse(`2026-11-10T${hhmm}:00+08:00`)

describe('sunPosition in the place clock', () => {
  it('before sunrise (04:00) and after sunset (20:00) is night', () => {
    expect(sunPosition(fc, at('04:00'))).toEqual({ state: 'before', f: 0 })
    expect(sunPosition(fc, at('20:00'))).toEqual({ state: 'after', f: 1 })
  })
  it('at sunrise it is up at 0; at sunset it is down', () => {
    expect(sunPosition(fc, at('05:41'))).toEqual({ state: 'up', f: 0 })
    expect(sunPosition(fc, at('17:32'))!.state).toBe('after')
  })
  it('midday of the daylight (11:36) is halfway: 711 minutes of daylight, half is 355.5', () => {
    expect(sunPosition(fc, at('11:36'))!.f).toBeCloseTo(0.5, 2) // the clock is read to the minute: 355 of 711
  })
  it('unknown sunrise, sunset or day is null', () => {
    expect(sunPosition({ ...fc, daily: [{ ...fc.daily[0]!, sunset: null }] }, at('12:00'))).toBeNull()
    expect(sunPosition({ ...fc, daily: [] }, at('12:00'))).toBeNull()
  })
  it('the place offset decides, not the viewer: noon in +08:00 is 23:00 the evening before in a -05:00 place, so before that date sunrise', () => {
    expect(sunPosition({ ...fc, utcOffset: -18000 }, at('12:00'))!.state).toBe('before')
  })
})

describe('SunArc', () => {
  afterEach(cleanup)
  it('names rise, set and the state for a screen reader', () => {
    render(<SunArc fc={fc} now={at('12:00')} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Sun: rose 5:41 AM, sets 5:32 PM, now up')
    expect(screen.getByTestId('wx-sun-dot').getAttribute('data-state')).toBe('up')
  })
  it('night reads "now down" and nothing renders without sun times', () => {
    const { rerender } = render(<SunArc fc={fc} now={at('22:00')} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/now down$/)
    rerender(<SunArc fc={{ ...fc, daily: [] }} now={at('22:00')} />)
    expect(screen.queryByTestId('wx-sun')).toBeNull()
  })
})

// the page is the veiled sky in both themes (weather.css), the card is white at .14 over it; the dots must stand out at 3:1
describe('sun and night dots against the card, every sky', () => {
  const lum = (c: number[]) => c.reduce((a, v, i) => a + [0.2126, 0.7152, 0.0722][i]! * (((v / 255 + 0.055) / 1.055) ** 2.4), 0)
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v * (1 - t) + b[i]! * t) // t of b over a
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }
  const cases = Object.entries(SKY).flatMap(([tod, stops]) => stops.map((s) => [tod, s] as const))
  it.each(cases)('%s sky %s: sun dot and night dot are 3:1 or better on the card', (_t, sky) => {
    const card = mix(mix(rgb(sky), [5, 12, 28], SCRIM), [255, 255, 255], 0.14)
    expect(ratio(rgb('#F5B301'), card)).toBeGreaterThanOrEqual(3)
    expect(ratio(mix(card, [255, 255, 255], 0.92 * 0.8), card)).toBeGreaterThanOrEqual(3) // currentColor (--muted, white .92) at fill-opacity .8
  })
})
