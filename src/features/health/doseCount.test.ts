import { describe, expect, it } from 'vitest'
import { adherence as reportAdherence } from '../family/reportLogic'
import { computeMyWeek, lastDays } from '../today/myWeekLogic'
import { countDoses } from './doseCount'
import { buildSummary } from './visitSummaryLogic'
import type { Medication, MedTaken } from '../log/store'

const NOW = new Date('2026-10-20T20:00:00')
const med: Medication = { personId: 'p1', name: 'Losartan', serverId: 'm1', medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, startedOn: '2026-10-14' }
const take = (day: string): MedTaken => ({ personId: 'p1', name: 'Losartan', medicationId: 'm1', slot: '08:00', takenAt: new Date(`${day}T08:05:00`).toISOString() })

describe('one dose counter', () => {
  const takes = [take('2026-10-20'), take('2026-10-19')]
  const days = lastDays(NOW, 7)
  it('counts due doses so far as the denominator', () => {
    const n = countDoses({ meds: [med], takes, personId: 'p1', now: NOW, days })
    expect(n.want).toBeGreaterThan(0)
    expect(n.done).toBe(2)
    expect(n.want).toBe(7) // 14 to 20 Oct, one 8:00 dose a day, today's is past its 2 hours
    expect(n.done).toBeLessThanOrEqual(n.want)
  })
  it('Today, report and visit summary agree for the same 7 days', () => {
    const n = countDoses({ meds: [med], takes, personId: 'p1', now: NOW, days })
    const tile = computeMyWeek({ personId: 'p1', readings: [], activity: [], meds: [med], takes, now: NOW }).find((t) => t.code === 'doses')!
    expect(tile.value).toBe(`${n.done} of ${n.want}`)
    const rp = reportAdherence([med], takes, 'p1', NOW)
    expect([rp.taken, rp.due]).toEqual([n.done, n.want])
    const s = buildSummary({ person: { name: 'A' }, readings: [], meds: [med], takes, personId: 'p1', now: NOW })
    expect(s.adherence).toMatchObject({ done: n.done, want: n.want }) // started 14 Oct, so the 30 day window holds the same 7 days
  })
  it('no scheduled doses gives no percentage, never 0', () => {
    expect(countDoses({ meds: [], takes: [], personId: 'p1', now: NOW, days }).pct).toBeNull()
  })
  it('a 23:00 dose taken at 00:30 the next day counts as done, not missed', () => {
    const night: Medication = { ...med, schedule: { v: 1, times: ['23:00'] }, startedOn: '2026-10-19' }
    const t: MedTaken = { personId: 'p1', name: 'Losartan', medicationId: 'm1', slot: '23:00', takenAt: new Date('2026-10-20T00:30:00').toISOString() }
    const n = countDoses({ meds: [night], takes: [t], personId: 'p1', now: new Date('2026-10-20T12:00:00'), days: ['2026-10-19'] })
    expect([n.done, n.want]).toEqual([1, 1])
  })
  it('a 00:30 dose taken at 23:45 the night before counts as done, and one take never serves two days', () => {
    const early: Medication = { ...med, schedule: { v: 1, times: ['00:30'] }, startedOn: '2026-10-19' }
    const t: MedTaken = { personId: 'p1', name: 'Losartan', medicationId: 'm1', slot: '00:30', takenAt: new Date('2026-10-19T23:45:00').toISOString() }
    const n = countDoses({ meds: [early], takes: [t], personId: 'p1', now: new Date('2026-10-20T12:00:00'), days: ['2026-10-19', '2026-10-20'] })
    expect([n.done, n.want]).toEqual([1, 2]) // 19 Oct 00:30 slot is 23h away: missed; 20 Oct 00:30 slot takes it
  })
  it('just after midnight a 23:00 slot of yesterday is still inside its 2 hours', () => {
    const night: Medication = { ...med, schedule: { v: 1, times: ['23:00'] }, startedOn: '2026-10-19' }
    const n = countDoses({ meds: [night], takes: [], personId: 'p1', now: new Date('2026-10-20T00:30:00'), days: ['2026-10-19'] })
    expect([n.done, n.want]).toEqual([0, 0])
  })
})
