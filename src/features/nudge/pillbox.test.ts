import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ldb, type MedTaken, type Medication } from '../log/store'
import { logHalf, pillbox } from './pillboxLogic'

// Sunday 15 March 2026, 8 PM; the week is Mon 9 to Sun 15.
const now = new Date(2026, 2, 15, 20, 0)
const at = (d: number, h: number, m = 0) => new Date(2026, 2, d, h, m).toISOString()
const losartan: Medication = { personId: 'me', name: 'Losartan', serverId: 'm1', schedule: { v: 1, times: ['08:00'] }, startedOn: '2026-03-01', medStatus: 'active' }
const metformin: Medication = { personId: 'me', name: 'Metformin', serverId: 'm2', schedule: { v: 1, times: ['08:00', '20:00'] }, startedOn: '2026-03-01', medStatus: 'active' }
const take = (d: number, h: number, id: string, name: string, slot: string, extra: Partial<MedTaken> = {}): MedTaken => ({ personId: 'me', name, medicationId: id, slot, takenAt: at(d, h, 5), ...extra })

describe('pillbox grid', () => {
  const takes = [take(9, 8, 'm1', 'Losartan', '08:00'), take(10, 8, 'm1', 'Losartan', '08:00', { skipped: true }), take(15, 8, 'm1', 'Losartan', '08:00')]
  const week = pillbox({ personId: 'me', meds: [losartan], takes, now })
  it('seven days ending today, today last', () => {
    expect(week).toHaveLength(7)
    expect(week[0]!.day).toBe('2026-03-09')
    expect(week[6]).toMatchObject({ day: '2026-03-15', today: true })
  })
  it('morning cell: taken is done, skipped is skipped, not logged on a past day is missed', () => {
    expect(week[0]!.am.state).toBe('done')
    expect(week[1]!.am.state).toBe('skipped')
    expect(week[2]!.am.state).toBe('missed')
    expect(week[6]!.am.state).toBe('done')
  })
  it('a half with no dose due is none', () => expect(week.every((d) => d.pm.state === 'none')).toBe(true))
  it('today\'s evening dose not yet taken is open, not missed', () => {
    const w = pillbox({ personId: 'me', meds: [metformin], takes: [take(15, 8, 'm2', 'Metformin', '08:00')], now })
    expect(w[6]!.am.state).toBe('done')
    expect(w[6]!.pm.state).toBe('open')
    expect(w[5]!.pm.state).toBe('missed')
  })
  it('another person\'s takes never fill my cell', () => {
    const w = pillbox({ personId: 'me', meds: [losartan], takes: [{ ...take(9, 8, 'm1', 'Losartan', '08:00'), personId: 'other' }], now })
    expect(w[0]!.am.state).toBe('missed')
  })
})

describe('logHalf: tap logs through logDose, never twice', () => {
  beforeEach(async () => { await Promise.all([ldb.medications.clear(), ldb.meds.clear()]) })
  it('logs the open doses of that half once', async () => {
    await ldb.medications.bulkAdd([metformin, losartan])
    expect(await logHalf('me', 'am', now)).toBe(2)
    const rows = await ldb.meds.toArray()
    expect(rows.map((r) => [r.name, r.slot, r.medicationId]).sort()).toEqual([['Losartan', '08:00', 'm1'], ['Metformin', '08:00', 'm2']])
    expect(await logHalf('me', 'am', now)).toBe(0) // second tap: already logged
    expect(await ldb.meds.count()).toBe(2)
  })
  it('the evening tap leaves the morning alone', async () => {
    await ldb.medications.add(metformin)
    expect(await logHalf('me', 'pm', now)).toBe(1)
    expect((await ldb.meds.toArray()).map((r) => r.slot)).toEqual(['20:00'])
  })
  it('a dose already logged (say from a reminder) is not logged again', async () => {
    await ldb.medications.add(losartan)
    await ldb.meds.add(take(15, 8, 'm1', 'Losartan', '08:00'))
    expect(await logHalf('me', 'am', now)).toBe(0)
    expect(await ldb.meds.count()).toBe(1)
  })
  it('a 00:30 dose taken at 23:50 the night before is not logged again at 00:10', async () => {
    const night: Medication = { ...losartan, schedule: { v: 1, times: ['00:30'] } }
    const justAfter = new Date(2026, 2, 16, 0, 10)
    await ldb.medications.add(night)
    await ldb.meds.add({ personId: 'me', name: 'Losartan', medicationId: 'm1', slot: '00:30', takenAt: at(15, 23, 50) })
    expect(await logHalf('me', 'am', justAfter)).toBe(0)
    expect(await ldb.meds.count()).toBe(1)
  })
  it('the same dose with no earlier take is logged once at 00:10', async () => {
    await ldb.medications.add({ ...losartan, schedule: { v: 1, times: ['00:30'] } })
    expect(await logHalf('me', 'am', new Date(2026, 2, 16, 0, 10))).toBe(1)
    expect(await logHalf('me', 'am', new Date(2026, 2, 16, 0, 11))).toBe(0)
  })
  it('a take more than 3 h old does not block a new dose of the same slot', async () => {
    await ldb.medications.add(losartan)
    await ldb.meds.add({ personId: 'me', name: 'Losartan', medicationId: 'm1', slot: '08:00', takenAt: at(14, 8, 5) })
    expect(await logHalf('me', 'am', now)).toBe(1)
  })
  it('a person with no medicine logs nothing', async () => {
    await ldb.medications.add(losartan)
    expect(await logHalf('someone-else', 'am', now)).toBe(0)
  })
})
