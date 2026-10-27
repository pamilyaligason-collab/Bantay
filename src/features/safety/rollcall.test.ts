import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ upsert: vi.fn(), result: { error: null } as { error: unknown } }))
vi.mock('../auth/client', () => ({ supabase: { from: (t: string) => ({ upsert: (row: unknown, opt: unknown) => { h.upsert(t, row, opt); return Promise.resolve(h.result) } }) } }))
import { db } from '../../db'
import { fdb } from '../family/store'
import { ensureStormTasks, sendRollcall, STORM_TASKS, stormTaskId, tally, uuidv5 } from './rollcall'
import { stormRef } from './stormMode'

const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8' // RFC 4122 Appendix C namespace for DNS names

beforeEach(async () => { h.upsert.mockReset(); h.result = { error: null }; await Promise.all([db.outbox.clear(), db.kv.clear(), fdb.tasks.clear()]) })

describe('uuidv5 and stormRef', () => {
  it('matches the published v5 vector (python.org in the DNS namespace)', async () => {
    expect(await uuidv5('python.org', DNS)).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d')
  })
  it('a storm task id is stable, version 5, and different per item and per storm', async () => {
    const ids = await Promise.all(STORM_TASKS.map((t) => stormTaskId('pagasa-tcws-rosal-dampas', t)))
    expect(new Set(ids).size).toBe(4)
    expect(ids.every((i) => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(i))).toBe(true)
    expect(await stormTaskId('pagasa-tcws-rosal-dampas', STORM_TASKS[0])).toBe(ids[0])
    expect(await stormTaskId('pagasa-tcws-other', STORM_TASKS[0])).not.toBe(ids[0])
  })
  it('stormRef is the id of the live signal', () => { expect(stormRef({ id: 'pagasa-tcws-rosal-dampas' })).toBe('pagasa-tcws-rosal-dampas') })
})

describe('tally', () => {
  it('counts safe, help and no answer by hand: 5 people, 2 ok, 1 help, 2 silent (and a stranger row ignored)', () => {
    const t = tally(['a', 'b', 'c', 'd', 'e'], [{ personId: 'a', status: 'ok', at: 'x' }, { personId: 'c', status: 'ok', at: 'x' }, { personId: 'b', status: 'need_help', at: 'x' }, { personId: 'zz', status: 'ok', at: 'x' }])
    expect(t.safe).toEqual(['a', 'c'])
    expect(t.help).toEqual(['b'])
    expect(t.none).toEqual(['d', 'e'])
    expect(t.line).toBe('2 of 5 safe')
  })
  it('no rows at all: 0 of n safe, everyone has no answer', () => {
    const t = tally(['a', 'b'], [])
    expect(t.line).toBe('0 of 2 safe')
    expect(t.none).toEqual(['a', 'b'])
  })
})

describe('sendRollcall (direct REST upsert, not the outbox)', () => {
  it('upserts one row on person_id + storm_ref and leaves the outbox empty', async () => {
    expect(await sendRollcall('p1', 'storm-1', 'need_help')).toBe('sent')
    expect(h.upsert).toHaveBeenCalledTimes(1)
    const [table, row, opt] = h.upsert.mock.calls[0] as [string, Record<string, unknown>, unknown]
    expect(table).toBe('rollcall')
    expect(row).toMatchObject({ person_id: 'p1', storm_ref: 'storm-1', status: 'need_help' })
    expect(Object.keys(row).sort()).toEqual(['at', 'person_id', 'status', 'storm_ref']) // no user_id: the server sets it
    expect(opt).toEqual({ onConflict: 'person_id,storm_ref' })
    expect(await db.outbox.count()).toBe(0)
  })
  it('a refusal is refused, a network failure is offline, and neither is queued', async () => {
    h.result = { error: { code: '42501', message: 'rls' } }
    expect(await sendRollcall('p1', 's', 'ok')).toBe('refused')
    h.result = { error: { message: 'Failed to fetch' } }
    expect(await sendRollcall('p1', 's', 'ok')).toBe('offline')
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('ensureStormTasks', () => {
  it('makes the 4 tasks once; a second mount adds 0; another storm makes its own 4', async () => {
    expect(await ensureStormTasks('storm-1')).toBe(4)
    expect(await fdb.tasks.count()).toBe(4)
    expect((await db.outbox.toArray()).filter((o) => o.table === 'family_tasks').length).toBe(4)
    expect(await ensureStormTasks('storm-1')).toBe(0)
    expect(await fdb.tasks.count()).toBe(4)
    expect(await db.outbox.count()).toBe(4)
    expect(await ensureStormTasks('storm-2')).toBe(4)
    expect(await fdb.tasks.count()).toBe(8)
  })
  it('two mounts at the same moment still make 4', async () => {
    const [a, b] = await Promise.all([ensureStormTasks('storm-3'), ensureStormTasks('storm-3')])
    expect([a, b]).toEqual([4, 4]) // the second caller joins the first run
    expect(await fdb.tasks.count()).toBe(4)
  })
  it('a task that already arrived from another phone is not written again (it cannot un-tick it)', async () => {
    const first = await stormTaskId('storm-4', STORM_TASKS[0])
    await fdb.tasks.add({ clientId: first, title: STORM_TASKS[0], due: null, assigneePersonId: null, done: true })
    expect(await ensureStormTasks('storm-4')).toBe(3)
    expect((await fdb.tasks.where('clientId').equals(first).first())!.done).toBe(true)
  })
  it('the rows carry the deterministic client_id, a title, today as the due date and no assignee', async () => {
    await ensureStormTasks('storm-5')
    const rows = (await db.outbox.toArray()).map((o) => o.payload as { client_id: string; title: string; due: string; done: boolean })
    expect(rows.map((r) => r.client_id).sort()).toEqual((await Promise.all(STORM_TASKS.map((t) => stormTaskId('storm-5', t)))).sort())
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.due) && r.done === false)).toBe(true)
  })
})
