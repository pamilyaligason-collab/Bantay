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
  it('with no alerts the first row is weather, then storms, hazards, rescue map', () => {
    const r = rightNowRows(base)
    expect(r.map((x) => x.href)).toEqual(['#weather', '#safety/storms', '#safety/hazards', '#safety/map'])
    expect(r[1]!.value).toBe('No storms')
    expect(r[2]!.sub).toBe(base.hazard)
    expect(r[3]!.value).toBe('Shelters, help')
  })
  it('ranks at most three alerts first, with icon, tint and a felt badge', () => {
    const many = [alert({ id: 'a' }), alert({ id: 'b' }), alert({ id: 'c' }), alert({ id: 'd' })]
    const r = rightNowRows({ ...base, alerts: many })
    expect(r.filter((x) => x.href === '#safety/warnings')).toHaveLength(3)
    const q = r[0]!
    expect(q.icon).toBe('quake')
    expect(q.tint).toBe('amber')
    expect(q.title).toBe('M4.6 quake')
    expect(q.sub).toMatch(/^Siquijor · \d+ km · USGS$/)
    expect(q.badge).toBe('You may feel it')
  })
  it('a far quake is minor; a signal 3 is red; no point omits the km', () => {
    const far = rightNowRows({ ...base, alerts: [alert({ lat: 14.6, lon: 121 })] })[0]!
    expect(far.badge).toBe('Minor, far away')
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

describe('readyRows', () => {
  const b = { dial: 12, cards: 7, ids: 3, offline: false, sosLast: null as string | null, phoneFix: 0 }
  it('always Hotlines, Safety cards, IDs and insurance, Past SOS', () => {
    const r = readyRows(b)
    expect(r.map((x) => x.title)).toEqual(['Hotlines', 'Safety cards', 'IDs and insurance', 'Past SOS'])
    expect(r[0]!.value).toBe('12 numbers')
    expect(r[1]!.value).toBe('7 guides')
    expect(r[2]!.href).toBe('#docs')
    expect(r[3]!.value).toBe('None sent')
  })
  it('Offline maps only with the flag, Phone alerts only while something needs fixing', () => {
    const r = readyRows({ ...b, offline: true, phoneFix: 1, sosLast: '3 Oct' })
    expect(r.map((x) => x.title)).toEqual(['Hotlines', 'Safety cards', 'IDs and insurance', 'Past SOS', 'Offline maps', 'Phone alerts'])
    expect(r.at(-1)!.value).toBe('1 needs fixing')
    expect(r[3]!.value).toBe('3 Oct')
  })
})

describe('kickerOf', () => {
  it('upper-cases the freshness line', () => {
    const now = Date.parse('2026-11-01T08:06:00Z')
    expect(kickerOf('2026-11-01T08:00:00Z', now)).toBe('CHECKED 6 MIN AGO')
    expect(kickerOf(null, now)).toBe('NEVER CHECKED')
  })
})
