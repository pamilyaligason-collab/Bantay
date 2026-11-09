import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { DEAD_KEY, getSyncState, startSync } from './sync'
import { DeadSheet, SyncStatus, queuedNote, reasonText, statusText } from './SyncStatus'

const ready = { ready: true, signedIn: true, offline: false }
const none = { waiting: 0, unknown: 0, dead: 0 }

describe('statusText', () => {
  it('is empty until the first check', () => expect(statusText({ ...ready, ready: false }, none)).toBe(''))
  it('is empty when signed out', () => expect(statusText({ ...ready, signedIn: false }, { ...none, waiting: 3 })).toBe(''))
  it('is empty when everything is sent', () => expect(statusText(ready, none)).toBe(''))
  it('waiting counts rows we will not send too', () => expect(statusText(ready, { ...none, waiting: 2, unknown: 1 })).toBe('3 waiting to send'))
  it('offline', () => {
    expect(statusText({ ...ready, offline: true }, none)).toBe('Offline')
    expect(statusText({ ...ready, offline: true }, { ...none, waiting: 2 })).toBe('Offline, 2 waiting to send')
  })
  it('dead letters are counted apart from queued rows (D-142)', () => {
    expect(statusText(ready, { ...none, dead: 2 })).toBe('2 could not be sent')
    expect(statusText(ready, { waiting: 3, unknown: 0, dead: 2 })).toBe('3 waiting to send, 2 could not be sent')
    expect(statusText({ ...ready, offline: true }, { ...none, dead: 1 })).toBe('Offline, 1 could not be sent')
  })
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
    await waitFor(() => expect(screen.getAllByTestId('dead-row')).toHaveLength(1)) // the sheet has settled on the first discard before the list is replaced under it
    await db.kv.put({ key: DEAD_KEY, value: [dead(1), dead(2)] })
    await waitFor(() => expect(screen.getAllByTestId('dead-row')).toHaveLength(2))
    fireEvent.click(await screen.findByRole('button', { name: 'Discard all' }))
    await waitFor(async () => expect(((await db.kv.get(DEAD_KEY))?.value as unknown[]).length).toBe(0))
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('queued section (D-142)', () => {
  beforeEach(async () => { await db.kv.clear(); await db.outbox.clear() })
  afterEach(cleanup)
  it('lists queued rows by table with tries and the last error in plain words', async () => {
    await db.outbox.bulkAdd([
      { table: 'readings', op: 'insert', payload: { value: 987654 }, createdAt: 1_700_000_000_000, tries: 3, lastCode: 'HTTP500', lastAt: 1 },
      { table: 'readings', op: 'insert', payload: {}, createdAt: 1_700_000_000_001, tries: 0 },
      { table: 'water_entries', op: 'insert', payload: {}, createdAt: 1_700_000_000_002, tries: 1, lastCode: 'net' }
    ])
    render(<DeadSheet onClose={() => undefined} />)
    expect(await screen.findAllByTestId('queued-group')).toHaveLength(2)
    expect(document.body.textContent).toMatch(/readings \(2\)/)
    expect(document.body.textContent).toMatch(/water \(1\)/)
    expect(document.body.textContent).toMatch(/Tried 3 times\. The server had a problem/)
    expect(document.body.textContent).toMatch(/Tried 1 time\. Waiting for a connection/)
    expect(document.body.textContent).not.toMatch(/987654/)
  })
  it('Discard asks first; Keep it leaves the row, Yes deletes only that row', async () => {
    await db.outbox.bulkAdd([
      { table: 'readings', op: 'insert', payload: {}, createdAt: 1, tries: 0 },
      { table: 'consults', op: 'insert', payload: {}, createdAt: 2, tries: 0 }
    ])
    render(<DeadSheet onClose={() => undefined} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Discard queued health readings insert' }))
    expect(await db.outbox.count()).toBe(2) // nothing deleted by the first press
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }))
    expect(await db.outbox.count()).toBe(2)
    fireEvent.click(await screen.findByRole('button', { name: 'Discard queued health readings insert' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, discard' }))
    await waitFor(async () => expect((await db.outbox.toArray()).map((r) => r.table)).toEqual(['consults']))
  })
  it('Discard all older than 30 days asks first and keeps newer dead letters', async () => {
    const mk = (n: number, at: number) => ({ table: 'readings', op: 'insert', clientId: `c${n}`, code: '23514', at, payload: {} })
    await db.kv.put({ key: DEAD_KEY, value: [mk(1, Date.now() - 40 * 86_400_000), mk(2, Date.now() - 86_400_000)] })
    render(<DeadSheet onClose={() => undefined} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Discard all older than 30 days' }))
    expect(((await db.kv.get(DEAD_KEY))?.value as unknown[]).length).toBe(2)
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, discard' }))
    await waitFor(async () => expect(((await db.kv.get(DEAD_KEY))?.value as { clientId: string }[]).map((d) => d.clientId)).toEqual(['c2']))
  })
})

describe('SyncStatus', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  it('waiting 3, dead 0: the pill is a button and its sheet lists the tables', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {})) // no real network: a failed fetch would flip the shared state to offline for the next test
    await db.kv.clear(); await db.outbox.clear()
    await db.outbox.bulkAdd(['readings', 'readings', 'consults'].map((table, i) => ({ table, op: 'insert', payload: {}, createdAt: i, tries: 0 })))
    startSync({ url: 'https://x.supabase.test', key: 'pk', getToken: async () => 'tok' })
    await waitFor(() => expect(getSyncState().signedIn).toBe(true))
    render(<SyncStatus />)
    const pill = await screen.findByRole('button', { name: '3 waiting to send' })
    fireEvent.click(pill)
    expect(await screen.findAllByTestId('queued-group')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Send now' })).toBeTruthy()
  })
  it('keeps an empty live region mounted when there is nothing to say', () => {
    render(<SyncStatus />)
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('queued row wording', () => {
  it('an urgent row with a coded server failure says it will keep trying; an internal wait shows no code', () => {
    expect(queuedNote({ tries: 0, lastCode: 'PGRST002', table: 'sos_events' })).toBe('The server had a problem. It will keep trying. Code PGRST002.')
    expect(queuedNote({ tries: 0, lastCode: 'insert-queued' })).toBe('Waiting for the first part to be sent.')
    expect(queuedNote({ tries: 0, lastCode: 'PGRST301', table: 'sos_events' })).not.toContain('keep trying') // an expired session needs the person: sign in again
  })
  it('a network failure says waiting for a connection, never Tried 0 times', () => {
    expect(queuedNote({ tries: 0, lastCode: 'net' })).toBe('Waiting for a connection.')
  })
  it('a legacy row with tries and no code says only how many times', () => {
    expect(queuedNote({ tries: 3 })).toBe('Tried 3 times.')
    expect(queuedNote({ tries: 1 })).toBe('Tried 1 time.')
    expect(queuedNote({ tries: 0 })).toBe('Not tried yet.')
  })
  it('401, PGRST301 and PGRST303 ask to sign in again, 403 stays not allowed', () => {
    for (const c of ['401', 'auth', 'PGRST301', 'PGRST303', 'HTTP401']) expect(reasonText(c)).toBe('Sign in again to send this.')
    expect(reasonText('HTTP403')).toMatch(/not allowed/)
  })
  it('a code after a failure never says Not tried yet', () => {
    expect(queuedNote({ tries: 0, lastCode: 'error' })).not.toMatch(/Not tried yet/)
    expect(reasonText('error')).toMatch(/went wrong/)
  })
})

describe('queuedNote for a held SOS row', () => {
  it('says it will keep trying once, worded by the HTTP status and not by the code text', () => {
    expect(queuedNote({ tries: 0, lastCode: 'HTTP503', table: 'sos_events' })).toBe('The server had a problem. It will keep trying. Code HTTP503.')
    expect(queuedNote({ tries: 0, lastCode: '57014', lastStatus: 500, table: 'sos_events' })).toBe('The server had a problem. It will keep trying. Code 57014.')
    expect(queuedNote({ tries: 0, lastCode: 'X500', lastStatus: 500, table: 'sos_events' })).toBe('The server had a problem. It will keep trying. Code X500.')
    expect(queuedNote({ tries: 0, lastCode: '42501', lastStatus: 403, table: 'sos_events' })).toBe('The server said this phone is not allowed to save it. It will keep trying. Code 42501.')
    expect(queuedNote({ tries: 0, lastCode: 'X422', lastStatus: 422, table: 'sos_events' })).toBe('The server refused it. It will keep trying. Code X422.')
    expect(queuedNote({ tries: 0, lastCode: '0rows', lastStatus: 200, table: 'sos_events_update' })).toBe('The server had no matching row to change. It will keep trying. Code 0rows.')
    expect(queuedNote({ tries: 2, lastCode: 'HTTP503', table: 'readings' })).toBe('Tried 2 times. The server had a problem. Try again later. Code HTTP503.')
  })
  it('no 4xx reads as a server problem and no 5xx as a refusal, whatever the code (exact strings)', () => {
    const problem = 'The server had a problem. Try again later.'
    for (const s of [500, 502, 503, 504]) for (const c of ['42501', '23505', 'PGRST100', 'X', '57014', 'HTTP403']) expect(reasonText(c, s)).toBe(problem)
    for (const s of [400, 403, 404, 409, 418, 422]) for (const c of ['PGRST002', '57014', 'XX000', 'HTTP503', 'HTTP429', 'X']) expect(reasonText(c, s)).toBe('The server refused it.')
    expect(reasonText('42501', 403)).toBe('The server said this phone is not allowed to save it.')
    expect(reasonText('0rows', 200)).toBe('The server had no matching row to change.')
    expect(reasonText('23505', 409)).toBe('The server already has a row like this.')
    expect(reasonText('X', 429)).toBe('The server was busy. It will try again.')
    // no status (an old row or dead letter): server-side codes still read as a server problem
    for (const c of ['HTTP500', 'PGRST002', '57014', '53300', 'XX000']) expect(reasonText(c)).toBe(problem)
    expect(queuedNote({ tries: 0, lastCode: 'PGRST002', lastStatus: 403, table: 'sos_events' })).toBe('The server refused it. It will keep trying. Code PGRST002.')
    expect(queuedNote({ tries: 0, lastCode: '42501', lastStatus: 503, table: 'sos_events' })).toBe('The server had a problem. It will keep trying. Code 42501.')
    expect(queuedNote({ tries: 5, lastCode: '57014', lastStatus: 500, table: 'readings' })).toBe('Tried 5 times. The server had a problem. Try again later. Code 57014.')
  })
  it('a dead letter is worded by its kept status', async () => {
    await db.kv.clear(); await db.outbox.clear()
    await db.kv.put({ key: DEAD_KEY, value: [{ table: 'readings', op: 'insert', clientId: 'c1', code: '57014', status: 500, at: 1_700_000_000_000, payload: {} }] })
    render(<DeadSheet onClose={() => undefined} />)
    expect((await screen.findByTestId('dead-row')).textContent).toContain('The server had a problem. Try again later. Code 57014')
    cleanup()
  })
  it('408, 429 and error codes carry one "It will keep trying." and no second try-again sentence', () => {
    expect(queuedNote({ tries: 0, lastCode: 'HTTP408', lastStatus: 408, table: 'sos_events' })).toBe('The server was busy. It will keep trying. Code HTTP408.')
    expect(queuedNote({ tries: 0, lastCode: 'HTTP429', lastStatus: 429, table: 'sos_events' })).toBe('The server was busy. It will keep trying. Code HTTP429.')
    expect(queuedNote({ tries: 0, lastCode: 'error', table: 'sos_events' })).toBe('Something went wrong while sending. It will keep trying. Code error.')
    expect(queuedNote({ tries: 0, lastCode: 'HTTP429', table: 'sos_events' })).toBe('The server was busy. It will keep trying. Code HTTP429.') // an old row with no status
  })
})
