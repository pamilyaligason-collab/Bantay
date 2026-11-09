import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, enqueue } from '../../db'
import { resetSyncForTests, startSync, syncNow } from '../sync/sync'
import { fromRow, toRow } from '../sync/tables'
import { fdb } from './store'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

const URL = 'https://x.supabase.test'
const cfg = { url: URL, key: 'pk', getToken: async () => 'tok1' }
type Call = { url: string; method: string; body?: string }
let calls: Call[]
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
const row = (over: Record<string, unknown> = {}) => ({ client_id: 't1', title: 'Pay the bill', due: '2030-01-05', assignee_person_id: null, done: false, remind_at: '08:30', deleted_at: null, updated_at: '2026-11-01T00:00:00+00:00', ...over })

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([db.outbox.clear(), db.kv.clear(), fdb.tasks.clear()])
  resetSyncForTests()
})
afterEach(() => vi.unstubAllGlobals())

describe('task reminder time sync (0061 remind_at)', () => {
  it('toRow sends remind_at and fromRow keeps it; a cleared time is simply absent locally', () => {
    expect(toRow('family_tasks', { title: 'x', due: '2030-01-05', remindAt: '08:30' }, 'c1')).toMatchObject({ remind_at: '08:30', client_id: 'c1' })
    expect(toRow('family_tasks', { title: 'x', due: null, remindAt: null }, 'c1')).toMatchObject({ remind_at: null })
    expect(fromRow('family_tasks', row())).toMatchObject({ clientId: 't1', remindAt: '08:30' })
    expect(fromRow('family_tasks', row({ remind_at: null }))).not.toHaveProperty('remindAt')
  })

  it('a pull round-trip keeps remindAt, and a time cleared on the server clears it here', async () => {
    let rows: Record<string, unknown>[] = [row()]
    calls = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => { calls.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined }); return url.includes('/family_tasks?') && (init.method ?? 'GET') === 'GET' ? json(rows) : json([]) })
    startSync(cfg)()
    await syncNow()
    expect(await fdb.tasks.toArray()).toMatchObject([{ clientId: 't1', due: '2030-01-05', remindAt: '08:30' }])
    rows = [row({ remind_at: null, updated_at: '2026-11-02T00:00:00+00:00' })]
    await syncNow(true)
    const all = await fdb.tasks.toArray()
    expect(all).toHaveLength(1)
    expect(all[0]!.remindAt ?? null).toBeNull()
  })

  it('a push carries the time to the server', async () => {
    calls = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => { calls.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined }); return json([]) })
    await enqueue('family_tasks', 'upsert', { client_id: 't2', title: 'Call', due: '2030-01-06', assigneePersonId: null, done: false, remindAt: '07:15', deletedAt: null })
    startSync(cfg)()
    await syncNow()
    const post = calls.find((c) => c.method === 'POST' && c.url.includes('/family_tasks'))!
    expect(JSON.parse(post.body!)).toMatchObject({ client_id: 't2', remind_at: '07:15' })
  })
})
