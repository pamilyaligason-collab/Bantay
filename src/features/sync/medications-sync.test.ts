import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, enqueue } from '../../db'
import { ldb } from '../log/store'
import { fromRow, isSyncable, naturalKey, PULL_TABLES, TABLES, toRow } from './tables'
import { resetSyncForTests, startSync, syncNow } from './sync'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

const URL = 'https://x.supabase.test'
const cfg = { url: URL, key: 'pk', getToken: async () => 'tok1' }
type Call = { url: string; method: string; body?: string }
let calls: Call[]
function mockFetch(handler: (c: Call) => Response) {
  calls = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const c = { url, method: init.method ?? 'GET', body: init.body as string | undefined }
    calls.push(c)
    return handler(c)
  })
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([db.outbox.clear(), db.kv.clear(), ldb.meds.clear(), ldb.medications.clear()])
  resetSyncForTests()
})
afterEach(() => vi.unstubAllGlobals())

const SCHEDULE = { v: 1, times: ['08:00'], review: true, review_since: '2026-10-21' }
const serverRow = (over: Record<string, unknown> = {}) => ({
  id: 'srv-1', client_id: 'cm1', person_id: 'p1', name: 'Drug A', strength: '50 mg', form: null, dose: '1 tablet', schedule: SCHEDULE, as_needed: false,
  per_day: 1, med_status: 'active', status: 'confirmed', origin: 'rx', edited_at: null, deleted_at: null, updated_at: '2026-10-02T00:00:00+00:00', ...over
})

describe('medications spec', () => {
  it('is synced, pulled by updated_at and upserted on client_id', () => {
    expect(isSyncable('medications')).toBe(true)
    expect(PULL_TABLES).toContain('medications')
    expect(TABLES.medications).toMatchObject({ onConflict: 'client_id', resolution: 'merge-duplicates', pull: true, cursor: 'updated_at' })
    for (const f of ['personId', 'name', 'genericName', 'strength', 'form', 'dose', 'schedule', 'asNeeded', 'perDay', 'stockQty', 'stockUnit', 'medStatus', 'startedOn', 'stoppedOn', 'status', 'deletedAt']) expect(TABLES.medications.fields).toContain(f)
  })
  it('toRow maps to snake_case, sends the schedule object and the server id, never origin or edited_at', () => {
    const row = toRow('medications', { id: 3, serverId: 'srv-9', personId: 'p1', name: 'Drug A', schedule: SCHEDULE, asNeeded: false, medStatus: 'paused', status: 'confirmed', origin: 'rx', editedAt: 'x', deletedAt: null }, 'cm9')
    expect(row).toEqual({ id: 'srv-9', client_id: 'cm9', person_id: 'p1', name: 'Drug A', schedule: SCHEDULE, as_needed: false, med_status: 'paused', status: 'confirmed', deleted_at: null })
  })
  it('fromRow keeps the server id as serverId and reads origin and edited_at', () => {
    expect(fromRow('medications', serverRow())).toMatchObject({ clientId: 'cm1', serverId: 'srv-1', personId: 'p1', name: 'Drug A', schedule: SCHEDULE, origin: 'rx', medStatus: 'active', asNeeded: false, perDay: 1 })
    expect(fromRow('medications', serverRow())).not.toHaveProperty('form') // null is dropped
    expect(naturalKey.medications({ clientId: 'cm1' })).toBe('cid:cm1')
  })
  it('meds_taken carries medication_id, slot and skipped', () => {
    expect(toRow('meds_taken', { personId: 'p1', name: 'Drug A', takenAt: 't', medicationId: 'srv-1', slot: '08:00', skipped: true }, 'c'))
      .toEqual({ person_id: 'p1', name: 'Drug A', taken_at: 't', medication_id: 'srv-1', slot: '08:00', skipped: true, client_id: 'c' })
    expect(toRow('meds_taken', { personId: 'p1', name: 'Drug A', takenAt: 't' }, 'c')).not.toHaveProperty('medication_id') // old callers
  })
})

describe('medications round trip', () => {
  it('pulls rows, applies a server edit to the same local row, and a soft delete removes it', async () => {
    let rows: Record<string, unknown>[] = [serverRow()]
    mockFetch((c) => (c.url.includes('/medications?') && c.method === 'GET' ? json(rows) : json([])))
    startSync(cfg)()
    await syncNow()
    let all = await ldb.medications.toArray()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ clientId: 'cm1', serverId: 'srv-1', name: 'Drug A', origin: 'rx' })
    rows = [serverRow({ name: 'Drug A', dose: '2 tablets', schedule: { v: 1, times: ['08:00', '20:00'] }, updated_at: '2026-10-03T00:00:00+00:00' })]
    await syncNow(true)
    all = await ldb.medications.toArray()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ dose: '2 tablets', schedule: { v: 1, times: ['08:00', '20:00'] } })
    rows = [serverRow({ updated_at: '2026-10-04T00:00:00+00:00', deleted_at: '2026-10-04T00:00:00+00:00' })]
    await syncNow(true)
    expect(await ldb.medications.count()).toBe(0)
    expect((await db.kv.get('sync.cursor.medications'))?.value).toBe('2026-10-04T00:00:00+00:00')
  })

  it('pushes an edit as an upsert on client_id and a soft delete with deleted_at, then a dose with its medication id', async () => {
    mockFetch(() => json([]))
    await enqueue('medications', 'upsert', { client_id: 'cm2', serverId: 'srv-2', personId: 'p1', name: 'Drug B', schedule: { v: 1, times: ['21:00'] }, medStatus: 'active', status: 'confirmed', deletedAt: null })
    await enqueue('medications', 'upsert', { client_id: 'cm2', serverId: 'srv-2', personId: 'p1', name: 'Drug B', deletedAt: '2026-10-05T00:00:00.000Z' })
    await enqueue('meds_taken', 'insert', { personId: 'p1', name: 'Drug B', takenAt: '2026-10-05T21:00:00.000Z', medicationId: 'srv-2', slot: '21:00', skipped: false })
    startSync(cfg)()
    await syncNow()
    const posts = calls.filter((c) => c.method === 'POST')
    expect(posts.map((p) => p.url)).toEqual([`${URL}/rest/v1/medications?on_conflict=client_id`, `${URL}/rest/v1/medications?on_conflict=client_id`, `${URL}/rest/v1/meds_taken?on_conflict=client_id`])
    expect(JSON.parse(posts[0]!.body!)).toMatchObject({ id: 'srv-2', client_id: 'cm2', person_id: 'p1', name: 'Drug B', schedule: { v: 1, times: ['21:00'] }, med_status: 'active', status: 'confirmed', deleted_at: null })
    expect(JSON.parse(posts[1]!.body!)).toMatchObject({ client_id: 'cm2', deleted_at: '2026-10-05T00:00:00.000Z' })
    expect(JSON.parse(posts[2]!.body!)).toMatchObject({ medication_id: 'srv-2', slot: '21:00', skipped: false })
    expect(await db.outbox.count()).toBe(0)
  })
})
