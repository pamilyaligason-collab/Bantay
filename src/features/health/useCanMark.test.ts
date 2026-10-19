import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ res: { data: [{ person_id: 'p2' }], error: null } as { data: unknown; error: unknown }, calls: 0 }))
vi.mock('../auth/client', () => ({
  supabase: { from: () => { const q: any = { select: () => q, eq: () => q, then: (f: (v: unknown) => unknown) => { h.calls++; return Promise.resolve(h.res).then(f) } }; return q } }
}))
import { canMarkFor, loadWritable, useWritableIds } from './useCanMark'

beforeEach(async () => { await db.kv.clear(); h.calls = 0; h.res = { data: [{ person_id: 'p2' }], error: null } })

describe('canMarkFor', () => {
  it('own person can mark', () => expect(canMarkFor('p1', 'p1', [])).toBe(true))
  it('a can_write carer can mark', () => expect(canMarkFor('p2', 'p1', ['p2'])).toBe(true))
  it('someone else without a writable carer link cannot (admin role is irrelevant)', () => expect(canMarkFor('p3', 'p1', ['p2'])).toBe(false))
  it('no person chosen cannot mark', () => expect(canMarkFor('', '', [])).toBe(false))
})

describe('writable ids cache', () => {
  it('falls back to the cached list when the query errors', async () => {
    const { supabase } = await import('../auth/client')
    expect(await loadWritable(supabase as never, 'u1')).toEqual(['p2'])
    h.res = { data: null, error: { message: 'offline' } }
    expect(await loadWritable(supabase as never, 'u1')).toEqual(['p2'])
    expect(await loadWritable(supabase as never, 'other-user')).toEqual([])
  })
  it('refetches on online so a revoked link drops', async () => {
    const { result } = renderHook(() => useWritableIds('u1'))
    await waitFor(() => expect(result.current).toEqual(['p2']))
    h.res = { data: [], error: null }
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(result.current).toEqual([]))
  })
})
