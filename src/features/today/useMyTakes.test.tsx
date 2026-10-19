import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const rows = [
  { personId: 'me', name: 'Losartan', takenAt: '2026-10-20T08:00:00' },
  { personId: 'ma', name: 'Metformin', takenAt: '2026-10-20T08:05:00' }
]
vi.mock('dexie', () => ({ liveQuery: (f: () => Promise<unknown>) => ({ subscribe: (o: { next: (v: unknown) => void }) => { void f().then(o.next); return { unsubscribe: () => undefined } } }) }))
vi.mock('../log/store', () => ({ ldb: { meds: { where: () => ({ aboveOrEqual: () => ({ toArray: async () => rows }) }) } } }))
const who = vi.hoisted(() => ({ id: 'me' as string | null }))
vi.mock('../sensors/health', () => ({ currentPersonId: async () => who.id }))
import { useMyTakes } from './useMyTakes'

describe('useMyTakes', () => {
  it("keeps only this member's takes, never a family member's synced row", async () => {
    const { result } = renderHook(() => useMyTakes())
    await waitFor(() => expect(result.current.map((r) => r.name)).toEqual(['Losartan']))
  })
})
