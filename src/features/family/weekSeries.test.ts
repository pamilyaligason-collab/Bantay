import { describe, expect, it } from 'vitest'
import type { Reading } from '../health/ranges'
import type { Activity, MedTaken, Medication } from '../log/store'
import { bpSeries, dayKeys, doseSeries, legendWord, stepSeries } from './weekSeries'

const now = new Date(2026, 9, 27, 10, 20)
const at = (day: string, hm = '08:00') => `${day}T${hm}:00`
const bp = (personId: string, day: string, value: number): Reading => ({ personId, takenAt: at(day), test: 'bp_systolic', value })

describe('weekSeries', () => {
  it('has 7 local day keys ending today', () => {
    const k = dayKeys(now)
    expect(k).toHaveLength(7)
    expect(k[6]).toBe('2026-10-27')
    expect(k[0]).toBe('2026-10-21')
  })
  it('averages a day, leaves gaps null, ignores other people and old readings', () => {
    const s = bpSeries([bp('a', '2026-10-27', 120), bp('a', '2026-10-27', 130), bp('b', '2026-10-27', 99), bp('a', '2026-10-19', 150)], ['a', 'b'], now)
    expect(s[0]!.points[6]).toBe(125)
    expect(s[0]!.points.slice(0, 6).every((p) => p === null)).toBe(true)
    expect(s[0]).toMatchObject({ latest: 125, empty: false })
    expect(s[1]!.points[6]).toBe(99)
  })
  it('sums steps for a day', () => {
    const a = (steps: number): Activity => ({ personId: 'a', kind: 'steps', minutes: null, steps, startedAt: at('2026-10-26'), source: 'manual' } as Activity)
    expect(stepSeries([a(1000), a(2000)], ['a'], now)[0]!.points[5]).toBe(3000)
  })
  it('dose percent is taken over all slots, null on a day with none, all-null is empty', () => {
    const med = { personId: 'a', name: 'Losartan', serverId: 'm1', schedule: { v: 1, times: ['08:00', '20:00'] } } as unknown as Medication
    const take = { personId: 'a', name: 'Losartan', medicationId: 'm1', slot: '08:00', takenAt: at('2026-10-26') } as MedTaken
    const s = doseSeries([med], [take], ['a'], now)[0]!
    expect(s.points[5]).toBe(50)
    expect(doseSeries([], [], ['a'], now)[0]!.empty).toBe(true)
  })
  it('legend words', () => {
    const s = (latest: number | null) => ({ personId: 'a', points: [], latest, empty: latest == null })
    expect(legendWord('bp', s(null))).toBe('no readings')
    expect(legendWord('bp', s(148))).toBe('148 high')
    expect(legendWord('bp', s(110))).toBe('110 in range')
    expect(legendWord('steps', s(3120))).toBe('3,120')
    expect(legendWord('meds', s(80))).toBe('80%')
  })
})
