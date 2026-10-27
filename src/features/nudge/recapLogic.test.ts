import { describe, expect, it } from 'vitest'
import type { Reading } from '../health/ranges'
import type { MedTaken, Medication } from '../log/store'
import { hasSomethingToShare, recap, recapShareText } from './recapLogic'

// Sunday 15 March 2026, 8 PM. The week is Mon 9 to Sun 15 March.
const now = new Date(2026, 2, 15, 20, 0)
const at = (d: number, h: number, m = 0) => new Date(2026, 2, d, h, m).toISOString()
const SYS = [130, 132, 134, 136, 131, 135, 133] // sum 931, 931 / 7 = 133
const DIA = [80, 82, 84, 86, 81, 85, 83] // sum 581, 581 / 7 = 83
const week = (hours: number[]): Reading[] => SYS.flatMap((s, k) => [
  { personId: 'me', takenAt: at(9 + k, hours[k]!, 30), test: 'bp_systolic', value: s, unit: 'mmHg' },
  { personId: 'me', takenAt: at(9 + k, hours[k]!, 30), test: 'bp_diastolic', value: DIA[k]!, unit: 'mmHg' }
])
const med: Medication = { personId: 'me', name: 'Losartan', serverId: 'm1', schedule: { v: 1, times: ['08:00'] }, startedOn: '2026-03-01', medStatus: 'active' }
const take = (d: number): MedTaken => ({ personId: 'me', name: 'Losartan', medicationId: 'm1', slot: '08:00', takenAt: at(d, 8, 10) })
const takes = [9, 10, 11, 13, 15].map(take) // missed Thu 12 and Sat 14

describe('recap', () => {
  const r = recap({ personId: 'me', readings: week([7, 7, 7, 7, 7, 7, 7]), meds: [med], takes, now })
  it('averages the week: 133 over 83', () => expect(r.avg).toEqual({ sys: 133, dia: 83 }))
  it('7 of 7 morning checks', () => expect(r.checks).toEqual({ done: 7, of: 7 }))
  it('medicines on 5 of 7 days', () => expect(r.medDays).toEqual({ done: 5, of: 7 }))
  it('an afternoon reading is a check but not a MORNING check', () => {
    expect(recap({ personId: 'me', readings: week([7, 15, 7, 16, 7, 7, 7]), meds: [], takes: [], now }).checks).toEqual({ done: 5, of: 7 })
  })
  it('unknown stays null: no readings, no timed medicine', () => {
    const e = recap({ personId: 'me', readings: [], meds: [], takes: [], now })
    expect(e).toEqual({ avg: null, checks: { done: 0, of: 7 }, medDays: null })
  })
  it('only the member\'s own numbers and a reading outside the week is ignored', () => {
    const other = week([7, 7, 7, 7, 7, 7, 7]).map((x) => ({ ...x, personId: 'someone', value: 200 }))
    const old: Reading = { personId: 'me', takenAt: at(1, 7), test: 'bp_systolic', value: 200, unit: 'mmHg' }
    expect(recap({ personId: 'me', readings: [...week([7, 7, 7, 7, 7, 7, 7]), ...other, old], meds: [], takes: [], now }).avg).toEqual({ sys: 133, dia: 83 })
  })
})

describe('recapShareText: counts only', () => {
  const r = recap({ personId: 'me', readings: week([7, 7, 7, 7, 7, 7, 7]), meds: [med], takes, now })
  it('the exact family line', () => expect(recapShareText(r)).toBe('This week: 7 of 7 morning checks, medicines on 5 of 7 days.'))
  it('never carries a reading, the average or a pair', () => {
    const s = recapShareText(r)
    expect(s).not.toMatch(/133|83|\d{2,3}\s*\/\s*\d{2,3}/)
    expect(s.length).toBeLessThanOrEqual(200)
  })
  it('leaves the medicine part out when no medicine has a time', () => {
    expect(recapShareText({ avg: null, checks: { done: 3, of: 7 }, medDays: null })).toBe('This week: 3 of 7 morning checks.')
  })
  it('an empty week has nothing to share', () => {
    expect(hasSomethingToShare({ avg: null, checks: { done: 0, of: 7 }, medDays: { done: 0, of: 7 } })).toBe(false)
    expect(hasSomethingToShare(r)).toBe(true)
  })
})
