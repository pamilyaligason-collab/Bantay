import { describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { dueDoses, heroCards, parseDose, rainOutlook, skyOf, zoneAlert, type Wx } from './heroCards'

const alert = (o: Partial<Alert>): Alert => ({
  id: 'a1', kind: 'tcws', level: 'Signal No. 2', title: 'Typhoon signal no. 2', what: 'w', where: 'Bohol', when: 'Tonight', doNow: 'Charge phones.',
  source: 'PAGASA', sourceUrl: null, issuedAt: '2026-10-18T01:00:00Z', lat: 9.7, lon: 123.9, bulletin: 'b', ...o
})
const wx: Wx = { temp: 29.4, rainPct: 70, words: 'rainy', at: '2026-10-18T08:10:00Z' }
const at = (h: number, m = 0) => new Date(2026, 9, 18, h, m)
const base = { alerts: [] as Alert[], ref: null, doses: [], weather: null, placeName: 'Dampas' }

describe('parseDose', () => {
  it('reads 24h and am/pm times, and skips text with no time', () => {
    expect(parseDose('Losartan 50 mg 8:00')).toEqual({ name: 'Losartan 50 mg', at: 480 })
    expect(parseDose('Metformin 8:30 PM')).toEqual({ name: 'Metformin', at: 20 * 60 + 30 })
    expect(parseDose('Aspirin @ 12:05 am')).toEqual({ name: 'Aspirin', at: 5 })
    expect(parseDose('Losartan')).toBeNull()
    expect(parseDose('8:00')).toBeNull()
    expect(parseDose('Vitamin 25:00')).toBeNull()
  })
})

describe('dueDoses', () => {
  const list = ['Losartan 8:00', 'Metformin 20:00', 'No time here']
  it('is due from its time for two hours', () => {
    expect(dueDoses(list, [], [], at(7, 59))).toEqual([])
    expect(dueDoses(list, [], [], at(8, 30)).map((d) => d.name)).toEqual(['Losartan'])
    expect(dueDoses(list, [], [], at(10, 0))).toEqual([])
  })
  it('drops a dose already taken today or skipped, but not yesterday\'s', () => {
    expect(dueDoses(list, [{ name: 'losartan', takenAt: at(8, 4).toISOString() }], [], at(8, 30))).toEqual([])
    expect(dueDoses(list, [{ name: 'Losartan', takenAt: new Date(2026, 9, 17, 8, 4).toISOString() }], [], at(8, 30))).toHaveLength(1)
    expect(dueDoses(list, [], ['Losartan'], at(8, 30))).toEqual([])
  })
  it('is empty for a missing or odd profile', () => {
    expect(dueDoses(undefined, [], [], at(8))).toEqual([])
    expect(dueDoses([1, null], [], [], at(8))).toEqual([])
  })
})

describe('zoneAlert', () => {
  it('keeps official warnings near the member and ignores far, utility and air alerts', () => {
    const far = alert({ id: 'far', lat: 35.7, lon: 139.7 })
    const util = alert({ id: 'u', kind: 'utility' })
    const air = alert({ id: 'air', kind: 'air' })
    expect(zoneAlert([far, util, air], null)).toBeNull()
    expect(zoneAlert([far, util, alert({})], null)?.id).toBe('a1')
    expect(zoneAlert([alert({ lat: null, lon: null })], null)?.id).toBe('a1')
  })
})

describe('heroCards priority', () => {
  const dose = { name: 'Losartan', at: 480 }
  it('alert, then dose, then weather', () => {
    const k = heroCards({ ...base, alerts: [alert({})], doses: [dose], weather: wx }).map((c) => c.kind)
    expect(k).toEqual(['alert', 'dose', 'weather'])
  })
  it('dose before weather when there is no alert', () => {
    expect(heroCards({ ...base, doses: [dose], weather: wx })[0]!.kind).toBe('dose')
  })
  it('weather alone, rainy wording and rounded temperature', () => {
    const [c, ...rest] = heroCards({ ...base, weather: wx })
    expect(rest).toEqual([])
    expect(c).toMatchObject({ kind: 'weather', big: '29°', title: 'Rain likely today in Dampas' })
  })
  it('unknown temperature is not shown as 0', () => {
    expect(heroCards({ ...base, weather: { ...wx, temp: null } })[0]!.kind).toBe('summary')
  })
  it('nothing applies: one calm summary', () => {
    expect(heroCards(base).map((c) => c.kind)).toEqual(['summary'])
  })
  it('the alert card offers What to do and I am OK', () => {
    expect(heroCards({ ...base, alerts: [alert({})] })[0]!.actions.map((a) => a.id)).toEqual(['safety', 'ok'])
  })
})

describe('rain timing', () => {
  const times = Array.from({ length: 24 }, (_, h) => `2026-10-19T${String(h).padStart(2, '0')}:00`)
  const probs = (f: (h: number) => number) => times.map((_, h) => f(h))
  it('finds the start, length and peak from the current hour', () => {
    const r = rainOutlook(times, probs((h) => (h >= 15 && h < 19 ? (h === 16 ? 100 : 70) : 10)), '2026-10-19T11:20')
    expect(r).toEqual({ now: false, startH: 15, endH: 19, hours: 4, peakPct: 100 })
    const c = heroCards({ ...base, weather: { ...wx, rain: r } })[0]!
    expect(c.body).toBe('Rain likely from 3 PM for about 4 hours. Chance: 100%.')
  })
  it('rain now says when it eases; past rain is ignored', () => {
    const p = probs((h) => (h >= 1 && h < 3 ? 90 : h >= 14 && h < 17 ? 60 : 0))
    const r = rainOutlook(times, p, '2026-10-19T14:05')
    expect(r).toMatchObject({ now: true, startH: 14, endH: 17 })
    expect(heroCards({ ...base, weather: { ...wx, rain: r } })[0]!.body).toBe('Rain now, easing around 5 PM.')
  })
  it('null when no hour reaches 50, undefined without hourly data, old text kept', () => {
    expect(rainOutlook(times, probs(() => 20), '2026-10-19T08:00')).toBeNull()
    expect(rainOutlook(undefined, undefined, '2026-10-19T08:00')).toBeUndefined()
    expect(heroCards({ ...base, weather: wx })[0]!.body).toBe('Bring an umbrella. Chance of rain: 70%.')
  })
  it('sky from weather code', () => {
    expect([0, 2, 45, 63, 96, undefined].map((c) => skyOf({ ...wx, code: c }))).toEqual(['clear', 'cloud', 'fog', 'rain', 'storm', undefined])
  })
})
