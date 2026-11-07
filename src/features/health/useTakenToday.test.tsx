import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ldb } from '../log/store'
import { useTakenToday } from './useActivity'

describe('useTakenToday', () => {
  beforeEach(async () => {
    await ldb.meds.clear()
    const takenAt = new Date().toISOString()
    await ldb.meds.bulkAdd([
      { personId: 'p', name: 'Drug A', takenAt },
      { personId: 'p', name: 'Drug B', takenAt, skipped: true }
    ])
  })
  it('does not count a skipped dose as taken', async () => {
    const { result } = renderHook(() => useTakenToday('p'))
    await waitFor(() => expect(result.current.map((r) => r.name)).toEqual(['Drug A']))
  })
  it('can include skipped rows for the id-based screens', async () => {
    const { result } = renderHook(() => useTakenToday('p', { includeSkipped: true }))
    await waitFor(() => expect(result.current).toHaveLength(2))
  })
})

// ML-38: "today" is the Manila day, whatever this phone's own calendar says. A worker cannot switch the real zone, so the local-time methods read an instant shifted `hours` ahead of UTC.
function phoneAhead(hours: number) {
  const proto = Object.getPrototypeOf(new Date()) as Date
  const shift = (d: Date) => new Date(d.getTime() + hours * 3_600_000)
  vi.spyOn(proto, 'getFullYear').mockImplementation(function (this: Date) { return shift(this).getUTCFullYear() })
  vi.spyOn(proto, 'getMonth').mockImplementation(function (this: Date) { return shift(this).getUTCMonth() })
  vi.spyOn(proto, 'getDate').mockImplementation(function (this: Date) { return shift(this).getUTCDate() })
  vi.spyOn(proto, 'setHours').mockImplementation(function (this: Date, h: number, m = 0, s = 0, ms = 0) { const sh = shift(this); return this.setTime(Date.UTC(sh.getUTCFullYear(), sh.getUTCMonth(), sh.getUTCDate(), h, m, s, ms) - hours * 3_600_000) })
}
describe('useTakenToday: the Manila day', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
  const takenNames = async (now: string, hours: number, rows: { name: string; at: string }[]) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    phoneAhead(hours)
    vi.setSystemTime(new Date(now))
    await ldb.meds.clear()
    await ldb.meds.bulkAdd(rows.map((r) => ({ personId: 'p', name: r.name, takenAt: new Date(r.at).toISOString() })))
    const { result } = renderHook(() => useTakenToday('p'))
    await new Promise((r) => setTimeout(r, 80))
    return result.current.map((r) => r.name).sort()
  }
  it('23:30 Manila on a phone 13 h ahead: a dose taken at 10:00 Manila earlier today still counts, yesterday evening does not', async () => {
    expect(await takenNames('2026-10-26T23:30:00+08:00', 13, [{ name: 'Morning', at: '2026-10-26T10:00:00+08:00' }, { name: 'Yesterday', at: '2026-10-25T23:50:00+08:00' }])).toEqual(['Morning'])
  })
  it('00:30 Manila on a phone on UTC: a dose taken at 23:50 Manila the evening before is yesterday, a 00:10 one is today', async () => {
    expect(await takenNames('2026-10-27T00:30:00+08:00', 0, [{ name: 'Evening', at: '2026-10-26T23:50:00+08:00' }, { name: 'Midnight', at: '2026-10-27T00:10:00+08:00' }])).toEqual(['Midnight'])
  })
})
