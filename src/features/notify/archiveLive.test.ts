import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The live path: a mocked supabase client, not supabase: null (ML-16).
const h = vi.hoisted(() => {
  const calls: { update: unknown; filter: string; args: unknown[] }[] = []
  const from = vi.fn(() => ({ update: (u: unknown) => ({
    eq: (...args: unknown[]) => { calls.push({ update: u, filter: 'eq', args }); return Promise.resolve({ error: null }) },
    in: (...args: unknown[]) => { calls.push({ update: u, filter: 'in', args }); return Promise.resolve({ error: null }) }
  }) }))
  return { calls, from }
})
vi.mock('../auth/client', () => ({ supabase: { from: h.from } }))
import { adb, markAllSeen, unmarkSeen, type AlertRow } from './store'

const day = 86_400_000
// Fixed, distinct createdAt so the newest-first order never depends on the clock.
const made: Record<string, string> = { a: '2026-01-03T00:00:00.000Z', b: '2026-01-02T00:00:00.000Z', c: '2026-01-01T00:00:00.000Z' }
const row = (id: string): AlertRow => ({ id, personId: null, kind: 'hazard', template: 'storm_warning', ref: null, createdAt: made[id], pushedAt: null, seenAt: null, expiresAt: new Date(Date.now() + day).toISOString() })

beforeEach(async () => { await adb.alerts.clear(); h.calls.length = 0; h.from.mockClear() })

describe('Archive all and Undo against the server', () => {
  it('markAllSeen writes seen_at per accepted row; unmarkSeen clears seen_at with .in(id, ids) on carer_alerts', async () => {
    await adb.alerts.bulkPut([row('a'), row('b'), row('c')])
    await markAllSeen(new Date(), (r) => r.id !== 'c')
    const eq = h.calls.filter((c) => c.filter === 'eq')
    expect(eq.map((c) => c.args)).toEqual([['id', 'a'], ['id', 'b']])
    expect(eq.every((c) => typeof (c.update as { seen_at: unknown }).seen_at === 'string')).toBe(true)
    h.calls.length = 0
    await unmarkSeen(['a', 'b'])
    expect(h.from).toHaveBeenCalledWith('carer_alerts')
    expect(h.calls).toEqual([{ update: { seen_at: null }, filter: 'in', args: ['id', ['a', 'b']] }])
    expect((await adb.alerts.get('a'))!.seenAt).toBeNull()
    expect((await adb.alerts.get('c'))!.seenAt).toBeNull()
  })
})
