import { describe, expect, it } from 'vitest'
import { DAMPAS } from '../location/geo'
import type { Alert } from './alerts'
import { kickerOf, readyRows, rightNowRows } from './SafetyHub'

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: 'q1', kind: 'quake', level: 'M4.6', title: 'M4.6 quake', what: 'x', where: 'Siquijor', when: 'now', doNow: 'x', source: 'USGS', sourceUrl: null,
  issuedAt: '2026-11-01T00:00:00.000Z', lat: 9.2, lon: 123.5, bulletin: 'b', ...over
})
const base = { alerts: [] as Alert[], here: DAMPAS, wx: null, storms: [] as Alert[], hazard: 'Earthquake: can have very destructive shaking', pins: 0 }

describe('rightNowRows', () => {
  it('the badge follows the cards: a quiet quake beside anything worse is May be felt, not Far away', () => {
    const now = Date.now()
    const live = { source: 'gps', zone: 'dampas', weather: { lat: 7.07, lon: 125.6 }, fixAt: now }
    const q = (id: string, km: number, level: string, min: number, over: Partial<Alert> = {}) => alert({ id, title: id, level, lat: 7.07, lon: 125.6 + km / 110.35, issuedAt: new Date(now - min * 60_000).toISOString(), ...over })
    const badges = (alerts: Alert[]) => Object.fromEntries(rightNowRows({ ...base, here: live.weather, place: live, alerts }).filter((r) => alerts.some((a) => a.title === r.title)).map((r) => [r.title, r.badge]))
    expect(badges([q('old', 205, 'M5.0', 300), q('fresh', 215, 'M5.4', 3)])).toEqual({ old: 'May be felt', fresh: 'May be felt' })
    expect(badges([q('old', 272, 'M4.6', 300), q('volcano', 120, 'Orange', 30, { kind: 'volcano' })])).toEqual({ old: 'May be felt', volcano: 'Near you' })
    expect(badges([q('old', 205, 'M5.0', 300)])).toEqual({ old: 'Far away' })
  })
  it('with no alerts the first row is Warnings (None now), then weather, storms, hazards, rescue map', () => {
    const r = rightNowRows(base)
    expect(r.map((x) => x.href)).toEqual(['#safety/warnings', '#weather', '#safety/storms', '#safety/hazards', '#safety/map'])
    expect(r[0]!.value).toBe('None now')
    expect(r[0]!.badge).toBeUndefined()
    expect(r[2]!.value).toBe('No storms')
    expect(r[3]!.sub).toBe(base.hazard)
    expect(r[4]!.value).toBe('Shelters, help')
  })
  it('ranks at most three alerts first, with icon, tint and a felt badge', () => {
    const many = [alert({ id: 'a' }), alert({ id: 'b' }), alert({ id: 'c' }), alert({ id: 'd' })]
    const r = rightNowRows({ ...base, alerts: many })
    expect(r.filter((x) => x.href === '#safety/warnings')).toHaveLength(4) // Warnings row (4 now, only 3 shown) + three alerts
    expect(r[0]!.title).toBe('Warnings')
    expect(r[0]!.value).toBe('4 now')
    const q = r[1]!
    expect(q.icon).toBe('quake')
    expect(q.tint).toBe('amber')
    expect(q.title).toBe('M4.6 quake')
    expect(q.sub).toMatch(/^Siquijor · \d+ km · USGS$/)
    expect(q.badge).toBe('You may feel it')
  })
  it('a far quake says Far away only where Warnings hides the steps, else May be felt; a signal 3 is red; no point omits the km', () => {
    const manila = { lat: 14.6, lon: 121 }
    const now = Date.now()
    const live = { source: 'gps', zone: 'dampas', weather: { lat: 7.07, lon: 125.6 }, fixAt: now }
    const old = alert({ ...manila, issuedAt: new Date(now - 5 * 3_600_000).toISOString() })
    expect(rightNowRows({ ...base, alerts: [old] })[0]!.badge).toBe('May be felt') // only a home zone is known
    expect(rightNowRows({ ...base, here: live.weather, place: live, alerts: [old] })[0]!.badge).toBe('Far away')
    const firstHour = alert({ ...manila, issuedAt: new Date(now - 12 * 60_000).toISOString() }) // VISUAL-round2: Warnings says You may feel it in the first hour
    expect(rightNowRows({ ...base, here: live.weather, place: live, alerts: [firstHour] })[0]!.badge).toBe('May be felt')
    const big = rightNowRows({ ...base, alerts: [alert({ level: 'M6.4', title: 'M6.4 quake', lat: 14.6, lon: 121 })] })[0]!
    expect(big.badge).toBe('May be felt')
    const unknown = rightNowRows({ ...base, alerts: [alert({ level: null, title: 'Quake', what: '', lat: 14.6, lon: 121 })] })[0]!
    expect(unknown.badge).toBe('May be felt') // size unknown: never downgraded to Far away
    const t = rightNowRows({ ...base, alerts: [alert({ kind: 'tcws', level: 'Signal No. 3', title: 'Signal 3', lat: null, lon: null })] })[0]!
    expect(t.tint).toBe('red')
    expect(t.icon).toBe('typhoon')
    expect(t.sub).toBe('Siquijor · USGS')
  })
  it('names the storm and how many more; counts places', () => {
    const s = [alert({ kind: 'gdacs', id: 's1', title: 'Tropical Cyclone ROSAL' }), alert({ kind: 'gdacs', id: 's2', title: 'Tropical Cyclone TWO' })]
    const r = rightNowRows({ ...base, storms: s, pins: 2 })
    expect(r.find((x) => x.href === '#safety/storms')!.value).toMatch(/ and 1 more$/)
    expect(r.find((x) => x.href === '#safety/map')!.value).toBe('2 places')
  })
})

describe('CS: the first row is the alert itself', () => {
  it('one alert replaces the Warnings row; stale or hidden alerts bring it back', () => {
    expect(rightNowRows({ ...base, alerts: [alert({ id: 'a' })] })[0]!.title).toBe('M4.6 quake')
    expect(rightNowRows({ ...base, alerts: [alert({ id: 'a' })], stale: true })[0]!.title).toBe('Warnings')
  })
  it('Offline maps is always listed before Past SOS, honest while no pack exists', () => {
    const r = readyRows({ dial: 1, cards: 7, ids: 0, offline: false, sosLast: null, phoneFix: 0 })
    expect(r.map((x) => x.title)).toEqual(['Hotlines', 'Safety cards', 'IDs and insurance', 'Offline maps', 'Past SOS'])
    expect(r[3]!.value).toBe('Not ready yet')
  })
})

describe('Warnings row staleness', () => {
  it('shows May be out of date only when stale', () => {
    expect(rightNowRows({ ...base, stale: true })[0]!.badge).toBe('May be out of date')
    expect(rightNowRows({ ...base, stale: true })[0]!.value).toBeUndefined()
  })
})

describe('R1 Storm tracker row staleness', () => {
  const storm = (r: ReturnType<typeof rightNowRows>) => r.find((x) => x.title === 'Storm tracker')!
  it('stale and no storm: no "No storms" value, the same badge as Warnings', () => {
    expect(storm(rightNowRows({ ...base, stale: true }))).toMatchObject({ value: undefined, badge: 'May be out of date' })
  })
  it('fresh and no storm: still "No storms"', () => {
    expect(storm(rightNowRows(base))).toMatchObject({ value: 'No storms', badge: undefined })
  })
})

describe('R4 Safety rows', () => {
  const storm = (r: ReturnType<typeof rightNowRows>) => r.find((x) => x.title === 'Storm tracker')!
  const signal = alert({ id: 'pagasa-tcws-1-1', kind: 'tcws', level: 'Signal No. 1', issuedAt: new Date().toISOString() })
  it('a live signal with no GDACS storm: the storm row names it in amber, never "No storms", fresh or stale', () => {
    expect(storm(rightNowRows({ ...base, alerts: [signal] }))).toMatchObject({ value: 'Signal No. 1', tint: 'amber', badge: undefined })
    expect(storm(rightNowRows({ ...base, alerts: [signal], stale: true }))).toMatchObject({ value: 'Signal No. 1', tint: 'amber', badge: undefined })
  })
  it('Warnings row: amber when stale and empty, green only when fresh and empty', () => {
    expect(rightNowRows({ ...base, stale: true })[0]!.tint).toBe('amber')
    expect(rightNowRows(base)[0]!.tint).toBe('green')
  })
})

describe('readyRows', () => {
  const b = { dial: 12, cards: 7, ids: 3, offline: false, sosLast: null as string | null, phoneFix: 0 }
  it('always Hotlines, Safety cards, IDs and insurance, Offline maps, Past SOS', () => {
    const r = readyRows(b)
    expect(r.map((x) => x.title)).toEqual(['Hotlines', 'Safety cards', 'IDs and insurance', 'Offline maps', 'Past SOS'])
    expect(r[0]!.value).toBe('12 numbers')
    expect(r[1]!.value).toBe('7 guides')
    expect(r[2]!.href).toBe('#docs')
    expect(r[4]!.value).toBe('None sent')
  })
  it('Offline maps loses its Not ready yet with the flag, Phone alerts only while something needs fixing', () => {
    const r = readyRows({ ...b, offline: true, phoneFix: 1, sosLast: '3 Oct' })
    expect(r.map((x) => x.title)).toEqual(['Hotlines', 'Safety cards', 'IDs and insurance', 'Offline maps', 'Past SOS', 'Phone alerts'])
    expect(r.at(-1)!.value).toBe('1 needs fixing')
    expect(r[4]!.value).toBe('3 Oct')
  })
})

describe('kickerOf', () => {
  it('says the freshness line (CSS upper-cases it)', () => {
    const now = Date.parse('2026-11-01T08:06:00Z')
    expect(kickerOf('2026-11-01T08:00:00Z', now)).toBe('Checked 6 min ago')
    expect(kickerOf(null, now)).toBe('Never checked')
  })
})
