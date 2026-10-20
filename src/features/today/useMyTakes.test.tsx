import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const rows = [
  { personId: 'me', name: 'Losartan', takenAt: '2026-10-20T08:00:00' },
  { personId: 'me', name: 'Drug A', takenAt: '2026-10-20T09:00:00', medicationId: 'srv-a', slot: '08:00', skipped: true },
  { personId: 'ma', name: 'Metformin', takenAt: '2026-10-20T08:05:00' }
]
const self = vi.hoisted(() => ({ id: 'me' as string | null }))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => self.id }))
vi.mock('../health/useActivity', () => ({ useTakenToday: (pid: string) => (pid ? rows.filter((r) => r.personId === pid) : []) }))
import { useMyTakes } from './useMyTakes'

describe('useMyTakes', () => {
  it("keeps only this member's takes, never a family member's synced row", () => {
    const { result } = renderHook(() => useMyTakes())
    expect(result.current.map((r) => r.name)).toEqual(['Losartan', 'Drug A'])
    expect(result.current[1]).toMatchObject({ medicationId: 'srv-a', slot: '08:00', skipped: true }) // id fields pass through for id-based matching
    self.id = null // not resolved yet: no takes rather than someone else's
    expect(renderHook(() => useMyTakes()).result.current).toEqual([])
  })
})
