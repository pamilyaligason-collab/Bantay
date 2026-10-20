import 'fake-indexeddb/auto'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, enqueue } from '../../db'
import { logDose } from '../log/store'
import { OfflineBar, QueuedBadge } from './OfflineBar'
import { LAST_ONLINE_KEY, offlineText, useQueuedDoseIds } from './useOffline'

const setOnline = (on: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on })
beforeEach(async () => { setOnline(true); await db.kv.clear(); await db.outbox.clear() })
afterEach(() => { cleanup(); setOnline(true) })

describe('offlineText', () => {
  it('names the time the data is from and that it will sync', () => {
    expect(offlineText(Date.parse('2026-10-20T02:42:00Z'))).toBe('Offline · showing data from 10:42 AM · will sync')
  })
  it('does not invent a time when none is known', () => {
    expect(offlineText(null)).toBe('Offline · showing saved data · will sync')
  })
})

describe('OfflineBar', () => {
  it('is absent while online, appears when the phone goes offline, and goes when it is back', async () => {
    render(<OfflineBar />)
    expect(screen.queryByTestId('offline-bar')).toBeNull()
    setOnline(false)
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(await screen.findByTestId('offline-bar')).toBeTruthy()
    expect(screen.getByTestId('offline-bar').textContent).toMatch(/^Offline · showing data from \d{1,2}:\d{2} (AM|PM) · will sync$/)
    setOnline(true)
    act(() => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(screen.queryByTestId('offline-bar')).toBeNull())
  })
  it('opening the app already offline shows the last time it was online', async () => {
    await db.kv.put({ key: LAST_ONLINE_KEY, value: Date.parse('2026-10-20T02:42:00Z') })
    setOnline(false)
    render(<OfflineBar />)
    await waitFor(() => expect(screen.getByTestId('offline-bar').textContent).toBe('Offline · showing data from 10:42 AM · will sync'))
  })
  it('the QueuedBadge says Queued', () => {
    render(<QueuedBadge />)
    expect(screen.getByTestId('queued-badge').textContent).toBe('Queued')
  })
})

describe('useQueuedDoseIds', () => {
  function Probe({ ids }: { ids: number[] }) {
    const q = useQueuedDoseIds()
    return <p data-testid="q">{ids.map((i) => (q.has(i) ? 'queued' : 'synced')).join(',')}</p>
  }
  it('a dose is queued while its outbox row exists and stops being queued once it is sent', async () => {
    const id = await logDose({ personId: 'me', name: 'Drug A', serverId: 'srv-a' }, '08:00')
    await enqueue('readings', 'insert', { id: id + 100 }) // another table never counts
    render(<Probe ids={[id, id + 100]} />)
    await waitFor(() => expect(screen.getByTestId('q').textContent).toBe('queued,synced'))
    await db.outbox.where('table').equals('meds_taken').delete()
    await waitFor(() => expect(screen.getByTestId('q').textContent).toBe('synced,synced'))
  })
})
