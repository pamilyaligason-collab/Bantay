import { describe, expect, it } from 'vitest'
import { actionLine, actionLines, hourSpan, rainWatch, type HourlyRain } from './actionLine'

const NOW = '2026-10-20T13:20'
const hours = (probAt: (day: number, h: number) => number): HourlyRain[] =>
  Array.from({ length: 48 }, (_, i) => ({ time: `2026-10-${20 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`, prob: probAt(Math.floor(i / 24), i % 24) }))
const dry = hours(() => 10)
const base = { heatIndexC: 30, hourly: dry, nowLocal: NOW, uvMax: 5, warning: null }

describe('rain watch', () => {
  it('names the window and the peak: Rain likely 2-5 PM (88%)', () => {
    const h = hours((d, hr) => (d === 0 && hr === 14 ? 70 : d === 0 && hr === 15 ? 88 : d === 0 && hr === 16 ? 75 : 10))
    expect(rainWatch(h, NOW)?.text).toBe('Rain likely 2-5 PM (88%)')
  })
  it('says tomorrow when the first wet hour is on the next day, and now when it is raining this hour', () => {
    expect(rainWatch(hours((d, hr) => (d === 1 && hr >= 3 && hr <= 4 ? 65 : 0)), '2026-10-20T20:00')?.text).toBe('Rain likely tomorrow 3-5 AM (65%)')
    expect(rainWatch(hours((d, hr) => (d === 0 && hr >= 13 && hr <= 15 ? 90 : 0)), NOW)?.text).toBe('Rain likely now until 4 PM (90%)')
  })
  it('59% is not a watch; 60% is', () => {
    expect(rainWatch(hours((d, hr) => (d === 0 && hr === 15 ? 59 : 0)), NOW)).toBeNull()
    expect(rainWatch(hours((d, hr) => (d === 0 && hr === 15 ? 60 : 0)), NOW)?.peak).toBe(60)
  })
  it('only looks 12 hours ahead and never at the past', () => {
    expect(rainWatch(hours((d, hr) => (d === 1 && hr === 6 ? 95 : d === 0 && hr === 9 ? 95 : 0)), NOW)).toBeNull()
  })
  it('null probabilities are not rain', () => {
    expect(rainWatch([{ time: '2026-10-20T14:00', prob: null }], NOW)).toBeNull()
  })
  it('hour spans', () => {
    expect(hourSpan(14, 17)).toBe('2-5 PM')
    expect(hourSpan(11, 14)).toBe('11 AM-2 PM')
  })
})

describe('action line: the worst applies first', () => {
  it('nothing applies: null', () => { expect(actionLine(base)).toBeNull() })
  it('heat Danger gives the PAGASA action and the band', () => {
    const a = actionLine({ ...base, heatIndexC: 42 })!
    expect(a.id).toBe('heat')
    expect(a.text).toBe('Stay indoors 11 AM-3 PM. Drink water often. Check on older family.')
    expect(a.band).toBe('Heat index 42° · Danger')
  })
  it('Caution alone is the everyday reading: no action line', () => { expect(actionLine({ ...base, heatIndexC: 30 })).toBeNull() })
  it('Extreme caution beats nothing but loses to rain; Danger beats rain', () => {
    const rainy = hours((d, hr) => (d === 0 && hr >= 14 && hr <= 16 ? 80 : 0))
    expect(actionLine({ ...base, heatIndexC: 36, hourly: rainy })!.id).toBe('rain')
    expect(actionLine({ ...base, heatIndexC: 44, hourly: rainy })!.id).toBe('heat')
    expect(actionLines({ ...base, heatIndexC: 44, hourly: rainy }).map((x) => x.id)).toEqual(['heat', 'rain'])
  })
  it('UV 8+ says strong sun, until 3 PM', () => {
    expect(actionLine({ ...base, uvMax: 8 })!.text).toBe('Strong sun: shade and a hat 10 AM-3 PM')
    expect(actionLine({ ...base, uvMax: 7 })).toBeNull()
    expect(actionLine({ ...base, uvMax: 11, nowLocal: '2026-10-20T16:00' })).toBeNull()
  })
  it('an active warning for the place comes first; air quality does not outrank heat Danger', () => {
    const w = { kind: 'tcws', title: 'Signal No. 2 for Bohol', doNow: 'Stay home.' }
    expect(actionLine({ ...base, heatIndexC: 44, warning: w })!.text).toBe('Signal No. 2 for Bohol. Stay home.')
    expect(actionLine({ ...base, heatIndexC: 44, warning: { kind: 'air', title: 'Poor air', doNow: 'Wear a mask outdoors.' } })!.id).toBe('heat')
    expect(actionLine({ ...base, warning: { kind: 'air', title: 'Poor air', doNow: 'Wear a mask outdoors.' } })!.id).toBe('air')
  })
  it('unknown heat index is not Danger', () => { expect(actionLine({ ...base, heatIndexC: null })).toBeNull() })
})
