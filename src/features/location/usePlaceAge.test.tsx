import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { resetRefresh, usePlace } from './useLocation'

// Today's weather card reads usePlace({ weather: true }): the same 6 h rule as the Weather screen (S22 G). Invented fix: a spot in Cebu.
const fixAgo = (h: number) => db.kv.put({ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() - h * 3_600_000 } })
beforeEach(async () => { resetRefresh(); await db.kv.clear() })

describe('usePlace({ weather: true }) and the stored-fix age', () => {
  it('a 2 h old fix is still used', async () => {
    await fixAgo(2)
    const { result } = renderHook(() => usePlace({ weather: true }))
    await waitFor(() => expect(result.current?.settled).toBe(true))
    expect(result.current!.source).toBe('last')
    expect(result.current!.weather.lat).toBeCloseTo(10.3157, 3)
  })
  it('a 7 h old fix is not used for weather: the saved zone answers', async () => {
    await fixAgo(7)
    const { result } = renderHook(() => usePlace({ weather: true }))
    await waitFor(() => expect(result.current?.settled).toBe(true))
    expect(result.current!.source).toBe('zone')
    expect(result.current!.weather.lat).toBeCloseTo(9.6, 0) // Dampas, not Cebu
  })
  it('the same 7 h old fix is still shown as last known to every other reader', async () => {
    await fixAgo(7)
    const { result } = renderHook(() => usePlace())
    await waitFor(() => expect(result.current?.settled).toBe(true))
    expect(result.current!.source).toBe('last')
  })
})
