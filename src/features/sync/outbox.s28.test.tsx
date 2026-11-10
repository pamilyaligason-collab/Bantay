import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, enqueue } from '../../db'
import { DEAD_KEY, getSyncState, resetSyncForTests, retryStuck, startSync, syncCounts, syncNow, WAIT_LIMIT_MS, MAX_TRIES } from './sync'
import { DeadSheet, queuedNote, queuedReasons, statusText, tableWords } from './SyncStatus'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

const URL = 'https://x.supabase.test'
const cfg = (token: string | null = 'tok1') => ({ url: URL, key: 'pk', getToken: async () => token })
const sos = { id: 'e1', personId: 'p1', at: '2026-10-26T10:00:00.000Z', lat: null, lon: null, gps: false, callTo: 'family' }
let urls: string[] = []
const answer = (status: number, body: unknown = {}) => { urls = []; vi.stubGlobal('fetch', async (u: string) => { urls.push(u); return new Response(status === 201 ? null : JSON.stringify(body), { status }) }) }
const sosSends = () => urls.filter((u) => u.includes('/rest/v1/sos_events')).length // the pull that follows a run also calls the server
const dead = async () => ((await db.kv.get(DEAD_KEY))?.value ?? []) as { table: string; code: string }[]

beforeEach(async () => { await Promise.all([db.outbox.clear(), db.kv.clear()]); resetSyncForTests() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('A: an SOS the server keeps refusing', () => {
  it.each([400, 403, 404, 422])('a permanent %i five times: the row stays, stops retrying by itself, shows as call instead, never a dead letter', async (status) => {
    await enqueue('sos_events', 'insert', sos)
    answer(status, { code: 'PGRST301' })
    startSync(cfg())()
    for (let i = 0; i < MAX_TRIES; i++) await syncNow(true)
    expect(sosSends()).toBe(MAX_TRIES)
    const [row] = await db.outbox.toArray()
    expect(row.stuck).toBe(true)
    expect(row.permFails).toBe(MAX_TRIES)
    await syncNow(true); await syncNow(true)
    expect(sosSends()).toBe(MAX_TRIES) // no more hammering, not even when forced by the network coming back
    expect(await dead()).toEqual([])
    expect(await syncCounts()).toEqual({ waiting: 0, unknown: 0, dead: 1 })
    expect(queuedNote(row)).toMatch(/^Could not be sent - call instead\./)
  })
  it('a stuck SOS is still tried by itself once its slow wait (30 min cap) is over, and a good answer then removes it', async () => {
    await enqueue('sos_events', 'insert', sos)
    answer(403)
    startSync(cfg())()
    for (let i = 0; i < MAX_TRIES; i++) await syncNow(true)
    expect((await db.outbox.toArray())[0].stuck).toBe(true)
    const t0 = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(t0 + 31 * 60_000)
    try {
      answer(201)
      await syncNow(false)
      await waitFor(async () => expect(await db.outbox.count()).toBe(0))
    } finally { clock.mockRestore() }
  })
  it('a 503 never counts: ten of them leave the SOS retrying, not stuck', async () => {
    await enqueue('sos_events', 'insert', sos)
    answer(503)
    startSync(cfg())()
    for (let i = 0; i < 10; i++) await syncNow(true)
    const [row] = await db.outbox.toArray()
    expect(row.stuck).toBeFalsy()
    expect(row.permFails ?? 0).toBe(0)
    expect(sosSends()).toBe(10)
  })
  it('Try again clears it and the next sync sends it; a good answer removes the row', async () => {
    await enqueue('sos_events', 'insert', sos)
    answer(403)
    startSync(cfg())()
    for (let i = 0; i < MAX_TRIES; i++) await syncNow(true)
    answer(201)
    await retryStuck()
    await waitFor(async () => expect(await db.outbox.count()).toBe(0))
    expect(urls.some((u) => u.includes('/rest/v1/sos_events'))).toBe(true)
  })
  it('a stuck SOS does not block a newer one', async () => {
    await enqueue('sos_events', 'insert', sos)
    answer(403)
    startSync(cfg())()
    for (let i = 0; i < MAX_TRIES; i++) await syncNow(true)
    await enqueue('sos_events', 'insert', { ...sos, id: 'e2' })
    answer(201)
    await syncNow(true)
    expect((await db.outbox.toArray()).map((r) => (r.payload as { id: string }).id)).toEqual(['e1'])
  })
})

describe('B: rows waiting for a table the server lacks', () => {
  it.each([['PGRST205 404', { code: 'PGRST205' }], ['bare 404', {}]])('%s: a row older than a day becomes a visible dead letter, a newer one keeps waiting', async (_n, body) => {
    await enqueue('food_entries', 'insert', { personId: 'p1', loggedAt: '2026-10-26T10:00:00.000Z', name: 'x' })
    await enqueue('water_entries', 'insert', { personId: 'p1', loggedAt: '2026-10-26T10:00:00.000Z', ml: 200 })
    const [old, fresh] = await db.outbox.orderBy('id').toArray()
    await db.outbox.update(old.id!, { createdAt: Date.now() - WAIT_LIMIT_MS - 1000 })
    await db.outbox.update(fresh.id!, { createdAt: Date.now() - WAIT_LIMIT_MS + 3_600_000 })
    answer(404, body)
    startSync(cfg())()
    await syncNow(true)
    expect((await dead()).map((d) => [d.table, d.code])).toEqual([['food_entries', 'wait-limit']])
    expect((await db.outbox.toArray()).map((r) => r.table)).toEqual(['water_entries'])
    expect(await syncCounts()).toEqual({ waiting: 1, unknown: 0, dead: 1 })
  })
})

describe('C: paused', () => {
  it('a 401 pauses sync and the pill says to sign in again', async () => {
    await enqueue('readings', 'insert', { personId: 'p1', takenAt: '2026-10-26T10:00:00.000Z', test: 'bp', value: 1 })
    answer(401)
    startSync(cfg())()
    await syncNow(true)
    const s = getSyncState()
    expect(s.paused).toBe(true)
    expect(statusText(s, await syncCounts())).toBe('Paused - sign in again')
  })
  it('not paused: the counts read as before', () => {
    expect(statusText({ ready: true, signedIn: true, offline: false, paused: false }, { waiting: 11, unknown: 0, dead: 0 })).toBe('11 waiting to send')
  })
})

describe('D: the sheet shows what the waiting rows are', () => {
  it('groups by table in plain words with counts and no values', async () => {
    await db.outbox.bulkAdd([
      { table: 'food_entries', op: 'insert', payload: { name: 'SECRETFOOD' }, createdAt: 1, tries: 0 },
      { table: 'food_entries', op: 'insert', payload: {}, createdAt: 2, tries: 0 },
      { table: 'readings', op: 'insert', payload: { value: 987654 }, createdAt: 3, tries: 0 },
      { table: 'sos_events', op: 'insert', payload: {}, createdAt: 4, tries: 5, lastCode: 'HTTP403', lastStatus: 403, stuck: true, permFails: 5 },
    ])
    render(<DeadSheet onClose={() => undefined} />)
    expect((await screen.findByTestId('queued-summary')).textContent).toBe('2 meals, 1 health readings, 1 SOS alerts.')
    expect(document.body.textContent).toContain('Could not be sent - call instead.')
    expect(document.body.textContent).not.toMatch(/SECRETFOOD|987654/)
    expect(tableWords('some_new_table')).toBe('some new table')
  })
  it('Try again on a stuck row clears it', async () => {
    const id = await db.outbox.add({ table: 'sos_events', op: 'insert', payload: sos, createdAt: 1, tries: 5, lastCode: 'HTTP403', stuck: true, permFails: 5 })
    answer(500) // the retry itself fails; only the clearing is asserted
    startSync(cfg())()
    render(<DeadSheet onClose={() => undefined} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Try again, SOS alerts' }))
    await waitFor(async () => expect((await db.outbox.get(id))?.stuck).toBeFalsy())
  })
})

describe('E: why the waiting rows wait (S30 L4)', () => {
  it('tallies the reasons in plain words with no values', () => {
    expect(queuedReasons([
      { tries: 0 }, { tries: 0 }, { tries: 1, lastCode: 'net' }, { tries: 2, lastCode: 'PGRST205', lastStatus: 404 }, { tries: 1, lastCode: 'insert-queued' }, { tries: 5, lastCode: 'HTTP403', stuck: true },
    ])).toBe('Not tried yet: 2; Waiting for a connection: 1; The server is missing the place to keep it. An admin needs to update the database: 1; Waiting for an earlier change: 1; Could not be sent, kept for another try: 1.')
  })
  it('the sheet shows the line above the table groups', async () => {
    await db.outbox.bulkAdd([
      { table: 'readings', op: 'insert', payload: { value: 987654 }, createdAt: 1, tries: 0 },
      { table: 'readings', op: 'insert', payload: {}, createdAt: 2, tries: 1, lastCode: 'net' },
    ])
    render(<DeadSheet onClose={() => undefined} />)
    expect((await screen.findByTestId('queued-reasons')).textContent).toBe('Why: Not tried yet: 1; Waiting for a connection: 1.')
  })
})
