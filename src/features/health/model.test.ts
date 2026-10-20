import { describe, expect, it } from 'vitest'
import {
  activitySeries, barLayout, beforeLine, bodyNodes, compareToPrevious, doseStates, insightHeadline, medSlots, monthlyAverages, parseMedicine, previousReading, sparkCount
} from './model'
import type { Reading } from './ranges'

const NOW = new Date('2026-10-19T09:00:00')
const rd = (test: string, value: number, takenAt: string, extra: Partial<Reading> = {}): Reading => ({ personId: 'p1', test, value, takenAt, unit: 'mmHg', ...extra })

describe('insightHeadline', () => {
  it('says there is nothing yet when there are no readings', () => {
    expect(insightHeadline([], NOW).title).toBe('No results yet')
  })
  it('is not "in range" when the readings are older than a week', () => {
    const h = insightHeadline([rd('bp_systolic', 110, '2026-09-01T08:00:00')], NOW)
    expect(h.title).toBe('No new readings this week')
    expect(h.tone).toBe('none')
  })
  it('names a single in-range measure', () => {
    const h = insightHeadline([rd('bp_systolic', 110, '2026-10-18T08:00:00'), rd('bp_diastolic', 70, '2026-10-18T08:00:00')], NOW)
    expect(h.title).toBe('Blood pressure is in range this week')
    expect(h.tone).toBe('ok')
  })
  it('flags what is outside the range', () => {
    const h = insightHeadline([rd('bp_systolic', 110, '2026-10-18T08:00:00'), rd('fasting_glucose', 140, '2026-10-17T08:00:00', { unit: 'mg/dL' })], NOW)
    expect(h.title).toBe('Blood sugar needs a look this week')
    expect(h.tone).toBe('watch')
  })
  it('does not call a reading with no range in range', () => {
    expect(insightHeadline([rd('weight', 61, '2026-10-18T08:00:00', { unit: 'kg' })], NOW).tone).toBe('none')
  })
  it('a family limit beats the general guide', () => {
    const h = insightHeadline([rd('bp_systolic', 110, '2026-10-18T08:00:00')], NOW, () => ({ low: null, high: 100 }))
    expect(h.tone).toBe('watch')
  })
})

describe('previousReading and the Before line', () => {
  const list = [rd('bp_systolic', 126, '2026-10-10T08:00:00'), rd('bp_systolic', 140, '2026-10-18T08:00:00'), rd('bp_systolic', 150, '2026-10-01T08:00:00'), rd('weight', 60, '2026-10-18T08:00:00', { unit: 'kg' })]
  it('picks the reading just before the latest', () => {
    expect(previousReading(list, 'bp_systolic')?.value).toBe(126)
  })
  it('is null with one reading or none', () => {
    expect(previousReading(list, 'weight')).toBeNull()
    expect(previousReading(list, 'ldl')).toBeNull()
  })
  it('says closer to normal when it moved toward the range', () => {
    const latest = rd('bp_systolic', 126, '2026-10-18T08:00:00')
    const prev = rd('bp_systolic', 136, '2026-10-12T08:00:00')
    expect(compareToPrevious(latest, prev)).toMatchObject({ delta: -10, direction: 'down', trend: 'closer' })
    expect(beforeLine(latest, prev)).toMatch(/^Before: 136 mmHg on .*, down 10, closer to normal$/)
  })
  it('says further from normal, and null trend when there is no range', () => {
    expect(compareToPrevious(rd('bp_systolic', 140, 'b'), rd('bp_systolic', 130, 'a')).trend).toBe('further')
    expect(compareToPrevious(rd('weight', 61, 'b'), rd('weight', 60, 'a')).trend).toBeNull()
  })
})

describe('barLayout', () => {
  it('puts the markers inside 0..100 and draws the band only with a range', () => {
    const l = barLayout(130, 110, { low: null, high: 119 })
    expect(l.band).not.toBeNull()
    for (const n of [l.now, l.prev!, l.band!.from, l.band!.to]) expect(n).toBeGreaterThanOrEqual(0)
    expect(l.now).toBeGreaterThan(l.band!.to)
    expect(barLayout(5, null, null).band).toBeNull()
  })
})

describe('bodyNodes', () => {
  const acts = [
    { kind: 'sleep', minutes: 400, steps: null, startedAt: '2026-10-19T05:00:00' },
    { kind: 'steps', minutes: null, steps: 1200, startedAt: '2026-10-19T07:00:00' },
    { kind: 'steps', minutes: null, steps: 300, startedAt: '2026-10-19T08:00:00' },
    { kind: 'mood-good', minutes: null, steps: null, startedAt: '2026-10-19T08:30:00' }
  ]
  it('builds the seven nodes with latest values and states', () => {
    const n = Object.fromEntries(bodyNodes([rd('bp_systolic', 124, '2026-10-19T08:00:00'), rd('bp_diastolic', 79, '2026-10-19T08:00:00')], acts, NOW).map((x) => [x.id, x]))
    expect(n.bp).toMatchObject({ value: '124/79', state: 'above' })
    expect(n.sleep!.value).toBe('6h 40')
    expect(n.steps!.value).toMatch(/1,?500/)
    expect(n.mood).toMatchObject({ value: 'Good', note: 'today' })
  })
  it('unknown is shown as no data, never 0', () => {
    const n = bodyNodes([], [], NOW)
    expect(n).toHaveLength(7)
    expect(n.every((x) => x.empty && x.value === '--' && x.state === 'none')).toBe(true)
  })
})

describe('series and monthly averages', () => {
  it('sums steps per day and leaves empty days out', () => {
    const s = activitySeries([
      { kind: 'steps', minutes: null, steps: 100, startedAt: '2026-10-18T07:00:00.000Z' },
      { kind: 'steps', minutes: null, steps: 50, startedAt: '2026-10-18T09:00:00.000Z' },
      { kind: 'sleep', minutes: 420, steps: null, startedAt: '2026-10-17T05:00:00.000Z' }
    ], 'steps')
    expect(s).toHaveLength(1)
    expect(s[0]!.value).toBe(150)
  })
  it('groups a 00:30 local reading under its local day and month, not the UTC one', () => {
    const early = new Date(2026, 9, 1, 0, 30).toISOString() // 00:30 local on 1 Oct (UTC+8: still 30 Sep in UTC)
    const s = activitySeries([{ kind: 'steps', minutes: null, steps: 10, startedAt: early }], 'steps')
    expect(s[0]!.takenAt.slice(0, 10)).toBe('2026-10-01')
    expect(monthlyAverages([{ takenAt: early, value: 120 }], NOW).map((x) => x.month)).toEqual(['2026-10'])
  })
  it('averages per calendar month, skipping months with no readings', () => {
    const m = monthlyAverages([{ takenAt: '2026-10-02T08:00:00Z', value: 120 }, { takenAt: '2026-10-09T08:00:00Z', value: 130 }, { takenAt: '2026-08-09T08:00:00Z', value: 140 }], NOW)
    expect(m.map((x) => [x.month, x.avg, x.n])).toEqual([['2026-08', 140, 1], ['2026-10', 125, 2]])
  })
})

describe('medicine times', () => {
  it('parses a bare name, one time, several times and am/pm', () => {
    expect(parseMedicine('Losartan 50 mg')).toEqual({ name: 'Losartan 50 mg', times: [] })
    expect(parseMedicine('Losartan 8:00')).toEqual({ name: 'Losartan', times: [480] })
    expect(parseMedicine('Metformin 20:00,8:00')).toEqual({ name: 'Metformin', times: [480, 1200] })
    expect(parseMedicine('Amlodipine 8:30 PM')).toEqual({ name: 'Amlodipine', times: [1230] })
  })
  it('drops impossible times instead of guessing', () => {
    expect(parseMedicine('Foo 25:00').times).toEqual([])
    expect(parseMedicine('Foo 13:00 PM').times).toEqual([])
  })
  it('makes one slot per time, one timeless slot otherwise, and skips blanks', () => {
    expect(medSlots(['Metformin 8:00,20:00', 'Aspirin', '  ', 'X'])).toEqual([
      { name: 'Metformin', at: 480 }, { name: 'Metformin', at: 1200 }, { name: 'Aspirin', at: null }, { name: 'X', at: null }
    ])
  })
  it('marks the earliest slots taken, one per take today', () => {
    const slots = medSlots(['Metformin 8:00,20:00', 'Aspirin'])
    const st = doseStates(slots, [
      { name: 'metformin', takenAt: '2026-10-19T08:05:00' },
      { name: 'Aspirin', takenAt: '2026-10-18T08:05:00' } // yesterday does not count
    ], NOW)
    expect(st.map((s) => [s.name, s.at, s.taken])).toEqual([['Metformin', 480, true], ['Metformin', 1200, false], ['Aspirin', null, false]])
  })
})

describe('doseStates skipped', () => {
  it('a skipped row is not a taken dose', () => {
    const st = doseStates(medSlots(['Metformin 8:00']), [{ name: 'Metformin', takenAt: '2026-10-19T08:05:00', skipped: true }], NOW)
    expect(st[0]!.taken).toBe(false)
  })
})

describe('sparkPath', () => {
  const at = (v: number, d: number) => ({ personId: 'p', test: 't', value: v, takenAt: `2026-10-${10 + d}T08:00:00Z` })
  it('needs two readings and draws oldest to newest', async () => {
    const { sparkPath } = await import('./model')
    expect(sparkPath([at(1, 0)])).toBe('')
    expect(sparkPath([at(5, 1), at(1, 0)])).toMatch(/^M2 19L58 3$/) // 1 (older) low, 5 (newer) high
  })
})

describe('round-3 fix helpers', () => {
  it('barLayout pins the dot to the arrow when off the end of a low-only range', () => {
    const b = barLayout(35, null, { low: 40, high: null })
    expect(b.edge).toBe('low')
    expect(b.now).toBe(3)
    expect(barLayout(200, null, { low: null, high: 100 }).now).toBe(97)
  })
  it('sparkCount counts only drawn points', () => {
    const r = (v: unknown, t: string) => ({ id: t, personId: 'p', test: 't', value: v, unit: '', takenAt: t }) as never
    expect(sparkCount([r(1, '2026-01-01'), r('x', '2026-01-02'), r(3, 'bad'), r(4, '2026-01-04')])).toBe(2)
  })
})

describe('medications-based exports (live schedule)', () => {
  it('model re-exports the pure helpers next to the deprecated text path', async () => {
    const m = await import('./model')
    const med = { personId: 'p', name: 'Drug A', medStatus: 'active' as const, serverId: 's1', schedule: { v: 1, times: ['08:00', '20:00'] } }
    const slots = m.slotsFor([med], 'p', '2026-10-20')
    expect(slots.map((s) => s.slot)).toEqual(['08:00', '20:00'])
    expect(m.matchDoses(slots, [{ name: 'Drug A', takenAt: new Date(2026, 9, 20, 8, 5).toISOString(), medicationId: 's1', slot: '08:00' }], '2026-10-20').map((d) => d.state)).toEqual(['taken', 'pending'])
    expect(m.reviewOverdue({ schedule: { review: true, review_since: '2026-10-01' } }, '2026-10-20')).toBe(true)
  })
  it('the profile-text path still works for the screens that have not moved yet', async () => {
    const { medSlots, doseStates } = await import('./model')
    const slots = medSlots(['Losartan 8:00'])
    expect(doseStates(slots, [{ name: 'losartan', takenAt: new Date(2026, 9, 20, 8, 1).toISOString() }], new Date(2026, 9, 20, 9, 0))[0]!.taken).toBe(true)
  })
})
