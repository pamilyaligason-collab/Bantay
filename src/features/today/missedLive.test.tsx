import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import type { AlertRow } from '../notify/store'

// D-145: the Today missed-dose row closes when the dose is taken or skipped (by anyone), and not before. Invented names and ids only.
const h = vi.hoisted(() => ({ seen: vi.fn((_id: string) => Promise.resolve()) }))
vi.mock('../notify/store', () => ({ markSeen: (id: string) => h.seen(id) }))
import { useMissedToday } from './missed'

const NOW = new Date('2026-10-26T10:10:00+08:00')
const row = (id: string, ref: string): AlertRow => ({ id, personId: 'p2', kind: 'dose_missed', template: 'dose_missed', ref, createdAt: '2026-10-26T01:40:00Z', pushedAt: null, seenAt: null, expiresAt: '2026-11-02T00:00:00Z' })
const ROWS = [row('md', 'p2:2026-10-26:09:00')]
function Probe({ rows }: { rows: AlertRow[] }) { return <p data-testid="out">{useMissedToday(rows).map((m) => `${m.personId}:${m.alertIds.join('+')}`).join(',') || 'none'}</p> }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); h.seen.mockClear()
  await Promise.all([db.outbox.clear(), db.kv.clear(), ldb.medications.clear(), ldb.meds.clear()])
  await ldb.medications.add({ personId: 'p2', name: 'Losartan', strength: '50 mg', serverId: 'm1', clientId: 'c1', medStatus: 'active', schedule: { v: 1, times: ['09:00'] } })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
/** A phone whose own calendar is `hours` ahead of UTC (a worker cannot switch the real zone): the local date getters read the shifted instant. */
function phoneAhead(hours: number) {
  const proto = Object.getPrototypeOf(new Date()) as Date
  const shift = (d: Date) => new Date(d.getTime() + hours * 3_600_000)
  vi.spyOn(proto, 'getFullYear').mockImplementation(function (this: Date) { return shift(this).getUTCFullYear() })
  vi.spyOn(proto, 'getMonth').mockImplementation(function (this: Date) { return shift(this).getUTCMonth() })
  vi.spyOn(proto, 'getDate').mockImplementation(function (this: Date) { return shift(this).getUTCDate() })
}

describe('useMissedToday', () => {
  it('an open dose keeps its row and nothing is marked seen', async () => {
    render(<Probe rows={ROWS} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('out').textContent).toBe('p2:md')
    expect(h.seen).not.toHaveBeenCalled()
  })
  it.each([[false], [true]])('a dose marked (skipped=%s) by anyone drops the row and marks its alert seen', async (skipped) => {
    render(<Probe rows={ROWS} />)
    await ldb.meds.add({ personId: 'p2', name: 'Losartan', takenAt: new Date('2026-10-26T09:40:00+08:00').toISOString(), medicationId: 'm1', slot: '09:00', skipped: skipped || undefined })
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('none'))
    await waitFor(() => expect(h.seen).toHaveBeenCalledWith('md'))
  })
  // ML-38: the dose day is the Manila day of the server's refs, whatever this phone's own clock says; fixed clocks either side of Manila midnight, on a phone whose own day differs
  it.each([['23:30 Manila, phone 13 h ahead', '2026-10-26T23:30:00+08:00', 13, '2026-10-26', '23:00', '2026-10-26T23:10:00+08:00'], ['00:30 Manila, phone on UTC', '2026-10-27T00:30:00+08:00', 0, '2026-10-27', '00:15', '2026-10-27T00:20:00+08:00']])('%s: a take made on the Manila day closes the row', async (_l, now, tz, day, slot, tookAt) => {
    phoneAhead(tz)
    vi.setSystemTime(new Date(now))
    await ldb.medications.clear()
    await ldb.medications.add({ personId: 'p2', name: 'Losartan', strength: '50 mg', serverId: 'm1', clientId: 'c1', medStatus: 'active', schedule: { v: 1, times: [slot] } })
    const rows = [row('md', `p2:${day}:${slot}`)]
    render(<Probe rows={rows} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('out').textContent).toBe('p2:md')
    await ldb.meds.add({ personId: 'p2', name: 'Losartan', takenAt: new Date(tookAt).toISOString(), medicationId: 'm1', slot })
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('none'))
    await waitFor(() => expect(h.seen).toHaveBeenCalledWith('md'))
  })
  it('00:30 Manila: a take from 23:50 the evening before (Manila) does not close the 00:15 dose of the new day', async () => {
    phoneAhead(0)
    vi.setSystemTime(new Date('2026-10-27T00:30:00+08:00'))
    await ldb.medications.clear()
    await ldb.medications.add({ personId: 'p2', name: 'Losartan', strength: '50 mg', serverId: 'm1', clientId: 'c1', medStatus: 'active', schedule: { v: 1, times: ['00:15'] } })
    await ldb.meds.add({ personId: 'p2', name: 'Losartan', takenAt: new Date('2026-10-26T23:50:00+08:00').toISOString(), medicationId: 'm1', slot: '00:15' })
    render(<Probe rows={[row('md', 'p2:2026-10-27:00:15')]} />)
    await new Promise((r) => setTimeout(r, 80))
    expect(screen.getByTestId('out').textContent).toBe('p2:md')
    expect(h.seen).not.toHaveBeenCalled()
  })
})
