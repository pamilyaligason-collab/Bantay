import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ acting: false }))
vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: h.acting, personId: h.acting ? 'p1' : null, name: '' }), useActingPersonId: () => 'me', useActingCan: () => null }))
vi.mock('../location/useLocation', () => ({ usePlace: () => ({ weather: { lat: 6.1, lon: 125.2 }, zone: 'dampas', source: 'zone', settled: true }) }))
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ people: [], selfId: null }) }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../safety/rollcall', async (orig) => ({ ...(await orig<typeof import('../safety/rollcall')>()), fetchRollcall: async () => null, ensureStormTasks: async () => true }))
import { db } from '../../db'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import WarningCard from '../today/WarningCard'
import ArchiveAll, { UNDO_MS } from './ArchiveAll'
import { archivable, ARCHIVE_KEY, useArchivedIds } from './archive'
import * as store from './store'
import { adb, type AlertRow } from './store'

const now = Date.now()
const iso = (ms: number) => new Date(now + ms).toISOString()
const row = (id: string, o: Partial<AlertRow> = {}): AlertRow => ({ id, personId: null, kind: 'hazard', template: 'storm_warning', ref: null, createdAt: iso(-3 * 86_400_000), pushedAt: null, seenAt: null, expiresAt: iso(86_400_000), ...o })

beforeEach(async () => { await adb.alerts.clear(); await db.kv.clear(); localStorage.clear(); h.acting = false })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('archivable', () => {
  it('takes exactly the unseen red rows Today shows that are past 24 h: never a live SOS, a fresh row, a seen row or a normal-tone row', () => {
    const rows = [row('old'), row('seen', { seenAt: iso(-500) }), row('dose', { template: 'dose_missed', kind: 'dose_missed' }), row('sos', { kind: 'sos', template: 'family_sos' }), row('fresh', { createdAt: iso(-1000) }), row('digest', { kind: 'digest', template: 'digest' })]
    expect(archivable(rows, new Set(), now).map((r) => r.id)).toEqual(['old'])
  })
})

describe('ArchiveAll', () => {
  it('shows nothing under two archivable rows', async () => {
    await adb.alerts.put(row('a'))
    const { container } = render(<ArchiveAll />)
    await new Promise((r) => setTimeout(r, 40))
    expect(container.textContent).toBe('')
  })

  it('archives past rows with one markAllSeen call, leaves a live SOS unseen, and Undo restores', async () => {
    await adb.alerts.bulkPut([row('a'), row('b'), row('sos', { kind: 'sos', template: 'family_sos' })])
    const spy = vi.spyOn(store, 'markAllSeen')
    render(<ArchiveAll />)
    fireEvent.click(await screen.findByRole('button', { name: 'Archive all (2)' }))
    await screen.findByRole('status')
    expect(spy).toHaveBeenCalledTimes(1)
    expect((await adb.alerts.get('a'))!.seenAt).not.toBeNull()
    expect((await adb.alerts.get('b'))!.seenAt).not.toBeNull()
    expect((await adb.alerts.get('sos'))!.seenAt).toBeNull()
    expect(JSON.parse(localStorage.getItem(ARCHIVE_KEY)!).map((x: { row: AlertRow }) => x.row.id).sort()).toEqual(['a', 'b'])
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await adb.alerts.get('a'))!.seenAt).toBeNull())
    expect((await adb.alerts.get('b'))!.seenAt).toBeNull()
    expect(localStorage.getItem(ARCHIVE_KEY)).toBe('[]')
  })

  it('the Undo toast goes after 6 s and the Archived list is read-only', async () => {
    await adb.alerts.bulkPut([row('a'), row('b')])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<ArchiveAll />)
    fireEvent.click(await screen.findByRole('button', { name: 'Archive all (2)' }))
    await screen.findByRole('status')
    act(() => { vi.advanceTimersByTime(UNDO_MS + 10) })
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Archived (2)' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
})

describe('viewing as someone else (useActing)', () => {
  it('offers no Archive all and shows no archive of the admin own', async () => {
    await adb.alerts.bulkPut([row('a'), row('b')])
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify([{ row: row('x'), at: new Date(now).toISOString() }]))
    h.acting = true
    const { container } = render(<ArchiveAll />)
    await new Promise((r) => setTimeout(r, 40))
    expect(container.textContent).toBe('')
  })
})

describe('what survives Archive all', () => {
  it('a feed warning in kv ALERTS_KEY shown by WarningCard stays, and so does an active SOS', async () => {
    const issued = new Date().toISOString()
    const quake: Alert = { id: 'q1', kind: 'quake', level: 'Magnitude 5.1', title: 'Earthquake', what: 'Magnitude 5.1, 40 km north.', where: 'Off Bohol', when: 'Just now', doNow: 'Drop, cover and hold on.', source: 'PHIVOLCS', sourceUrl: null, issuedAt: issued, lat: 6.2, lon: 125.2, bulletin: 'b' }
    await db.kv.put({ key: ALERTS_KEY, value: [quake] })
    await adb.alerts.bulkPut([row('a'), row('b'), row('sos', { kind: 'sos', template: 'family_sos' })])
    render(<><WarningCard /><ArchiveAll /></>)
    await screen.findByRole('region', { name: 'Active warning' })
    fireEvent.click(await screen.findByRole('button', { name: 'Archive all (2)' }))
    await screen.findByRole('button', { name: 'Undo' }) // the warning card has its own role=status line, so wait on Undo
    expect(screen.getByRole('region', { name: 'Active warning' })).toBeTruthy()
    expect((await db.kv.get(ALERTS_KEY))?.value).toEqual([quake])
    expect((await adb.alerts.get('sos'))!.seenAt).toBeNull() // an unseen, unexpired SOS is never archived, even when old
    expect(JSON.parse(localStorage.getItem(ARCHIVE_KEY)!).map((x: { row: AlertRow }) => x.row.id).sort()).toEqual(['a', 'b'])
  })
})

describe('useArchivedIds (the Family inbox hides archived rows)', () => {
  it('follows Archive all and Undo', async () => {
    await adb.alerts.bulkPut([row('a'), row('b')])
    const ids = renderHook(() => useArchivedIds())
    expect([...ids.result.current]).toEqual([])
    render(<ArchiveAll />)
    fireEvent.click(await screen.findByRole('button', { name: 'Archive all (2)' }))
    await waitFor(() => expect([...ids.result.current].sort()).toEqual(['a', 'b']))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect([...ids.result.current]).toEqual([]))
  })
})
