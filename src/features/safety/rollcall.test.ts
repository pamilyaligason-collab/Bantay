import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn(), result: { error: null } as { error: unknown } }))
vi.mock('../auth/client', () => ({ supabase: { rpc: (fn: string, args: unknown) => { h.rpc(fn, args); return Promise.resolve(h.result) } } }))
vi.mock('../sync/sync', () => ({ syncNow: vi.fn(() => Promise.resolve()) }))
import { db } from '../../db'
import { ensureStormTasks, sendRollcall, STORM_TASKS, stormTaskId, tally } from './rollcall'
import { stormRef } from './stormMode'

beforeEach(async () => { h.rpc.mockReset(); h.result = { error: null }; await Promise.all([db.outbox.clear(), db.kv.clear()]) })

describe('stormRef and the shared task ids', () => {
  it("a task id is the server's: storm:<ref>:<1..4>, stable per item and different per storm", () => {
    expect(STORM_TASKS.map((_, i) => stormTaskId('pagasa-tcws-rosal-dampas', i))).toEqual([1, 2, 3, 4].map((n) => `storm:pagasa-tcws-rosal-dampas:${n}`))
    expect(stormTaskId('other', 0)).not.toBe(stormTaskId('pagasa-tcws-rosal-dampas', 0))
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

describe('sendRollcall (the rollcall_set RPC, not the outbox, not a table write)', () => {
  it('calls rollcall_set with the person, the storm and the status, and leaves the outbox empty', async () => {
    expect(await sendRollcall('p1', 'storm-1', 'need_help')).toBe('sent')
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledWith('rollcall_set', { p_person: 'p1', p_storm_ref: 'storm-1', p_status: 'need_help' })
    expect(await db.outbox.count()).toBe(0)
  })
  it('a refusal is refused, a network failure is offline, and neither is queued', async () => {
    h.result = { error: { code: '42501', message: 'not allowed' } }
    expect(await sendRollcall('p1', 's', 'ok')).toBe('refused')
    h.result = { error: { code: '53400', message: 'too many check-ins' } }
    expect(await sendRollcall('p1', 's', 'ok')).toBe('refused')
    h.result = { error: { message: 'Failed to fetch' } }
    expect(await sendRollcall('p1', 's', 'ok')).toBe('offline')
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('ensureStormTasks (the server makes the 4 tasks; the phone only asks)', () => {
  it('asks once per storm, writes no family_tasks row itself, and remembers the storm', async () => {
    expect(await ensureStormTasks('storm-1')).toBe(true)
    expect(h.rpc).toHaveBeenCalledWith('ensure_storm_tasks', { p_storm_ref: 'storm-1' })
    expect(await db.outbox.count()).toBe(0) // nothing is queued: the old local create is gone
    expect(await ensureStormTasks('storm-1')).toBe(true) // a second mount asks nobody
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(await ensureStormTasks('storm-2')).toBe(true) // another storm is its own ask
    expect(h.rpc).toHaveBeenCalledTimes(2)
  })
  it('two mounts at the same moment ask once', async () => {
    const [a, b] = await Promise.all([ensureStormTasks('storm-3'), ensureStormTasks('storm-3')])
    expect([a, b]).toEqual([true, true])
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })
  it('a refusal or no signal is not remembered: the next mount asks again', async () => {
    h.result = { error: { message: 'Failed to fetch' } }
    expect(await ensureStormTasks('storm-4')).toBe(false)
    h.result = { error: null }
    expect(await ensureStormTasks('storm-4')).toBe(true)
    expect(h.rpc).toHaveBeenCalledTimes(2)
  })
})
