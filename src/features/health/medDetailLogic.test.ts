import { describe, expect, it } from 'vitest'
import type { MedTaken, Medication } from '../log/store'
import type { AlertRow } from '../notify/store'
import { missNote, stockInfo, weekCounter, weekStrip } from './medDetailLogic'

const d = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m) // October 2026, local clock
const med = (o: Partial<Medication> = {}): Medication => ({ serverId: 'm1', personId: 'p1', name: 'Amlodipine', schedule: { v: 1, times: ['08:00'] }, medStatus: 'active', ...o })
const take = (day: number, h: number, m: number, o: Partial<MedTaken> = {}): MedTaken => ({ personId: 'p1', name: 'Amlodipine', takenAt: d(day, h, m).toISOString(), medicationId: 'm1', slot: '08:00', ...o })

describe('stockInfo', () => {
  it('counts down per day: 12 tablets, 2 a day, counted 2 days ago = 8 left, 4 days, amber', () => {
    const s = stockInfo(med({ schedule: { v: 1, times: ['08:00', '20:00'] }, stockQty: 12, stockSetAt: d(26, 8).toISOString() }), d(28, 9))
    expect(s).toMatchObject({ kind: 'counted', left: 8, days: 4, low: true, chip: 'Refill in 4 days', line: '8 tablets left' })
  })
  it('7 days left is not amber; 1 day is singular; 0 runs out today', () => {
    const base = { stockSetAt: d(28, 7).toISOString() }
    expect(stockInfo(med({ ...base, stockQty: 7 }), d(28, 9))).toMatchObject({ days: 7, low: false, chip: '7 days' })
    expect(stockInfo(med({ ...base, stockQty: 1 }), d(28, 9))).toMatchObject({ days: 1, low: true, chip: 'Refill in 1 day' })
    expect(stockInfo(med({ ...base, stockQty: 0 }), d(28, 9))).toMatchObject({ days: 0, low: true, chip: 'Runs out today' })
  })
  it('no count and as-needed are not zero', () => {
    expect(stockInfo(med(), d(28, 9))).toMatchObject({ kind: 'not-counted', days: null, left: null, chip: null, line: 'No count yet' })
    expect(stockInfo(med({ asNeeded: true, stockQty: 5 }), d(28, 9))).toMatchObject({ kind: 'as-needed', days: null, chip: null })
  })
})

describe('weekStrip', () => {
  const now = d(28, 9) // Wed 28 Oct 09:00; the strip is Thu 22 .. Wed 28
  it('shows taken, late, missed (no take and skipped), pending today, with counts', () => {
    const takes = [take(22, 8, 5), take(23, 11, 0), take(25, 8, 1, { skipped: true }), take(26, 8, 30), take(27, 7, 50)]
    const w = weekStrip(med({ startedOn: '2026-10-20' }), takes, now)
    expect(w.cells.map((c) => c.state)).toEqual(['taken', 'late', 'missed', 'missed', 'taken', 'taken', 'pending'])
    expect(w.cells.map((c) => c.label)).toEqual(['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'])
    expect(w.taken).toBe(4)
    expect(w.due).toBe(6)
  })
  it('days before it started are not due', () => {
    const w = weekStrip(med({ startedOn: '2026-10-26' }), [], now)
    expect(w.cells.map((c) => c.state)).toEqual(['not-due', 'not-due', 'not-due', 'not-due', 'missed', 'missed', 'pending'])
    expect(w.due).toBe(2)
  })
  it('an as-needed medicine has no due days', () => {
    expect(weekStrip(med({ asNeeded: true }), [], now).cells.every((c) => c.state === 'not-due')).toBe(true)
  })
  it('across midnight: a 23:30 dose taken at 00:10 counts for the day it was due; tonight is pending', () => {
    const m = med({ schedule: { v: 1, times: ['23:30'] }, startedOn: '2026-10-27' })
    const w = weekStrip(m, [take(28, 0, 10, { slot: '23:30' })], now)
    expect(w.cells.slice(-2).map((c) => c.state)).toEqual(['taken', 'pending'])
  })
  it('across midnight: at 23:45 the 23:30 dose is still pending, at 01:31 next day it is missed', () => {
    const m = med({ schedule: { v: 1, times: ['23:30'] }, startedOn: '2026-10-27' })
    expect(weekStrip(m, [], d(27, 23, 45)).cells.at(-1)!.state).toBe('pending')
    expect(weekStrip(m, [], d(28, 1, 31)).cells.slice(-2)[0]!.state).toBe('missed')
  })
  it('another medicine or another person is never counted', () => {
    const w = weekStrip(med({ startedOn: '2026-10-28' }), [take(28, 8, 0, { medicationId: 'other' }), take(28, 8, 0, { personId: 'p2' })], d(28, 11))
    expect(w.cells.at(-1)!.state).toBe('missed')
  })
  it('two slots: one taken and one open gives the worse state', () => {
    const m = med({ schedule: { v: 1, times: ['08:00', '20:00'] }, startedOn: '2026-10-27' })
    const w = weekStrip(m, [take(27, 8, 0)], d(28, 9))
    expect(w.cells.slice(-2).map((c) => c.state)).toEqual(['missed', 'pending'])
  })
})

describe('missNote', () => {
  const m = med({ startedOn: '2026-10-20' })
  const cells = weekStrip(m, [take(22, 8, 5), take(23, 8, 0), take(25, 8, 0), take(26, 8, 0), take(27, 8, 0)], d(28, 9)).cells // Sat 24 missed
  const alert = (o: Partial<AlertRow>): AlertRow => ({ id: 'a', personId: 'p1', kind: 'dose_missed', template: 'dose_missed' as AlertRow['template'], ref: 'p1:2026-10-24:08:00', createdAt: d(24, 8, 31).toISOString(), pushedAt: null, seenAt: null, expiresAt: d(31, 8).toISOString(), ...o })
  it('names the day; says what this phone saw', () => {
    expect(missNote(cells, [], m)).toBe('Saturday: missed.')
    expect(missNote(cells, [alert({ seenAt: d(24, 8, 30).toISOString() })], m)).toBe('Saturday: missed. You saw the alert at 8:30 AM.')
    expect(missNote(cells, [alert({})], m)).toBe('Saturday: missed. The family was told. You have not opened the alert yet.')
  })
  it('ignores an alert for another day, person or kind', () => {
    expect(missNote(cells, [alert({ ref: 'p1:2026-10-23:08:00', seenAt: d(24, 8, 30).toISOString() }), alert({ personId: 'p2' }), alert({ kind: 'digest' as AlertRow['kind'] })], m)).toBe('Saturday: missed.')
  })
  it('null when nothing was missed', () => {
    expect(missNote(weekStrip(m, [], d(20, 7)).cells, [], m)).toBeNull()
  })
})

describe('weekCounter', () => {
  it('"1 of 2 doses on time this week", null before any dose is due', () => {
    const m = med({ startedOn: '2026-10-26' }) // due: Mon, Tue (Wed is still inside its 2 hours at 09:00)
    expect(weekCounter({ meds: [m], takes: [take(26, 8, 0)], personId: 'p1', now: d(28, 9) })).toBe('1 of 2 doses on time this week')
    expect(weekCounter({ meds: [m], takes: [], personId: 'p1', now: d(26, 7) })).toBeNull()
  })
})
