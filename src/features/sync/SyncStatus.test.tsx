import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { DEAD_KEY } from './sync'
import { DeadSheet, reasonText, statusText } from './SyncStatus'

const ready = { ready: true, signedIn: true, offline: false }
const none = { waiting: 0, unknown: 0, dead: 0 }

describe('statusText', () => {
  it('is empty until the first check', () => expect(statusText({ ...ready, ready: false }, none)).toBe(''))
  it('signed out', () => expect(statusText({ ...ready, signedIn: false }, { ...none, waiting: 3 })).toBe('Sign in to sync'))
  it('synced', () => expect(statusText(ready, none)).toBe('Synced'))
  it('waiting counts rows we will not send too', () => expect(statusText(ready, { ...none, waiting: 2, unknown: 1 })).toBe('3 waiting'))
  it('offline', () => {
    expect(statusText({ ...ready, offline: true }, none)).toBe('Offline')
    expect(statusText({ ...ready, offline: true }, { ...none, waiting: 2 })).toBe('Offline, 2 waiting')
  })
  it('could not sync', () => expect(statusText(ready, { ...none, dead: 2 })).toBe('2 could not sync'))
})

describe('DeadSheet', () => {
  const dead = (n: number) => ({ table: 'readings', op: 'insert', clientId: `c${n}`, code: '23514', at: 1_700_000_000_000 + n, payload: { client_id: `c${n}`, value: 987654 } })
  beforeEach(async () => { await db.kv.clear(); await db.outbox.clear(); await db.kv.put({ key: DEAD_KEY, value: [dead(1), dead(2)] }) })
  afterEach(cleanup)

  it('explains in plain words, shows field names but never values', async () => {
    render(<DeadSheet onClose={() => undefined} />)
    expect((await screen.findAllByTestId('dead-row'))).toHaveLength(2)
    expect(document.body.textContent).toMatch(/Fields: client_id, value/)
    expect(document.body.textContent).not.toMatch(/987654/)
    expect(reasonText('0rows')).toMatch(/no matching row/)
  })
  it('Try again re-queues the payload and removes the row', async () => {
    render(<DeadSheet onClose={() => undefined} />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Try again' }))[0]!)
    await waitFor(async () => expect(((await db.kv.get(DEAD_KEY))?.value as unknown[]).length).toBe(1))
    const rows = await db.outbox.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ table: 'readings', op: 'insert', tries: 0 })
  })
  it('Discard removes one row, Discard all clears the list without queueing', async () => {
    render(<DeadSheet onClose={() => undefined} />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Discard' }))[0]!)
    await waitFor(async () => expect(((await db.kv.get(DEAD_KEY))?.value as unknown[]).length).toBe(1))
    await db.kv.put({ key: DEAD_KEY, value: [dead(1), dead(2)] })
    fireEvent.click(await screen.findByRole('button', { name: 'Discard all' }))
    await waitFor(async () => expect(((await db.kv.get(DEAD_KEY))?.value as unknown[]).length).toBe(0))
    expect(await db.outbox.count()).toBe(0)
  })
})
