import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ldb } from '../log/store'
import { useTakenToday } from './useActivity'

describe('useTakenToday', () => {
  beforeEach(async () => {
    await ldb.meds.clear()
    const takenAt = new Date().toISOString()
    await ldb.meds.bulkAdd([
      { personId: 'p', name: 'Drug A', takenAt },
      { personId: 'p', name: 'Drug B', takenAt, skipped: true }
    ])
  })
  it('does not count a skipped dose as taken', async () => {
    const { result } = renderHook(() => useTakenToday('p'))
    await waitFor(() => expect(result.current.map((r) => r.name)).toEqual(['Drug A']))
  })
  it('can include skipped rows for the id-based screens', async () => {
    const { result } = renderHook(() => useTakenToday('p', { includeSkipped: true }))
    await waitFor(() => expect(result.current).toHaveLength(2))
  })
})
