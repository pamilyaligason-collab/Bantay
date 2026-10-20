import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ldb } from '../log/store'
import { useCheckIns, useCheckInsLoaded } from './roster'

describe('check-ins load state', () => {
  it('is null (no status lines) until the first read, then the latest check-in per person', async () => {
    await ldb.activity.clear()
    await ldb.activity.add({ personId: 'p1', kind: 'check-in', minutes: null, steps: null, startedAt: '2026-10-20T07:40:00Z', source: 'manual' })
    const { result } = renderHook(() => useCheckInsLoaded())
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toEqual({ p1: '2026-10-20T07:40:00Z' }))
  })
  it('the summary-line variant is an empty list until loaded, never null', () => {
    const { result } = renderHook(() => useCheckIns())
    expect(result.current).toEqual({})
  })
})
